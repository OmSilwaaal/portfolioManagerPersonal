const { getDb } = require('./schema');

// Watchlist queries
function getAllWatchlist() {
  const db = getDb();
  return db.prepare('SELECT * FROM watchlist ORDER BY addedAt DESC').all();
}

function addToWatchlist(ticker) {
  const db = getDb();
  const stmt = db.prepare('INSERT OR IGNORE INTO watchlist (ticker) VALUES (?)');
  return stmt.run(ticker.toUpperCase());
}

function removeFromWatchlist(ticker) {
  const db = getDb();
  const stmt = db.prepare('DELETE FROM watchlist WHERE ticker = ?');
  return stmt.run(ticker.toUpperCase());
}

// Alert queries — every user-facing query is scoped by user_id
function getAlertsByUser(userId) {
  const db = getDb();
  return db.prepare('SELECT * FROM alerts WHERE user_id = ? ORDER BY createdAt DESC').all(userId);
}

// Poller only: all untriggered alerts across users
function getAllPendingAlerts() {
  const db = getDb();
  return db.prepare('SELECT * FROM alerts WHERE triggered = 0 AND user_id IS NOT NULL').all();
}

function countAlertsByUser(userId) {
  const db = getDb();
  return db.prepare('SELECT COUNT(*) AS n FROM alerts WHERE user_id = ?').get(userId).n;
}

function getAlertById(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM alerts WHERE id = ?').get(id);
}

function getAlertForUser(id, userId) {
  const db = getDb();
  return db.prepare('SELECT * FROM alerts WHERE id = ? AND user_id = ?').get(id, userId);
}

function createAlert(userId, ticker, targetPrice, direction) {
  const db = getDb();
  const stmt = db.prepare(
    'INSERT INTO alerts (user_id, ticker, targetPrice, direction) VALUES (?, ?, ?, ?)'
  );
  const result = stmt.run(userId, ticker.toUpperCase(), targetPrice, direction);
  return getAlertById(result.lastInsertRowid);
}

function deleteAlertForUser(id, userId) {
  const db = getDb();
  return db.prepare('DELETE FROM alerts WHERE id = ? AND user_id = ?').run(id, userId);
}

function markAlertTriggered(id) {
  const db = getDb();
  const stmt = db.prepare('UPDATE alerts SET triggered = 1 WHERE id = ?');
  return stmt.run(id);
}

// User preferences queries
function getPreferences(sessionId) {
  const db = getDb();
  return db.prepare('SELECT * FROM user_preferences WHERE sessionId = ?').get(sessionId);
}

function createPreferences(prefs) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO user_preferences
      (sessionId, investorType, riskTolerance, updateFrequency, watchedCategories, priorityAlerts, watchlistJson)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    prefs.sessionId,
    prefs.investorType || null,
    prefs.riskTolerance || null,
    prefs.updateFrequency || null,
    JSON.stringify(prefs.watchedCategories || []),
    JSON.stringify(prefs.priorityAlerts || []),
    JSON.stringify(prefs.watchlist || [])
  );
  return getPreferences(prefs.sessionId);
}

function updatePreferences(sessionId, prefs) {
  const db = getDb();
  const stmt = db.prepare(`
    UPDATE user_preferences SET
      investorType = COALESCE(?, investorType),
      riskTolerance = COALESCE(?, riskTolerance),
      updateFrequency = COALESCE(?, updateFrequency),
      watchedCategories = COALESCE(?, watchedCategories),
      priorityAlerts = COALESCE(?, priorityAlerts),
      watchlistJson = COALESCE(?, watchlistJson),
      updatedAt = datetime('now')
    WHERE sessionId = ?
  `);
  stmt.run(
    prefs.investorType || null,
    prefs.riskTolerance || null,
    prefs.updateFrequency || null,
    prefs.watchedCategories ? JSON.stringify(prefs.watchedCategories) : null,
    prefs.priorityAlerts ? JSON.stringify(prefs.priorityAlerts) : null,
    prefs.watchlist ? JSON.stringify(prefs.watchlist) : null,
    sessionId
  );
  return getPreferences(sessionId);
}

// Gov trades cache queries
function upsertGovTrade(trade) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO gov_trades_cache
      (tradeHash, officialName, ticker, transactionType, tradeDate, disclosureDate,
       disclosureLagDays, amountRange, chamber, party, urgency, rawJson)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(
    trade.id,
    trade.officialName,
    trade.ticker,
    trade.transactionType,
    trade.tradeDate,
    trade.disclosureDate,
    trade.disclosureLagDays,
    trade.amountRange,
    trade.chamber,
    trade.party,
    trade.urgency,
    JSON.stringify(trade)
  );
}

