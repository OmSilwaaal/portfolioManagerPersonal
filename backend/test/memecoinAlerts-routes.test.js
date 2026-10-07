// Route-level contract for the alert prefs + feed, with auth stubbed to a fixed user.
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
require('./_sqlite').installBetterSqlite3Adapter();

process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'memealertroutes-')), 'test.sqlite');

const express = require('express');
const q = require('../src/db/queries');
const router = require('../src/routes/memecoinAlerts');

let USER = 'u-route';
const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.user = { id: USER }; next(); });
app.use('/api/memecoin-alerts', router);

const server = app.listen(0);
const ready = new Promise((resolve) => server.once('listening', resolve));
let base;

test.before(async () => {
  await ready;
  base = `http://127.0.0.1:${server.address().port}/api/memecoin-alerts`;
});
test.after(() => server.close());

const get = (p) => fetch(base + p).then(async (r) => ({ status: r.status, body: await r.json() }));
const send = (p, method, body) =>
  fetch(base + p, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    .then(async (r) => ({ status: r.status, body: await r.json() }));

test('prefs default to off, and say so', async () => {
  const { status, body } = await get('/prefs');
  assert.strictEqual(status, 200);
  assert.strictEqual(body.isDefault, true);
  assert.strictEqual(body.prefs.enabled, false);
  assert.strictEqual(body.prefs.minScore, 75);
  assert.strictEqual(body.prefs.movePct5m, 25);
  assert.ok(body.sms && typeof body.sms.available === 'boolean');
});

test('turning alerts on persists and stops reporting as default', async () => {
  const put = await send('/prefs', 'PUT', { enabled: true });
  assert.strictEqual(put.status, 200);
  assert.strictEqual(put.body.prefs.enabled, true);
  const { body } = await get('/prefs');
  assert.strictEqual(body.isDefault, false);
  assert.strictEqual(body.prefs.enabled, true);
});

test('a partial update leaves the other thresholds alone', async () => {
  await send('/prefs', 'PUT', { minScore: 60, movePct5m: 40 });
  await send('/prefs', 'PUT', { cooldownMin: 15 });
  const { body } = await get('/prefs');
  assert.strictEqual(body.prefs.cooldownMin, 15);
  assert.strictEqual(body.prefs.minScore, 60, 'minScore should survive an unrelated update');
  assert.strictEqual(body.prefs.movePct5m, 40);
  assert.strictEqual(body.prefs.enabled, true, 'enabled should survive too');
});

test('out-of-range thresholds are refused with a useful message', async () => {
  for (const [body, field] of [
    [{ minScore: 0 }, 'min_score'],
    [{ minScore: 101 }, 'min_score'],
    [{ movePct5m: -1 }, 'move_pct_5m'],
    [{ cooldownMin: 0 }, 'cooldown_min'],
    [{ cooldownMin: 10_000 }, 'cooldown_min'],
    [{ minConfidence: 2 }, 'min_confidence'],
    [{ minLiquidity: -5 }, 'min_liquidity'],
    [{ movePct5m: 'abc' }, 'move_pct_5m'],
  ]) {
    const res = await send('/prefs', 'PUT', body);
    assert.strictEqual(res.status, 400, `${JSON.stringify(body)} should be rejected`);
    assert.match(res.body.error, new RegExp(field));
  }
  // ... and nothing was written
  const { body } = await get('/prefs');
  assert.strictEqual(body.prefs.minScore, 60);
});

test('SMS cannot be enabled without a verified phone', async () => {
  const res = await send('/prefs', 'PUT', { sms: true });
  assert.strictEqual(res.status, 409);
  assert.match(res.body.error, /Verify a phone/);
  assert.strictEqual((await get('/prefs')).body.prefs.sms, false);
});

test('the feed returns this user events only, newest first, with an unread count', async () => {
  const now = Date.now();
  for (const [i, kind] of ['move', 'signal', 'move'].entries()) {
    q.insertMemeAlertEvent({
      user_id: USER, address: 'A' + i, symbol: 'T' + i, kind, direction: 'up', window: '5m',
      change_pct: 30 + i, score: 80, confidence: 0.7, message: `msg ${i}`, created_ts: now + i * 1000,
    });
  }
  q.insertMemeAlertEvent({
    user_id: 'someone-else', address: 'Z', symbol: 'Z', kind: 'move', direction: 'up', window: '5m',
    change_pct: 99, score: 90, confidence: 0.9, message: 'not yours', created_ts: now + 9999,
  });

  const { body } = await get('/events');
  assert.strictEqual(body.events.length, 3);
  assert.strictEqual(body.unread, 3);
  assert.deepStrictEqual(body.events.map((e) => e.message), ['msg 2', 'msg 1', 'msg 0']);
  assert.ok(!body.events.some((e) => e.message === 'not yours'));
  assert.strictEqual(body.events[0].kind, 'move');
  assert.strictEqual(body.events[1].kind, 'signal');
});

test('marking read clears the unread count without deleting anything', async () => {
  const res = await send('/read', 'POST', { before: Date.now() + 60_000 });
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.marked >= 3);
  const { body } = await get('/events');
  assert.strictEqual(body.unread, 0);
  assert.strictEqual(body.events.length, 3);
  assert.ok(body.events.every((e) => e.read === true));
});

test('one user cannot read or change another user prefs', async () => {
  USER = 'intruder';
  const { body } = await get('/prefs');
  assert.strictEqual(body.isDefault, true, 'a different user starts from defaults');
  assert.strictEqual(body.prefs.enabled, false);
  assert.strictEqual((await get('/events')).body.events.length, 0);
  USER = 'u-route';
  assert.strictEqual((await get('/prefs')).body.prefs.minScore, 60, 'original user untouched');
});
