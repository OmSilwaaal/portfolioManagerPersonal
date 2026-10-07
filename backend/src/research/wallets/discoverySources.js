'use strict';
// On-chain top-earner wallet discovery sources. NONE of them needs social data. Each is pluggable:
//   { name, enabled:false, reason }                      when unconfigured (flag off / key missing / nothing to do)
//   { name, enabled:true, minIntervalMs, async discover(ctx) -> { candidates:[{wallet, source?, reported_pnl?, reported_period?, survivor?}],
//                                                              controlPool?:[{wallet, source}] , note? } }
// Whatever PnL a source reports is a CLAIM: it is recorded (candidates.js) and ignored by scoring.
//
// ONLY documented HTTP APIs are used (Birdeye, Helius, SolanaTracker, FOMO API with a key) plus the radar's own DB and
// a manual JSON file. No site scraping (axiom.trade, fomo.family, ...), no undocumented/reverse-engineered endpoints,
// no unofficial SDKs. Field names/paths for third parties below come from public docs and are UNTESTED against live APIs.

const fs = require('fs');
const path = require('path');
const { httpJson, createQueue } = require('./providers');
const { createBudget, budgetError } = require('./budget');
const { isSolanaAddress } = require('../social/entityLinking');

const disabled = (name, reason) => ({ name, enabled: false, reason });
const HOUR = 3600 * 1000;
const FLAGS = {
  birdeye_leaderboard: 'SMART_MONEY_BIRDEYE_LB',
  winner_backbuyers: 'SMART_MONEY_WINNER_BACKBUY',
  seeds: 'SMART_MONEY_SEEDS',
  fomoapi: 'SMART_MONEY_FOMOAPI',
  solanatracker: 'SMART_MONEY_SOLANATRACKER',
};

function getPath(obj, p) {
  let cur = obj;
  for (const k of String(p).split('.')) { if (cur == null) return undefined; cur = cur[k]; }
  return cur;
}
const firstOf = (obj, paths) => { for (const p of paths) { const v = getPath(obj, p); if (v !== undefined && v !== null && v !== '') return v; } return undefined; };

// ── (d) third-party leaderboard adapters: ONE config object holds base URL, auth, paging and field mapping ───────────
const LEADERBOARD_ADAPTERS = {
  // fomoapi.io: FOMO-reported PnL and resolved wallets. Endpoint path and field names are from memory of the public docs
  // and UNVERIFIED; override FOMOAPI_BASE_URL / FOMOAPI_LEADERBOARD_PATH or edit `fields` here to match the real response.
  fomoapi: {
    flag: FLAGS.fomoapi, keyEnv: 'FOMOAPI_KEY',
    baseUrl: 'https://api.fomoapi.io', baseUrlEnv: 'FOMOAPI_BASE_URL',
    path: '/v1/leaderboard', pathEnv: 'FOMOAPI_LEADERBOARD_PATH',
    query: { period: '7d', limit: '50' },
    auth: { header: 'x-api-key' },
    pageParam: null, maxPages: 1,
    itemsPath: 'data',
    fields: { wallet: ['wallet', 'wallet_address', 'address', 'resolved_wallet'], pnl: ['pnl_usd', 'pnl', 'realized_pnl'], period: ['period'] },
    defaultPeriod: '7d', minIntervalMs: 6 * HOUR,
  },
  // SolanaTracker data API (docs.solanatracker.io): /top-traders/all, header x-api-key. summary.total = reported total PnL (USD).
  solanatracker: {
    flag: FLAGS.solanatracker, keyEnv: 'SOLANATRACKER_API_KEY',
    baseUrl: 'https://data.solanatracker.io', baseUrlEnv: 'SOLANATRACKER_BASE_URL',
    path: '/top-traders/all', pathEnv: 'SOLANATRACKER_LEADERBOARD_PATH',
    query: {},
    auth: { header: 'x-api-key' },
    pageParam: 'page', maxPages: 2,
    itemsPath: 'wallets',
    fields: { wallet: ['wallet', 'address'], pnl: ['summary.total', 'summary.realized'], period: [] },
    defaultPeriod: 'all-time', minIntervalMs: 6 * HOUR,
  },
};

