const crypto = require('crypto');
const { getDb } = require('../db/schema');
const { supabase } = require('./supabaseAdmin');

// Tunables
const REWARD_DAYS = 7;            // free Pro granted to BOTH the new user and whoever referred them
const MAX_REWARDED_REFERRALS = 10; // a referrer stops earning after this many (stops one person farming endless Pro)
const NEW_ACCOUNT_WINDOW_DAYS = 14; // codes only work on fresh accounts

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L lookalikes

const normalizeCode = (c) => String(c ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

function getOrCreateCode(userId) {
  const db = getDb();
  const existing = db.prepare('SELECT code FROM referral_codes WHERE user_id = ?').get(userId);
  if (existing) return existing.code;
  for (let attempt = 0; attempt < 8; attempt++) {
    let code = '';
    for (let i = 0; i < 7; i++) code += ALPHABET[crypto.randomInt(ALPHABET.length)];
    try {
      db.prepare('INSERT INTO referral_codes (user_id, code) VALUES (?, ?)').run(userId, code);
      return code;
    } catch (_) { /* collision or a concurrent insert — re-read / retry */
      const again = db.prepare('SELECT code FROM referral_codes WHERE user_id = ?').get(userId);
      if (again) return again.code;
    }
  }
  throw new Error('could not allocate referral code');
}

function getStats(userId) {
  const n = getDb().prepare('SELECT COUNT(*) AS n FROM referrals WHERE referrer_id = ?').get(userId).n;
  return { referralCount: n, rewardedLimit: MAX_REWARDED_REFERRALS, rewardDays: REWARD_DAYS };
}

// Pushes a user's referral Pro expiry forward by `days` (from now, or from their current expiry if later).
// Kept separate from app_metadata.isPro so Stripe webhooks, which own that flag, never clobber it.
async function grantProDays(userId, days) {
  const { data } = await supabase.auth.admin.getUserById(userId);
  const current = Date.parse(data?.user?.app_metadata?.referralProUntil ?? '') || 0;
  const until = new Date(Math.max(Date.now(), current) + days * 86400000).toISOString();
  const { error } = await supabase.auth.admin.updateUserById(userId, { app_metadata: { referralProUntil: until } });
  if (error) throw error;
  return until;
}

// Returns { ok: true, proUntil, days } or { ok: false, status, message }
async function redeem(refereeId, rawCode, refereeCreatedAt) {
  const db = getDb();
  const code = normalizeCode(rawCode);
  if (code.length < 6) return { ok: false, status: 400, message: 'That code is not valid.' };

  const owner = db.prepare('SELECT user_id FROM referral_codes WHERE code = ?').get(code);
  if (!owner) return { ok: false, status: 404, message: 'That code is not valid.' };
  if (owner.user_id === refereeId) return { ok: false, status: 400, message: "You can't use your own code." };

  const ageDays = (Date.now() - Date.parse(refereeCreatedAt ?? '')) / 86400000;
  if (!(ageDays <= NEW_ACCOUNT_WINDOW_DAYS)) {
    return { ok: false, status: 400, message: `Referral codes only work in your first ${NEW_ACCOUNT_WINDOW_DAYS} days.` };
  }

  // The PRIMARY KEY on referee_id makes "one referral per user" race-proof
  try {
    db.prepare('INSERT INTO referrals (referee_id, referrer_id) VALUES (?, ?)').run(refereeId, owner.user_id);
  } catch (_) {
    return { ok: false, status: 409, message: "You've already used a referral code." };
  }

  try {
    const proUntil = await grantProDays(refereeId, REWARD_DAYS);
    const rewarded = db.prepare('SELECT COUNT(*) AS n FROM referrals WHERE referrer_id = ?').get(owner.user_id).n;
    if (rewarded <= MAX_REWARDED_REFERRALS) {
      grantProDays(owner.user_id, REWARD_DAYS).catch((e) => console.error('[referrals] referrer reward failed:', e.message));
    }
    return { ok: true, proUntil, days: REWARD_DAYS };
  } catch (err) {
    db.prepare('DELETE FROM referrals WHERE referee_id = ?').run(refereeId); // let them retry
    console.error('[referrals] redeem failed:', err.message);
    return { ok: false, status: 500, message: 'Could not apply that code. Try again.' };
  }
}

module.exports = { getOrCreateCode, getStats, redeem };
