const crypto = require('crypto');
const { getDb } = require('../db/schema');
const { supabase } = require('./supabaseAdmin');

const entitlements = require('./entitlements');

// Tunables
const REWARD_DAYS = 7;            // the REFERRER's thank-you, in days
const REFEREE_REWARD_MONTHS = 1;  // the referred user gets a free month, dated from the day they are referred
const MAX_REWARDED_REFERRALS = 10; // a referrer stops earning after this many (stops one person farming endless Pro)
const NEW_ACCOUNT_WINDOW_DAYS = 14; // codes only work on fresh accounts

// "One month later", by calendar rather than by 30 days. The end-of-month clamp is the whole
// reason this is not `+ 30 * 86400000`: a referral on 31 January has to land on 28 February
// (29 in a leap year), and naive date maths rolls it over into March instead, quietly handing
// out an extra three days of Pro to anyone who signs up at month end.
function addMonthsIso(fromMs, months) {
  const d = new Date(fromMs);
  const targetMonth = d.getUTCMonth() + months;
  const out = new Date(Date.UTC(
    d.getUTCFullYear(), targetMonth, 1,
    d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds(),
  ));
  // Days in the destination month, then clamp the day-of-month into it.
  const daysInTarget = new Date(Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0)).getUTCDate();
  out.setUTCDate(Math.min(d.getUTCDate(), daysInTarget));
  return out.toISOString();
}

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
  return { referralCount: n, rewardedLimit: MAX_REWARDED_REFERRALS, rewardDays: REWARD_DAYS, refereeRewardMonths: REFEREE_REWARD_MONTHS };
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

// Pushes a user's referral Pro expiry out to a specific instant (never pulling it in).
// Same split as grantProDays: app_metadata.referralProUntil stays the field the existing UI
// and services/identity.js read, so nothing loses access, while pro_grants gets the auditable
// row that says which referral bought which window.
async function grantProUntil(userId, untilIso) {
  const { data } = await supabase.auth.admin.getUserById(userId);
  const current = Date.parse(data?.user?.app_metadata?.referralProUntil ?? '') || 0;
  const until = Date.parse(untilIso) > current ? untilIso : new Date(current).toISOString();
  const { error } = await supabase.auth.admin.updateUserById(userId, { app_metadata: { referralProUntil: until } });
  if (error) throw error;
  return until;
}

// The auditable half of a referral reward. Keyed on the referee id so a retried redeem (or a
// redeem that failed after the INSERT into `referrals`) cannot stack a second free month:
// the partial unique index on (source, external_id) refuses the duplicate.
// Best-effort by design — the user already has their access via app_metadata above, so a
// bookkeeping failure must not take the reward away from them.
function recordReferralGrant({ userId, startsAt, endsAt, externalId, reason }) {
  try {
    entitlements.grantPro({ userId, source: 'referral', startsAt, endsAt, externalId, reason });
  } catch (err) {
    console.error('[referrals] could not record pro_grant:', err.message);
  }
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
    // The referred user's month runs from the day they are referred, which is now: the row in
    // `referrals` was just written, so "the day they are referred" and "the day they redeem"
    // are the same instant by construction.
    const startedAt = Date.now();
    const startsAtIso = new Date(startedAt).toISOString();
    const endsAtIso = addMonthsIso(startedAt, REFEREE_REWARD_MONTHS);
    const proUntil = await grantProUntil(refereeId, endsAtIso);
    recordReferralGrant({
      userId: refereeId, startsAt: startsAtIso, endsAt: endsAtIso,
      externalId: `referee:${refereeId}`, reason: `referred by ${owner.user_id}`,
    });

    const rewarded = db.prepare('SELECT COUNT(*) AS n FROM referrals WHERE referrer_id = ?').get(owner.user_id).n;
    if (rewarded <= MAX_REWARDED_REFERRALS) {
      grantProDays(owner.user_id, REWARD_DAYS)
        .then(() => recordReferralGrant({
          userId: owner.user_id,
          startsAt: startsAtIso,
          endsAt: new Date(startedAt + REWARD_DAYS * 86400000).toISOString(),
          // One row per referral they earned from, so ten referrals are ten auditable rows.
          externalId: `referrer:${owner.user_id}:${refereeId}`,
          reason: `referred ${refereeId}`,
        }))
        .catch((e) => console.error('[referrals] referrer reward failed:', e.message));
    }
    return { ok: true, proUntil, days: REWARD_DAYS, refereeProUntil: endsAtIso, months: REFEREE_REWARD_MONTHS };
  } catch (err) {
    db.prepare('DELETE FROM referrals WHERE referee_id = ?').run(refereeId); // let them retry
    console.error('[referrals] redeem failed:', err.message);
    return { ok: false, status: 500, message: 'Could not apply that code. Try again.' };
  }
}

module.exports = { getOrCreateCode, getStats, redeem, addMonthsIso, REFEREE_REWARD_MONTHS, REWARD_DAYS };