function createLeaderboardAdapter(name, env = process.env, opts = {}) {
  const cfg = { ...LEADERBOARD_ADAPTERS[name], ...(opts.config || {}) };
  if (!cfg.flag) return disabled(name, 'unknown adapter');
  if (env[cfg.flag] !== '1') return disabled(name, `${cfg.flag} != 1`);
  const key = env[cfg.keyEnv];
  if (!key) return disabled(name, `${cfg.keyEnv} not set`);
  const base = opts.baseUrl || env[cfg.baseUrlEnv] || cfg.baseUrl;
  if (!/^https:\/\//i.test(base) && !opts.allowHttp) return disabled(name, `${cfg.baseUrlEnv || 'base URL'} must be https`);
  const pth = env[cfg.pathEnv] || cfg.path;
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  const q = opts.queue || createQueue({ minIntervalMs: 1100, maxRetries: 2 });
  return {
    name, enabled: true, survivor: true, minIntervalMs: opts.minIntervalMs ?? cfg.minIntervalMs,
    async discover() {
      const candidates = [];
      for (let page = 1; page <= cfg.maxPages; page++) {
        const u = new URL(pth, base);
        for (const [k, v] of Object.entries(cfg.query || {})) u.searchParams.set(k, v);
        if (cfg.pageParam) u.searchParams.set(cfg.pageParam, String(page));
        const j = await q.run(() => httpJson(u.toString(), { headers: { [cfg.auth.header]: key, accept: 'application/json' }, fetchImpl }));
        const items = getPath(j, cfg.itemsPath);
        if (!Array.isArray(items)) throw new Error(`${name}: unexpected response shape (no array at "${cfg.itemsPath}")`);
        for (const it of items) {
          const w = firstOf(it, cfg.fields.wallet);
          if (!isSolanaAddress(w)) continue;
          const pnl = Number(firstOf(it, cfg.fields.pnl));
          candidates.push({ wallet: w, source: name, reported_pnl: Number.isFinite(pnl) ? pnl : null, reported_period: String(firstOf(it, cfg.fields.period) || cfg.defaultPeriod), survivor: true });
        }
        if (!items.length) break;
      }
      return { candidates };
    },
  };
}

// ── (a) Birdeye leaderboard: /trader/gainers-losers and /defi/v2/tokens/top_traders, hard persisted daily budget ──────
function createBirdeyeLeaderboardSource(env = process.env, opts = {}) {
  const name = 'birdeye_leaderboard';
  if (env[FLAGS[name]] !== '1') return disabled(name, `${FLAGS[name]} != 1`);
  const key = env.BIRDEYE_API_KEY;
  if (!key) return disabled(name, 'BIRDEYE_API_KEY not set');
  const budget = opts.budget || createBudget(null, { provider: 'birdeye', dailyLimit: 150 });
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  const q = opts.queue || createQueue({ minIntervalMs: 1100, maxRetries: 2 });
  const headers = { 'X-API-KEY': key, 'x-chain': 'solana', accept: 'application/json' };
  const periods = String(env.BIRDEYE_LB_PERIODS || '1W').split(',').map((s) => s.trim()).filter((s) => /^[A-Za-z0-9]{1,8}$/.test(s)).slice(0, 4);
  const topTokens = Math.max(0, Number(env.BIRDEYE_LB_TOKENS ?? 2) || 0);
  const pages = Math.max(1, Math.min(5, Number(env.BIRDEYE_LB_PAGES) || 1));
  const get = (url) => q.run(() => {
    if (!budget.tryConsume(1)) throw budgetError('birdeye');   // charged per HTTP attempt, retries included
    return httpJson(url, { headers, fetchImpl });
  });
  return {
    name, enabled: true, survivor: true, minIntervalMs: opts.minIntervalMs ?? 6 * HOUR, budget,
    async discover(ctx = {}) {
      const candidates = [];
      let budgetBlocked = false;
      try {
        for (const period of periods) {
          for (let pg = 0; pg < pages; pg++) {
            const j = await get(`https://public-api.birdeye.so/trader/gainers-losers?type=${period}&sort_by=PnL&sort_type=desc&offset=${pg * 10}&limit=10`);
            const items = (j && j.data && j.data.items) || [];
            for (const i of items) {
              if (!isSolanaAddress(i && i.address)) continue;
              const pnl = Number(i.pnl);
              candidates.push({ wallet: i.address, source: 'birdeye_gainers', reported_pnl: Number.isFinite(pnl) ? pnl : null, reported_period: period, survivor: true });
            }
            if (items.length < 10) break;
          }
        }
        // top traders on tokens we are already looking at (ranked by VOLUME, not PnL: no reported_pnl, not a survivor list)
        for (const tok of (ctx.tokens || []).slice(0, topTokens)) {
          if (!isSolanaAddress(tok)) continue;
          const j = await get(`https://public-api.birdeye.so/defi/v2/tokens/top_traders?address=${tok}&time_frame=24h&sort_type=desc&sort_by=volume&limit=10`);
          for (const i of (j && j.data && j.data.items) || []) {
            if (isSolanaAddress(i && i.owner)) candidates.push({ wallet: i.owner, source: 'birdeye_top_traders', reported_pnl: null, reported_period: `24h:${tok}`, survivor: false });
          }
        }
      } catch (e) {
        if (!e.budgetExceeded) throw Object.assign(e, { partial: candidates });
        budgetBlocked = true;
      }
      return { candidates, note: budgetBlocked ? 'birdeye daily budget reached; stopped early' : undefined, budgetBlocked };
    },
  };
}

// ── (c) manual seeds ────────────────────────────────────────────────────────────────────────────────────────────────
const DEFAULT_SEEDS_PATH = path.join(__dirname, 'wallet_seeds.json');
const MAX_SEEDS = 500;

function readSeeds(file) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const list = Array.isArray(j) ? j : Array.isArray(j && j.wallets) ? j.wallets : [];
  const out = [], seen = new Set();
  for (const e of list) {
    const o = typeof e === 'string' ? { wallet: e } : e;
    const w = o && (o.wallet || o.address);
    if (!isSolanaAddress(w) || seen.has(w)) continue;
    seen.add(w);
    const pnl = Number(o.reported_pnl);
    out.push({ wallet: w, source: 'seed', reported_pnl: Number.isFinite(pnl) ? pnl : null, reported_period: String(o.period || o.reported_period || 'manual'), survivor: true });
    if (out.length >= MAX_SEEDS) break;
  }
  return out;
}

