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
