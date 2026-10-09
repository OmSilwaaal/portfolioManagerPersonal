// Pro entitlements and the referral month.
//
// The month boundary is the interesting part. "One month from the day they are referred" is a
// calendar question, not `+ 30 days`: a referral on 31 January must land on 28 February (29
// in a leap year). Naive arithmetic rolls that into March and quietly hands out extra days.
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
require('./_sqlite').installBetterSqlite3Adapter();

process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'billing-pro-')), 'test.sqlite');

const entitlements = require('../src/services/entitlements');
const { addMonthsIso, REFEREE_REWARD_MONTHS } = require('../src/services/referrals');
const { getDb } = require('../src/db/schema');

const at = (iso) => Date.parse(iso);
const day = (iso) => addMonthsIso(at(iso), 1).slice(0, 10);

test('a referral month lands on the right calendar day', () => {
  assert.strictEqual(REFEREE_REWARD_MONTHS, 1);
  assert.strictEqual(day('2026-03-15T12:00:00Z'), '2026-04-15');
  assert.strictEqual(day('2026-12-15T12:00:00Z'), '2027-01-15', 'across a year boundary');
  assert.strictEqual(day('2026-01-01T00:00:00Z'), '2026-02-01');
});

test('the end of a long month clamps into a shorter one instead of overflowing', () => {
  assert.strictEqual(day('2026-01-31T12:00:00Z'), '2026-02-28', '31 Jan must not become 3 March');
  assert.strictEqual(day('2026-01-30T12:00:00Z'), '2026-02-28');
  assert.strictEqual(day('2026-01-29T12:00:00Z'), '2026-02-28');
  assert.strictEqual(day('2026-03-31T12:00:00Z'), '2026-04-30', '31 March -> 30 April');
  assert.strictEqual(day('2026-05-31T12:00:00Z'), '2026-06-30');
  assert.strictEqual(day('2026-08-31T12:00:00Z'), '2026-09-30');
  assert.strictEqual(day('2026-10-31T12:00:00Z'), '2026-11-30');
});

test('a leap year gets the extra day and a common year does not', () => {
  assert.strictEqual(day('2024-01-31T12:00:00Z'), '2024-02-29');
  assert.strictEqual(day('2024-01-30T12:00:00Z'), '2024-02-29');
  assert.strictEqual(day('2023-01-31T12:00:00Z'), '2023-02-28');
  assert.strictEqual(day('2100-01-31T12:00:00Z'), '2100-02-28', '2100 is not a leap year');
  assert.strictEqual(day('2000-01-31T12:00:00Z'), '2000-02-29', '2000 is');
});

test('the time of day is carried through, so the month is never short', () => {
  const out = addMonthsIso(at('2026-03-15T23:59:59.500Z'), 1);
  assert.strictEqual(out, '2026-04-15T23:59:59.500Z');
  // A referral at any instant lasts at least 28 days.
  for (const d of ['2026-01-31', '2026-02-28', '2026-07-04', '2024-02-29']) {
    const start = at(`${d}T08:30:00Z`);
    const ms = at(addMonthsIso(start, 1)) - start;
    assert.ok(ms >= 28 * 86400000, `${d} gave only ${ms / 86400000} days`);
    assert.ok(ms <= 31 * 86400000, `${d} gave ${ms / 86400000} days`);
  }
});

// ── entitlements ──────────────────────────────────────────────────────────────

const U = 'pro-user';
const now = Date.now();
const iso = (ms) => new Date(ms).toISOString();

test('with no grants and no legacy metadata a user is not Pro', () => {
  const s = entitlements.proStatus(U);
  assert.strictEqual(s.isPro, false);
  assert.deepStrictEqual(s.sources, []);
});

test('a grant makes a user Pro only inside its window', () => {
  entitlements.grantPro({ userId: U, source: 'referral', startsAt: iso(now - 1000), endsAt: iso(now + 86400000), externalId: 'referee:pro-user' });
  assert.strictEqual(entitlements.proStatus(U).isPro, true);
  // A moment after it expires, it stops counting.
  assert.strictEqual(entitlements.proStatus(U, null, now + 2 * 86400000).isPro, false);
  // And before it starts.
  assert.strictEqual(entitlements.proStatus(U, null, now - 86400000).isPro, false);
});

test('a referral grant cannot be stacked by replaying the redeem', () => {
  const V = 'stacker';
  const first = entitlements.grantPro({ userId: V, source: 'referral', startsAt: iso(now), endsAt: iso(now + 30 * 86400000), externalId: `referee:${V}` });
  assert.strictEqual(first.granted, true);
  for (let i = 0; i < 5; i++) {
    const again = entitlements.grantPro({ userId: V, source: 'referral', startsAt: iso(now), endsAt: iso(now + 365 * 86400000), externalId: `referee:${V}` });
    assert.strictEqual(again.granted, false, 'a replay must not grant a second month');
    assert.strictEqual(again.duplicate, true);
  }
  assert.strictEqual(getDb().prepare("SELECT COUNT(*) AS n FROM pro_grants WHERE user_id = ? AND source = 'referral'").get(V).n, 1);
});