function createSeedsSource(env = process.env, opts = {}) {
  const name = 'seeds';
  if (env[FLAGS[name]] !== '1') return disabled(name, `${FLAGS[name]} != 1`);
  const file = opts.seedsPath || env.WALLET_SEEDS_PATH || DEFAULT_SEEDS_PATH;
  let first;
  try { first = readSeeds(file); } catch (e) { return disabled(name, `cannot read ${path.basename(file)}: ${e.message}`); }
  if (!first.length) return disabled(name, `no valid wallets in ${path.basename(file)} (paste addresses into the "wallets" list and restart)`);
  return {
    name, enabled: true, survivor: true, minIntervalMs: 0,
    async discover() { return { candidates: readSeeds(file) }; },
  };
}

// ── (b) winner back-buyers ──────────────────────────────────────────────────────────────────────────────────────────
// Winner = peaked >= +X% within H after a reference time (default +100% within 6h of 15 minutes after pool creation),
// the same definition as research/eval/winnerFirst.js. Early buyers = wallets that bought BEFORE the reference time,
// i.e. before the move began.

function heliusBuyer(tx, mint) {
  const sw = tx && tx.events && tx.events.swap;
  if (!sw) return null;
  for (const t of sw.tokenOutputs || []) if (t && t.mint === mint && isSolanaAddress(t.userAccount)) return t.userAccount;
  return null;
}

/** Radar's own PumpPortal trade stream (only for tokens it watched). Free, no API calls. */
function radarTradeFinder(getRadar) {
  return async ({ token, refTs }) => {
    let rows = [];
    try {
      rows = getRadar().prepare('SELECT wallet, MIN(ts_ms) AS m FROM trade WHERE token_address = ? AND is_buy = 1 AND wallet IS NOT NULL GROUP BY wallet').all(token);
    } catch { return { early: [], late: [] }; }
    const early = [], late = [];
    for (const r of rows) {
      if (r.m / 1000 < refTs) early.push({ wallet: r.wallet, ts: r.m / 1000 }); else late.push(r.wallet);
    }
    return { early, late };
  };
}

