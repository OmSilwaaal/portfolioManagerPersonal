// Free, keyless Solana memecoin data (DexScreener, GeckoTerminal, Jupiter) with TTL caching.
// Every exported function resolves (never throws) unless noted; errors are surfaced as
// MemecoinDataError so routes can map them to a clean 4xx/5xx.
const axios = require('axios');
const geckoBudget = require('./geckoBudget');

const DEXSCREENER = 'https://api.dexscreener.com';
const GECKO = 'https://api.geckoterminal.com/api/v2';

// GeckoTerminal's keyless tier is the single hardest limit in this file: measured from one IP it
// starts refusing at roughly 6-8 calls a minute, nowhere near its published 30, and no amount of
// budgeting can manufacture quota. A CoinGecko key lifts that, and the same endpoints are served
// under /onchain there, path for path — verified: both hosts answer this URL shape with 401
// "API Key Missing" rather than 404, so only the prefix and a header differ.
//
// Unset, nothing changes: same host, no header, exactly today's behaviour.
const CG_KEY = process.env.COINGECKO_API_KEY || '';
const CG_PRO = process.env.COINGECKO_PLAN === 'pro';
const CG_BASE = CG_PRO ? 'https://pro-api.coingecko.com/api/v3/onchain' : 'https://api.coingecko.com/api/v3/onchain';
const CG_HEADER = CG_PRO ? 'x-cg-pro-api-key' : 'x-cg-demo-api-key';

/** The URL and headers to actually use for a GeckoTerminal path, keyed or not. */
function geckoRequest(url) {
  if (!CG_KEY || !url.startsWith(GECKO)) return { url, headers: { Accept: 'application/json' } };
  return {
    url: CG_BASE + url.slice(GECKO.length),
    headers: { Accept: 'application/json', [CG_HEADER]: CG_KEY },
  };
}
const hasGeckoKey = () => Boolean(CG_KEY);
const JUP_PRICE = 'https://lite-api.jup.ag/price/v3';
const JUP_QUOTE = 'https://lite-api.jup.ag/swap/v1/quote';
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const TIMEOUT = 8000;
const ADDR_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

class MemecoinDataError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = 'MemecoinDataError';
    this.status = status;
  }
}

// ── TTL cache with in-flight de-dupe and stale-while-revalidate ─────────────
// A plain TTL couples the user's latency to the upstream's: the instant an entry expires, the next
// arrival pays the whole round trip. Measured against GeckoTerminal's keyless tier at a human pace
// that was a p95 of 13.4s on the trending list, a 23.6s worst case on /new, and half of all chart
// loads failing outright. So an expired entry is served *immediately* and refreshed behind the
// response. The single-flight below is what keeps that from becoming a stampede.
//
// Staleness has to be bounded, or serving the cache turns into a claim about a market that has
// moved on. Every call site that wants stale-while-revalidate therefore declares how old its own
// data may get (maxAgeMs, from MAX_AGE below). Past that ceiling the caller waits, and gets the
// upstream's error if the upstream is still refusing — a number that old is not an answer.
//
// No ceiling declared means no stale serving, which is exactly the old behaviour. Two call sites
// want that deliberately: the deep-page warmer, which does its own staleness accounting against
// the request budget, and the Jupiter quote, which is a price somebody is about to trade on.
const cache = new Map();
const inflight = new Map();
const MAX_ENTRIES = 2000;

// How stale each kind of value may get before a caller waits for a fresh one. These are ceilings
// for a *failing* upstream, not refresh intervals: the TTLs at the call sites are unchanged and a
// healthy upstream still refreshes on them. Each is chosen by what the number is used for.
const MAX_AGE = {
  // A discovery list is about which pools exist and roughly how they rank. That composition drifts
  // over minutes rather than seconds; past five, "trending" would be a statement about the past.
  list: 5 * 60_000,
  // A price shown as current. A minute is the most we will put in front of somebody; the trade
  // path refuses stale prices outright rather than relying on this (see getQuote).
  token: 60_000,
  // One-minute bars: a chart a bar and a half behind reads as lagging, three bars reads as broken.
  ohlcv1m: 90_000,
  // 5m/15m/1h bars move proportionally slower, so the same "about a bar and a half" is minutes.
  ohlcv: 5 * 60_000,
  // A trade tape older than a minute looks like a dead market, which is its own kind of wrong.
  trades: 60_000,
  // SOL is orders of magnitude deeper than anything else here, and it is only ever a denominator.
  sol: 2 * 60_000,
  // holders/decimals. Decimals never change and the holder count is decoration — and this is the
  // GeckoTerminal call that a cold chart click used to wait on before it could even ask for bars.
  info: 6 * 60 * 60_000,
  // A result set for one query: long enough to survive a reload, short enough that a launch shows.
  search: 2 * 60_000,
};

// A background refresh that keeps failing must not be retried by every arriving request, or a dead
// upstream turns into a request flood against a limit that is already refusing us.
const REFRESH_BACKOFF_MS = 2_000;
const REFRESH_BACKOFF_MAX_MS = 60_000;

// When the value was fetched, carried on the value itself so a caller can tell "live" from "a few
// seconds behind". Non-enumerable and a Symbol, so it cannot reach JSON, a spread or a deepEqual.
const CACHED_AT = Symbol('cachedAt');

function stamp(val, at) {
  if (val === null || typeof val !== 'object') return val;
  try {
    Object.defineProperty(val, CACHED_AT, { value: at, enumerable: false, configurable: true, writable: true });
  } catch (_) { /* frozen or exotic: the age is simply unavailable, never a failure */ }
  return val;
}

