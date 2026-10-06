const Database = require('better-sqlite3');
const path = require('path');

// On Railway, mount a Volume at /data to persist across deploys.
// Locally falls back to the project root.
const DB_PATH = process.env.DB_PATH ||
  path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH || __dirname, '../../market_intelligence.sqlite');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL UNIQUE,
      addedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL,
      targetPrice REAL NOT NULL,
      direction TEXT NOT NULL CHECK(direction IN ('above', 'below')),
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      triggered INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS user_preferences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sessionId TEXT NOT NULL UNIQUE,
      investorType TEXT,
      riskTolerance TEXT,
      updateFrequency TEXT,
      watchedCategories TEXT DEFAULT '[]',
      priorityAlerts TEXT DEFAULT '[]',
      watchlistJson TEXT DEFAULT '[]',
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS paper_portfolios (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      userId      TEXT    NOT NULL UNIQUE,
      cashBalance REAL    NOT NULL DEFAULT 0,
      createdAt   TEXT    NOT NULL DEFAULT (datetime('now')),
      updatedAt   TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS paper_positions (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      userId    TEXT    NOT NULL,
      ticker    TEXT    NOT NULL,
      shares    REAL    NOT NULL DEFAULT 0,
      avgCost   REAL    NOT NULL DEFAULT 0,
      updatedAt TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(userId, ticker)
    );

    CREATE TABLE IF NOT EXISTS paper_transactions (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      userId    TEXT    NOT NULL,
      type      TEXT    NOT NULL CHECK(type IN ('buy','sell','deposit')),
      ticker    TEXT,
      shares    REAL,
      price     REAL,
      total     REAL    NOT NULL,
      createdAt TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS paper_cash_purchases (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      userId             TEXT    NOT NULL,
      usdPaid            REAL    NOT NULL,
      paperCashCredited  REAL    NOT NULL,
      stripeSessionId    TEXT    UNIQUE,
      status             TEXT    NOT NULL DEFAULT 'pending'
                                 CHECK(status IN ('pending','completed')),
      createdAt          TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS gov_trades_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tradeHash TEXT NOT NULL UNIQUE,
      officialName TEXT NOT NULL,
      ticker TEXT NOT NULL,
      transactionType TEXT,
      tradeDate TEXT,
      disclosureDate TEXT,
      disclosureLagDays INTEGER,
      amountRange TEXT,
      chamber TEXT,
      party TEXT,
      urgency TEXT DEFAULT 'Low',
      rawJson TEXT,
      fetchedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS groups (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL,
      description TEXT    NOT NULL DEFAULT '',
      color       TEXT    NOT NULL DEFAULT '#e2e8f0',
      emoji       TEXT    NOT NULL DEFAULT '',
      code        TEXT    NOT NULL UNIQUE,
      createdBy   TEXT    NOT NULL,
      createdAt   TEXT    NOT NULL DEFAULT (datetime('now')),
      updatedAt   TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS group_members (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      groupId     INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      userId      TEXT    NOT NULL,
      displayName TEXT,
      email       TEXT,
      role        TEXT    NOT NULL DEFAULT 'member' CHECK(role IN ('admin','member')),
      joinedAt    TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(groupId, userId)
    );

    CREATE TABLE IF NOT EXISTS group_posts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      groupId     INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      authorId    TEXT    NOT NULL,
      authorName  TEXT,
      content     TEXT    NOT NULL,
      type        TEXT    NOT NULL DEFAULT 'post' CHECK(type IN ('post','announcement','notification')),
      createdAt   TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS csv_positions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     TEXT    NOT NULL,
      account     TEXT    NOT NULL DEFAULT 'Imported',
      ticker      TEXT    NOT NULL,
      quantity    REAL,
      avg_cost    REAL,
      price       REAL,
      market_value REAL,
      imported_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS snaptrade_connections (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id         TEXT    NOT NULL UNIQUE,
      snaptrade_user_id   TEXT NOT NULL,
      snaptrade_user_secret TEXT NOT NULL,
      connected_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Research data collection — append-only (never UPDATE/DELETE market_snapshot rows)
  db.exec(`
    CREATE TABLE IF NOT EXISTS token (
      token_id         INTEGER PRIMARY KEY AUTOINCREMENT,
      chain            TEXT    NOT NULL DEFAULT 'solana',
      contract_address TEXT    NOT NULL,
      first_seen_ts    INTEGER NOT NULL,
      symbol           TEXT,
      UNIQUE(chain, contract_address)
    );

    CREATE TABLE IF NOT EXISTS market_snapshot (
      snapshot_id   INTEGER PRIMARY KEY AUTOINCREMENT,
      token_id      INTEGER NOT NULL REFERENCES token(token_id),
      ts            INTEGER NOT NULL,
      price         REAL,
      mcap          REAL,
      liquidity_usd REAL,
      volume_5m     REAL,
      volume_1h     REAL,
      buy_count     INTEGER,
      sell_count    INTEGER,
      holder_count  INTEGER,
      ingested_ts   INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_market_snapshot_token_ts ON market_snapshot(token_id, ts);
  `);

  // Unusual-activity signal log — append-only (INSERT only; never UPDATE/DELETE)
  db.exec(`
    CREATE TABLE IF NOT EXISTS signal_snapshot (
      signal_id           INTEGER PRIMARY KEY AUTOINCREMENT,
      token_id            INTEGER NOT NULL REFERENCES token(token_id),
      as_of_ts            INTEGER NOT NULL,
      model_version       TEXT    NOT NULL,
      component_scores    TEXT    NOT NULL,
      composite_score     REAL    NOT NULL,
      feature_vector_hash TEXT    NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_signal_snapshot_token_ts ON signal_snapshot(token_id, as_of_ts);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS sms_settings (
      user_id      TEXT    PRIMARY KEY,
      phone_enc    TEXT    NOT NULL,
      phone_last4  TEXT    NOT NULL,
      verified     INTEGER NOT NULL DEFAULT 0,
      price_alerts INTEGER NOT NULL DEFAULT 1,
      verified_at  TEXT,
      sent_day     TEXT,
      sent_count   INTEGER NOT NULL DEFAULT 0
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS recovery_codes (
      user_id     TEXT PRIMARY KEY,
      phrase_hash TEXT NOT NULL UNIQUE,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS referral_codes (
      user_id TEXT PRIMARY KEY,
      code    TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS referrals (
      referee_id  TEXT PRIMARY KEY,
      referrer_id TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id);

    CREATE TABLE IF NOT EXISTS friendships (
      requester_id TEXT NOT NULL,
      addressee_id TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted')),
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (requester_id, addressee_id)
    );
    CREATE INDEX IF NOT EXISTS idx_friend_addressee ON friendships(addressee_id);
  `);

  // Migrations — add columns if they don't exist (SQLite lacks ADD COLUMN IF NOT EXISTS)
  // Alerts were previously global; scope them to the owning user (legacy rows keep user_id NULL and become unreachable)
  try { db.exec('ALTER TABLE alerts ADD COLUMN user_id TEXT') } catch (_) {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_alerts_user ON alerts(user_id)') } catch (_) {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_csv_positions_user ON csv_positions(user_id)') } catch (_) {}
  try { db.exec('ALTER TABLE paper_positions ADD COLUMN targetPrice REAL DEFAULT NULL') } catch (_) {}
  try { db.exec('ALTER TABLE paper_positions ADD COLUMN stopLoss REAL DEFAULT NULL') } catch (_) {}
  // Give existing $0 portfolios the $500 starting balance
  try { db.exec('UPDATE paper_portfolios SET cashBalance = 500 WHERE cashBalance = 0') } catch (_) {}
}

module.exports = { getDb };