/** Helius parsed swap history of the MINT address, paged newest-first until we pass the token's creation. */
function heliusFinder(env, { fetchImpl = globalThis.fetch, queue, maxPages = 6 } = {}) {
  const key = env.HELIUS_API_KEY;
  if (!key) return null;
  const q = queue || createQueue({ minIntervalMs: 150, maxRetries: 2 });
  return async ({ token, createdTs, refTs }) => {
    if (!isSolanaAddress(token)) return { early: [], late: [] };
    const early = [], late = [];
    let before = '';
    for (let page = 0; page < maxPages; page++) {
      const url = `https://api.helius.xyz/v0/addresses/${token}/transactions?api-key=${key}&type=SWAP&limit=100${before ? `&before=${before}` : ''}`;
      const txs = await q.run(() => httpJson(url, { fetchImpl }));
      if (!Array.isArray(txs) || !txs.length) break;
      for (const tx of txs) {
        if (tx.timestamp < createdTs) continue;
        const w = heliusBuyer(tx, token);
        if (!w) continue;
        if (tx.timestamp < refTs) early.push({ wallet: w, ts: tx.timestamp }); else late.push(w);
      }
      if (txs[txs.length - 1].timestamp < createdTs) break;
      before = txs[txs.length - 1].signature;
    }
    return { early, late };
  };
}

/** Birdeye token trades seek-by-time (docs), oldest first, bounded to [created, ref). Charged to the Birdeye budget. */
function birdeyeFinder(env, { fetchImpl = globalThis.fetch, queue, budget } = {}) {
  const key = env.BIRDEYE_API_KEY;
  if (!key || !budget) return null;
  const q = queue || createQueue({ minIntervalMs: 1100, maxRetries: 1 });
  const headers = { 'X-API-KEY': key, 'x-chain': 'solana', accept: 'application/json' };
  return async ({ token, createdTs, refTs }) => {
    if (!isSolanaAddress(token)) return { early: [], late: [] };
    const url = `https://public-api.birdeye.so/defi/txs/token/seek_by_time?address=${token}&tx_type=swap&sort_type=asc&limit=50&offset=0&after_time=${createdTs}&before_time=${refTs}`;
    const j = await q.run(() => {
      if (!budget.tryConsume(1)) throw budgetError('birdeye');
      return httpJson(url, { headers, fetchImpl });
    });
    const early = [];
    for (const it of (j && j.data && j.data.items) || []) {
      const ts = Number(it.block_unix_time);
      if (it.side === 'buy' && isSolanaAddress(it.owner) && ts >= createdTs && ts < refTs) early.push({ wallet: it.owner, ts });
    }
    return { early, late: [] };
  };
}

