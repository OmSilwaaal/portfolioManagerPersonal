// End-to-end over the real tables: list -> score -> rules -> stored events,
// with the cooldown and the per-cycle cap enforced.
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
require('./_sqlite').installBetterSqlite3Adapter();

process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'memealerts-')), 'test.sqlite');

const q = require('../src/db/queries');
const data = require('../src/services/memecoinData');
const { runOnce } = require('../src/services/memecoinAlertPoller');

const NOW = 1_700_000_000_000;
const token = (over) => ({
  address: 'A' + (over.symbol || 'X'), symbol: 'X', liquidity_usd: 100_000,
  change_5m: 0, change_1h: 0, volume_5m: 100, volume_1h: 1200,
  buys_5m: 10, sells_5m: 10, ...over,
});

let TRENDING = [];
data.getTrending = async () => TRENDING;
data.getNew = async () => [];

const enable = (userId, over = {}) =>
  q.upsertMemeAlertPrefs(userId, {
    enabled: 1, sms: 0, move_pct_5m: 25, move_pct_1h: 100,
    min_score: 75, min_confidence: 0.3, min_liquidity: 20_000, cooldown_min: 60, ...over,
  });

test('no enabled users means no work and no events', async () => {
  TRENDING = [token({ symbol: 'QUIET', change_5m: 90 })];
  assert.deepStrictEqual(await runOnce(NOW), { users: 0, alerts: 0 });
});

test('a major move is recorded for an opted-in user only', async () => {
  enable('alice');
  TRENDING = [token({ symbol: 'PUMP', change_5m: 60 }), token({ symbol: 'FLAT', change_5m: 1 })];
  const r = await runOnce(NOW);
  assert.strictEqual(r.users, 1);
  assert.ok(r.alerts >= 1);

  const events = q.listMemeAlertEvents('alice');
  const move = events.find((e) => e.kind === 'move');
  assert.ok(move, 'expected a move alert');
  assert.strictEqual(move.symbol, 'PUMP');
  assert.strictEqual(move.direction, 'up');
  assert.ok(move.change_pct >= 60);
  assert.strictEqual(events.filter((e) => e.symbol === 'FLAT').length, 0);
  assert.strictEqual(q.listMemeAlertEvents('bob').length, 0);
});

test('the cooldown suppresses a repeat and then releases it', async () => {
  const before = q.listMemeAlertEvents('alice').length;
  await runOnce(NOW + 60_000);                       // 1 min later, same move
  assert.strictEqual(q.listMemeAlertEvents('alice').length, before, 'repeat should be suppressed');

  await runOnce(NOW + 61 * 60_000);                  // past the 60 min cooldown
  assert.ok(q.listMemeAlertEvents('alice').length > before, 'should fire again after the cooldown');
});

test('a down move alerts too', async () => {
  enable('carol');
  TRENDING = [token({ symbol: 'DUMP', change_5m: -55 })];
  await runOnce(NOW);
  const e = q.listMemeAlertEvents('carol').find((x) => x.symbol === 'DUMP');
  assert.ok(e);
  assert.strictEqual(e.direction, 'down');
  assert.ok(e.change_pct <= -55);
});

test('per-user thresholds are independent', async () => {
  enable('strict', { move_pct_5m: 200 });
  enable('loose', { move_pct_5m: 10 });
  TRENDING = [token({ symbol: 'MID', change_5m: 40 })];
  await runOnce(NOW + 5 * 60 * 60_000);
  assert.strictEqual(q.listMemeAlertEvents('strict').filter((e) => e.symbol === 'MID').length, 0);
  assert.strictEqual(q.listMemeAlertEvents('loose').filter((e) => e.symbol === 'MID').length, 1);
});

test('one sweep cannot flood a user', async () => {
  enable('flood', { move_pct_5m: 5, cooldown_min: 1 });
  TRENDING = Array.from({ length: 40 }, (_, i) => token({ symbol: 'F' + i, change_5m: 50 }));
  const t = NOW + 10 * 60 * 60_000;
  await runOnce(t);
  const n = q.listMemeAlertEvents('flood', 200).filter((e) => e.created_ts === t).length;
  assert.ok(n > 0 && n <= 8, `expected 1..8 alerts in one cycle, got ${n}`);
});

test('a scoring failure on one token does not stop the sweep', async () => {
  enable('resilient', { cooldown_min: 1 });
  TRENDING = [
    { address: 'BROKEN', symbol: 'BROKEN', get liquidity_usd() { throw new Error('boom'); } },
    token({ symbol: 'OK', change_5m: 70 }),
  ];
  const t = NOW + 20 * 60 * 60_000;
  await assert.doesNotReject(runOnce(t));
  assert.ok(q.listMemeAlertEvents('resilient', 200).some((e) => e.symbol === 'OK'));
});

test('a list fetch failure degrades to no alerts rather than throwing', async () => {
  data.getTrending = async () => { throw new Error('upstream down'); };
  data.getNew = async () => { throw new Error('upstream down'); };
  const r = await runOnce(NOW + 30 * 60 * 60_000);
  assert.strictEqual(r.alerts, 0);
});
