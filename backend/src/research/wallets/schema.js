'use strict';
// Append-only research tables. Works with better-sqlite3 and node:sqlite (exec/prepare only).
// UPDATE/DELETE are blocked by triggers. event_ts = when it happened (unix s), ingested_ts = when we stored it.

const TABLES = ['wallet', 'wallet_trade', 'wallet_skill_snapshot', 'smart_money_event', 'wallet_candidate', 'wallet_candidate_eval'];

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
    -- Every wallet any discovery source ever proposed (leaderboards, winner back-buyers, manual seeds, third-party
    -- adapters) plus random-wallet CONTROLS. APPEND-ONLY. reported_pnl is whatever the source CLAIMED: it is stored for
    -- audit only and is NEVER read by scoring (skill.js re-scores from on-chain trades). discovered_ts = when WE first
    -- learned of the wallet from that source/period (the honest "could have known" time); ingested_ts = our clock.
    -- leaderboard_survivor = 1 when the source picked the wallet BECAUSE of past results (selection bias).
    CREATE TABLE IF NOT EXISTS wallet_candidate (
      candidate_id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_id TEXT NOT NULL,
      source TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'candidate' CHECK (role IN ('candidate','control')),
      reported_pnl REAL,
      reported_period TEXT NOT NULL DEFAULT '',
      leaderboard_survivor INTEGER NOT NULL DEFAULT 0,
      discovered_ts INTEGER NOT NULL,
      ingested_ts INTEGER NOT NULL,
      UNIQUE (wallet_id, source, reported_period)
    );
    CREATE INDEX IF NOT EXISTS idx_wallet_candidate_w ON wallet_candidate (wallet_id);
    -- Forward test, one row per candidate once its forward window has fully elapsed: our own on-chain skill in the
    -- window BEFORE discovered_ts vs realized results AFTER it (regression-to-the-mean check).
    CREATE TABLE IF NOT EXISTS wallet_candidate_eval (
      candidate_id INTEGER PRIMARY KEY,
      wallet_id TEXT NOT NULL,
      source TEXT NOT NULL,
      role TEXT NOT NULL,
      leaderboard_survivor INTEGER NOT NULL,
      discovered_ts INTEGER NOT NULL,
      forward_days REAL NOT NULL,
      pre_n INTEGER NOT NULL,
      pre_pnl_usd REAL,
      pre_mean_ret REAL,
      pre_win_rate REAL,
      pre_passed_holdout INTEGER NOT NULL,
      pre_skill_score REAL,
      post_n INTEGER NOT NULL,
      post_pnl_usd REAL,
      post_mean_ret REAL,
      post_win_rate REAL,
      evaluated_ts INTEGER NOT NULL,
      ingested_ts INTEGER NOT NULL
    );
    -- Mutable operational state (NOT research data): API request budget per provider per UTC day, discovery run clocks.
    CREATE TABLE IF NOT EXISTS api_budget (
      provider TEXT NOT NULL,
      day TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (provider, day)
    );
    CREATE TABLE IF NOT EXISTS discovery_state (
      key TEXT PRIMARY KEY,
      value TEXT
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
