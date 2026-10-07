// Outcome job: for every signal_snapshot whose horizon has fully elapsed, compute the forward
// return from market_snapshot and append one outcome_window row per (signal, horizon).
//
// LEAK RULES
//  * Every market_snapshot read is bounded BELOW by the signal's as_of_ts (ts >= as_of_ts).
//    Nothing earlier than the signal is ever used. Entry price = first snapshot at/after as_of_ts
//    (within entryTolSec), i.e. the first price you could actually have traded at.
//  * A (signal, horizon) is computed only once now >= as_of_ts + horizon + staleness tolerance,
//    so the exit snapshot has had its chance to be collected.
//  * Rows are INSERT OR IGNORE only; outcomes are never fed back into features/scores.
//
// SURVIVORSHIP RULE (documented bias control)
//  Memecoin collectors tend to stop seeing tokens that die or fall out of trending lists, which
//  would silently drop the worst outcomes and flatter any signal. So:
//   1. Exit snapshot found in [target, target+staleness] but liquidity <= deadLiqUsd, or
//      liquidity < deadLiqFrac * entry liquidity, or price null/<=0   => status 'dead', return -100%.
//   2. No exit snapshot in that window, entry exists, the token has NO snapshot after the target,
//      and its last snapshot is older than deadGapSec (default 6h)    => 'dead', -100%.
//   3. No exit snapshot in the window but later snapshots exist (a collection gap, token still
//      alive), or no entry snapshot                                    => 'missing',
//      forward_return NULL; excluded from evaluation but counted in the report.
//  Rule 2 is deliberately pessimistic: a token that merely left the collector's watchlist counts as
//  a total loss. The report shows the dead share so you can judge how much this drives results.
const { initEvalSchema, inTransaction } = require('./schema');

const HORIZONS_MIN = [5, 15, 60, 240, 1440];

const DEFAULTS = {
  horizons: HORIZONS_MIN,
  entryTolSec: 600,          // max delay from as_of_ts to the entry snapshot
  deadLiqUsd: 100,           // liquidity at/below this = rugged
  deadLiqFrac: 0.02,         // ... or below 2% of entry liquidity
  deadGapSec: 6 * 3600,      // snapshots silent this long = dead
  batchLimit: 100000,
};

// Staleness tolerance for the exit snapshot: 25% of horizon, clamped to [5 min, 60 min].
function stalenessSec(horizonMin, opts) {
  if (opts && opts.stalenessSec) return opts.stalenessSec;
  return Math.min(3600, Math.max(300, Math.round(horizonMin * 60 * 0.25)));
}

function prepare(db) {
  return {
    firstAtOrAfter: db.prepare(
      `SELECT ts, price, liquidity_usd FROM market_snapshot
       WHERE token_id = ? AND ts >= ? AND ts <= ? AND price IS NOT NULL
       ORDER BY ts ASC LIMIT 1`),
    exitRow: db.prepare(
      `SELECT ts, price, liquidity_usd FROM market_snapshot
       WHERE token_id = ? AND ts >= ? AND ts <= ?
       ORDER BY ts ASC LIMIT 1`),
    path: db.prepare(
      `SELECT MIN(price) AS lo, MAX(price) AS hi FROM market_snapshot
       WHERE token_id = ? AND ts >= ? AND ts <= ? AND price IS NOT NULL AND price > 0`),
    lastTs: db.prepare(`SELECT MAX(ts) AS ts FROM market_snapshot WHERE token_id = ?`),
  };
}

/**
 * Compute one outcome. Returns null if it cannot be decided yet (retry later), else an outcome
 * object {status, forward_return, max_drawdown, max_runup, entry_*, exit_*}.
 * Reads only market_snapshot rows with ts >= sig.as_of_ts.
 */