function getCachedGovTrades(limit = 50) {
  const db = getDb();
  return db
    .prepare('SELECT * FROM gov_trades_cache ORDER BY disclosureDate DESC LIMIT ?')
    .all(limit)
    .map((row) => {
      try {
        return JSON.parse(row.rawJson);
      } catch {
        return row;
      }
    });
}

module.exports = {
  getAllWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  getAlertsByUser,
  getAllPendingAlerts,
  countAlertsByUser,
  getAlertForUser,
  createAlert,
  deleteAlertForUser,
  markAlertTriggered,
  getPreferences,
  createPreferences,
  updatePreferences,
  upsertGovTrade,
  getCachedGovTrades,
};

/* ── memecoin alerts ──────────────────────────────────────────────────────── */

const getMemeAlertPrefs = (userId) =>
  getDb().prepare('SELECT * FROM memecoin_alert_prefs WHERE user_id = ?').get(userId) || null;

const listEnabledMemeAlertPrefs = () =>
  getDb().prepare('SELECT * FROM memecoin_alert_prefs WHERE enabled = 1').all();

function upsertMemeAlertPrefs(userId, p) {
  getDb()
    .prepare(
      `INSERT INTO memecoin_alert_prefs
         (user_id, enabled, sms, move_pct_5m, move_pct_1h, min_score, min_confidence, min_liquidity, cooldown_min, updated_at)
       VALUES (@user_id, @enabled, @sms, @move_pct_5m, @move_pct_1h, @min_score, @min_confidence, @min_liquidity, @cooldown_min, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET
         enabled = excluded.enabled, sms = excluded.sms,
         move_pct_5m = excluded.move_pct_5m, move_pct_1h = excluded.move_pct_1h,
         min_score = excluded.min_score, min_confidence = excluded.min_confidence,
         min_liquidity = excluded.min_liquidity, cooldown_min = excluded.cooldown_min,
         updated_at = datetime('now')`,
    )
    .run({ user_id: userId, ...p });
  return getMemeAlertPrefs(userId);
}

// Most recent send time per (address, kind) for one user — drives the cooldown.
function getMemeAlertLastSent(userId) {
  const rows = getDb()
    .prepare(
      `SELECT address, kind, MAX(created_ts) AS ts
         FROM memecoin_alert_events WHERE user_id = ? GROUP BY address, kind`,
    )
    .all(userId);
  const map = new Map();
  for (const r of rows) map.set(`${r.address}|${r.kind}`, r.ts);
  return map;
}

const insertMemeAlertEvent = (e) =>
  getDb()
    .prepare(
      `INSERT INTO memecoin_alert_events
         (user_id, address, symbol, kind, direction, window, change_pct, score, confidence, message, created_ts)
       VALUES (@user_id, @address, @symbol, @kind, @direction, @window, @change_pct, @score, @confidence, @message, @created_ts)`,
    )
    .run(e).lastInsertRowid;

const listMemeAlertEvents = (userId, limit = 50) =>
  getDb()
    .prepare('SELECT * FROM memecoin_alert_events WHERE user_id = ? ORDER BY created_ts DESC LIMIT ?')
    .all(userId, Math.min(Math.max(Number(limit) || 50, 1), 200));

const markMemeAlertsRead = (userId, ts) =>
  getDb()
    .prepare('UPDATE memecoin_alert_events SET read_ts = ? WHERE user_id = ? AND read_ts IS NULL AND created_ts <= ?')
    .run(ts, userId, ts).changes;

// Keep the table from growing without bound.
const pruneMemeAlertEvents = (beforeTs) =>
  getDb().prepare('DELETE FROM memecoin_alert_events WHERE created_ts < ?').run(beforeTs).changes;

module.exports.getMemeAlertPrefs = getMemeAlertPrefs;
module.exports.listEnabledMemeAlertPrefs = listEnabledMemeAlertPrefs;
module.exports.upsertMemeAlertPrefs = upsertMemeAlertPrefs;
module.exports.getMemeAlertLastSent = getMemeAlertLastSent;
module.exports.insertMemeAlertEvent = insertMemeAlertEvent;
module.exports.listMemeAlertEvents = listMemeAlertEvents;
module.exports.markMemeAlertsRead = markMemeAlertsRead;
module.exports.pruneMemeAlertEvents = pruneMemeAlertEvents;
