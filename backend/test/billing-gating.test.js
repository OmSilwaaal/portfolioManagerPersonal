// With nothing configured, the server must behave exactly as it did before billing existed.
//
// This file runs with a DELIBERATELY EMPTY billing environment. It is the regression test for
// "nothing goes live by accident": the router still mounts, the app still boots, every paying
// endpoint answers 503, and the UI is told `enabled: false` so it renders no way to pay.
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
require('./_sqlite').installBetterSqlite3Adapter();

process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'billing-gate-')), 'test.sqlite');

// Everything billing-related is cleared before the modules load.
for (const k of [
  'ENABLE_BILLING_STRIPE', 'ENABLE_BILLING_SOLANA', 'STRIPE_SECRET_KEY',
  'BILLING_STRIPE_PUBLISHABLE_KEY', 'BILLING_STRIPE_WEBHOOK_SECRET', 'BILLING_STRIPE_PRO_PRICE_ID',
  'BILLING_TREASURY_ADDRESS', 'BILLING_PRO_PRICE_LAMPORTS', 'BILLING_ADMIN_USER_IDS',
]) delete process.env[k];

const express = require('express');
const cfg = require('../src/services/billingConfig');
const { router } = require('../src/routes/billing');

const USER = '11111111-2222-4333-8444-555555555555';
const app = express();
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());
app.use((req, _res, next) => { req.user = { id: USER, email: 'u@example.com', app_metadata: {} }; next(); });
app.use('/api/billing', router);

const server = app.listen(0);
const ready = new Promise((r) => server.once('listening', r));
let base;
test.before(async () => { await ready; base = `http://127.0.0.1:${server.address().port}/api/billing`; });
test.after(() => server.close());

const get = (p) => fetch(base + p).then(async (r) => ({ status: r.status, body: await r.json() }));
const post = (p, b) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b ?? {}) })
  .then(async (r) => ({ status: r.status, body: await r.json() }));

test('both rails report themselves off, and say which settings are missing', () => {
  const c = cfg.config();
  assert.strictEqual(c.anyEnabled, false);
  assert.strictEqual(c.stripe.enabled, false);
  assert.strictEqual(c.solana.enabled, false);
  assert.ok(c.stripe.missing.includes('ENABLE_BILLING_STRIPE != true'));
  assert.ok(c.solana.missing.includes('ENABLE_BILLING_SOLANA != true'));
  // The diagnostics name variables, never values.
  assert.ok(!JSON.stringify(c).includes('sk_'), 'no key material in the config object');
});

test('a flag alone does not switch a rail on', () => {
  assert.strictEqual(cfg.stripeConfig({ ENABLE_BILLING_STRIPE: 'true' }).enabled, false, 'needs keys too');
  assert.strictEqual(cfg.solanaConfig({ ENABLE_BILLING_SOLANA: 'true' }).enabled, false, 'needs a treasury too');
  // And keys alone do not switch it on either: the flag is a separate, deliberate act.
  assert.strictEqual(cfg.stripeConfig({
    STRIPE_SECRET_KEY: 'sk_live_x', BILLING_STRIPE_PUBLISHABLE_KEY: 'pk_live_x', BILLING_STRIPE_WEBHOOK_SECRET: 'whsec_x',
  }).enabled, false);
  assert.strictEqual(cfg.solanaConfig({ BILLING_TREASURY_ADDRESS: 'TrEaSuRy1111111111111111111111111111111111' }).enabled, false);
  // Only both together.
  assert.strictEqual(cfg.solanaConfig({ ENABLE_BILLING_SOLANA: 'true', BILLING_TREASURY_ADDRESS: 'TrEaSuRy1111111111111111111111111111111111' }).enabled, true);
});

test('the config endpoint offers the UI nothing to pay with', async () => {
  const { status, body } = await get('/config');
  assert.strictEqual(status, 200);
  assert.strictEqual(body.card.enabled, false);
  assert.strictEqual(body.sol.enabled, false);
  assert.strictEqual(body.card.publishableKey, null);
  assert.strictEqual(body.sol.treasury, null);
  assert.deepStrictEqual(body.card.tiers, [], 'no tiers means no buttons');
  assert.strictEqual(body.card.proAvailable, false);
});

test('every paying endpoint answers 503 rather than half-working', async () => {
  for (const [p, b] of [
    ['/deposit/card', { tierId: 'usd_1000' }],
    ['/deposit/solana', { signature: '2'.repeat(88) }],
    ['/pro/checkout', {}],
    ['/pro/solana', { signature: '2'.repeat(88) }],
  ]) {
    const r = await post(p, b);
    assert.strictEqual(r.status, 503, `${p} should be unavailable`);
    assert.strictEqual(r.body.code, 'disabled');
  }
});

test('an unconfigured webhook is acknowledged and does nothing', async () => {
  const r = await fetch(`${base}/webhook`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'evt_x', type: 'checkout.session.completed' }),
  });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(await r.json(), { received: true, ignored: 'not_configured' });
});

test('the read-only endpoints still work, so nothing else breaks', async () => {
  const bal = await get('/balance');
  assert.strictEqual(bal.status, 200);
  assert.strictEqual(bal.body.balances.usd.netMinor, 0);
  assert.strictEqual(bal.body.balances.sol.netMinor, 0);
  const pro = await get('/pro');
  assert.strictEqual(pro.status, 200);
  assert.strictEqual(pro.body.isPro, false);
  assert.strictEqual(pro.body.isAdmin, false);
  assert.strictEqual((await get('/wallet')).status, 200);
});

test('with no admin configured, nobody is an admin', async () => {
  assert.strictEqual((await post('/admin/pro', { userId: USER, days: 30, reason: 'x' })).status, 403);
  assert.strictEqual((await get('/admin/audit')).status, 403);
});

test('the retired promo-code path grants nothing whatever PROMO_CODE is set to', async () => {
  // The old shared-secret route to free Pro. It must be inert now.
  process.env.PROMO_CODE = 'the-secret-password';
  const stripeApp = express();
  stripeApp.use(express.json());
  stripeApp.use((req, _res, next) => { req.user = { id: USER }; next(); });
  stripeApp.use('/api/stripe', require('../src/routes/stripe').router);
  const s = stripeApp.listen(0);
  await new Promise((r) => s.once('listening', r));
  for (const code of ['the-secret-password', 'THE-SECRET-PASSWORD', 'anything']) {
    const res = await fetch(`http://127.0.0.1:${s.address().port}/api/stripe/redeem-code`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }),
    });
    assert.strictEqual(res.status, 410, 'the promo path is retired');
    const body = await res.json();
    assert.strictEqual(body.code, 'retired');
    assert.ok(!body.success, 'it must never report success');
  }
  s.close();
  delete process.env.PROMO_CODE;
});
