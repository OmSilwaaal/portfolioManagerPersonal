'use strict';
// Append-only research tables. Works with better-sqlite3 and node:sqlite (exec/prepare only).
// UPDATE/DELETE are blocked by triggers. event_ts = when it happened (unix s), ingested_ts = when we stored it.

const TABLES = ['wallet', 'wallet_trade', 'wallet_skill_snapshot', 'smart_money_event'];

function initWalletSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS wallet (
      wallet_id TEXT NOT NULL,
      chain TEXT NOT NULL DEFAULT 'solana',
      first_seen_ts INTEGER NOT NULL,
      event_ts INTEGER NOT NULL,
      ingested_ts INTEGER NOT NULL,
      PRIMARY KEY (wallet_id, chain)
    );
    CREATE TABLE IF NOT EXISTS wallet_trade (
      wallet_id TEXT NOT NULL,
      token_id TEXT NOT NULL,
      ts INTEGER NOT NULL,
      side TEXT NOT NULL CHECK (side IN ('buy','sell')),
      amount_token REAL NOT NULL,
      price_usd REAL NOT NULL,
      amount_usd REAL NOT NULL,
      tx TEXT NOT NULL,
      event_ts INTEGER NOT NULL,
      ingested_ts INTEGER NOT NULL,
      UNIQUE (wallet_id, tx, token_id, side)
    );
    CREATE INDEX IF NOT EXISTS idx_wallet_trade_w_ts ON wallet_trade (wallet_id, ts);
    CREATE INDEX IF NOT EXISTS idx_wallet_trade_tok_ts ON wallet_trade (token_id, ts);
    CREATE TABLE IF NOT EXISTS wallet_skill_snapshot (
      wallet_id TEXT NOT NULL,
      as_of_ts INTEGER NOT NULL,
      n_trades INTEGER NOT NULL,
      win_rate REAL,
      sortino_like REAL,
      consistency_score REAL,
      realized_pnl_usd REAL,
      top_trade_share REAL,
      passed_holdout INTEGER NOT NULL DEFAULT 0,
      skill_score REAL NOT NULL DEFAULT 0,
      event_ts INTEGER NOT NULL,
      ingested_ts INTEGER NOT NULL,
      PRIMARY KEY (wallet_id, as_of_ts)
    );
    CREATE TABLE IF NOT EXISTS smart_money_event (
      token_id TEXT NOT NULL,
      wallet_id TEXT NOT NULL,
      ts INTEGER NOT NULL,
      side TEXT NOT NULL,
      amount_usd REAL NOT NULL,
      skill_as_of_ts INTEGER NOT NULL,
      skill_score REAL NOT NULL,
      event_ts INTEGER NOT NULL,
      ingested_ts INTEGER NOT NULL,
      PRIMARY KEY (token_id, wallet_id, ts, side)
    );
  `);
  for (const t of TABLES) {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS ${t}_no_update BEFORE UPDATE ON ${t}
        BEGIN SELECT RAISE(ABORT, '${t} is append-only'); END;
      CREATE TRIGGER IF NOT EXISTS ${t}_no_delete BEFORE DELETE ON ${t}
        BEGIN SELECT RAISE(ABORT, '${t} is append-only'); END;
    `);
  }
}

// Look-ahead-safe: latest snapshot strictly before ts.
function getSkillAsOf(db, walletId, ts) {
  return db.prepare(
    `SELECT * FROM wallet_skill_snapshot WHERE wallet_id = ? AND as_of_ts < ?
     ORDER BY as_of_ts DESC LIMIT 1`
  ).get(walletId, ts) || null;
}

module.exports = { initWalletSchema, getSkillAsOf, TABLES };