/** ms since this value was fetched upstream, or null when it did not come from the cache. */
function ageOf(val) {
  const at = val === null || typeof val !== 'object' ? null : val[CACHED_AT];
  return typeof at === 'number' ? Math.max(0, Date.now() - at) : null;
}

function evict(now) {
  if (cache.size < MAX_ENTRIES) return;
  for (const [k, v] of cache) if (v.exp <= now) cache.delete(k);
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value);
}

/**
 * Run the loader and store the result, de-duped by key. Always rejects on failure — whether a
 * stale value is an acceptable substitute is the caller's decision, not this function's, because
 * two callers can join the same in-flight refresh with different staleness ceilings.
 */
function load(key, ttlMs, loader) {
  const p = (async () => {
    const was = cache.get(key);
    try {
      const val = await loader();
      const at = Date.now();
      evict(at);
      cache.set(key, { val: stamp(val, at), exp: at + ttlMs, at, fails: 0, nextTry: 0 });
      // Serving stale data makes an outage invisible, so a recovery is worth a line too: otherwise
      // the only trace of a long failure is the burst of errors that started it.
      if (was?.fails > 0) console.log(`[memecoinData] ${key}: upstream recovered after ${was.fails} failed refresh(es)`);
      return val;
    } catch (err) {
      if (was && cache.get(key) === was) {
        // A refresh that fails is news about the upstream, not about the data: keep the last good
        // value and come back later. The backoff is what makes "later" bounded, so a dead upstream
        // is asked once a minute rather than by every request that arrives.
        was.fails = (was.fails || 0) + 1;
        was.nextTry = Date.now() + Math.min(REFRESH_BACKOFF_MS * 2 ** (was.fails - 1), REFRESH_BACKOFF_MAX_MS);
        console.error(`[memecoinData] ${key}: refresh failed ${was.fails}x (${err.message}); last good value is ${Date.now() - was.at}ms old`);
      }
      throw err;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

/**
 * maxAgeMs — how old this key's value may get while still being served instantly, with the refresh
 * happening behind the answer. 0 (the default) opts out of stale-while-revalidate: the caller waits
 * for the loader, and falls back to the last value only if the loader fails.
 */
async function cached(key, ttlMs, loader, maxAgeMs = 0) {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.exp > now) return hit.val;
  if (hit && maxAgeMs > 0 && now - hit.at < maxAgeMs) {
    // Expired but inside its ceiling: answer from cache and refresh behind the answer. The
    // in-flight check stops every arrival starting its own refresh; nextTry stops a failing
    // upstream being asked by every arrival.
    if (!inflight.has(key) && now >= (hit.nextTry || 0)) {
      load(key, ttlMs, loader).catch(() => { /* load() logged it; the stale value stands */ });
    }
    return hit.val;
  }
  const p = inflight.get(key) || load(key, ttlMs, loader);
  if (maxAgeMs > 0) {
    // Past the ceiling (or nothing cached at all). This caller waits, and if the upstream is still
    // refusing it gets the error: a value this old is not an answer, and pretending otherwise is
    // how an outage becomes invisible.
    if (hit) console.error(`[memecoinData] ${key}: value is ${now - hit.at}ms old, past its ${maxAgeMs}ms ceiling; refusing to serve it`);
    return p;
  }
  // No ceiling declared keeps the original contract: an unbounded stale value beats an error.
  return p.catch((err) => {
    const prev = cache.get(key);
    if (prev) return prev.val;
    throw err;
  });
}

// A value we were handed rather than fetched (see notePools). Same eviction rule as cached().
function remember(key, ttlMs, val) {
  const now = Date.now();
  evict(now);
  cache.set(key, { val: stamp(val, now), exp: now + ttlMs, at: now, fails: 0, nextTry: 0 });
}

// Is there a live entry? Lets a caller skip spending a request budget on something it already has.
const isFresh = (key) => { const h = cache.get(key); return Boolean(h && h.exp > Date.now()); };
// The last value for a key, fresh or not. Only for callers that choose to skip the loader entirely.
const peek = (key) => cache.get(key)?.val;
// ms until a key expires; <= 0 means expired, null means nothing is cached. The warmer reads this
// to refresh a key just before a request would have had to.
const freshFor = (key) => { const h = cache.get(key); return h ? h.exp - Date.now() : null; };
// How old a key's value is, independent of its TTL. null when nothing is cached.
const cacheAge = (key) => { const h = cache.get(key); return h ? Date.now() - h.at : null; };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A 429 is often a blip rather than a verdict: the keyless tier refuses a third of chart loads at
// a human click pace and answers `retry-after: 0`, meaning it will take the same request again
// now. So a call somebody is waiting on asks again instead of becoming "chart unavailable" in the
// UI. Only ever for the GETs this module makes (nothing here is non-idempotent), bounded by
// RETRY_WAITS, jittered so two tabs do not line their retries up, and dropped entirely while the
// budget is still cooling off from an earlier refusal — measured against the live tier, a retry
// into a limit that is known to be full gets refused as well, so asking twice would only spend
// twice the quota for the same answer. It is the same rule the terminal applies to its own retry,
// which is what retryAfterMs below tells it.
// A retry-after longer than RETRY_MAX_WAIT is honoured by giving up at once rather than sleeping
// on it: upstream has said it is still refusing, and making the user wait seconds for the same
// error is worse than saying so.
const RETRY_WAITS = [250, 700];
const RETRY_MAX_WAIT = 1_500;
const RETRY_JITTER = 0.4;

/** retry-after as ms (it may be seconds or an HTTP date), or null when it is absent/unusable. */
function retryAfterMs(response) {
  const raw = response?.headers?.['retry-after'] ?? response?.headers?.get?.('retry-after');
  if (raw === undefined || raw === null || raw === '') return null;
  const secs = Number(raw);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const at = Date.parse(raw);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null;
}

/** How long to wait before attempt+1, or null when the wait is not worth making anyone sit through. */
function backoffMs(attempt, afterMs) {
  const base = RETRY_WAITS[attempt] ?? RETRY_WAITS[RETRY_WAITS.length - 1];
  const want = afterMs === null ? base : Math.max(afterMs, base);
  if (want > RETRY_MAX_WAIT) return null;
  return Math.round(want * (1 + (Math.random() * 2 - 1) * RETRY_JITTER));
}

/**
 * opts.retries  extra attempts after a 429 (capped at RETRY_WAITS.length); default none.
 * opts.priority 'user' marks the call as one somebody is waiting on, which makes the
 *               opportunistic lane of the GeckoTerminal budget stand down while it is in flight.
 */
async function getJson(url, params, opts = {}) {
  const gecko = url.startsWith(GECKO);
  const retries = Math.min(opts.retries ?? 0, RETRY_WAITS.length);
  const release = gecko && opts.priority === 'user' ? geckoBudget.beginUserCall() : null;
  try {
    for (let attempt = 0; ; attempt += 1) {
      // Every GeckoTerminal request this process makes goes through here, so this is the one place
      // that can keep an honest count of what the shared free-tier budget has spent.
      if (gecko) geckoBudget.record();
      try {
        const req = geckoRequest(url);
        const r = await axios.get(req.url, { params, timeout: TIMEOUT, headers: req.headers });
        return r.data;
      } catch (err) {
        const status = err.response?.status;
        if (status === 404) throw new MemecoinDataError('Not found upstream', 404);
        if (status !== 429) throw new MemecoinDataError(`Upstream request failed: ${err.code || status || err.message}`, 502);
        const after = retryAfterMs(err.response);
        const knownFull = gecko && geckoBudget.coolingOff();
        // Whoever got refused, the limit is now known to be tight: the prefetch lane stands down.
        if (gecko) geckoBudget.note429(after ?? 0);
        const wait = attempt < retries && !knownFull ? backoffMs(attempt, after) : null;
        if (wait === null) {
          const e = new MemecoinDataError('Upstream rate limited, try again shortly', 503);
          // How long we know the limit will stay full. A client that is told this can wait for its
          // next poll instead of spending three requests discovering the same thing.
          if (gecko) e.retryAfterMs = geckoBudget.coolOffRemaining();
          throw e;
        }
        await sleep(wait);
      }
    }
  } finally {
    if (release) release();
  }
}

const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function isValidAddress(a) {
  return typeof a === 'string' && ADDR_RE.test(a);
}

// ── untrusted text hardening ────────────────────────────────────────────────
// Token names/symbols are attacker-controlled. Strip control/format chars (bidi overrides, zero-width, BOM, tag chars),
// invisible "filler" glyphs used for padding/spoofing, variation selectors and combining-mark stacks; NFKC-normalise
// (folds fullwidth/compat homoglyphs), collapse whitespace and cap length by code point.
const FILLER_CHARS = [0x115F, 0x1160, 0x3164, 0xFFA0, 0x2800, 0x17B4, 0x17B5].map((c) => String.fromCharCode(c)).join('');
const INVISIBLE_RE = new RegExp(String.raw`[\p{Cc}\p{Cf}\p{Co}\p{Cs}\p{Zl}\p{Zp}\p{Variation_Selector}${FILLER_CHARS}]`, 'gu');
const BREAK_CHARS = [9, 10, 11, 12, 13, 0x85, 0x2028, 0x2029].map((c) => String.fromCharCode(c)).join(''); // tab/newline-like controls
const BREAK_RE = new RegExp(`[${BREAK_CHARS}]+`, 'g');
const SYMBOL_MAX = 32;
const NAME_MAX = 48;

function shortMint(address) {
  return typeof address === 'string' && address.length > 10 ? `${address.slice(0, 4)}...${address.slice(-4)}` : (address || '?');
}

function sanitizeText(value, max, fallback = '') {
  if (typeof value !== 'string' && typeof value !== 'number') return fallback;
  let s = String(value).slice(0, 4 * max + 64); // bound work on huge inputs
  // whitespace (tab/newline/etc. are control chars) becomes a single space BEFORE control chars are stripped,
  // otherwise "a\nb" would fuse into "ab"
  s = s.replace(BREAK_RE, ' ').replace(INVISIBLE_RE, '').normalize('NFKC').replace(INVISIBLE_RE, '');
  s = s.replace(/(\p{M}{2})\p{M}+/gu, '$1').replace(/\s+/gu, ' ').trim();
  s = Array.from(s).slice(0, max).join('').trim();
  return s || fallback;
}
const cleanSymbol = (v, address) => sanitizeText(v, SYMBOL_MAX, shortMint(address));
const cleanName = (v, address, symbol) => sanitizeText(v, NAME_MAX, symbol || shortMint(address));
// Only plain http(s) URLs are passed through to <img src>/links (no javascript:, data:, etc.)
const cleanUrl = (u) => (typeof u === 'string' && /^https?:\/\/[^\s]{1,500}$/i.test(u) ? u : null);
const cleanLinks = (list) => (Array.isArray(list) ? list : []).slice(0, 10)
  .map((x) => ({ ...x, url: cleanUrl(x?.url), type: sanitizeText(x?.type, 24), label: sanitizeText(x?.label, 32) }))
  .filter((x) => x.url);

// ── normalisers ─────────────────────────────────────────────────────────────
function fromDexPair(p) {
  if (!p) return null;
  const address = p.baseToken?.address;
  const symbol = cleanSymbol(p.baseToken?.symbol, address);
  return {
    address,
    symbol,
    name: cleanName(p.baseToken?.name, address, symbol),
    price: num(p.priceUsd),
    price_native: num(p.priceNative),
    mcap: num(p.marketCap) ?? num(p.fdv),
    fdv: num(p.fdv),
    liquidity_usd: num(p.liquidity?.usd),
    volume_5m: num(p.volume?.m5),
    volume_1h: num(p.volume?.h1),
    volume_6h: num(p.volume?.h6),
    volume_24h: num(p.volume?.h24),
    change_5m: num(p.priceChange?.m5),
    change_1h: num(p.priceChange?.h1),
    change_6h: num(p.priceChange?.h6),
    change_24h: num(p.priceChange?.h24),
    buy_count: num(p.txns?.h1?.buys),
    sell_count: num(p.txns?.h1?.sells),
    buys_5m: num(p.txns?.m5?.buys),
    sells_5m: num(p.txns?.m5?.sells),
    holders: null,
    pair: {
      pair_address: p.pairAddress,
      dex: p.dexId,
      quote_symbol: sanitizeText(p.quoteToken?.symbol, SYMBOL_MAX),
      quote_address: p.quoteToken?.address,
      created_at: p.pairCreatedAt || null,
      url: cleanUrl(p.url),
    },
    image: cleanUrl(p.info?.imageUrl),
    websites: cleanLinks(p.info?.websites),
    socials: cleanLinks(p.info?.socials),
  };
}

function fromGeckoPool(pool, included) {
  const a = pool.attributes || {};
  const baseId = pool.relationships?.base_token?.data?.id; // solana_<addr>
  const address = baseId ? baseId.replace(/^solana_/, '') : null;
  const tok = (included || []).find((i) => i.id === baseId)?.attributes;
  const poolName = typeof a.name === 'string' ? a.name : '';
  const symbol = cleanSymbol(tok?.symbol || poolName.split('/')[0], address);
  const t = a.transactions || {};
  return {
    address,
    symbol,
    name: cleanName(tok?.name, address, symbol),
    price: num(a.base_token_price_usd),
    mcap: num(a.market_cap_usd) ?? num(a.fdv_usd),
    fdv: num(a.fdv_usd),
    liquidity_usd: num(a.reserve_in_usd),
    volume_5m: num(a.volume_usd?.m5),
    volume_1h: num(a.volume_usd?.h1),
    volume_6h: num(a.volume_usd?.h6),
    volume_24h: num(a.volume_usd?.h24),
    change_5m: num(a.price_change_percentage?.m5),
    change_1h: num(a.price_change_percentage?.h1),
    change_6h: num(a.price_change_percentage?.h6),
    change_24h: num(a.price_change_percentage?.h24),
    buy_count: num(t.h1?.buys),
    sell_count: num(t.h1?.sells),
    buys_5m: num(t.m5?.buys),
    sells_5m: num(t.m5?.sells),
    holders: null,
    pair: {
      pair_address: a.address,
      dex: pool.relationships?.dex?.data?.id,
      created_at: a.pool_created_at ? Date.parse(a.pool_created_at) : null,
    },
    image: cleanUrl(tok?.image_url),
  };
}

function dedupe(list) {
  const seen = new Set();
  return list.filter((t) => {
    if (!t.address || seen.has(t.address)) return false;
    seen.add(t.address);
    return true;
  });
}

// ── list endpoints ──────────────────────────────────────────────────────────
async function geckoPools(path, page = 1) {
  const data = await getJson(`${GECKO}/networks/solana/${path}`, { include: 'base_token', page });
  return dedupe((data.data || []).map((p) => fromGeckoPool(p, data.included)));
}

// ── address -> pool ─────────────────────────────────────────────────────────
// A token's main pool is the only thing the chart and the trade feed need from the token detail,
// and a pool address does not change. Remembering it on its own turns a chart load from two
// serial requests (DexScreener detail, then GeckoTerminal OHLCV) into one — and every list row
// already carries it, so clicking a coin in the terminal usually needs no lookup at all.
const POOL_TTL = 6 * 60 * 60_000;
const poolKey = (address) => `pool:${address}`;

function notePools(list) {
  for (const t of Array.isArray(list) ? list : []) {
    const p = t?.pair?.pair_address;
    if (t?.address && typeof p === 'string' && p) remember(poolKey(t.address), POOL_TTL, p);
  }
  return list;
}

const knownPool = (address) => (isFresh(poolKey(address)) ? peek(poolKey(address)) : null);

/** The token's pool, from the full detail lookup. Null when no DEX has paired it yet. */
async function resolvePool(address) {
  const token = await getToken(address);   // notePools runs inside it, via indexed()
  return token.pair?.pair_address || null;
}

// Discovery-index writes are best-effort and lazily required so a DB problem never breaks a response.
function indexed(list, source) {
  notePools(list);   // every row already knows its pool; this is what makes the next click one request
  try { require('./tokenIndex').recordTokens(list, source); } catch (err) { console.error('[tokenIndex]', err.message); }
  return list;
}

// GeckoTerminal serves exactly 20 pools per page, so one page is not "the market". Page 1 is the
// part that actually moves and keeps the short TTL below; pages 2..N are kept warm on a long TTL
// inside the opportunistic half of the request budget, and a page that fails is simply left out —
// a short list beats a 503.
//
// The long TTL is not an optimisation, it is the only thing that works: measured from one IP, the
// keyless tier refuses roughly three deep-page requests in four no matter how far apart they are
// spaced, so a page has to be kept once it is finally obtained or the list visibly oscillates
// between 20 rows and 100. That makes deep pages a dependable source of *which* pools exist and a
// poor source of what they are worth, so their numbers are refreshed separately (repriceFromDex).
const GECKO_DEEP_PAGES = 5;        // page 1 plus four deep pages ≈ 100 pools per list
const DEEP_PAGE_TTL = 10 * 60_000;
const DEEP_WARM_BUDGET_MS = 2_000; // most we will ever spend spacing deep-page calls apart in one load
// How many pages one load is allowed to go and fetch. Four of them back to back is a burst that
// puts us over the limit for the next half minute, which is exactly when somebody opens the
// terminal and clicks a coin: measured, that burst was the difference between 2 charts out of 8
// and 6 out of 8. The pages the burst used to win still arrive, two at a time, on the refreshes
// that follow — and once a page is won it is kept, so breadth builds up rather than oscillating.
const DEEP_WARM_PER_LOAD = 2;

async function geckoDeepPools(path) {
  const out = [];
  let waited = 0;
  let fetching = 0;
  for (let page = 2; page <= GECKO_DEEP_PAGES; page++) {
    const key = `gkpage:${path}:${page}`;
    if (!isFresh(key)) {
      const serveLast = () => { const last = peek(key); if (last) out.push(...last); };
      if (fetching >= DEEP_WARM_PER_LOAD) { serveLast(); continue; }
      const wait = geckoBudget.waitFor();
      if (wait > 0 && waited + wait <= DEEP_WARM_BUDGET_MS) { await sleep(wait); waited += wait; }
      if (!geckoBudget.tryTake(1)) {
        serveLast();                     // out of budget: whatever this page last held, or nothing
        continue;
      }
      fetching += 1;
    }
    // cached() serves the stale page when a refresh fails, so a deep page can only ever add rows
    const rows = await cached(key, DEEP_PAGE_TTL, () => geckoPools(path, page)).catch(() => null);
    if (rows) out.push(...rows);
  }
  return out;
}

// Fallback for trending: DexScreener boosted tokens, hydrated via /tokens/v1
async function dexBoosted() {
  const boosts = await getJson(`${DEXSCREENER}/token-boosts/top/v1`);
  const addrs = [...new Set((Array.isArray(boosts) ? boosts : [])
    .filter((b) => b.chainId === 'solana').map((b) => b.tokenAddress))].slice(0, 30);
  if (!addrs.length) return [];
  const pairs = await getJson(`${DEXSCREENER}/tokens/v1/solana/${addrs.join(',')}`);
  return dedupe(bestPairsByToken(pairs).map(fromDexPair));
}

function bestPairsByToken(pairs) {
  const best = new Map();
  for (const p of Array.isArray(pairs) ? pairs : []) {
    const k = p.baseToken?.address;
    if (!k) continue;
    const cur = best.get(k);
    if (!cur || (p.liquidity?.usd || 0) > (cur.liquidity?.usd || 0)) best.set(k, p);
  }
  return [...best.values()];
}

// Deep-page rows, repriced. DexScreener prices 30 tokens per request and allows ~300 requests a
// minute, so the numbers past page 1 cost four cheap calls rather than four contested ones.
// A token DexScreener has nothing for keeps its GeckoTerminal row: a stale row beats a missing one.
const DEX_BATCH = 30;
const REPRICE_BATCHES = 4;         // up to 120 addresses, which covers every deep page

async function repriceFromDex(tokens) {
  const batches = [];
  for (let i = 0; i < tokens.length && batches.length < REPRICE_BATCHES; i += DEX_BATCH) {
    batches.push(tokens.slice(i, i + DEX_BATCH).map((t) => t.address));
  }
  const rows = (await Promise.all(batches.map((b) => hydrateTokens(b).catch(() => [])))).flat();
  const fresh = new Map(rows.map((t) => [t.address, t]));
  return tokens.map((t) => {
    const f = fresh.get(t.address);
    if (!f) return t;
    // The pool's creation time is the /new list's age column, and GeckoTerminal always has it
    // where DexScreener sometimes does not; keep whichever we actually know.
    return { ...f, image: f.image || t.image, pair: { ...f.pair, created_at: f.pair?.created_at ?? t.pair?.created_at ?? null } };
  });
}

// Page 1 straight from GeckoTerminal, then the warm deep pages with their numbers refreshed.
// Only page 1 can throw; everything after it degrades to whatever was obtainable.
async function geckoList(path) {
  ingestLaunches();   // every 30s, so launches land in the index even when nobody searches
  const first = await geckoPools(path, 1);
  const seen = new Set(first.map((t) => t.address));
  const deep = dedupe(await geckoDeepPools(path)).filter((t) => !seen.has(t.address));
  return [...first, ...await repriceFromDex(deep)];
}

async function getTrending() {
  return cached('trending', 30_000, async () => {
    try {
      return indexed(await geckoList('trending_pools'), 'trending');
    } catch (e) {
      return indexed(await dexBoosted(), 'trending');
    }
  }, MAX_AGE.list);
}

async function getNew() {
  return cached('new', 30_000, async () => {
    try {
      return indexed(await geckoList('new_pools'), 'new');
    } catch (e) {
      // Fallback: latest token profiles from DexScreener
      const prof = await getJson(`${DEXSCREENER}/token-profiles/latest/v1`);
      const addrs = [...new Set((Array.isArray(prof) ? prof : [])
        .filter((b) => b.chainId === 'solana').map((b) => b.tokenAddress))].slice(0, 30);
      if (!addrs.length) throw e;
      const pairs = await getJson(`${DEXSCREENER}/tokens/v1/solana/${addrs.join(',')}`);
      return indexed(dedupe(bestPairsByToken(pairs).map(fromDexPair)), 'new');
    }
  }, MAX_AGE.list);
}

// ── search ──────────────────────────────────────────────────────────────────
// DexScreener's search is narrow — at most 30 pairs, which for "pump" measured two Solana tokens —
// so it is a supplement, not the source. The local discovery index (services/tokenIndex) answers
// first with every token this server has ever seen, and the index's hits get their numbers from the
// live path rather than from the index, which knows identity only.
const SEARCH_RESULTS = 50;
const HYDRATE_MAX = DEX_BATCH;   // the best index hits get live numbers, in one request

// The same tiers tokenIndex ranks by, so DexScreener rows and index rows can be ordered together.
function matchTier(symbol, name, q) {
  const s = String(symbol || '').toLowerCase();
  const n = String(name || '').toLowerCase();
  if (s === q) return 0;
  if (s.startsWith(q)) return 1;
  if (n === q) return 2;
  if (n.startsWith(q)) return 3;
  if (s.includes(q)) return 4;
  return 5;
}

async function dexSearch(query) {
  const data = await getJson(`${DEXSCREENER}/latest/dex/search`, { q: query });
  const pairs = (data.pairs || []).filter((p) => p.chainId === 'solana');
  return bestPairsByToken(pairs).map(fromDexPair);
}

/** Live rows for up to HYDRATE_MAX addresses in one DexScreener request. */
async function hydrateTokens(addresses) {
  if (!addresses.length) return [];
  const pairs = await getJson(`${DEXSCREENER}/tokens/v1/solana/${addresses.join(',')}`);
  const want = new Set(addresses);
  // A returned pair may hold one of ours as the quote side; only base-token matches are our tokens.
  return bestPairsByToken((Array.isArray(pairs) ? pairs : []).filter((p) => want.has(p.baseToken?.address)))
    .map(fromDexPair);
}

/**
 * An index hit no DEX can price yet (a pump.fun coin with no pair). Identity only: price, mcap and
 * liquidity are null, never the remembered figures, so nothing downstream can read a stale number
 * as a live quote. The last-known values travel under their own names for display that wants them.
 */
function fromIndexRow(r) {
  const symbol = cleanSymbol(r.symbol, r.address);
  return {
    address: r.address,
    symbol,
    name: cleanName(r.name, r.address, symbol),
    price: null,
    mcap: null,
    fdv: null,
    liquidity_usd: null,
    volume_5m: null, volume_1h: null, volume_6h: null, volume_24h: null,
    change_5m: null, change_1h: null, change_6h: null, change_24h: null,
    buy_count: null, sell_count: null, buys_5m: null, sells_5m: null, holders: null,
    pair: null,
    image: null,
    source: 'index',
    last_seen: r.last_seen_ts ? r.last_seen_ts * 1000 : null,
    last_mcap: num(r.mcap),
    last_liquidity_usd: num(r.liquidity_usd),
  };
}

function searchIndex(query, limit) {
  try { return require('./tokenIndex').searchIndex(query, limit); } catch (err) { console.error('[tokenIndex]', err.message); return []; }
}

// Fold in whatever the Helius watcher has seen since we last looked. A no-op when that feature is
// off, which is why it needs no flag check here.
function ingestLaunches() {
  try { require('./tokenIndex').ingestLaunches(); } catch (err) { console.error('[tokenIndex]', err.message); }
}

async function search(q) {
  const query = String(q || '').trim().slice(0, 80);
  if (!query) return [];
  return cached(`search:${query.toLowerCase()}`, 20_000, async () => {
    if (isValidAddress(query)) {
      const t = await getToken(query).catch(() => null);
      return t ? [t] : [];
    }
    const lower = query.toLowerCase();
    let live = [];
    let liveFailed = false;
    try { live = await dexSearch(query); } catch (_) { liveFailed = true; }
    indexed(live, 'search');

    ingestLaunches();   // a coin launched seconds ago should be findable by the time it is searched
    const known = new Set(live.map((t) => t.address));
    const extra = searchIndex(query, SEARCH_RESULTS).filter((r) => !known.has(r.address));
    const hydrated = await hydrateTokens(extra.slice(0, HYDRATE_MAX).map((r) => r.address)).catch(() => []);
    const byAddress = new Map(hydrated.map((t) => [t.address, t]));

    const merged = dedupe([...live, ...extra.map((r) => byAddress.get(r.address) || fromIndexRow(r))]);
    // DexScreener down and nothing of our own to show: still an error, as it was before the index.
    // With index hits we can answer anyway, which is the whole point of keeping one.
    if (liveFailed && !merged.length) throw new MemecoinDataError('Upstream search failed', 502);
    // Rank by how well the text matches, then by depth; priceless index rows sink inside their tier.
    return merged
      .map((t) => ({ t, tier: matchTier(t.symbol, t.name, lower) }))
      .sort((a, b) => a.tier - b.tier
        || (b.t.liquidity_usd || 0) - (a.t.liquidity_usd || 0)
        || (b.t.mcap || 0) - (a.t.mcap || 0))
      .slice(0, SEARCH_RESULTS)
      .map((x) => x.t);
  }, MAX_AGE.search);
}

// ── token detail ────────────────────────────────────────────────────────────
async function getTokenInfo(address) {
  // holders / decimals from GeckoTerminal; optional
  return cached(`info:${address}`, 5 * 60_000, async () => {
    try {
      const d = await getJson(`${GECKO}/networks/solana/tokens/${address}/info`, undefined, { priority: 'user' });
      const a = d.data?.attributes || {};
      return { holders: num(a.holders?.count), decimals: num(a.decimals), image: cleanUrl(a.image_url) };
    } catch (_) {
      return { holders: null, decimals: null, image: null };
    }
  }, MAX_AGE.info);
}

/**
 * opts.fresh — never answer from an expired entry without asking upstream first. For the one caller
 * that must not: a trade fills at this price. It still falls back to the last known price if the
 * upstream fails outright, because refusing the trade over a blip is worse — what it will not do is
 * skip the round trip.
 */
async function getToken(address, opts = {}) {
  if (!isValidAddress(address)) throw new MemecoinDataError('Invalid Solana address', 400);
  const base = await cached(`token:${address}`, 10_000, async () => {
    const pairs = await getJson(`${DEXSCREENER}/tokens/v1/solana/${address}`);
    const best = bestPairsByToken((Array.isArray(pairs) ? pairs : [])
      .filter((p) => p.baseToken?.address === address))[0];
    if (!best) throw new MemecoinDataError('Token not found', 404);
    const tok = fromDexPair(best);
    indexed([tok], 'token');     // inside the loader, so a hot token is not re-indexed on every call
    return tok;
  }, opts.fresh ? 0 : MAX_AGE.token);
  const info = await getTokenInfo(address);
  const token = { ...base, holders: info.holders, decimals: info.decimals, image: base.image || info.image };
  // The merged record is new every call, so carry the price row's age onto it — that row is the
  // part a caller would want to know the age of.
  return stamp(token, Date.now() - (ageOf(base) ?? 0));
}

// ── OHLCV ───────────────────────────────────────────────────────────────────
const TF = {
  '1m': { unit: 'minute', agg: 1 },
  '5m': { unit: 'minute', agg: 5 },
  '15m': { unit: 'minute', agg: 15 },
  '1h': { unit: 'hour', agg: 1 },
};

function ohlcvForPool(pool, tf, cfg) {
  return cached(`ohlcv:${pool}:${tf}`, tf === '1m' ? 10_000 : 20_000, async () => {
    const d = await getJson(`${GECKO}/networks/solana/pools/${pool}/ohlcv/${cfg.unit}`, {
      aggregate: cfg.agg, limit: 300, currency: 'usd',
    }, { retries: 2, priority: 'user' });
    const list = d.data?.attributes?.ohlcv_list || [];
    return list
      .map(([t, o, h, l, c, v]) => ({ time: t, open: +o, high: +h, low: +l, close: +c, volume: +v }))
      .sort((a, b) => a.time - b.time);
  }, tf === '1m' ? MAX_AGE.ohlcv1m : MAX_AGE.ohlcv);
}

/** The cache key an OHLCV refresh would touch, or null when the pool is not known yet. */
function ohlcvKey(address, tf) {
  const pool = knownPool(address);
  return pool && TF[tf] ? `ohlcv:${pool}:${tf}` : null;
}

async function getOhlcv(address, tf = '5m') {
  const cfg = TF[tf];
  if (!cfg) throw new MemecoinDataError('tf must be one of 1m, 5m, 15m, 1h', 400);
  if (!isValidAddress(address)) throw new MemecoinDataError('Invalid Solana address', 400);
  const remembered = knownPool(address);
  const pool = remembered || await resolvePool(address);
  if (!pool) throw new MemecoinDataError('No pool for token', 404);
  try {
    return await ohlcvForPool(pool, tf, cfg);
  } catch (err) {
    // A remembered pool can go stale in one way: the pair migrates and the old one stops existing.
    // Re-resolve once on a 404 rather than telling the user the chart is unavailable.
    if (err.status !== 404 || !remembered) throw err;
    cache.delete(poolKey(address));
    const fresh = await resolvePool(address);
    if (!fresh) throw new MemecoinDataError('No pool for token', 404);
    if (fresh === pool) throw err;
    return ohlcvForPool(fresh, tf, cfg);
  }
}

// ── trades ──────────────────────────────────────────────────────────────────
async function getTrades(address) {
  if (!isValidAddress(address)) throw new MemecoinDataError('Invalid Solana address', 400);
  const pool = knownPool(address) || await resolvePool(address);
  if (!pool) throw new MemecoinDataError('No pool for token', 404);
  return cached(`trades:${pool}`, 8_000, async () => {
    const d = await getJson(`${GECKO}/networks/solana/pools/${pool}/trades`, undefined, { retries: 1, priority: 'user' });
    return (d.data || []).map((t) => {
      const a = t.attributes || {};
      const side = a.kind === 'buy' || a.kind === 'sell' ? a.kind : null;
      return {
        time: a.block_timestamp ? Math.floor(Date.parse(a.block_timestamp) / 1000) : null,
        side,
        price: num(side === 'buy' ? a.price_to_in_usd : a.price_from_in_usd) ?? num(a.price_from_in_usd),
        amount_usd: num(a.volume_in_usd),
        token_amount: num(side === 'buy' ? a.to_token_amount : a.from_token_amount),
        wallet: a.tx_from_address || null,
        tx: a.tx_hash || null,
      };
    });
  }, MAX_AGE.trades);
}

// ── SOL price & quotes ──────────────────────────────────────────────────────
async function getSolPrice(opts = {}) {
  return cached('solprice', 15_000, async () => {
    try {
      const d = await getJson(JUP_PRICE, { ids: SOL_MINT });
      const p = num(d?.[SOL_MINT]?.usdPrice);
      if (p) return p;
    } catch (_) { /* fall through */ }
    const pairs = await getJson(`${DEXSCREENER}/tokens/v1/solana/${SOL_MINT}`);
    const best = bestPairsByToken((Array.isArray(pairs) ? pairs : [])
      .filter((p) => p.baseToken?.address === SOL_MINT))[0];
    const p = num(best?.priceUsd);
    if (!p) throw new MemecoinDataError('SOL price unavailable', 502);
    return p;
  }, opts.fresh ? 0 : MAX_AGE.sol);
}

// Constant-product style impact estimate from pool liquidity (liquidity_usd is both sides,
// so one side is ~liq/2).
function estimateImpact(tradeUsd, liquidityUsd, side) {
  if (!liquidityUsd || liquidityUsd <= 0) return 0.5; // unknown liquidity: assume severe
  const reserve = liquidityUsd / 2;
  const frac = tradeUsd / reserve;
  const impact = side === 'buy' ? frac : frac / (1 + frac); // avg-fill vs spot, constant product
  return Math.min(Math.max(impact, 0), 0.99);
}

/**
 * Returns {side, address, symbol, solPrice, marketPrice, fillPrice, tokens, usd, amountSol,
 *          priceImpactPct, slippageBps, minReceived, source}
 * Buy: amountSol is SOL spent. Sell: amountSol is SOL-value of tokens to sell
 * (or pass amountTokens for an exact token amount).
 */
async function getQuote({ address, side, amountSol, amountTokens, slippageBps }) {
  if (side !== 'buy' && side !== 'sell') throw new MemecoinDataError("side must be 'buy' or 'sell'", 400);
  const slip = Number.isFinite(+slippageBps) ? Math.min(Math.max(Math.round(+slippageBps), 0), 5000) : 100;
  // Deliberately not stale-while-revalidate: the fill price and the SOL conversion both come from
  // here and a paper trade is settled against them, so this one call still makes the round trip
  // instead of answering from an entry that has expired.
  const [token, solPrice] = await Promise.all([getToken(address, { fresh: true }), getSolPrice({ fresh: true })]);
  if (!token.price) throw new MemecoinDataError('Token has no price', 502);

  let usd;
  let tokensIn = null;
  if (side === 'sell' && amountTokens !== undefined && amountTokens !== null && amountTokens !== '') {
    tokensIn = Number(amountTokens);
    if (typeof amountTokens === 'boolean' || !Number.isFinite(tokensIn) || tokensIn <= 0 || tokensIn > 1e21) {
      throw new MemecoinDataError('amountTokens must be a positive number', 400);
    }
    usd = tokensIn * token.price;
  } else {
    const sol = typeof amountSol === 'boolean' ? NaN : Number(amountSol);
    if (!Number.isFinite(sol) || sol <= 0) throw new MemecoinDataError('amountSol must be a positive number', 400);
    if (sol > 1000) throw new MemecoinDataError('amountSol too large', 400);
    usd = sol * solPrice;
  }

  let impact = null;
  let source = 'estimate';
  // Best effort: real Jupiter route for price impact
  try {
    const decimals = token.decimals;
    if (decimals !== null && decimals !== undefined) {
      const lamports = Math.floor((usd / solPrice) * 1e9);
      if (lamports > 0) {
        const q = await cached(`jq:${address}:${side}:${lamports}:${slip}`, 5_000, () =>
          getJson(JUP_QUOTE, {
            inputMint: side === 'buy' ? SOL_MINT : address,
            outputMint: side === 'buy' ? address : SOL_MINT,
            amount: side === 'buy' ? lamports : Math.floor((tokensIn ?? usd / token.price) * 10 ** decimals),
            slippageBps: slip,
          }));
        const pi = num(q.priceImpactPct);
        if (pi !== null) { impact = Math.abs(pi); source = 'jupiter'; }
      }
    }
  } catch (_) { /* fall back to estimate */ }
  if (impact === null) impact = estimateImpact(usd, token.liquidity_usd, side);

  const marketPrice = token.price;
  const fillPrice = side === 'buy' ? marketPrice * (1 + impact) : marketPrice * (1 - impact);
  const tokens = side === 'buy' ? usd / fillPrice : (tokensIn ?? usd / marketPrice);
  const proceedsUsd = side === 'buy' ? usd : tokens * fillPrice;
  const expected = side === 'buy' ? tokens : proceedsUsd / solPrice;

  return {
    side,
    address,
    symbol: token.symbol,
    solPrice,
    marketPrice,
    fillPrice,
    tokens,
    usd: side === 'buy' ? usd : proceedsUsd,
    amountSol: side === 'buy' ? usd / solPrice : proceedsUsd / solPrice,
    priceImpactPct: impact * 100,
    slippageBps: slip,
    minReceived: expected * (1 - slip / 10_000),
    exceedsSlippage: impact * 10_000 > slip,
    liquidity_usd: token.liquidity_usd,
    source,
  };
}

module.exports = {
  hasGeckoKey, ageOf, MAX_AGE,
  MemecoinDataError, isValidAddress, getTrending, getNew, search, getToken,
  getOhlcv, getTrades, getSolPrice, getQuote, SOL_MINT,
  sanitizeText, cleanSymbol, cleanName, cleanUrl, shortMint, fromDexPair, fromGeckoPool,
  matchTier, fromIndexRow, GECKO_DEEP_PAGES, DEEP_WARM_PER_LOAD, SEARCH_RESULTS, POOL_TTL,
  // what the warmer needs to know about the cache without duplicating any of its key shapes
  freshFor, cacheAge, ohlcvKey,
  // test helpers: what the long-lived address -> pool mapping currently holds
  _knownPool: knownPool,
  // test helpers: drop entries, or age them out while keeping the value cached() falls back to
  _resetCache: (pred) => {
    for (const k of [...cache.keys()]) if (!pred || pred(k)) cache.delete(k);
    inflight.clear();
  },
  _expireCache: (pred) => { for (const [k, v] of cache) if (!pred || pred(k)) v.exp = 0; },
  // test helper: pretend an entry was fetched `ms` ago, which is the only way to reach the hard
  // staleness ceiling without a test that sits there for minutes.
  _ageCache: (pred, ms) => {
    for (const [k, v] of cache) if (!pred || pred(k)) {
      v.at -= ms; v.exp -= ms; v.nextTry = 0;
      stamp(v.val, v.at);   // the age travels on the value, so moving the entry has to move that too
    }
  },
};
