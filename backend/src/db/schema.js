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

  // Migrations — add columns if they don't exist (SQLite lacks ADD COLUMN IF NOT EXISTS)
  try { db.exec('ALTER TABLE paper_positions ADD COLUMN targetPrice REAL DEFAULT NULL') } catch (_) {}
  try { db.exec('ALTER TABLE paper_positions ADD COLUMN stopLoss REAL DEFAULT NULL') } catch (_) {}
  // Give existing $0 portfolios the $500 starting balance
  try { db.exec('UPDATE paper_portfolios SET cashBalance = 500 WHERE cashBalance = 0') } catch (_) {}
}

module.exports = { getDb };
