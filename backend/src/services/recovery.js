const crypto = require('crypto');
const WORDS = require('../data/wordlist');
const { getDb } = require('../db/schema');

// A recovery phrase is 6 random BIP-39 words (6 × 11 = 66 bits). It is only ever shown once: we keep an HMAC of it
// (keyed with a server secret) and look accounts up by that hash, so the phrase alone is enough to sign in.
const PHRASE_WORDS = 6;

function pepper() {
  return process.env.RECOVERY_PEPPER || process.env.DATA_ENCRYPTION_KEY || null;
}

const isAvailable = () => Boolean(pepper());

function normalize(input) {
  return String(input ?? '').toLowerCase().split(/[^a-z]+/).filter(Boolean).join(' ');
}

function hashPhrase(normalized) {
  return crypto.createHmac('sha256', pepper()).update(normalized).digest('hex');
}

function generatePhrase() {
  const out = [];
  for (let i = 0; i < PHRASE_WORDS; i++) out.push(WORDS[crypto.randomInt(WORDS.length)]);
  return out.join(' ');
}

function getStatus(userId) {
  const row = getDb().prepare('SELECT created_at FROM recovery_codes WHERE user_id = ?').get(userId);
  return { hasPhrase: Boolean(row), createdAt: row?.created_at ?? null };
}

// Creates (or, with replace, rotates) the user's phrase and returns it in plaintext this one time.
// Returns null if a phrase already exists and replace wasn't requested.
function createPhrase(userId, { replace = false } = {}) {
  const db = getDb();
  if (!replace && db.prepare('SELECT 1 FROM recovery_codes WHERE user_id = ?').get(userId)) return null;
  const phrase = generatePhrase();
  db.prepare(`
    INSERT INTO recovery_codes (user_id, phrase_hash) VALUES (?, ?)
    ON CONFLICT(user_id) DO UPDATE SET phrase_hash = excluded.phrase_hash, created_at = datetime('now')
  `).run(userId, hashPhrase(phrase));
  return phrase;
}

function findUserByPhrase(input) {
  const n = normalize(input);
  if (n.split(' ').length !== PHRASE_WORDS) return null;
  return getDb().prepare('SELECT user_id FROM recovery_codes WHERE phrase_hash = ?').get(hashPhrase(n))?.user_id ?? null;
}

module.exports = { isAvailable, getStatus, createPhrase, findUserByPhrase };
