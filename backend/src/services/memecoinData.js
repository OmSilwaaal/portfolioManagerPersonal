// Free, keyless Solana memecoin data (DexScreener, GeckoTerminal, Jupiter) with TTL caching.
// Every exported function resolves (never throws) unless noted; errors are surfaced as
// MemecoinDataError so routes can map them to a clean 4xx/5xx.
const axios = require('axios');

const DEXSCREENER = 'https://api.dexscreener.com';
const GECKO = 'https://api.geckoterminal.com/api/v2';
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

// ── tiny TTL cache with in-flight de-dupe ───────────────────────────────────
const cache = new Map();
const inflight = new Map();
const MAX_ENTRIES = 2000;

async function cached(key, ttlMs, loader) {
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && hit.exp > now) return hit.val;
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    try {
      const val = await loader();
      if (cache.size >= MAX_ENTRIES) {
        for (const [k, v] of cache) if (v.exp <= now) cache.delete(k);
        if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value);
      }
      cache.set(key, { val, exp: Date.now() + ttlMs });
      return val;
    } catch (err) {
      // serve stale data on upstream failure
      if (hit) return hit.val;
      throw err;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

async function getJson(url, params) {
  try {
    const r = await axios.get(url, {
      params,
      timeout: TIMEOUT,
      headers: { Accept: 'application/json' },
    });
    return r.data;
  } catch (err) {
    const status = err.response?.status;
    if (status === 404) throw new MemecoinDataError('Not found upstream', 404);
    if (status === 429) throw new MemecoinDataError('Upstream rate limited, try again shortly', 503);
    throw new MemecoinDataError(`Upstream request failed: ${err.code || status || err.message}`, 502);
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

async function getTrending() {
  return cached('trending', 30_000, async () => {
    try {
      return await geckoPools('trending_pools');
    } catch (e) {
      return dexBoosted();
    }
  });
}

async function getNew() {
  return cached('new', 30_000, async () => {
    try {
      return await geckoPools('new_pools');
    } catch (e) {
      // Fallback: latest token profiles from DexScreener
      const prof = await getJson(`${DEXSCREENER}/token-profiles/latest/v1`);
      const addrs = [...new Set((Array.isArray(prof) ? prof : [])
        .filter((b) => b.chainId === 'solana').map((b) => b.tokenAddress))].slice(0, 30);
      if (!addrs.length) throw e;
      const pairs = await getJson(`${DEXSCREENER}/tokens/v1/solana/${addrs.join(',')}`);
      return dedupe(bestPairsByToken(pairs).map(fromDexPair));
    }
  });
}

async function search(q) {
  const query = String(q || '').trim().slice(0, 80);
  if (!query) return [];
  return cached(`search:${query.toLowerCase()}`, 20_000, async () => {
    if (isValidAddress(query)) {
      const t = await getToken(query).catch(() => null);
      return t ? [t] : [];
    }
    const data = await getJson(`${DEXSCREENER}/latest/dex/search`, { q: query });
    const pairs = (data.pairs || []).filter((p) => p.chainId === 'solana');
    return bestPairsByToken(pairs)
      .sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))
      .slice(0, 25)
      .map(fromDexPair);
  });
}

// ── token detail ────────────────────────────────────────────────────────────
async function getTokenInfo(address) {
  // holders / decimals from GeckoTerminal; optional
  return cached(`info:${address}`, 5 * 60_000, async () => {
    try {
      const d = await getJson(`${GECKO}/networks/solana/tokens/${address}/info`);
      const a = d.data?.attributes || {};
      return { holders: num(a.holders?.count), decimals: num(a.decimals), image: cleanUrl(a.image_url) };
    } catch (_) {
      return { holders: null, decimals: null, image: null };
    }
  });
}

async function getToken(address) {
  if (!isValidAddress(address)) throw new MemecoinDataError('Invalid Solana address', 400);
  const base = await cached(`token:${address}`, 10_000, async () => {
    const pairs = await getJson(`${DEXSCREENER}/tokens/v1/solana/${address}`);
    const best = bestPairsByToken((Array.isArray(pairs) ? pairs : [])
      .filter((p) => p.baseToken?.address === address))[0];
    if (!best) throw new MemecoinDataError('Token not found', 404);
    return fromDexPair(best);
  });
  const info = await getTokenInfo(address);
  return { ...base, holders: info.holders, decimals: info.decimals, image: base.image || info.image };
}

// ── OHLCV ───────────────────────────────────────────────────────────────────
const TF = {
  '1m': { unit: 'minute', agg: 1 },
  '5m': { unit: 'minute', agg: 5 },
  '15m': { unit: 'minute', agg: 15 },
  '1h': { unit: 'hour', agg: 1 },
};

async function getOhlcv(address, tf = '5m') {
  const cfg = TF[tf];
  if (!cfg) throw new MemecoinDataError('tf must be one of 1m, 5m, 15m, 1h', 400);
  const token = await getToken(address);
  const pool = token.pair?.pair_address;
  if (!pool) throw new MemecoinDataError('No pool for token', 404);
  return cached(`ohlcv:${pool}:${tf}`, tf === '1m' ? 10_000 : 20_000, async () => {
    const d = await getJson(`${GECKO}/networks/solana/pools/${pool}/ohlcv/${cfg.unit}`, {
      aggregate: cfg.agg, limit: 300, currency: 'usd',
    });
    const list = d.data?.attributes?.ohlcv_list || [];
    return list
      .map(([t, o, h, l, c, v]) => ({ time: t, open: +o, high: +h, low: +l, close: +c, volume: +v }))
      .sort((a, b) => a.time - b.time);
  });
}

// ── trades ──────────────────────────────────────────────────────────────────
async function getTrades(address) {
  const token = await getToken(address);
  const pool = token.pair?.pair_address;
  if (!pool) throw new MemecoinDataError('No pool for token', 404);
  return cached(`trades:${pool}`, 8_000, async () => {
    const d = await getJson(`${GECKO}/networks/solana/pools/${pool}/trades`);
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
  });
}

// ── SOL price & quotes ──────────────────────────────────────────────────────
async function getSolPrice() {
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
  });
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
  const [token, solPrice] = await Promise.all([getToken(address), getSolPrice()]);
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
  MemecoinDataError, isValidAddress, getTrending, getNew, search, getToken,
  getOhlcv, getTrades, getSolPrice, getQuote, SOL_MINT,
  sanitizeText, cleanSymbol, cleanName, cleanUrl, shortMint, fromDexPair, fromGeckoPool,
};
