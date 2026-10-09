// Pro status, and who is allowed to hand it out.
//
// ── Why there is no admin password in this file ───────────────────────────────
// The ask was to "make the admin password unhackable for free Pro". No shared password is
// unhackable: a single constant string that grants a paid tier is guessable, loggable,
// screenshot-able, greppable out of a deploy log, and — critically — unattributable. When it
// leaks you cannot tell who used it, cannot revoke one person's access without changing it
// for everyone, and cannot prove afterwards what it was used for. Once real money is in the
// system that is a liability, not an inconvenience.
//
// So there is no password. Authority is an `admin` ROW in user_roles keyed to a Supabase
// user id. To grant Pro you must hold a valid session for an account that has that row, and
// every grant writes an admin_audit row naming the actor. Revoking one admin is deleting one
// row and affects nobody else. The bootstrap admin is named by BILLING_ADMIN_USER_IDS, which
// is an *identifier*, not a secret: knowing it gets you nothing, because you still have to
// authenticate as that user. Leaking it is embarrassing, not exploitable.
//
// ── Why Pro is a grant log and not a boolean ──────────────────────────────────
// `app_metadata.isPro = true` cannot express "paid, plus a referral month, minus a
// cancellation". A referral month would clobber a subscription or vice versa. Here each
// source writes its own row and `proStatus()` reads the union, so the sources cannot
// overwrite each other and every entitlement has a start, an end and a reason.

const { getDb } = require('../db/schema');

const ADMIN_IDS_ENV = 'BILLING_ADMIN_USER_IDS';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Bootstrap admins, comma-separated Supabase user ids. Identifiers, not credentials. */
function bootstrapAdminIds(env = process.env) {
  return String(env[ADMIN_IDS_ENV] || '')
    .split(',').map((s) => s.trim()).filter((s) => UUID_RE.test(s));
}

function isAdmin(userId, env = process.env) {
  if (typeof userId !== 'string' || !userId) return false;
  if (bootstrapAdminIds(env).includes(userId)) return true;
  try {
    return Boolean(getDb().prepare("SELECT 1 FROM user_roles WHERE user_id = ? AND role = 'admin'").get(userId));
  } catch (_) {
    // A DB problem must not accidentally promote anyone. Fail closed.
    return false;
  }
}

function audit(actorId, action, targetId, detail) {
  try {
    getDb().prepare('INSERT INTO admin_audit (actor_id, action, target_id, detail) VALUES (?, ?, ?, ?)')
      .run(String(actorId), String(action).slice(0, 80), targetId ? String(targetId) : null,
        detail == null ? null : JSON.stringify(detail).slice(0, 2000));
  } catch (err) {
    // An unauditable privileged action is worse than a failed one: let the caller abort.
    throw new Error(`could not write audit record: ${err.message}`);
  }
}

/**
 * Is this user Pro, and why. Reads only rows — no network, no Supabase call — so it is cheap
 * enough to call on any request. `legacyMeta` lets a caller fold in the older
 * app_metadata.isPro / referralProUntil flags that existing code still writes, so nobody
 * loses access on the day this ships.
 */
function proStatus(userId, legacyMeta = null, now = Date.now()) {
  const iso = new Date(now).toISOString();
  let rows = [];
  try {
    rows = getDb().prepare(
      'SELECT id, source, starts_at, ends_at, revoked_at, reason, external_id FROM pro_grants WHERE user_id = ? ORDER BY id DESC'
    ).all(userId);
  } catch (_) { rows = []; }

  const active = rows.filter((r) => !r.revoked_at && r.starts_at <= iso && (r.ends_at == null || r.ends_at > iso));
  const sources = [...new Set(active.map((r) => r.source))];

  // The furthest-out expiry among active grants; null means an open-ended one is live.
  let until = null;
  let openEnded = false;
  for (const r of active) {
    if (r.ends_at == null) openEnded = true;
    else if (until == null || r.ends_at > until) until = r.ends_at;
  }

  const legacyPro = Boolean(legacyMeta && legacyMeta.isPro);
  const legacyUntilMs = legacyMeta ? Date.parse(legacyMeta.referralProUntil ?? '') : NaN;
  const legacyReferral = Number.isFinite(legacyUntilMs) && legacyUntilMs > now;
  if (legacyReferral && !openEnded) {
    const legacyIso = new Date(legacyUntilMs).toISOString();
    if (until == null || legacyIso > until) until = legacyIso;
  }
  if (legacyPro) openEnded = true;
  if (legacyPro || legacyReferral) sources.push('legacy');

  return {
    isPro: active.length > 0 || legacyPro || legacyReferral,
    openEnded,
    until: openEnded ? null : until,
    sources: [...new Set(sources)],
    grants: active.map((r) => ({ id: r.id, source: r.source, startsAt: r.starts_at, endsAt: r.ends_at, reason: r.reason })),
  };
}

