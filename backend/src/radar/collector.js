const axios = require('axios');
const { getRadarDb } = require('./db');

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
const QUIET_AFTER_AGE = 30 * 60;    // from here, a token with no liquidity/volume stops costing API calls
const QUIET_LIQ = 1000, QUIET_VOL_H1 = 30, QUIET_STREAK = 4;
const BATCH = 30;                   // DexScreener max addresses per call
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

// Tokens due a snapshot this tick (fast cadence while young, slow after).
function dueTokens(ts) {
  const db = getRadarDb();
  return db.prepare(`
    SELECT t.token_address, t.pool_created_ts, t.dex, t.migrated_ts,
           (SELECT MAX(ts) FROM market_snapshot s WHERE s.token_address = t.token_address) AS last_ts
    FROM token t
    WHERE t.dead_ts IS NULL AND ? - t.pool_created_ts < ?
  `).all(ts, TRACK_SECONDS).filter((t) => {
    const gap = ts - t.pool_created_ts < FAST_SECONDS ? 55 : 295;
    return !t.last_ts || ts - t.last_ts >= gap;
  });
}

async function snapshot() {
  const db = getRadarDb();
  const ts = now();
  const due = dueTokens(ts);
  const ins = db.prepare(`INSERT OR IGNORE INTO market_snapshot
    (token_address, ts, pool_address, price_usd, liquidity_usd, liq_estimated, fdv, vol_m5, vol_h1, buys_m5, sells_m5, buys_h1, sells_h1)
    VALUES (@tok, @ts, @pool, @price, @liq, @est, @fdv, @vm5, @vh1, @b5, @s5, @bh, @sh)`);
  // Misses only count toward 'gone' once the token has traded on DexScreener at least once — a brand-new token that
  // simply isn't indexed yet is not a rug. Never-indexed tokens are retired as 'unindexed' (no data, never scored).
  const markMiss = db.prepare(`UPDATE token SET misses = misses + 1,
    dead_ts = CASE WHEN misses + 1 >= @n AND EXISTS (SELECT 1 FROM market_snapshot s WHERE s.token_address = token.token_address) THEN @ts
                   WHEN @ts - pool_created_ts > ${UNINDEXED_AFTER} AND NOT EXISTS (SELECT 1 FROM market_snapshot s WHERE s.token_address = token.token_address) THEN @ts
                   ELSE dead_ts END,
    dead_reason = CASE WHEN misses + 1 >= @n AND EXISTS (SELECT 1 FROM market_snapshot s WHERE s.token_address = token.token_address) THEN 'gone'
                   WHEN @ts - pool_created_ts > ${UNINDEXED_AFTER} AND NOT EXISTS (SELECT 1 FROM market_snapshot s WHERE s.token_address = token.token_address) THEN 'unindexed'
                   ELSE dead_reason END
    WHERE token_address = @tok`);
  const seenOk = db.prepare(`UPDATE token SET misses = 0, current_pool = @pool, dex = @dex,
    migrated_ts = CASE WHEN migrated_ts IS NULL AND launchpad = 'pumpfun' AND @dex <> 'pumpfun' AND @real = 1 THEN @ts ELSE migrated_ts END,
    quiet_count = CASE WHEN @ts - pool_created_ts > ${QUIET_AFTER_AGE} AND (COALESCE(@liq, 0) < ${QUIET_LIQ} OR COALESCE(@vh1, 0) < ${QUIET_VOL_H1})
                       THEN quiet_count + 1 ELSE 0 END
    WHERE token_address = @tok`);
  const goQuiet = db.prepare(`UPDATE token SET dead_ts = @ts, dead_reason = 'inactive'
    WHERE token_address = @tok AND dead_ts IS NULL AND quiet_count >= ${QUIET_STREAK}`);
  let written = 0;

  for (let i = 0; i < due.length; i += BATCH) {
    const batch = due.slice(i, i + BATCH);
    let pairs;
    try {
      const { data } = await axios.get(`${DEX_TOKENS}/${batch.map((b) => b.token_address).join(',')}`, { timeout: 15000 });
      pairs = Array.isArray(data) ? data : [];
    } catch (e) {
      console.warn(`[radar] snapshot batch failed: ${e.message}`);
      continue; // an API failure is NOT a miss — never mark tokens dead for our own outage
    }
    const byTok = new Map();
    for (const p of pairs) {
      if (p.chainId !== 'solana' || !p.baseToken?.address) continue;
      if (!byTok.has(p.baseToken.address)) byTok.set(p.baseToken.address, []);
      byTok.get(p.baseToken.address).push(p);
    }
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
  }
  const migrations = db.prepare('SELECT COUNT(*) c FROM token WHERE migrated_ts = ?').get(ts).c;
  return { due: due.length, written, migrations };
}

// Snapshots/features older than the retention window are dropped; token + security rows are tiny and kept forever.
function prune() {
  const db = getRadarDb();
  const cutoff = now() - RETENTION_DAYS * 86400;
  const a = db.prepare('DELETE FROM market_snapshot WHERE ts < ?').run(cutoff).changes;
  const b = db.prepare('DELETE FROM feature_snapshot WHERE ts < ?').run(cutoff).changes;
  if (a + b > 0) console.log(`[radar] pruned ${a} snapshots, ${b} cached features older than ${RETENTION_DAYS}d`);
  return { snapshots: a, features: b };
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

module.exports = { start, stop, discover, snapshot, prune };
