const axios = require('axios');
const { getRadarDb } = require('./db');
const { mapLimit } = require('./util');

const GT_NEW_POOLS = 'https://api.geckoterminal.com/api/v2/networks/solana/new_pools';
const DEX_TOKENS = 'https://api.dexscreener.com/tokens/v1/solana';

const DISCOVERY_EVERY_MS = 30 * 1000;
const SNAPSHOT_EVERY_MS = 60 * 1000;
const PRUNE_EVERY_MS = 6 * 3600 * 1000;
const DISCOVERY_PAGES = 3;          // GeckoTerminal free tier: 30 calls/min; 3 pages/30s = 6/min
const TRACK_SECONDS = 24 * 3600;    // follow every token for its first 24h
const FAST_SECONDS = 2 * 3600;      // 1-minute cadence while young, 5-minute after
const DEAD_AFTER_MISSES = 3;        // consecutive "no pairs" responses before we call it gone (guards API gaps)
const UNINDEXED_AFTER = 30 * 60;   // never seen trading by 30 min: stop asking
// ~2,000 pump.fun launches/hour and almost all die within minutes: retiring dead ones fast is what keeps polling
// (and the 300 req/min DexScreener budget) focused on tokens that can still matter.
const QUIET_AFTER_AGE = 10 * 60;    // from 10 min old, a token with no liquidity/volume stops costing API calls
const QUIET_LIQ = 1000, QUIET_VOL_H1 = 75, QUIET_STREAK = 3;
const BATCH = 30;                   // DexScreener max addresses per call
const CONCURRENCY = 4;              // parallel DexScreener requests per tick (limit is 300/min)
const RETENTION_DAYS = Number(process.env.RADAR_RETENTION_DAYS || 14);

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const now = () => Math.floor(Date.now() / 1000);

// Pump.fun bonding curve is constant-product on VIRTUAL reserves (30 SOL x 1.073B tokens, 1B supply), which gives
// virtualSOL = sqrt(32.19 * fdvInSol). DexScreener reports no liquidity before graduation, so we derive the
// equivalent figure (2 x quote reserve, matching the simulator's "reserve = liquidity/2") to model slippage.
// Other launchpads (meteora-dbc, bags, ...) use different curves: left null => excluded from the tradeable universe.
function estimateCurveLiquidityUsd(p) {
  if (p.dexId !== 'pumpfun') return null;
  const fdv = Number(p.fdv), priceUsd = Number(p.priceUsd), priceNative = Number(p.priceNative);
  if (!(fdv > 0 && priceUsd > 0 && priceNative > 0)) return null;
  return 2 * Math.sqrt(32.19 * fdv * (priceUsd / priceNative));
}

function liquidityFields(p) {
  const reported = num(p.liquidity?.usd);
  if (reported !== null) return { liq: reported, est: 0 };
  const est = estimateCurveLiquidityUsd(p);
  return { liq: est, est: est === null ? 0 : 1 };
}

// A token can have several pairs (curve + AMM after graduation, plus side pools). Follow the deepest REAL pool;
// before graduation the curve pair is the only one so it wins by default.
function pickPair(pairs) {
  const real = pairs.filter((p) => num(p.liquidity?.usd) > 0).sort((a, b) => b.liquidity.usd - a.liquidity.usd);
  if (real.length) return real[0];
  return pairs.find((p) => p.dexId === 'pumpfun') || pairs[0];
}

// Discovery records EVERY new pool, including ones that die minutes later — no survivorship filter.
async function discover() {
  const db = getRadarDb();
  const ins = db.prepare(`INSERT OR IGNORE INTO token
    (token_address, symbol, name, first_pool, current_pool, dex, launchpad, pool_created_ts, first_seen_ts)
    VALUES (@tok, @symbol, @name, @pool, @pool, @dex, @launchpad, @created, @seen)`);
  let added = 0;
  for (let page = 1; page <= DISCOVERY_PAGES; page++) {
    let data;
    try {
      ({ data } = await axios.get(GT_NEW_POOLS, { params: { page }, headers: { accept: 'application/json' }, timeout: 15000 }));
    } catch (e) {
      console.warn(`[radar] discovery page ${page} failed: ${e.message}`);
      break;
    }
    const seen = now();
    db.transaction((rows) => {
      for (const p of rows) {
        const a = p.attributes;
        const tok = (p.relationships?.base_token?.data?.id || '').replace(/^solana_/, '');
        if (!tok) continue;
        const dex = p.relationships?.dex?.data?.id || null;
        added += ins.run({
          tok, symbol: (a.name || '').split(' / ')[0], name: a.name, pool: a.address, dex,
          launchpad: dex === 'pump-fun' ? 'pumpfun' : null,
          created: Math.floor(new Date(a.pool_created_at).getTime() / 1000), seen,
        }).changes;
      }
    })(data.data || []);
  }
  return added;
}

