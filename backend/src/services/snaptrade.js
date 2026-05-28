const { Snaptrade } = require('snaptrade-typescript-sdk');
const { getDb } = require('../db/schema');

let client;

function getClient() {
  if (!client) {
    const clientId = process.env.SNAPTRADE_CLIENT_ID;
    const consumerKey = process.env.SNAPTRADE_CONSUMER_KEY;
    if (!clientId || !consumerKey) {
      throw new Error('SNAPTRADE_CLIENT_ID and SNAPTRADE_CONSUMER_KEY must be set');
    }
    client = new Snaptrade({ clientId, consumerKey });
  }
  return client;
}

function getConnection(userId) {
  const db = getDb();
  return db.prepare('SELECT * FROM snaptrade_connections WHERE user_id = ?').get(userId);
}

function saveConnection(userId, snaptradeUserId, snaptradeUserSecret) {
  const db = getDb();
  db.prepare(`
    INSERT INTO snaptrade_connections (user_id, snaptrade_user_id, snaptrade_user_secret)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      snaptrade_user_id = excluded.snaptrade_user_id,
      snaptrade_user_secret = excluded.snaptrade_user_secret,
      connected_at = datetime('now')
  `).run(userId, snaptradeUserId, snaptradeUserSecret);
}

function deleteConnection(userId) {
  const db = getDb();
  db.prepare('DELETE FROM snaptrade_connections WHERE user_id = ?').run(userId);
}

module.exports = { getClient, getConnection, saveConnection, deleteConnection };
