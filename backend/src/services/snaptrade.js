const crypto = require('crypto');
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

// ── Encryption at rest for SnapTrade user secrets ─────────────────────────────
// A SnapTrade userSecret grants read access to a user's brokerage accounts, so it is
// AES-256-GCM encrypted in SQLite when DATA_ENCRYPTION_KEY (32 bytes, hex or base64) is set.
// Legacy plaintext rows are still readable and are upgraded on next save.
const PREFIX = 'enc:v1:';

function getKey() {
  const raw = process.env.DATA_ENCRYPTION_KEY;
  if (!raw) return null;
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('DATA_ENCRYPTION_KEY must decode to exactly 32 bytes');
  return key;
}

function encrypt(plain) {
  const key = getKey();
  if (!key) {
    if (process.env.NODE_ENV === 'production') {
      console.warn('[snaptrade] DATA_ENCRYPTION_KEY not set — brokerage secrets are stored unencrypted');
    }
    return plain;
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64');
}

function decrypt(stored) {
  if (typeof stored !== 'string' || !stored.startsWith(PREFIX)) return stored; // legacy plaintext
  const key = getKey();
  if (!key) throw new Error('DATA_ENCRYPTION_KEY is required to decrypt stored SnapTrade secrets');
  const buf = Buffer.from(stored.slice(PREFIX.length), 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
}

function getConnection(userId) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM snaptrade_connections WHERE user_id = ?').get(userId);
  if (!row) return row;
  return { ...row, snaptrade_user_secret: decrypt(row.snaptrade_user_secret) };
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
  `).run(userId, snaptradeUserId, encrypt(snaptradeUserSecret));
}

function deleteConnection(userId) {
  const db = getDb();
  db.prepare('DELETE FROM snaptrade_connections WHERE user_id = ?').run(userId);
}

module.exports = { getClient, getConnection, saveConnection, deleteConnection };