// Tokens due a snapshot this tick (fast cadence while young, slow after). Uses the cached last_snapshot_ts and a
// partial index over live tokens, so this stays cheap however much history accumulates.
function dueTokens(ts) {
  return getRadarDb().prepare(`
    SELECT token_address, pool_created_ts, last_snapshot_ts FROM token
    WHERE dead_ts IS NULL AND pool_created_ts > ?
      AND (last_snapshot_ts IS NULL OR last_snapshot_ts <= ? - CASE WHEN ? - pool_created_ts < ${FAST_SECONDS} THEN 55 ELSE 295 END)
  `).all(ts - TRACK_SECONDS, ts, ts);
}

function groupPairs(pairs) {
  const byTok = new Map();
  for (const p of pairs) {
    if (p.chainId !== 'solana' || !p.baseToken?.address) continue;
    if (!byTok.has(p.baseToken.address)) byTok.set(p.baseToken.address, []);
    byTok.get(p.baseToken.address).push(p);
  }
  return byTok;
}

let snapshotInFlight = false;

async function snapshot() {
  if (snapshotInFlight) return { skipped: 'previous tick still running' };
  snapshotInFlight = true;
  try { return await snapshotOnce(); } finally { snapshotInFlight = false; }
}

async function snapshotOnce() {
  const db = getRadarDb();
  const ts = now();
  const due = dueTokens(ts);
  const ins = db.prepare(`INSERT OR IGNORE INTO market_snapshot
    (token_address, ts, pool_address, price_usd, liquidity_usd, liq_estimated, fdv, vol_m5, vol_h1, buys_m5, sells_m5, buys_h1, sells_h1)
    VALUES (@tok, @ts, @pool, @price, @liq, @est, @fdv, @vm5, @vh1, @b5, @s5, @bh, @sh)`);
  // Misses only count toward 'gone' once the token has traded on DexScreener at least once — a brand-new token that
  // simply isn't indexed yet is not a rug. Never-indexed tokens are retired as 'unindexed' (no data, never scored).
  const markMiss = db.prepare(`UPDATE token SET misses = misses + 1,
    dead_ts = CASE WHEN misses + 1 >= @n AND last_snapshot_ts IS NOT NULL THEN @ts
                   WHEN last_snapshot_ts IS NULL AND @ts - pool_created_ts > ${UNINDEXED_AFTER} THEN @ts
                   ELSE dead_ts END,
    dead_reason = CASE WHEN misses + 1 >= @n AND last_snapshot_ts IS NOT NULL THEN 'gone'
                   WHEN last_snapshot_ts IS NULL AND @ts - pool_created_ts > ${UNINDEXED_AFTER} THEN 'unindexed'
                   ELSE dead_reason END
    WHERE token_address = @tok`);
  const seenOk = db.prepare(`UPDATE token SET misses = 0, current_pool = @pool, dex = @dex,
    last_snapshot_ts = @ts, last_vol_h1 = @vh1, last_liq = @liq,
    migrated_ts = CASE WHEN migrated_ts IS NULL AND launchpad = 'pumpfun' AND @dex <> 'pumpfun' AND @real = 1 THEN @ts ELSE migrated_ts END,
    quiet_count = CASE WHEN @ts - pool_created_ts > ${QUIET_AFTER_AGE} AND (COALESCE(@liq, 0) < ${QUIET_LIQ} OR COALESCE(@vh1, 0) < ${QUIET_VOL_H1})
                       THEN quiet_count + 1 ELSE 0 END
    WHERE token_address = @tok`);
  const goQuiet = db.prepare(`UPDATE token SET dead_ts = @ts, dead_reason = 'inactive'
    WHERE token_address = @tok AND dead_ts IS NULL AND quiet_count >= ${QUIET_STREAK}`);

  const batches = [];
  for (let i = 0; i < due.length; i += BATCH) batches.push(due.slice(i, i + BATCH));
  let written = 0, failedBatches = 0;

  // Fetch in parallel; write each batch as it lands (SQLite writes are synchronous and take microseconds).
  await mapLimit(batches, CONCURRENCY, async (batch) => {
    let pairs;
    try {
      const { data } = await axios.get(`${DEX_TOKENS}/${batch.map((b) => b.token_address).join(',')}`, { timeout: 15000 });
      pairs = Array.isArray(data) ? data : [];
    } catch (e) {
      failedBatches++;
      return; // an API failure is NOT a miss — never mark tokens dead for our own outage
    }
    const byTok = groupPairs(pairs);
    db.transaction(() => {
      for (const b of batch) {
        const list = byTok.get(b.token_address);
        if (!list || !list.length) { markMiss.run({ n: DEAD_AFTER_MISSES, ts, tok: b.token_address }); continue; }
        const p = pickPair(list);
        const lf = liquidityFields(p);
        const vh1 = num(p.volume?.h1);
        seenOk.run({ pool: p.pairAddress, dex: p.dexId, real: lf.est === 0 && lf.liq > 0 ? 1 : 0, ts, liq: lf.liq, vh1, tok: b.token_address });
        goQuiet.run({ ts, tok: b.token_address });
        written += ins.run({
          tok: b.token_address, ts, pool: p.pairAddress,
          price: num(p.priceUsd), liq: lf.liq, est: lf.est, fdv: num(p.fdv),
          vm5: num(p.volume?.m5), vh1,
          b5: p.txns?.m5?.buys ?? null, s5: p.txns?.m5?.sells ?? null,
          bh: p.txns?.h1?.buys ?? null, sh: p.txns?.h1?.sells ?? null,
        }).changes;
      }
    })();
  });
  if (failedBatches) console.warn(`[radar] ${failedBatches}/${batches.length} snapshot batches failed this tick`);
  const migrations = db.prepare('SELECT COUNT(*) c FROM token WHERE migrated_ts = ?').get(ts).c;
  return { due: due.length, written, migrations, seconds: now() - ts };
}

