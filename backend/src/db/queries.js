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

// Alert queries
function getAllAlerts() {
  const db = getDb();
  return db.prepare('SELECT * FROM alerts ORDER BY createdAt DESC').all();
}

function getAlertById(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM alerts WHERE id = ?').get(id);
}

function createAlert(ticker, targetPrice, direction) {
  const db = getDb();
  const stmt = db.prepare(
    'INSERT INTO alerts (ticker, targetPrice, direction) VALUES (?, ?, ?)'
  );
  const result = stmt.run(ticker.toUpperCase(), targetPrice, direction);
  return getAlertById(result.lastInsertRowid);
}

function deleteAlert(id) {
  const db = getDb();
  const stmt = db.prepare('DELETE FROM alerts WHERE id = ?');
  return stmt.run(id);
}

function markAlertTriggered(id) {
  const db = getDb();
  const stmt = db.prepare('UPDATE alerts SET triggered = 1 WHERE id = ?');
  return stmt.run(id);
}

module.exports = {
  getAllWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  getAllAlerts,
  getAlertById,
  createAlert,
  deleteAlert,
  markAlertTriggered,
};
