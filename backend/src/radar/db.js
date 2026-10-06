const Database = require('better-sqlite3');
const path = require('path');

// Separate file from the app DB: radar writes constantly and can be wiped/rebuilt without touching users.
// On Railway the volume mount persists it across deploys.
const DB_PATH = process.env.RADAR_DB_PATH ||
  path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, '../..'), 'radar.sqlite');

let db;

function getRadarDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    initSchema();
  }
  return db;
}

// Everything is append-only. Features are stored per snapshot so models can be replayed/ablated offline
// without re-collecting, and every feature uses only data with ts <= the row's own ts (point-in-time).
function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS token (
      pool_address   TEXT PRIMARY KEY,
      token_address  TEXT,
      symbol         TEXT,
      name           TEXT,
      dex            TEXT,
      pool_created_ts INTEGER NOT NULL,   -- unix seconds, from the exchange
      first_seen_ts   INTEGER NOT NULL,   -- unix seconds, when we first saw it
      dead_ts         INTEGER,            -- set after repeated missing responses
      misses          INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS market_snapshot (
      pool_address TEXT    NOT NULL,
      ts           INTEGER NOT NULL,      -- unix seconds we observed it
      price_usd    REAL,
      liquidity_usd REAL,
      liq_estimated INTEGER NOT NULL DEFAULT 0,  -- 1 = derived from bonding-curve math, 0 = reported by exchange
      fdv          REAL,
      vol_m5       REAL,
      vol_h1       REAL,
      buys_m5      INTEGER,
      sells_m5     INTEGER,
      buys_h1      INTEGER,
      sells_h1     INTEGER,
      PRIMARY KEY (pool_address, ts)
    ) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS idx_snap_ts ON market_snapshot(ts);
  `);
}

module.exports = { getRadarDb, DB_PATH };