/**
 * Add a grant. `externalId` makes the grant idempotent via the partial unique index, so a
 * replayed Stripe event or a resubmitted SOL signature cannot stack free months.
 * Returns { granted, duplicate, id }.
 */
function grantPro({ userId, source, startsAt = new Date().toISOString(), endsAt = null, grantedBy = null, reason = null, externalId = null }) {
  if (typeof userId !== 'string' || !userId) throw new TypeError('userId required');
  if (!['admin', 'referral', 'stripe', 'solana'].includes(source)) throw new TypeError(`bad source: ${source}`);
  try {
    const row = getDb().prepare(
      'INSERT INTO pro_grants (user_id, source, starts_at, ends_at, granted_by, reason, external_id) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id'
    ).get(userId, source, startsAt, endsAt, grantedBy, reason, externalId);
    return { granted: true, duplicate: false, id: row.id };
  } catch (err) {
    if (require('./ledger').isUniqueViolation(err)) {
      const prior = getDb().prepare('SELECT id FROM pro_grants WHERE source = ? AND external_id = ?').get(source, externalId);
      return { granted: false, duplicate: true, id: prior ? prior.id : null };
    }
    throw err;
  }
}

/** Revoke every active grant from one source (or all sources). Returns how many rows changed. */
function revokePro(userId, { source = null, at = new Date().toISOString() } = {}) {
  const sql = source
    ? 'UPDATE pro_grants SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL AND source = ?'
    : 'UPDATE pro_grants SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL';
  const args = source ? [at, userId, source] : [at, userId];
  const info = getDb().prepare(sql).run(...args);
  return Number(info.changes || 0);
}

/** The stripe subscription id backing a user's current paid grant, if any. */
function stripeSubscriptionIdFor(userId) {
  const row = getDb().prepare(
    "SELECT external_id FROM pro_grants WHERE user_id = ? AND source = 'stripe' AND revoked_at IS NULL AND external_id IS NOT NULL ORDER BY id DESC LIMIT 1"
  ).get(userId);
  return row ? row.external_id : null;
}

function userIdForStripeSubscription(subscriptionId) {
  const row = getDb().prepare("SELECT user_id FROM pro_grants WHERE source = 'stripe' AND external_id = ? ORDER BY id DESC LIMIT 1").get(subscriptionId);
  return row ? row.user_id : null;
}

/** Promote/demote an admin. Only ever called by an already-authenticated admin. */
function setAdmin(actorId, targetId, on) {
  if (on) {
    try { getDb().prepare("INSERT INTO user_roles (user_id, role, granted_by) VALUES (?, 'admin', ?)").run(targetId, actorId); }
    catch (err) { if (!require('./ledger').isUniqueViolation(err)) throw err; }
  } else {
    getDb().prepare("DELETE FROM user_roles WHERE user_id = ? AND role = 'admin'").run(targetId);
  }
  audit(actorId, on ? 'admin.grant' : 'admin.revoke', targetId, null);
}

module.exports = {
  ADMIN_IDS_ENV, bootstrapAdminIds, isAdmin, audit, proStatus, grantPro, revokePro,
  stripeSubscriptionIdFor, userIdForStripeSubscription, setAdmin,
};
