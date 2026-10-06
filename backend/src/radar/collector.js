const axios = require('axios');
const { getRadarDb } = require('./db');

const GT_NEW_POOLS = 'https://api.geckoterminal.com/api/v2/networks/solana/new_pools';
const DEX_PAIRS = 'https://api.dexscreener.com/latest/dex/pairs/solana';

const DISCOVERY_EVERY_MS = 30 * 1000;
const SNAPSHOT_EVERY_MS = 60 * 1000;
const DISCOVERY_PAGES = 3;          // GeckoTerminal free tier: 30 calls/min; 3 pages/30s = 6/min
const TRACK_SECONDS = 24 * 3600;    // follow every token for its first 24h
const FAST_SECONDS = 2 * 3600;      // 1-minute cadence while young, 5-minute after
const DEAD_AFTER_MISSES = 3;        // consecutive misses before we call it dead (guards against API gaps)
const BATCH = 30;                   // DexScreener max pairs per call

// Pump.fun bonding curve is constant-product on VIRTUAL reserves (30 SOL x 1.073B tokens, 1B supply), which gives
// virtualSOL = sqrt(32.19 * fdvInSol). DexScreener reports no liquidity before graduation, so we derive the
// equivalent figure (2 x quote reserve, matching the simulator's "reserve = liquidity/2") to model slippage.
// Other launchpads (meteora-dbc, bags, ...) use different curves: left null => excluded from the tradeable universe.
function estimateCurveLiquidityUsd(p) {
  if (p.dexId !== 'pumpfun') return null;
  const fdv = Number(p.fdv), priceUsd = Number(p.priceUsd), priceNative = Number(p.priceNative);
  if (!(fdv > 0 && priceUsd > 0 && priceNative > 0)) return null;
  const solUsd = priceUsd / priceNative;
  return 2 * Math.sqrt(32.19 * fdv * solUsd);
}

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const now = () => Math.floor(Date.now() / 1000);

// Discovery records EVERY new pool, including ones that die minutes later — no survivorship filter.
async function discover() {
  const db = getRadarDb();
  const ins = db.prepare(`INSERT OR IGNORE INTO token
    (pool_address, token_address, symbol, name, dex, pool_created_ts, first_seen_ts)
    VALUES (@pool, @tok, @symbol, @name, @dex, @created, @seen)`);
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
    const tx = db.transaction((rows) => {
      for (const p of rows) {
        const a = p.attributes;
        const baseId = p.relationships?.base_token?.data?.id || '';
        const info = ins.run({
          pool: a.address,
          tok: baseId.replace(/^solana_/, ''),
          symbol: (a.name || '').split(' / ')[0],
          name: a.name,
          dex: p.relationships?.dex?.data?.id || null,
          created: Math.floor(new Date(a.pool_created_at).getTime() / 1000),
          seen,
        });
        added += info.changes;
      }
    });
    tx(data.data || []);
  }
  return added;
}

// Which tokens are due a snapshot this tick (fast cadence while young, slow after).
function dueTokens(ts) {
  const db = getRadarDb();
  return db.prepare(`
    SELECT t.pool_address, t.pool_created_ts, t.misses,
           (SELECT MAX(ts) FROM market_snapshot s WHERE s.pool_address = t.pool_address) AS last_ts
    FROM token t
    WHERE t.dead_ts IS NULL AND ? - t.pool_created_ts < ?
  `).all(ts, TRACK_SECONDS).filter((t) => {
    const age = ts - t.pool_created_ts;
    const gap = age < FAST_SECONDS ? 55 : 295;
    return !t.last_ts || ts - t.last_ts >= gap;
  });
}

function liquidityFields(p) {
  const reported = num(p.liquidity?.usd);
  if (reported !== null) return { liq: reported, est: 0 };
  const est = estimateCurveLiquidityUsd(p);
  return { liq: est, est: est === null ? 0 : 1 };
}

async function snapshot() {
  const db = getRadarDb();
  const ts = now();
  const due = dueTokens(ts);
  const ins = db.prepare(`INSERT OR IGNORE INTO market_snapshot
    (pool_address, ts, price_usd, liquidity_usd, liq_estimated, fdv, vol_m5, vol_h1, buys_m5, sells_m5, buys_h1, sells_h1)
    VALUES (@pool, @ts, @price, @liq, @est, @fdv, @vm5, @vh1, @b5, @s5, @bh, @sh)`);
  const markMiss = db.prepare(`UPDATE token SET misses = misses + 1,
    dead_ts = CASE WHEN misses + 1 >= ? THEN ? ELSE dead_ts END WHERE pool_address = ?`);
  const resetMiss = db.prepare('UPDATE token SET misses = 0 WHERE pool_address = ?');
  let written = 0;

  for (let i = 0; i < due.length; i += BATCH) {
    const batch = due.slice(i, i + BATCH);
    let pairs;
    try {
      const { data } = await axios.get(`${DEX_PAIRS}/${batch.map((b) => b.pool_address).join(',')}`, { timeout: 15000 });
      pairs = data.pairs || [];
    } catch (e) {
      console.warn(`[radar] snapshot batch failed: ${e.message}`);
      continue; // an API failure is NOT a miss — don't mark tokens dead for our own outage
    }
    const byAddr = new Map(pairs.map((p) => [p.pairAddress, p]));
    db.transaction(() => {
      for (const b of batch) {
        const p = byAddr.get(b.pool_address);
        if (!p) { markMiss.run(DEAD_AFTER_MISSES, ts, b.pool_address); continue; }
        resetMiss.run(b.pool_address);
        written += ins.run({
          pool: b.pool_address, ts,
          price: num(p.priceUsd), fdv: num(p.fdv), ...liquidityFields(p),
          vm5: num(p.volume?.m5), vh1: num(p.volume?.h1),
          b5: p.txns?.m5?.buys ?? null, s5: p.txns?.m5?.sells ?? null,
          bh: p.txns?.h1?.buys ?? null, sh: p.txns?.h1?.sells ?? null,
        }).changes;
      }
    })();
  }
  return { due: due.length, written };
}

let timers = [];
let running = false;

function start() {
  if (running) return;
  running = true;
  console.log('[radar] collector started (Solana new pools → 1-min snapshots)');
  const guard = (name, fn) => async () => {
    try { const r = await fn(); if (r && (r.written || r > 0)) console.log(`[radar] ${name}`, r); }
    catch (e) { console.error(`[radar] ${name} error:`, e.message); }
  };
  const d = guard('discovered', discover);
  const s = guard('snapshot', snapshot);
  d(); setTimeout(s, 10000);
  timers.push(setInterval(d, DISCOVERY_EVERY_MS));
  timers.push(setInterval(s, SNAPSHOT_EVERY_MS));
}

function stop() {
  timers.forEach(clearInterval);
  timers = [];
  running = false;
}

module.exports = { start, stop, discover, snapshot };
