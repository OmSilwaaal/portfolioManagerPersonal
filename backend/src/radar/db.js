const Database = require('better-sqlite3');
const path = require('path');

// Separate file from the app DB: radar writes constantly and can be wiped/rebuilt without touching users.
// On Railway the volume mount persists it across deploys.
const DB_PATH = process.env.RADAR_DB_PATH ||
  path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, '../..'), 'radar.sqlite');

const SCHEMA_VERSION = 2;
let db;

function getRadarDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    migrate();
  }
  return db;
}

// v1 keyed everything by pool address, so a pump.fun → PumpSwap migration looked like the token vanished (a fake rug).
// v2 keys by TOKEN and records which pool it currently trades on. v1 tables are renamed, never dropped.
function migrate() {
  const version = db.pragma('user_version', { simple: true });
  if (version < 2) {
    const hasV1 = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='token'").get();
    if (hasV1) {
      const cols = db.prepare('PRAGMA table_info(token)').all().map((c) => c.name);
      if (cols.includes('pool_address') && !cols.includes('current_pool')) {
        db.exec(`
          DROP INDEX IF EXISTS idx_snap_ts;
          ALTER TABLE market_snapshot RENAME TO market_snapshot_v1;
          ALTER TABLE token RENAME TO token_v1;
        `);
      }
    }
  }
  initSchema();
  db.pragma(`user_version = ${SCHEMA_VERSION}`);
}

// Everything is append-only. A feature at time t may only use rows with ts <= t (point-in-time).
function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS token (
      token_address   TEXT PRIMARY KEY,
      symbol          TEXT,
      name            TEXT,
      creator         TEXT,
      first_pool      TEXT,
      current_pool    TEXT,
      dex             TEXT,
      launchpad       TEXT,
      pool_created_ts INTEGER NOT NULL,   -- unix seconds, from the exchange
      first_seen_ts   INTEGER NOT NULL,   -- unix seconds, when we first saw it (gap = discovery lag)
      migrated_ts     INTEGER,            -- pump.fun curve -> AMM graduation
      dead_ts         INTEGER,
      dead_reason     TEXT,               -- 'gone' (no pairs anywhere) | 'inactive' (liquidity/volume dried up)
      misses          INTEGER NOT NULL DEFAULT 0,
      quiet_count     INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_token_creator ON token(creator);
    CREATE INDEX IF NOT EXISTS idx_token_created ON token(pool_created_ts);

    CREATE TABLE IF NOT EXISTS market_snapshot (
      token_address TEXT    NOT NULL,
      ts            INTEGER NOT NULL,
      pool_address  TEXT,
      price_usd     REAL,
      liquidity_usd REAL,
      liq_estimated INTEGER NOT NULL DEFAULT 0,  -- 1 = derived from bonding-curve math, 0 = reported
      fdv           REAL,
      vol_m5        REAL,
      vol_h1        REAL,
      buys_m5       INTEGER,
      sells_m5      INTEGER,
      buys_h1       INTEGER,
      sells_h1      INTEGER,
      PRIMARY KEY (token_address, ts)
    ) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS idx_snap_ts ON market_snapshot(ts);

    -- Holder / authority / creator-history checks. Append-only: each row is "what we knew as of ts".
    CREATE TABLE IF NOT EXISTS token_security (
      token_address  TEXT    NOT NULL,
      ts             INTEGER NOT NULL,
      creator        TEXT,
      rc_score       REAL,      -- rugcheck normalised risk score (higher = riskier)
      danger_count   INTEGER,
      top1_pct_ex    REAL,      -- largest holder %, excluding AMM/curve/locker accounts
      top10_pct_ex   REAL,
      creator_pct    REAL,
      insider_pct    REAL,
      mint_auth      INTEGER,
      freeze_auth    INTEGER,
      holders        INTEGER,
      lp_locked_pct  REAL,
      rugged         INTEGER,
      creator_prev_count      INTEGER,
      creator_prev_dead_share REAL,
      risks_json     TEXT,
      PRIMARY KEY (token_address, ts)
    ) WITHOUT ROWID;

    -- Cached market features (point-in-time, so final the moment they're written). Bump version to invalidate.
    CREATE TABLE IF NOT EXISTS feature_snapshot (
      token_address TEXT    NOT NULL,
      ts            INTEGER NOT NULL,
      version       INTEGER NOT NULL,
      json          TEXT    NOT NULL,
      PRIMARY KEY (token_address, ts)
    ) WITHOUT ROWID;
  `);
}

module.exports = { getRadarDb, DB_PATH };
