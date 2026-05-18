const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '../../market_intelligence.sqlite');

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
  `);
}

module.exports = { getDb };