test('admin grants have no external id, so many of them are allowed', () => {
  const V = 'comped';
  for (let i = 0; i < 3; i++) {
    assert.strictEqual(entitlements.grantPro({ userId: V, source: 'admin', startsAt: iso(now), endsAt: iso(now + 86400000), grantedBy: 'admin-1', reason: `comp ${i}` }).granted, true);
  }
  assert.strictEqual(entitlements.proStatus(V).isPro, true);
  assert.strictEqual(entitlements.revokePro(V), 3, 'revoking clears all of them');
  assert.strictEqual(entitlements.proStatus(V).isPro, false);
});

test('revoking one source leaves the others alone', () => {
  const V = 'mixed';
  entitlements.grantPro({ userId: V, source: 'stripe', startsAt: iso(now), endsAt: null, externalId: 'sub_mixed' });
  entitlements.grantPro({ userId: V, source: 'referral', startsAt: iso(now), endsAt: iso(now + 30 * 86400000), externalId: `referee:${V}` });
  assert.strictEqual(entitlements.revokePro(V, { source: 'stripe' }), 1);
  const s = entitlements.proStatus(V);
  assert.strictEqual(s.isPro, true, 'the referral month survives a cancelled card');
  assert.deepStrictEqual(s.sources, ['referral']);
  assert.strictEqual(s.openEnded, false);
});

test('an open-ended subscription reports no expiry date', () => {
  const V = 'subbed';
  entitlements.grantPro({ userId: V, source: 'stripe', startsAt: iso(now), endsAt: null, externalId: 'sub_open' });
  const s = entitlements.proStatus(V);
  assert.strictEqual(s.isPro, true);
  assert.strictEqual(s.openEnded, true);
  assert.strictEqual(s.until, null);
  assert.strictEqual(entitlements.stripeSubscriptionIdFor(V), 'sub_open');
  assert.strictEqual(entitlements.userIdForStripeSubscription('sub_open'), V);
});

test('the existing app_metadata flags still grant Pro, so nobody loses access on deploy', () => {
  const V = 'legacy-user';
  assert.strictEqual(entitlements.proStatus(V, { isPro: true }).isPro, true);
  assert.strictEqual(entitlements.proStatus(V, { referralProUntil: iso(now + 86400000) }).isPro, true);
  assert.strictEqual(entitlements.proStatus(V, { referralProUntil: iso(now - 86400000) }).isPro, false);
  assert.strictEqual(entitlements.proStatus(V, { isPro: false }).isPro, false);
  assert.strictEqual(entitlements.proStatus(V, {}).isPro, false);
  assert.ok(entitlements.proStatus(V, { isPro: true }).sources.includes('legacy'));
});

// ── admin authority ───────────────────────────────────────────────────────────

test('admin is a per-user row, and an unknown user is never admin', () => {
  assert.strictEqual(entitlements.isAdmin('nobody'), false);
  assert.strictEqual(entitlements.isAdmin(''), false);
  assert.strictEqual(entitlements.isAdmin(null), false);
  assert.strictEqual(entitlements.isAdmin(undefined), false);
  entitlements.setAdmin('bootstrap', 'new-admin', true);
  assert.strictEqual(entitlements.isAdmin('new-admin'), true);
  entitlements.setAdmin('bootstrap', 'new-admin', false);
  assert.strictEqual(entitlements.isAdmin('new-admin'), false);
});

test('the bootstrap list takes user ids, and ignores anything that is not one', () => {
  const id = '11111111-2222-4333-8444-555555555555';
  assert.deepStrictEqual(entitlements.bootstrapAdminIds({ BILLING_ADMIN_USER_IDS: id }), [id]);
  assert.strictEqual(entitlements.isAdmin(id, { BILLING_ADMIN_USER_IDS: id }), true);
  // Not a user id: ignored rather than treated as a password.
  for (const junk of ['hunter2', 'admin', '', 'true', '*']) {
    assert.deepStrictEqual(entitlements.bootstrapAdminIds({ BILLING_ADMIN_USER_IDS: junk }), []);
    assert.strictEqual(entitlements.isAdmin(junk, { BILLING_ADMIN_USER_IDS: junk }), false);
  }
  assert.deepStrictEqual(entitlements.bootstrapAdminIds({}), []);
});

test('every privileged action leaves an audit row naming the actor', () => {
  const before = getDb().prepare('SELECT COUNT(*) AS n FROM admin_audit').get().n;
  entitlements.audit('admin-7', 'pro.admin_grant', 'victim', { days: 30, reason: 'why' });
  const row = getDb().prepare('SELECT * FROM admin_audit ORDER BY id DESC LIMIT 1').get();
  assert.strictEqual(getDb().prepare('SELECT COUNT(*) AS n FROM admin_audit').get().n, before + 1);
  assert.strictEqual(row.actor_id, 'admin-7');
  assert.strictEqual(row.target_id, 'victim');
  assert.match(row.detail, /"days":30/);
});
