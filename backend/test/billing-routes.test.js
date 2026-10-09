// Route-level contract for /api/billing.
//
// The app in this file is mounted exactly the way index.js must mount it, raw-body line
// included, so these tests double as a check that the documented mounting actually works.
// No network: Stripe's SDK is used only for its local signature maths, and the Solana RPC is
// stubbed.
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
require('./_sqlite').installBetterSqlite3Adapter();

process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'billing-routes-')), 'test.sqlite');

const WEBHOOK_SECRET = 'whsec_test_secret_for_signing_only';
const TREASURY = 'TrEaSuRy1111111111111111111111111111111111';
Object.assign(process.env, {
  ENABLE_BILLING_STRIPE: 'true',
  STRIPE_SECRET_KEY: 'sk_test_not_a_real_key',
  BILLING_STRIPE_PUBLISHABLE_KEY: 'pk_test_publishable',
  BILLING_STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
  BILLING_STRIPE_PRO_PRICE_ID: 'price_test_pro',
  ENABLE_BILLING_SOLANA: 'true',
  BILLING_TREASURY_ADDRESS: TREASURY,
  BILLING_PRO_PRICE_LAMPORTS: '500000000',
});

const express = require('express');
const stripeLib = require('stripe');
const { router, handleStripeEvent } = require('../src/routes/billing');
const ledger = require('../src/services/ledger');
const entitlements = require('../src/services/entitlements');
const deposits = require('../src/services/solanaDeposits');
const { getDb } = require('../src/db/schema');

const USER = '11111111-2222-4333-8444-555555555555';
const ADMIN = '99999999-8888-4777-8666-555555555555';
const OTHER = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
let currentUser = USER;

const app = express();
// EXACTLY the mounting index.js needs: raw body for the webhook, before express.json().
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '60kb' }));
// Stand-in for a verified Supabase session. requireAuth returns early when req.user is set,
// so the real token check is bypassed without being weakened.
app.use((req, _res, next) => { if (currentUser) req.user = { id: currentUser, email: 'u@example.com', app_metadata: {} }; next(); });
app.use('/api/billing', router);

const server = app.listen(0);
const ready = new Promise((r) => server.once('listening', r));
let base;
test.before(async () => { await ready; base = `http://127.0.0.1:${server.address().port}/api/billing`; });
test.after(() => { server.close(); deposits.__setConnectionFactory(null); });
test.beforeEach(() => { currentUser = USER; });

const get = (p) => fetch(base + p).then(async (r) => ({ status: r.status, body: await r.json() }));
const post = (p, body) => fetch(base + p, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}),
}).then(async (r) => ({ status: r.status, body: await r.json() }));