function computeOutcome(stmts, sig, horizonMin, nowSec, o = {}) {
  const opts = { ...DEFAULTS, ...o };
  const stale = stalenessSec(horizonMin, opts);
  const asOf = sig.as_of_ts;
  const target = asOf + horizonMin * 60;
  if (nowSec < target + stale) return null; // horizon (plus collection tolerance) not elapsed

  const entry = stmts.firstAtOrAfter.get(sig.token_id, asOf, asOf + opts.entryTolSec);
  if (!entry || !(entry.price > 0)) {
    return { status: 'missing', forward_return: null, max_drawdown: null, max_runup: null,
      entry_ts: null, entry_price: null, exit_ts: null, exit_price: null };
  }
  const base = { entry_ts: entry.ts, entry_price: entry.price };
  const runupOf = (p) => (p && p.hi != null ? Math.max(0, p.hi / entry.price - 1) : 0);

  const exit = stmts.exitRow.get(sig.token_id, target, target + stale);
  if (exit) {
    const dead = !(exit.price > 0)
      || (exit.liquidity_usd != null && (exit.liquidity_usd <= opts.deadLiqUsd
        || (entry.liquidity_usd > 0 && exit.liquidity_usd < opts.deadLiqFrac * entry.liquidity_usd)));
    const p = stmts.path.get(sig.token_id, entry.ts, exit.ts);
    if (dead) {
      return { ...base, status: 'dead', forward_return: -1, max_drawdown: -1, max_runup: runupOf(p),
        exit_ts: exit.ts, exit_price: exit.price > 0 ? exit.price : 0 };
    }
    const lo = Math.min(p && p.lo != null ? p.lo : exit.price, exit.price);
    const hi = Math.max(p && p.hi != null ? p.hi : exit.price, exit.price);
    return { ...base, status: 'ok', forward_return: exit.price / entry.price - 1,
      max_drawdown: Math.min(0, lo / entry.price - 1), max_runup: Math.max(0, hi / entry.price - 1),
      exit_ts: exit.ts, exit_price: exit.price };
  }

  // No snapshot in the exit window. Dead, or just a collection gap?
  const last = stmts.lastTs.get(sig.token_id);
  const lastTs = last && last.ts != null ? last.ts : null;
  if (lastTs !== null && lastTs > target + stale) {
    return { ...base, status: 'missing', forward_return: null, max_drawdown: null, max_runup: null,
      exit_ts: null, exit_price: null };
  }
  const silentSince = lastTs === null ? entry.ts : lastTs;
  if (nowSec - silentSince < opts.deadGapSec) return null; // may still resume; decide later
  const p = stmts.path.get(sig.token_id, entry.ts, Math.max(entry.ts, silentSince));
  return { ...base, status: 'dead', forward_return: -1, max_drawdown: -1, max_runup: runupOf(p),
    exit_ts: null, exit_price: 0 };
}

/** Compute and append all outcomes that are due. Returns {inserted, byStatus, undecided}. */
function runOutcomes(db, o = {}) {
  initEvalSchema(db);
  const opts = { ...DEFAULTS, ...o };
  const nowSec = opts.nowSec != null ? opts.nowSec : Math.floor(Date.now() / 1000);
  const stmts = prepare(db);
  const pending = db.prepare(
    `SELECT s.signal_id, s.token_id, s.as_of_ts FROM signal_snapshot s
     WHERE s.as_of_ts <= ?
       AND NOT EXISTS (SELECT 1 FROM outcome_window o
                       WHERE o.signal_snapshot_id = s.signal_id AND o.horizon_min = ?)
     ORDER BY s.as_of_ts ASC LIMIT ?`);
  const ins = db.prepare(
    `INSERT OR IGNORE INTO outcome_window
     (token_id, signal_snapshot_id, horizon_min, forward_return, max_drawdown, max_runup, computed_ts,
      status, entry_ts, entry_price, exit_ts, exit_price)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  const res = { inserted: 0, undecided: 0, byStatus: { ok: 0, dead: 0, missing: 0 } };

  for (const h of opts.horizons) {
    const stale = stalenessSec(h, opts);
    const rows = pending.all(nowSec - h * 60 - stale, h, opts.batchLimit);
    inTransaction(db, () => {
      for (const sig of rows) {
        const out = computeOutcome(stmts, sig, h, nowSec, opts);
        if (!out) { res.undecided++; continue; }
        ins.run(sig.token_id, sig.signal_id, h, out.forward_return, out.max_drawdown, out.max_runup,
          nowSec, out.status, out.entry_ts, out.entry_price, out.exit_ts, out.exit_price);
        res.inserted++;
        res.byStatus[out.status]++;
      }
    });
  }
  return res;
}

module.exports = { runOutcomes, computeOutcome, prepare, stalenessSec, HORIZONS_MIN, DEFAULTS };
