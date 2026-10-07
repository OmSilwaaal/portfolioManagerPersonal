const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('./_sqlite');

const { initWalletSchema } = require('../src/research/wallets/schema');
const { initSocialSchema } = require('../src/research/social/schema');
const { createMockProvider } = require('../src/research/wallets/providers');
const { runCycle } = require('../src/research/wallets/collector');
const fast = require('../src/research/wallets/fast');
const X = require('../src/radar/extraFeatures');

const quiet = { log() {}, warn() {} };
const NOW = 1_800_000_000;                       // an exact hour boundary + 0 (1_800_000_000 % 3600 === 0)
const TOK = 'TokenMint1111111111111111111111111111111111';

function mkdb() {
  const db = new DatabaseSync(':memory:');
  initWalletSchema(db);
  initSocialSchema(db);
  return db;
}
function snap(db, w, asOf, { score = 0.8, hold = 1 } = {}) {
  db.prepare('INSERT INTO wallet_skill_snapshot (wallet_id, as_of_ts, n_trades, passed_holdout, skill_score, event_ts, ingested_ts) VALUES (?,?,?,?,?,?,?)')
    .run(w, asOf, 20, hold, score, asOf, asOf);
}
function oldTrade(db, w, ts = NOW - 86400) {
  db.prepare('INSERT INTO wallet_trade (wallet_id, token_id, ts, side, amount_token, price_usd, amount_usd, tx, event_ts, ingested_ts) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(w, 'oldtok', ts, 'sell', 1, 1, 1, `old-${w}`, ts, ts);
}
const buy = (ts, usd = 700, token = TOK, tx = `tx${ts}`) => ({ token_id: token, ts, side: 'buy', amount_token: usd / 0.001, price_usd: 0.001, amount_usd: usd, tx });
const counting = (inner) => { let calls = 0; const p = { ...inner, getWalletTrades: async (...a) => { calls++; return inner.getWalletTrades(...a); } }; Object.defineProperty(p, 'calls', { get: () => calls }); return p; };

test('fast cycle: a buy made 2 minutes ago is in the radar features within ONE fast cycle (slow loop has not run)', async () => {
  const db = mkdb();
  snap(db, 'skilled', NOW - 86400);
  oldTrade(db, 'skilled');
  const provider = createMockProvider({ trades: { skilled: [buy(NOW - 120)] } });
  const p = X.createMainDbProvider({ db });
  assert.equal(X.extraFeaturesAt(p, TOK, NOW, ['smartmoney']).sm_buyers_30m, null, 'no smart-money data at all yet');

  const s = await fast.runFastCycle(db, { provider, now: NOW, log: quiet, env: {}, hourlyLimit: 10 });
  assert.equal(s.errors, 0);
  assert.equal(s.polled, 1);
  assert.equal(s.events, 1);
  const f = X.extraFeaturesAt(p, TOK, NOW, ['smartmoney']);
  assert.equal(f.sm_buyers_30m, 1);
  assert.equal(f.sm_net_usd_30m, 700);
  const e = db.prepare('SELECT * FROM smart_money_event').get();
  assert.equal(e.token_id, TOK);                    // any token, keyed by mint address
  assert.equal(e.ts, NOW - 120);
  assert.ok(e.skill_as_of_ts < e.ts, 'skill snapshot predates the buy');
  assert.equal(e.ingested_ts, NOW);
});

test('fast cycle: look-ahead rule. skill snapshot after the buy, failed holdout and weak score never produce events', async () => {
  const db = mkdb();
  snap(db, 'late', NOW - 60);                       // only skilled AFTER the buy at NOW-120
  snap(db, 'nohold', NOW - 86400, { hold: 0 });
  snap(db, 'weak', NOW - 86400, { score: 0.3 });
  const provider = createMockProvider({ trades: { late: [buy(NOW - 120, 100, TOK, 'a')], nohold: [buy(NOW - 120, 100, TOK, 'b')], weak: [buy(NOW - 120, 100, TOK, 'c')] } });
  const s = await fast.runFastCycle(db, { provider, now: NOW, log: quiet, env: {}, hourlyLimit: 10 });
  // only 'late' is currently skilled (latest snapshot), and its snapshot postdates the buy
  assert.equal(s.skilled, 1);
  assert.equal(s.events, 0);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM smart_money_event').get().c, 0);
});

test('fast cycle: same row as the slow loop (idempotent), and the slow loop afterwards adds no duplicate', async () => {
  const db = mkdb();
  snap(db, 'skilled', NOW - 86400);
  oldTrade(db, 'skilled');
  const trades = { skilled: [buy(NOW - 120)] };
  const provider = createMockProvider({ trades });
  await fast.runFastCycle(db, { provider, now: NOW, log: quiet, env: {}, hourlyLimit: 10 });
  await fast.runFastCycle(db, { provider, now: NOW + 5, log: quiet, env: {}, hourlyLimit: 10 });   // same buy again: ignored
  assert.equal(db.prepare('SELECT COUNT(*) c FROM smart_money_event').get().c, 1);
  const slow = await runCycle(db, { providers: [provider], getTrending: async () => [], now: NOW + 900, log: quiet });
  assert.equal(slow.errors, 0);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM smart_money_event').get().c, 1, 'the slow loop sees the same event row');
  assert.equal(db.prepare('SELECT COUNT(*) c FROM wallet_trade WHERE wallet_id = ?').get('skilled').c, 2, 'trade stored once');
});

test('fast cycle: persisted hourly budget blocks over-budget cycles and resets next hour', async () => {
  const db = mkdb();
  for (let i = 0; i < 5; i++) { snap(db, `w${i}`, NOW - 86400); oldTrade(db, `w${i}`); }
  const provider = counting(createMockProvider({ trades: {} }));
  const opts = { provider, log: quiet, env: {}, hourlyLimit: 3, maxWallets: 10 };

  const a = await fast.runFastCycle(db, { ...opts, now: NOW + 10 });
  assert.equal(a.polled, 3);
  assert.equal(a.budgetBlocked, 1);
  assert.equal(provider.calls, 3);
  const b = await fast.runFastCycle(db, { ...opts, now: NOW + 70 });         // same clock hour: nothing left
  assert.equal(b.polled, 0);
  assert.equal(b.budgetBlocked, 1);
  assert.equal(provider.calls, 3, 'no provider request was made over budget');
  // persisted: a brand-new budget object (as after a restart) still sees the usage
  const { createBudget } = require('../src/research/wallets/budget');
  const again = createBudget(db, { provider: 'fast-mock', dailyLimit: 3, nowSec: () => NOW + 80, period: 'hour' });
  assert.equal(again.used(), 3);
  assert.equal(again.tryConsume(1), false);
  const c = await fast.runFastCycle(db, { ...opts, now: NOW + 3600 + 5 });   // next hour
  assert.equal(c.polled, 3);
});

test('fast cycle: zero budget never calls the provider; cap per cycle; fair rotation covers every skilled wallet', async () => {
  const db = mkdb();
  for (let i = 0; i < 5; i++) { snap(db, `w${i}`, NOW - 86400); oldTrade(db, `w${i}`); }
  const provider = counting(createMockProvider({ trades: {} }));
  const zero = await fast.runFastCycle(db, { provider, now: NOW, log: quiet, env: {}, hourlyLimit: 0 });
  assert.equal(zero.polled, 0);
  assert.equal(provider.calls, 0);

  const seen = new Set();
  const spy = { ...provider, getWalletTrades: async (w) => { seen.add(w); return []; } };
  for (let cycle = 0; cycle < 3; cycle++) {
    const s = await fast.runFastCycle(db, { provider: spy, now: NOW + cycle * 60, log: quiet, env: {}, hourlyLimit: 100, maxWallets: 2 });
    assert.equal(s.polled, 2, 'cap per cycle');
  }
  assert.equal(seen.size, 5, 'every skilled wallet was polled within ceil(5/2) cycles');
});

test('fast cycle never throws: failing provider, no provider, broken db', async () => {
  const db = mkdb();
  snap(db, 'w', NOW - 86400); oldTrade(db, 'w');
  const boom = { name: 'boom', enabled: true, async getWalletTrades() { throw new Error('rate limited'); } };
  const s = await fast.runFastCycle(db, { provider: boom, now: NOW, log: quiet, env: {}, hourlyLimit: 5 });
  assert.equal(s.errors, 1);
  assert.equal(s.events, 0);
  const none = await fast.runFastCycle(db, { providers: [{ name: 'helius', enabled: false }], now: NOW, log: quiet, env: {} });
  assert.match(none.reason, /no wallet-trade provider/);
  const broken = await fast.runFastCycle(new DatabaseSync(':memory:'), { provider: boom, now: NOW, log: quiet, env: {} });
  assert.ok(broken.errors >= 1);
});

test('birdeye provider keeps a reserve of the shared daily budget for the slow loop', async () => {
  const db = mkdb();
  snap(db, 'w', NOW - 86400); oldTrade(db, 'w');
  const provider = counting({ name: 'birdeye', enabled: true, async getWalletTrades() { return []; } });
  const low = await fast.runFastCycle(db, { provider, now: NOW, log: quiet, env: {}, hourlyLimit: 5, birdeyeBudget: { remaining: () => 10 }, birdeyeReserve: 60 });
  assert.equal(low.polled, 0);
  assert.equal(provider.calls, 0);
  const ok = await fast.runFastCycle(db, { provider, now: NOW, log: quiet, env: {}, hourlyLimit: 5, birdeyeBudget: { remaining: () => 100 }, birdeyeReserve: 60 });
  assert.equal(ok.polled, 1);
});

test('interval parsing: default 60s, minimum 30s, 0/off disables; provider preference helius then birdeye', () => {
  assert.equal(fast.parseIntervalMs({}), 60000);
  assert.equal(fast.parseIntervalMs({ SMART_MONEY_FAST_MS: '5000' }), 30000);
  assert.equal(fast.parseIntervalMs({ SMART_MONEY_FAST_MS: '45000' }), 45000);
  assert.equal(fast.parseIntervalMs({ SMART_MONEY_FAST_MS: '0' }), 0);
  assert.equal(fast.parseIntervalMs({ SMART_MONEY_FAST_MS: 'off' }), 0);
  assert.equal(fast.parseIntervalMs({ SMART_MONEY_FAST_MS: 'junk' }), 60000);
  const b = { name: 'birdeye', enabled: true, getWalletTrades() {} }, h = { name: 'helius', enabled: true, getWalletTrades() {} };
  assert.equal(fast.pickProvider([b, h]).name, 'helius');
  assert.equal(fast.pickProvider([b, { name: 'helius', enabled: false }]).name, 'birdeye');
  assert.equal(fast.pickProvider([{ name: 'x', enabled: false }]), null);
});

test('start(): disabled when SMART_MONEY_FAST_MS=0 or no provider; otherwise starts and stops cleanly', () => {
  const db = mkdb();
  const h = { name: 'helius', enabled: true, getWalletTrades: async () => [] };
  assert.equal(fast.start(db, { env: { SMART_MONEY_FAST_MS: '0' }, log: quiet, providers: [h] }).started, false);
  assert.equal(fast.start(db, { env: {}, log: quiet, providers: [] }).started, false);
  const r = fast.start(db, { env: {}, log: quiet, providers: [h], initialDelayMs: 3_600_000 });
  assert.equal(r.started, true);
  assert.equal(r.intervalMs, 60000);
  fast.stop();
});