/** POST a raw webhook payload with a real Stripe signature header (local HMAC, no network). */
function postWebhook(payload, { secret = WEBHOOK_SECRET, header = null } = {}) {
  const raw = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const sig = header !== null ? header : stripeLib.webhooks.generateTestHeaderString({ payload: raw, secret });
  return fetch(`${base}/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': sig },
    body: raw,
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
}

const evt = (id, type, object) => ({ id, type, object: 'event', data: { object } });

// ── config ────────────────────────────────────────────────────────────────────

test('config exposes the publishable key and the treasury, and no secret', async () => {
  const { status, body } = await get('/config');
  assert.strictEqual(status, 200);
  assert.strictEqual(body.feeBps, 500);
  assert.strictEqual(body.card.publishableKey, 'pk_test_publishable');
  assert.strictEqual(body.sol.treasury, TREASURY);
  // The one thing that must never appear anywhere in the payload.
  const text = JSON.stringify(body);
  assert.ok(!text.includes('sk_test_not_a_real_key'), 'the secret key must never be serialised');
  assert.ok(!text.includes(WEBHOOK_SECRET), 'the webhook secret must never be serialised');
});

test('every tier arrives pre-split, so the client never computes money', async () => {
  const { body } = await get('/config');
  assert.ok(body.card.tiers.length > 0);
  for (const t of body.card.tiers) {
    assert.ok(Number.isInteger(t.grossMinor) && Number.isInteger(t.feeMinor) && Number.isInteger(t.netMinor));
    assert.strictEqual(t.feeMinor + t.netMinor, t.grossMinor);
    assert.strictEqual(t.feeMinor, Math.floor(t.grossMinor * 500 / 10000));
  }
});

// ── authorisation ─────────────────────────────────────────────────────────────

test('every balance-changing endpoint refuses an unauthenticated caller', async () => {
  currentUser = null;
  for (const [p, b] of [
    ['/wallet', { address: 'x' }], ['/deposit/card', { tierId: 'usd_1000' }],
    ['/deposit/solana', { signature: 'x' }], ['/pro/checkout', {}], ['/pro/solana', { signature: 'x' }],
    ['/pro/cancel', {}], ['/admin/pro', { userId: OTHER, days: 1, reason: 'x' }], ['/admin/role', { userId: OTHER, admin: true }],
  ]) {
    const r = await post(p, b);
    assert.strictEqual(r.status, 401, `${p} must require auth`);
  }
  for (const p of ['/config', '/balance', '/wallet', '/pro', '/admin/audit']) {
    assert.strictEqual((await get(p)).status, 401, `${p} must require auth`);
  }
});

test('a non-admin cannot grant Pro, to themselves or to anyone else', async () => {
  for (const target of [USER, OTHER]) {
    const r = await post('/admin/pro', { userId: target, days: 30, reason: 'please' });
    assert.strictEqual(r.status, 403);
    assert.strictEqual(r.body.code, 'forbidden');
  }
  assert.strictEqual(entitlements.proStatus(USER).isPro, false, 'no Pro was granted');
  assert.strictEqual((await post('/admin/role', { userId: USER, admin: true })).status, 403);
  assert.strictEqual((await get('/admin/audit')).status, 403);
});

test('an admin grants Pro only with a reason, bounded, and it is audited', async () => {
  getDb().prepare("INSERT INTO user_roles (user_id, role, granted_by) VALUES (?, 'admin', 'bootstrap')").run(ADMIN);
  currentUser = ADMIN;

  assert.strictEqual((await post('/admin/pro', { userId: OTHER, days: 30 })).body.code, 'reason_required');
  assert.strictEqual((await post('/admin/pro', { userId: 'not-a-uuid', days: 30, reason: 'x' })).body.code, 'bad_user');
  for (const days of [0, -1, 400, 1.5, 'lots']) {
    assert.strictEqual((await post('/admin/pro', { userId: OTHER, days, reason: 'x' })).body.code, 'bad_days', `${days} days must be refused`);
  }

  const ok = await post('/admin/pro', { userId: OTHER, days: 30, reason: 'support comp #42' });
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(ok.body.granted, true);
  assert.strictEqual(entitlements.proStatus(OTHER).isPro, true);

  const audit = await get('/admin/audit');
  const row = audit.body.entries.find((e) => e.action === 'pro.admin_grant' && e.target_id === OTHER);
  assert.ok(row, 'the grant must be audited');
  assert.strictEqual(row.actor_id, ADMIN, 'the audit names the acting admin, not a shared secret');
  assert.match(row.detail, /support comp #42/);

  // And revoking works and is audited too.
  const rev = await post('/admin/pro', { userId: OTHER, revoke: true, reason: 'chargeback' });
  assert.strictEqual(rev.body.revoked, 1);
  assert.strictEqual(entitlements.proStatus(OTHER).isPro, false);
  currentUser = USER;
});

test('an admin cannot demote themselves and lock the system out', async () => {
  currentUser = ADMIN;
  assert.strictEqual((await post('/admin/role', { userId: ADMIN, admin: false })).body.code, 'self_demote');
  assert.strictEqual((await post('/admin/role', { userId: OTHER, admin: 'yes' })).body.code, 'bad_flag');
  currentUser = USER;
});

// ── input validation ──────────────────────────────────────────────────────────

test('the deposit amount cannot be chosen by the client', async () => {
  // An unknown tier is refused; an amount in the body is simply never read.
  assert.strictEqual((await post('/deposit/card', { tierId: 'usd_99999999' })).body.code, 'bad_tier');
  assert.strictEqual((await post('/deposit/card', { tierId: '' })).body.code, 'bad_tier');
  assert.strictEqual((await post('/deposit/card', { amount: 100000, grossMinor: 1, netMinor: 999999 })).body.code, 'bad_tier');
  assert.strictEqual((await post('/deposit/card', {})).body.code, 'bad_tier');
});

test('a wallet address is validated and a secret key is refused', async () => {
  assert.strictEqual((await post('/wallet', { address: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU' })).status, 200);
  for (const bad of ['', 'nope', '4'.repeat(88), null, 42]) {
    assert.strictEqual((await post('/wallet', { address: bad })).body.code, 'bad_address', `${bad} must be refused`);
  }
});

// ── webhook ───────────────────────────────────────────────────────────────────

test('a webhook with no signature, a bad signature or the wrong secret is rejected', async () => {
  const payload = evt('evt_sig_1', 'checkout.session.completed', { id: 'cs_1', mode: 'payment', payment_status: 'paid', amount_total: 1000, currency: 'usd', client_reference_id: USER, payment_intent: 'pi_sig_1' });

  assert.strictEqual((await postWebhook(payload, { header: '' })).status, 400);
  assert.strictEqual((await postWebhook(payload, { header: 't=1,v1=deadbeef' })).status, 400);
  assert.strictEqual((await postWebhook(payload, { secret: 'whsec_the_wrong_secret' })).status, 400);
  // A valid signature over a DIFFERENT payload must not validate this one.
  const otherSig = stripeLib.webhooks.generateTestHeaderString({ payload: JSON.stringify({ tampered: true }), secret: WEBHOOK_SECRET });
  assert.strictEqual((await postWebhook(payload, { header: otherSig })).status, 400);

  assert.strictEqual(ledger.balances(USER).usd.netMinor, 0, 'nothing was credited by an unverified webhook');
});

test('a correctly signed deposit webhook credits once, and a replay credits nothing', async () => {
  const session = { id: 'cs_ok', mode: 'payment', payment_status: 'paid', amount_total: 10000, currency: 'usd', client_reference_id: USER, payment_intent: 'pi_ok', metadata: { tierId: 'usd_10000' } };
  const first = await postWebhook(evt('evt_ok_1', 'checkout.session.completed', session));
  assert.strictEqual(first.status, 200);
  assert.strictEqual(ledger.balances(USER).usd.netMinor, 9500, '10000 minus the 5% fee');

  // Same event id again: recognised as a duplicate delivery.
  const replay = await postWebhook(evt('evt_ok_1', 'checkout.session.completed', session));
  assert.strictEqual(replay.body.duplicate, true);

  // A DIFFERENT event id carrying the SAME payment. This is the case that event-id-only
  // keying would get wrong, and the ledger's payment-intent key catches it.
  await postWebhook(evt('evt_ok_2', 'checkout.session.completed', session));
  assert.strictEqual(ledger.balances(USER).usd.netMinor, 9500, 'one payment, one credit');
});

test('the amount credited comes from Stripe, never from metadata the client could set', async () => {
  const session = { id: 'cs_lie', mode: 'payment', payment_status: 'paid', amount_total: 2500, currency: 'usd', client_reference_id: USER, payment_intent: 'pi_lie', metadata: { tierId: 'usd_50000', netMinor: 999999, amount: 999999 } };
  const before = ledger.balances(USER).usd.netMinor;
  await postWebhook(evt('evt_lie', 'checkout.session.completed', session));
  assert.strictEqual(ledger.balances(USER).usd.netMinor, before + 2375, 'credited 2500 less 5%, ignoring the metadata');
});

test('a subscription checkout grants Pro, and deleting it revokes only that grant', async () => {
  const sub = { id: 'sub_abc' };
  await postWebhook(evt('evt_sub_1', 'checkout.session.completed', { id: 'cs_sub', mode: 'subscription', payment_status: 'paid', client_reference_id: USER, subscription: 'sub_abc' }));
  assert.strictEqual(entitlements.proStatus(USER).isPro, true);

  // An unrelated referral month must survive the cancellation below.
  entitlements.grantPro({ userId: USER, source: 'referral', startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 30 * 86400000).toISOString(), externalId: 'referee:survives' });

  await postWebhook(evt('evt_sub_2', 'customer.subscription.deleted', sub));
  const after = entitlements.proStatus(USER);
  assert.ok(!after.sources.includes('stripe'), 'the paid grant is gone');
  assert.ok(after.sources.includes('referral'), 'the referral month survived');
  assert.strictEqual(after.isPro, true);
});

test('an unparseable or unknown webhook body is acknowledged without side effects', async () => {
  assert.strictEqual((await postWebhook(evt('evt_unknown', 'invoice.created', { id: 'in_1' }))).status, 200);
  const bad = await postWebhook('{"not":"an event"', { secret: WEBHOOK_SECRET });
  assert.strictEqual(bad.status, 400, 'malformed JSON must not be processed');
});

test('a session without a usable user id credits nobody', async () => {
  const before = ledger.balances(USER).usd.netMinor;
  await postWebhook(evt('evt_nouser', 'checkout.session.completed', { id: 'cs_nouser', mode: 'payment', payment_status: 'paid', amount_total: 5000, currency: 'usd', client_reference_id: 'not-a-uuid', payment_intent: 'pi_nouser' }));
  assert.strictEqual(ledger.balances(USER).usd.netMinor, before);
});

test('the webhook refuses to run against a parsed body instead of verifying nothing', async () => {
  // This is the misconfiguration the mounting note exists to prevent: if express.json() ate
  // the raw bytes, the signature cannot be checked, and the handler must fail closed rather
  // than re-serialising and pretending.
  const parsedApp = express();
  parsedApp.use(express.json());
  parsedApp.use((req, _res, next) => { req.user = { id: USER, app_metadata: {} }; next(); });
  parsedApp.use('/api/billing', router);
  const s = parsedApp.listen(0);
  await new Promise((r) => s.once('listening', r));
  const payload = JSON.stringify(evt('evt_raw', 'checkout.session.completed', { id: 'cs_raw', mode: 'payment', payment_status: 'paid', amount_total: 1000, currency: 'usd', client_reference_id: USER, payment_intent: 'pi_raw' }));
  const res = await fetch(`http://127.0.0.1:${s.address().port}/api/billing/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': stripeLib.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET }) },
    body: payload,
  });
  assert.strictEqual(res.status, 500, 'a parsed body must be refused, not trusted');
  s.close();
});