function createWinnerBackBuyersSource(env = process.env, opts = {}) {
  const name = 'winner_backbuyers';
  if (env[FLAGS[name]] !== '1') return disabled(name, `${FLAGS[name]} != 1`);
  if (!opts.radarDb && env.ENABLE_RADAR !== 'true') return disabled(name, 'radar is off (ENABLE_RADAR != true): no winner tokens to look back on');
  const getRadar = opts.radarDb || (() => require('../../radar/db').getRadarDb());
  const wf = require('../eval/winnerFirst');
  const num = (k, d) => (env[k] !== undefined && env[k] !== '' && Number.isFinite(Number(env[k])) ? Number(env[k]) : d);
  const cfg = {
    ...wf.DEFAULTS,
    winnerReturn: num('WINNER_BACKBUY_RETURN_PCT', 100) / 100,
    horizonSec: num('WINNER_BACKBUY_HORIZON_HOURS', 6) * 3600,
    refAgeSec: num('WINNER_BACKBUY_REF_AGE_MIN', 15) * 60,
    lookbackDays: num('WINNER_BACKBUY_LOOKBACK_DAYS', 14),
    ...(opts.config || {}),
  };
  const maxWinners = num('WINNER_BACKBUY_MAX_WINNERS', 5);
  const maxBuyers = num('WINNER_BACKBUY_MAX_BUYERS', 20);
  const minBuyersBeforeApi = num('WINNER_BACKBUY_MIN_FREE_BUYERS', 5);
  const finders = opts.finders || [
    radarTradeFinder(getRadar),
    heliusFinder(env, { fetchImpl: opts.fetchImpl, queue: opts.heliusQueue }),
    birdeyeFinder(env, { fetchImpl: opts.fetchImpl, queue: opts.birdeyeQueue, budget: opts.budget }),
  ].filter(Boolean);
  const { getState, setState, stateKeys } = require('./candidates');
  return {
    name, enabled: true, survivor: true, minIntervalMs: opts.minIntervalMs ?? HOUR, config: cfg,
    async discover(ctx) {
      const { db, now } = ctx;
      const radar = getRadar();
      const done = new Set(stateKeys(db, 'backbuy:').map((k) => k.slice('backbuy:'.length)));
      const tokens = wf.loadTokens(radar, cfg, now);
      const winners = [];
      for (const t of tokens) {
        if (done.has(t.address)) continue;
        const c = wf.classifyToken(t, cfg);
        if (c.status === 'winner') winners.push({ ...t, ref: c.ref, maxRet: c.maxRet });
      }
      winners.sort((a, b) => b.ref.ts - a.ref.ts);
      const candidates = [], controlPool = [];
      let processed = 0;
      for (const w of winners.slice(0, maxWinners)) {
        let creator = null;
        try { const r = radar.prepare('SELECT creator FROM token WHERE token_address = ?').get(w.address); creator = r && r.creator; } catch { /* optional */ }
        const early = new Map(), late = new Set();
        let ok = false;
        for (const f of finders) {
          if (early.size >= minBuyersBeforeApi && f !== finders[0]) break;     // free source was enough; do not spend API calls
          try {
            const r = await f({ token: w.address, createdTs: w.created, refTs: w.ref.ts });
            ok = true;
            for (const e of r.early || []) if (e.wallet !== creator && (!early.has(e.wallet) || early.get(e.wallet) > e.ts)) early.set(e.wallet, e.ts);
            for (const l of r.late || []) late.add(l);
          } catch (e) { if (e && e.budgetExceeded) break; /* try the next finder */ }
        }
        if (!ok) continue;                      // every finder failed: retry this winner next run
        setState(db, `backbuy:${w.address}`, String(now));
        processed++;
        const sorted = [...early.entries()].sort((a, b) => a[1] - b[1]).slice(0, maxBuyers);
        for (const [wallet] of sorted) candidates.push({ wallet, source: 'winner_backbuyers', reported_pnl: null, reported_period: `winner:${w.address}`, survivor: true });
        for (const l of late) if (!early.has(l) && l !== creator) controlPool.push({ wallet: l, source: 'control_late_buyers' });
      }
      return { candidates, controlPool, note: `${winners.length} winners found, ${processed} processed` };
    },
  };
}

// ── registry ────────────────────────────────────────────────────────────────────────────────────────────────────────
/** opts: { budget (Birdeye), radarDb, fetchImpl, seedsPath, ... }. Every entry is {name, enabled, reason?|discover()}. Never throws. */
function getDiscoverySources(env = process.env, opts = {}) {
  const mk = (name, fn) => { try { return fn(); } catch (e) { return disabled(name, `init failed: ${e.message}`); } };
  return [
    mk('birdeye_leaderboard', () => createBirdeyeLeaderboardSource(env, opts)),
    mk('winner_backbuyers', () => createWinnerBackBuyersSource(env, opts)),
    mk('seeds', () => createSeedsSource(env, opts)),
    mk('fomoapi', () => createLeaderboardAdapter('fomoapi', env, opts)),
    mk('solanatracker', () => createLeaderboardAdapter('solanatracker', env, opts)),
  ];
}

module.exports = {
  getDiscoverySources, createBirdeyeLeaderboardSource, createWinnerBackBuyersSource, createSeedsSource, createLeaderboardAdapter,
  LEADERBOARD_ADAPTERS, FLAGS, readSeeds, heliusFinder, birdeyeFinder, radarTradeFinder, heliusBuyer, DEFAULT_SEEDS_PATH,
};