// Snapshots/features older than the retention window are dropped; token + security rows are tiny and kept forever.
function prune() {
  const db = getRadarDb();
  const cutoff = now() - RETENTION_DAYS * 86400;
  const a = db.prepare('DELETE FROM market_snapshot WHERE ts < ?').run(cutoff).changes;
  const b = db.prepare('DELETE FROM feature_snapshot WHERE ts < ?').run(cutoff).changes;
  const c = db.prepare('DELETE FROM trade WHERE ts_ms < ?').run(cutoff * 1000).changes;
  if (a + b + c > 0) console.log(`[radar] pruned ${a} snapshots, ${b} cached features, ${c} trades older than ${RETENTION_DAYS}d`);
  return { snapshots: a, features: b, trades: c };
}

let timers = [];
let running = false;

function start() {
  if (running) return;
  running = true;
  console.log('[radar] collector started (Solana new pools → token-level snapshots)');
  const guard = (name, fn) => async () => {
    try { const r = await fn(); if (r && (r.written || r > 0)) console.log(`[radar] ${name}`, r); }
    catch (e) { console.error(`[radar] ${name} error:`, e.message); }
  };
  const d = guard('discovered', discover);
  const s = guard('snapshot', snapshot);
  d(); setTimeout(s, 10000);
  timers.push(setInterval(d, DISCOVERY_EVERY_MS));
  timers.push(setInterval(s, SNAPSHOT_EVERY_MS));
  timers.push(setInterval(guard('prune', async () => prune()), PRUNE_EVERY_MS));
}

function stop() {
  timers.forEach(clearInterval);
  timers = [];
  running = false;
}

module.exports = { start, stop, discover, snapshot, prune, estimateCurveLiquidityUsd };
