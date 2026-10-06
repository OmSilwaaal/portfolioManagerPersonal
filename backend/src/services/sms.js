const crypto = require('crypto');
const axios = require('axios');
const { getDb } = require('../db/schema');

// SMS via Twilio. Phone verification uses Twilio Verify (Twilio generates, delivers and checks the code, so we never
// store or compare codes ourselves); outbound alert texts use the Messages API.
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID
//   TWILIO_MESSAGING_SERVICE_SID  or  TWILIO_FROM_NUMBER   (sender for alert texts)
const E164_RE = /^\+[1-9]\d{7,14}$/;
const DAILY_CAP = 20; // hard ceiling on texts per user per day — a runaway alert loop can't run up the Twilio bill

function isConfigured() {
  const e = process.env;
  return Boolean(
    e.TWILIO_ACCOUNT_SID && e.TWILIO_AUTH_TOKEN && e.TWILIO_VERIFY_SERVICE_SID &&
    (e.TWILIO_MESSAGING_SERVICE_SID || e.TWILIO_FROM_NUMBER)
  );
}

// ── Encryption at rest (phone numbers are personal data) ──────────────────────
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
  if (!key) return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64');
}

function decrypt(stored) {
  if (typeof stored !== 'string' || !stored.startsWith(PREFIX)) return stored;
  const key = getKey();
  if (!key) throw new Error('DATA_ENCRYPTION_KEY is required to decrypt stored phone numbers');
  const buf = Buffer.from(stored.slice(PREFIX.length), 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
}

// ── Twilio ────────────────────────────────────────────────────────────────────
async function twilioPost(url, params) {
  try {
    const { data } = await axios.post(url, new URLSearchParams(params).toString(), {
      auth: { username: process.env.TWILIO_ACCOUNT_SID, password: process.env.TWILIO_AUTH_TOKEN },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 10000,
    });
    return data;
  } catch (err) {
    const e = new Error(err.response?.data?.message || err.message);
    e.twilioCode = err.response?.data?.code;
    e.status = err.response?.status;
    throw e;
  }
}

const verifyUrl = (path) => `https://verify.twilio.com/v2/Services/${process.env.TWILIO_VERIFY_SERVICE_SID}/${path}`;

async function startVerification(phone) {
  await twilioPost(verifyUrl('Verifications'), { To: phone, Channel: 'sms' });
}

async function checkVerification(phone, code) {
  const data = await twilioPost(verifyUrl('VerificationCheck'), { To: phone, Code: code });
  return data.status === 'approved';
}

async function sendSms(phone, body) {
  const params = { To: phone, Body: body };
  if (process.env.TWILIO_MESSAGING_SERVICE_SID) params.MessagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  else params.From = process.env.TWILIO_FROM_NUMBER;
  await twilioPost(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`, params);
}

// ── Per-user settings ─────────────────────────────────────────────────────────
function getSettings(userId) {
  return getDb().prepare('SELECT * FROM sms_settings WHERE user_id = ?').get(userId) ?? null;
}

function saveVerifiedPhone(userId, phone) {
  getDb().prepare(`
    INSERT INTO sms_settings (user_id, phone_enc, phone_last4, verified, price_alerts, verified_at)
    VALUES (?, ?, ?, 1, 1, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      phone_enc = excluded.phone_enc,
      phone_last4 = excluded.phone_last4,
      verified = 1,
      verified_at = datetime('now')
  `).run(userId, encrypt(phone), phone.slice(-4));
}

function setPriceAlerts(userId, enabled) {
  return getDb().prepare('UPDATE sms_settings SET price_alerts = ? WHERE user_id = ?').run(enabled ? 1 : 0, userId);
}

function removePhone(userId) {
  getDb().prepare('DELETE FROM sms_settings WHERE user_id = ?').run(userId);
}

// Reserves one send against today's cap. Returns false when the user has hit it.
function reserveSend(userId) {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const row = db.prepare('SELECT sent_day, sent_count FROM sms_settings WHERE user_id = ?').get(userId);
  if (!row) return false;
  const count = row.sent_day === today ? row.sent_count : 0;
  if (count >= DAILY_CAP) return false;
  db.prepare('UPDATE sms_settings SET sent_day = ?, sent_count = ? WHERE user_id = ?').run(today, count + 1, userId);
  return true;
}

// Sends a text to a user's verified number. `kind: 'price_alerts'` honours the user's opt-in toggle.
// Never throws — a failed text must not break the caller (alert poller, trade flow).
async function notifyUser(userId, body, { kind } = {}) {
  if (!isConfigured()) return false;
  try {
    const s = getSettings(userId);
    if (!s || !s.verified) return false;
    if (kind === 'price_alerts' && !s.price_alerts) return false;
    if (!reserveSend(userId)) return false;
    await sendSms(decrypt(s.phone_enc), body);
    return true;
  } catch (err) {
    console.error('[sms] send failed:', err.message);
    return false;
  }
}

module.exports = {
  E164_RE,
  isConfigured,
  startVerification,
  checkVerification,
  getSettings,
  saveVerifiedPhone,
  setPriceAlerts,
  removePhone,
  notifyUser,
};
