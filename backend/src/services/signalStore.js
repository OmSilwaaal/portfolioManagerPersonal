// Append-only persistence for computed signals (INSERT only; never UPDATE/DELETE).
// All functions are best-effort: a DB problem must never break an API response.
const crypto = require('crypto');
const { getDb } = require('../db/schema');
const { MODEL_VERSION } = require('./signalScore');

function persistSignal(address, symbol, sig) {
  try {
    const db = getDb();
    const asOfSec = Math.floor(sig.asOf / 1000);
    db.prepare(`INSERT OR IGNORE INTO token (chain, contract_address, first_seen_ts, symbol) VALUES ('solana', ?, ?, ?)`)
      .run(address, asOfSec, symbol || null);
    const row = db.prepare(`SELECT token_id FROM token WHERE chain = 'solana' AND contract_address = ?`).get(address);
    if (!row) return false;
    const scores = { confidence: sig.confidence, mode: sig.mode || 'full' };
    for (const [k, v] of Object.entries(sig.components)) scores[k] = v.score;
    db.prepare(`INSERT INTO signal_snapshot
      (token_id, as_of_ts, model_version, component_scores, composite_score, feature_vector_hash)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .run(row.token_id, asOfSec, MODEL_VERSION, JSON.stringify(scores), sig.score, sig.featureVectorHash);
    return true;
  } catch (err) {
    console.error('[signalStore] persist failed:', err.message);
    return false;
  }
}

// Liquidity from the earliest market_snapshot in the last hour (for liquidity_delta). Null if none.
function previousLiquidity(address, nowMs) {
  try {
    const nowSec = Math.floor(nowMs / 1000);
    const row = getDb().prepare(`
      SELECT m.liquidity_usd AS liq FROM market_snapshot m
      JOIN token t ON t.token_id = m.token_id
      WHERE t.chain = 'solana' AND t.contract_address = ? AND m.ts >= ? AND m.ts <= ? AND m.liquidity_usd IS NOT NULL
      ORDER BY m.ts ASC LIMIT 1`).get(address, nowSec - 3600, nowSec - 300);
    return row ? row.liq : null;
  } catch (_) {
    return null;
  }
}

// ── live RADAR scores -> signal_snapshot (model_version 'radar-<model>') ───────────────────────────────────────────
// The radar's live score (services/radarSignals) is the primary engine, but until now it was never stored, so the
// research evaluator could only ever judge activity-v0. computeForTokens() hands each scored token to
// queueRadarSignal(); this module then
//   * dedupes (at most one row per token + model per RADAR_SNAPSHOT_MIN_GAP_MIN minutes, default 5; the in-memory check is
//     a Map lookup so the request path pays almost nothing, the DB re-checks at flush time to survive restarts);
//   * buffers rows and writes them in ONE transaction on a later tick (setImmediate), never inside the request;
//   * never throws and never grows without bound (queue is capped, a failing DB just drops rows).
// Rows are append-only like every other signal_snapshot row; outcomes are filled in later by research/eval/outcomes.js.
// RADAR_PERSIST_SCORES=0|off disables.

const RADAR_PREFIX = 'radar-';
const DEFAULT_GAP_MIN = 5;
const QUEUE_CAP = 2000;
const FLUSH_BATCH = 500;

// Subset of the feature row stored with each score (keeps rows ~1KB). The hash below covers the FULL numeric vector.
const STORED_FEATURES = ['age_min', 'vol_m5', 'price_usd', 'liquidity_usd', 'fdv', 'volume_accel', 'vol_trend', 'buy_pressure', 'txn_accel',
  'price_chg_5m', 'price_chg_15m', 'price_chg_60m', 'liq_delta_15m', 'realized_vol_30m', 'drawdown_from_peak', 'turnover',
  'curve_progress', 'has_sec', 'top1_pct_ex', 'top10_pct_ex', 'creator_pct', 'insider_pct', 'rc_score', 'danger_count',
  'mint_auth', 'freeze_auth', 'rugged', 'creator_prev_dead_share', 'dev_buy_sol', 'boost_total', 'has_profile', 'cto',
  'unique_buyers_5m', 'buyer_hhi_5m', 'dev_sold',
  'sm_buyers_30m', 'sm_net_usd_30m', 'mention_unique_accounts_15m', 'mention_accel', 'telegram_mentions_15m', 'source_diversity'];

const radarQueue = [];
const lastQueued = new Map();            // `${model}|${address}` -> as_of_ts of the last row queued/written
let flushScheduled = false;
let flushHook = null;                    // tests can swap the scheduler (default: setImmediate)

function persistEnabled(env = process.env) { return !/^(0|off|false|no)$/i.test(String(env.RADAR_PERSIST_SCORES || '')); }

function radarGapSec(env = process.env) {
  const raw = env.RADAR_SNAPSHOT_MIN_GAP_MIN;
  const m = raw === undefined || raw === '' ? DEFAULT_GAP_MIN : Number(raw);
  return (Number.isFinite(m) && m >= 0 ? m : DEFAULT_GAP_MIN) * 60;
}

// Deterministic hash of a numeric feature vector (keys sorted, non-numbers dropped) — same 32-hex format as activity-v0.
function hashVector(f) {
  const keys = Object.keys(f || {}).filter((k) => typeof f[k] === 'number' && Number.isFinite(f[k])).sort();
  return crypto.createHash('sha256').update(keys.map((k) => `${k}=${f[k]}`).join('|')).digest('hex').slice(0, 32);
}

// Pure: the row for one scored radar token. `sig` = mapRadarSignal output, `f` = the feature row it was scored from.
function buildRadarSnapshot(sig, f, nowSec, env = process.env) {
  const scores = { confidence: sig.confidence, mode: 'radar', model: sig.model, passesSafetyGate: sig.passesSafetyGate ? 1 : 0 };
  // component scores stay top-level numbers so research/eval can ablate them like activity-v0's components
  for (const [k, v] of Object.entries(sig.components || {})) if (v && typeof v.score === 'number') scores[k] = v.score;
  const features = {};
  for (const k of STORED_FEATURES) if (f && k in f && (f[k] === null || (typeof f[k] === 'number' && Number.isFinite(f[k])))) features[k] = f[k];
  if (f && typeof f.ts === 'number') features.ts = f.ts;  // market snapshot the features came from (<= as_of_ts)
  scores.features = features;
  scores.riskFlags = (sig.riskFlags || []).map((x) => x.code);
  return {
    address: sig.address, symbol: sig.symbol || null, gapSec: radarGapSec(env), modelVersion: `${RADAR_PREFIX}${sig.model}`,
    asOfTs: nowSec, composite: sig.score, componentScores: JSON.stringify(scores), hash: hashVector(f),
  };
}

// Request-path entry point: O(1) when the token was written recently. Never throws.
function queueRadarSignal(sig, f, nowSec, env = process.env) {
  try {
    if (!persistEnabled(env) || !sig || !f || typeof sig.score !== 'number' || !Number.isFinite(sig.score) || !sig.address) return false;
    const key = `${sig.model}|${sig.address}`;
    const last = lastQueued.get(key);
    if (last !== undefined && nowSec - last < radarGapSec(env)) return false;
    lastQueued.set(key, nowSec);
    if (lastQueued.size > 20000) for (const [k, t] of lastQueued) if (nowSec - t > 3600) lastQueued.delete(k);
    radarQueue.push(buildRadarSnapshot(sig, f, nowSec, env));
    if (radarQueue.length > QUEUE_CAP) radarQueue.splice(0, radarQueue.length - QUEUE_CAP);
    scheduleFlush();
    return true;
  } catch (err) {
    console.error('[signalStore] radar queue failed:', err.message);
    return false;
  }
}

function scheduleFlush() {
  if (flushScheduled) return;
  flushScheduled = true;
  const run = () => { flushScheduled = false; flushRadarQueue(); };
  try { (flushHook || setImmediate)(run); } catch { flushScheduled = false; }
}

// Write queued rows in one transaction. `db` defaults to the main DB. Returns the number of rows inserted. Never throws.
function flushRadarQueue(db, env = process.env) {
  if (!radarQueue.length) return 0;
  const batch = radarQueue.splice(0, FLUSH_BATCH);
  const more = radarQueue.length > 0;
  let inserted = 0;
  try {
    const d = db || getDb();
    const insTok = d.prepare(`INSERT OR IGNORE INTO token (chain, contract_address, first_seen_ts, symbol) VALUES ('solana', ?, ?, ?)`);
    const getTok = d.prepare(`SELECT token_id FROM token WHERE chain = 'solana' AND contract_address = ?`);
    const recent = d.prepare('SELECT 1 FROM signal_snapshot WHERE token_id = ? AND model_version = ? AND as_of_ts > ? AND as_of_ts <= ? LIMIT 1');
    const ins = d.prepare(`INSERT INTO signal_snapshot (token_id, as_of_ts, model_version, component_scores, composite_score, feature_vector_hash)
      VALUES (?, ?, ?, ?, ?, ?)`);
    d.exec('BEGIN');
    try {
      for (const r of batch) {
        insTok.run(r.address, r.asOfTs, r.symbol);
        const row = getTok.get(r.address);
        if (!row) continue;
        if (r.gapSec > 0 && recent.get(row.token_id, r.modelVersion, r.asOfTs - r.gapSec, r.asOfTs)) continue;   // written before a restart
        ins.run(row.token_id, r.asOfTs, r.modelVersion, r.componentScores, r.composite, r.hash);
        inserted++;
      }
      d.exec('COMMIT');
    } catch (e) {
      try { d.exec('ROLLBACK'); } catch { /* ignore */ }
      throw e;
    }
  } catch (err) {
    console.error('[signalStore] radar flush failed (batch dropped):', err.message);
    inserted = 0;
  }
  if (more) scheduleFlush();
  return inserted;
}

// test helpers
function _resetRadarQueue() { radarQueue.length = 0; lastQueued.clear(); flushScheduled = false; }
function _setFlushScheduler(fn) { flushHook = fn; }
function _radarQueueLength() { return radarQueue.length; }

module.exports = {
  persistSignal, previousLiquidity,
  RADAR_PREFIX, buildRadarSnapshot, hashVector, queueRadarSignal, flushRadarQueue, radarGapSec,
  _resetRadarQueue, _setFlushScheduler, _radarQueueLength,
};