// ── SOL rail through the route ────────────────────────────────────────────────

test('a SOL deposit claimed twice through the route credits once', async () => {
  const MINE = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
  // base58 has no 'l', so the label is picked from the alphabet rather than scrubbed later
  const signature = ('sorouteDeposit' + '2'.repeat(88)).slice(0, 88);
  deposits.__setConnectionFactory(() => ({
    getTransaction: async () => ({
      slot: 7, blockTime: Math.floor(Date.now() / 1000),
      meta: { err: null, preBalances: [0, 1000], postBalances: [0, 1000 + 4_000_000_000] },
      transaction: { message: { accountKeys: [MINE, TREASURY] } },
    }),
  }));
  await post('/wallet', { address: MINE });

  const first = await post('/deposit/solana', { signature });
  assert.strictEqual(first.status, 200);
  assert.strictEqual(first.body.credited, true);
  assert.strictEqual(first.body.netMinor, 3_800_000_000, '4 SOL less the 5% fee');

  const second = await post('/deposit/solana', { signature });
  assert.strictEqual(second.status, 409, 'a resubmitted signature is refused');
  assert.strictEqual(ledger.balances(USER).sol.netMinor, 3_800_000_000);
  deposits.__setConnectionFactory(null);
});

test('paying for Pro in SOL requires the full price', async () => {
  const MINE = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
  const short = ('underpaid' + '2'.repeat(88)).slice(0, 88);
  deposits.__setConnectionFactory(() => ({
    getTransaction: async () => ({
      slot: 8, blockTime: Math.floor(Date.now() / 1000),
      meta: { err: null, preBalances: [0, 0], postBalances: [0, 100_000_000] }, // 0.1 SOL, price is 0.5
      transaction: { message: { accountKeys: [MINE, TREASURY] } },
    }),
  }));
  const r = await post('/pro/solana', { signature: short });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.body.code, 'underpaid');
  deposits.__setConnectionFactory(null);
});

test('cancelling with no subscription says so rather than pretending', async () => {
  const r = await post('/pro/cancel');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.cancelled, false);
  assert.strictEqual(r.body.reason, 'no_subscription');
});
