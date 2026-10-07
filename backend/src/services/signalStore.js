// Append-only persistence for computed signals (INSERT only; never UPDATE/DELETE).
// All functions are best-effort: a DB problem must never break an API response.
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

module.exports = { persistSignal, previousLiquidity };
