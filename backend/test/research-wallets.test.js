const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite'); // local Node 24; prod uses better-sqlite3 with the same API subset

const { initWalletSchema, getSkillAsOf } = require('../src/research/wallets/schema');
const { computeSkill, pairTrades } = require('../src/research/wallets/skill');
const { createMockProvider, getProviders, createQueue } = require('../src/research/wallets/providers');
const { runCycle, start, stop } = require('../src/research/wallets/collector');

const quiet = { log: { log() {}, warn() {} } };
const BASE = 1_700_000_000;

// round trips: [pnlMultiple,...] each held 100s, spaced 1000s apart
function trips(mults, { base = BASE, step = 1000, tokenPrefix = 'T' } = {}) {
  const out = [];
  mults.forEach((m, i) => {
    const t0 = base + i * step;
    out.push({ token_id: tokenPrefix + i, ts: t0, side: 'buy', amount_token: 100, price_usd: 1, amount_usd: 100, tx: `b${tokenPrefix}${i}` });
    out.push({ token_id: tokenPrefix + i, ts: t0 + 100, side: 'sell', amount_token: 100, price_usd: m, amount_usd: 100 * m, tx: `s${tokenPrefix}${i}` });
  });
  return out;
}

const SKILLED = [1.3, 1.2, 0.9, 1.25, 1.3, 1.2, 0.95, 1.3, 1.25, 1.2, 1.3, 1.2]; // steady edge
const END = BASE + 100_000;

test('pairTrades: FIFO pairing and look-ahead cutoff', () => {
  const t = trips([1.5, 0.5]);
  assert.equal(pairTrades(t, END).length, 2);
  // as_of just after first buy but before its sell: no closed trips
  assert.equal(pairTrades(t, BASE + 50).length, 0);
  // sell at exactly asOf is excluded (strictly before)
  assert.equal(pairTrades(t, BASE + 100).length, 0);
  assert.equal(pairTrades(t, BASE + 101).length, 1);
});

test('skilled wallet is labeled smart and passes holdout', () => {
  const s = computeSkill(trips(SKILLED), END);
  assert.equal(s.n_trades, 12);
  assert.equal(s.passed_holdout, 1);
  assert.ok(s.skill_score > 0.4, `score ${s.skill_score}`);
  assert.ok(s.win_rate > 0.8);
  assert.ok(s.consistency_score >= 0.66);
  assert.ok(s.top_trade_share < 0.5);
});

test('too few trades -> not smart', () => {
  const s = computeSkill(trips(SKILLED.slice(0, 4)), END);
  assert.equal(s.passed_holdout, 0);
  assert.equal(s.skill_score, 0);
});

test('one lucky trade dominating profit is penalised (top_trade_share > 0.5)', () => {
  const s = computeSkill(trips([10, 0.9, 0.95, 1.02, 0.9, 1.01, 0.9, 1.02, 0.95, 1.01, 0.9, 1.02]), END);
  assert.ok(s.top_trade_share > 0.5, `share ${s.top_trade_share}`);
  assert.equal(s.skill_score, 0);
  assert.equal(s.is_smart, false);
});

test('fails holdout when edge does not persist into later window', () => {
  const s = computeSkill(trips([1.3, 1.2, 1.25, 1.3, 1.2, 1.3, 0.7, 0.8, 0.75, 0.8, 0.7, 0.85]), END);
  assert.equal(s.passed_holdout, 0);
  assert.equal(s.skill_score, 0);
  assert.equal(s.is_smart, false);
});

test('consistency needs >=3 time buckets', () => {
  // all closes bunched -> single bucket
  const t = [];
  for (let i = 0; i < 10; i++) {
    t.push({ token_id: 'X' + i, ts: BASE, side: 'buy', amount_token: 1, price_usd: 1, amount_usd: 1, tx: 'b' + i });
    t.push({ token_id: 'X' + i, ts: BASE + 1, side: 'sell', amount_token: 1, price_usd: 1.5, amount_usd: 1.5, tx: 's' + i });
  }
  const s = computeSkill(t, END);
  assert.equal(s.consistency_score, 0);
  assert.equal(s.is_smart, false);
});

test('computeSkill ignores future trades (point-in-time)', () => {
  const all = trips(SKILLED);
  const cut = BASE + 5 * 1000 + 101; // 6 trips closed
  const early = computeSkill(all, cut);
  const onlyEarly = computeSkill(all.filter((t) => t.ts < cut), cut);
  assert.deepEqual(early, onlyEarly);
  assert.equal(early.n_trades, 6);
});

function freshDb() {
  const db = new DatabaseSync(':memory:');
  initWalletSchema(db);
  return db;
}

