// Evaluation tables. Both are APPEND-ONLY: rows are only ever INSERTed.
// Outcomes are derived strictly from market_snapshot rows at/after a signal's as_of_ts
// and strictly after the horizon has elapsed; they are never fed back into features.
// Works with better-sqlite3 and node:sqlite (only uses db.exec).
function initEvalSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS outcome_window (
      outcome_id         INTEGER PRIMARY KEY AUTOINCREMENT,
      token_id           INTEGER NOT NULL,
      signal_snapshot_id INTEGER NOT NULL,
      horizon_min        INTEGER NOT NULL,
      forward_return     REAL,            -- fraction (0.3 = +30%); NULL when status='missing'
      max_drawdown       REAL,            -- <= 0, worst price vs entry inside the window
      max_runup          REAL,            -- >= 0, best price vs entry inside the window
      computed_ts        INTEGER NOT NULL,
      status             TEXT    NOT NULL DEFAULT 'ok',  -- ok | dead | missing
      entry_ts           INTEGER,
      entry_price        REAL,
      exit_ts            INTEGER,
      exit_price         REAL,
      UNIQUE(signal_snapshot_id, horizon_min)
    );
    CREATE INDEX IF NOT EXISTS idx_outcome_window_token ON outcome_window(token_id, horizon_min);

    CREATE TABLE IF NOT EXISTS eval_report (
      report_id     INTEGER PRIMARY KEY AUTOINCREMENT,
      created_ts    INTEGER NOT NULL,
      model_version TEXT,
      json          TEXT    NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_eval_report_created ON eval_report(created_ts);
  `);
}

// node:sqlite has no db.transaction(); plain BEGIN/COMMIT works on both drivers.
function inTransaction(db, fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (_) { /* ignore */ }
    throw e;
  }
}

module.exports = { initEvalSchema, inTransaction };