function addSnap(db, w, asOf, score = 0.7, holdout = 1) {
  db.prepare('INSERT INTO wallet_skill_snapshot (wallet_id, as_of_ts, n_trades, win_rate, sortino_like, consistency_score, realized_pnl_usd, top_trade_share, passed_holdout, skill_score, event_ts, ingested_ts) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(w, asOf, 10, 0.7, 2, 0.8, 100, 0.3, holdout, score, asOf, asOf);
}

test('getSkillAsOf never returns a future (or same-ts) snapshot', () => {
  const db = freshDb();
  addSnap(db, 'w1', 100, 0.3);
  addSnap(db, 'w1', 200, 0.5);
  addSnap(db, 'w1', 300, 0.9);
  addSnap(db, 'w2', 150, 0.9);
  assert.equal(getSkillAsOf(db, 'w1', 100), null);        // strictly before
  assert.equal(getSkillAsOf(db, 'w1', 101).as_of_ts, 100);
  assert.equal(getSkillAsOf(db, 'w1', 250).as_of_ts, 200);
  assert.equal(getSkillAsOf(db, 'w1', 10_000).as_of_ts, 300);
  assert.equal(getSkillAsOf(db, 'nobody', 10_000), null);
  for (let ts = 0; ts < 400; ts += 7) {
    const r = getSkillAsOf(db, 'w1', ts);
    if (r) assert.ok(r.as_of_ts < ts);
  }
});

test('tables are append-only', () => {
  const db = freshDb();
  addSnap(db, 'w1', 100);
  assert.throws(() => db.prepare("UPDATE wallet_skill_snapshot SET skill_score = 1 WHERE wallet_id = 'w1'").run(), /append-only/);
  assert.throws(() => db.prepare('DELETE FROM wallet_skill_snapshot').run(), /append-only/);
  db.prepare('INSERT INTO wallet (wallet_id, chain, first_seen_ts, event_ts, ingested_ts) VALUES (?,?,?,?,?)').run('w', 'solana', 1, 1, 1);
  assert.throws(() => db.prepare('DELETE FROM wallet').run(), /append-only/);
  initWalletSchema(db); // idempotent
});

test('providers return enabled:false cleanly without keys', () => {
  const ps = getProviders({});
  assert.ok(ps.length >= 2);
  for (const p of ps) {
    assert.equal(p.enabled, false);
    assert.ok(p.reason);
  }
  assert.equal(getProviders({ HELIUS_API_KEY: 'x' }).find((p) => p.name === 'helius').enabled, true);
});

test('queue retries 429 with backoff then succeeds', async () => {
  const sleeps = [];
  const q = createQueue({ minIntervalMs: 0, baseBackoffMs: 10, sleep: async (ms) => { sleeps.push(ms); } });
  let n = 0;
  const v = await q.run(async () => { if (++n < 3) { const e = new Error('rl'); e.status = 429; throw e; } return 'ok'; });
  assert.equal(v, 'ok');
  assert.equal(n, 3);
  assert.deepEqual(sleeps.filter((s) => s >= 10), [10, 20]);
});

test('start() is a no-op without the env flag or keys, and never throws', () => {
  assert.equal(start(freshDb(), { env: {}, ...quiet }).started, false);
  assert.equal(start(freshDb(), { env: { SMART_MONEY_COLLECTOR: '1' }, ...quiet }).started, false);
  assert.equal(start(null, { env: { SMART_MONEY_COLLECTOR: '1', HELIUS_API_KEY: 'k' }, ...quiet }).started, false); // bad db -> caught
  stop();
});

test('collector: writes snapshots and look-ahead-safe smart_money_event', async () => {
  const db = freshDb();
  const NOW1 = END;
  const NOW2 = END + 10_000;
  const buyTs = END + 5_000; // after cycle 1's snapshot
  const hist = trips(SKILLED);
  const provider = createMockProvider({
    candidates: { MEME: ['smart', 'dud'] },
    trades: {
      smart: [...hist, { token_id: 'MEME', ts: buyTs, side: 'buy', amount_token: 500, price_usd: 0.01, amount_usd: 5, tx: 'live1' }],
      dud: [...trips([0.7, 0.8, 0.9, 0.8, 0.7, 0.9, 0.8, 0.7, 0.9, 0.8], { tokenPrefix: 'D' }),
        { token_id: 'MEME', ts: buyTs, side: 'buy', amount_token: 500, price_usd: 0.01, amount_usd: 5, tx: 'live2' }],
    },
  });
  const common = { providers: [provider], getTrending: async () => [{ address: 'MEME' }], ...quiet };

  const s1 = await runCycle(db, { ...common, now: NOW1 });
  assert.equal(s1.wallets, 2);
  assert.equal(s1.snapshots, 2);
  assert.equal(s1.events, 0); // future buy not yet ingested

  const s2 = await runCycle(db, { ...common, now: NOW2 });
  assert.equal(s2.events, 1);
  const ev = db.prepare('SELECT * FROM smart_money_event').all();
  assert.equal(ev.length, 1);
  assert.equal(ev[0].wallet_id, 'smart');
  assert.equal(ev[0].token_id, 'MEME');
  assert.equal(ev[0].skill_as_of_ts, NOW1);
  assert.ok(ev[0].skill_as_of_ts < ev[0].ts);

  // idempotent: re-running adds no duplicate events/trades
  await runCycle(db, { ...common, now: NOW2 + 1 });
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM smart_money_event').get().c, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM wallet_trade WHERE tx = 'live1'").get().c, 1);
});

test('collector survives provider and trending failures', async () => {
  const db = freshDb();
  const bad = { name: 'bad', enabled: true, async discoverCandidateWallets() { throw new Error('boom'); }, async getWalletTrades() { throw new Error('boom'); } };
  const s = await runCycle(db, { providers: [bad], getTrending: async () => { throw new Error('down'); }, now: END, ...quiet });
  assert.ok(s.errors >= 1);
});
