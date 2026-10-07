'use strict';
// On-chain top-earner wallet discovery: sources are pluggable, leaderboard-reported PnL is never trusted, every
// candidate is re-scored from on-chain trades with the holdout rule, forward test vs random control.
// node:sqlite stands in for better-sqlite3 (same API subset). No network: all providers are mocks.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const W = path.join(__dirname, '..', 'src', 'research', 'wallets');
const { initWalletSchema } = require(path.join(W, 'schema.js'));
const { computeSkill } = require(path.join(W, 'skill.js'));
const { createMockProvider, createBirdeyeProvider, createQueue } = require(path.join(W, 'providers.js'));
const { runCycle } = require(path.join(W, 'collector.js'));
const { createBudget, parseDailyBudget } = require(path.join(W, 'budget.js'));
const S = require(path.join(W, 'discoverySources.js'));
const { runDiscovery, buildDiscoveryReport } = require(path.join(W, 'discovery.js'));
const C = require(path.join(W, 'candidates.js'));

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58(buf) {
  let n = BigInt('0x' + buf.toString('hex')); let s = '';
  while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  for (const b of buf) { if (b === 0) s = '1' + s; else break; }
  return s;
}
const addr = (i) => b58(Buffer.concat([Buffer.from([1 + (i % 200)]), crypto.createHash('sha256').update(`w${i}`).digest().subarray(0, 31)]));
const quiet = { log: { log() {}, warn() {} } };
const fastQueue = () => createQueue({ minIntervalMs: 0, sleep: async () => {} });
const jsonResp = (body, status = 200) => ({ ok: status < 300, status, headers: { get: () => null }, json: async () => body });

const BASE = 1_700_000_000;
function trips(mults, { base = BASE, step = 1000, prefix = 'T' } = {}) {
  const out = [];
  mults.forEach((m, i) => {
    const t0 = base + i * step;
    out.push({ token_id: prefix + i, ts: t0, side: 'buy', amount_token: 100, price_usd: 1, amount_usd: 100, tx: `b${prefix}${i}` });
    out.push({ token_id: prefix + i, ts: t0 + 100, side: 'sell', amount_token: 100, price_usd: m, amount_usd: 100 * m, tx: `s${prefix}${i}` });
  });
  return out;
}
const SKILLED = [1.3, 1.2, 0.9, 1.25, 1.3, 1.2, 0.95, 1.3, 1.25, 1.2, 1.3, 1.2];
const BAD = [0.5, 0.6, 0.7, 0.5, 0.9, 0.8, 0.6, 0.7, 0.5, 0.9];
const LUCKY = [50, 0.97, 0.98, 0.96, 0.97, 0.98, 0.96, 0.97, 0.98, 0.96, 0.97, 0.98];   // one 50x, rest slow bleed
const END = BASE + 100_000;

const freshDb = () => { const db = new DatabaseSync(':memory:'); initWalletSchema(db); return db; };

function seedsFile(wallets) {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'seeds-')), 'wallet_seeds.json');
  fs.writeFileSync(f, JSON.stringify({ wallets }));
  return f;
}

// ── sources are disabled when unconfigured ─────────────────────────────────────────────────────────────────────────
test('every discovery source returns {enabled:false, reason} when unconfigured', () => {
  const srcs = S.getDiscoverySources({});
  assert.equal(srcs.length, 5);
  for (const s of srcs) { assert.equal(s.enabled, false, s.name); assert.ok(s.reason, s.name); assert.equal(s.discover, undefined); }
  // flag on but key missing
  const env = { SMART_MONEY_BIRDEYE_LB: '1', SMART_MONEY_FOMOAPI: '1', SMART_MONEY_SOLANATRACKER: '1', SMART_MONEY_WINNER_BACKBUY: '1', SMART_MONEY_SEEDS: '1' };
  const by = Object.fromEntries(S.getDiscoverySources(env, { seedsPath: seedsFile([]) }).map((s) => [s.name, s]));
  assert.match(by.birdeye_leaderboard.reason, /BIRDEYE_API_KEY/);
  assert.match(by.fomoapi.reason, /FOMOAPI_KEY/);
  assert.match(by.solanatracker.reason, /SOLANATRACKER_API_KEY/);
  assert.match(by.winner_backbuyers.reason, /radar is off/);
  assert.match(by.seeds.reason, /no valid wallets/);
  // key present but flag off -> still disabled
  assert.equal(S.getDiscoverySources({ BIRDEYE_API_KEY: 'k', FOMOAPI_KEY: 'k', SOLANATRACKER_API_KEY: 'k' }).every((s) => !s.enabled), true);
  // flag + key -> enabled
  assert.equal(S.createLeaderboardAdapter('fomoapi', { SMART_MONEY_FOMOAPI: '1', FOMOAPI_KEY: 'k' }).enabled, true);
  // non-https base URL rejected
  assert.equal(S.createLeaderboardAdapter('fomoapi', { SMART_MONEY_FOMOAPI: '1', FOMOAPI_KEY: 'k', FOMOAPI_BASE_URL: 'http://x.example' }).enabled, false);
});

// ── Birdeye daily budget ────────────────────────────────────────────────────────────────────────────────────────────
test('Birdeye daily budget persists across restarts and blocks over budget', () => {
  const db = freshDb();
  let t = 1_800_000_000;
  const mk = () => createBudget(db, { provider: 'birdeye', dailyLimit: 3, nowSec: () => t });
  const b1 = mk();
  assert.equal(b1.tryConsume(), true); assert.equal(b1.tryConsume(), true);
  const b2 = mk();                                  // "restart": a new object on the same database
  assert.equal(b2.used(), 2);
  assert.equal(b2.tryConsume(), true);
  assert.equal(b2.tryConsume(), false);             // over budget
  assert.equal(mk().remaining(), 0);
  assert.equal(b2.tryConsume(2), false);
  t += 86400;                                        // next UTC day
  assert.equal(mk().tryConsume(), true);
  assert.equal(parseDailyBudget({}), 150);
  assert.equal(parseDailyBudget({ BIRDEYE_DAILY_BUDGET: '40' }), 40);
  assert.equal(parseDailyBudget({ BIRDEYE_DAILY_BUDGET: 'junk' }), 150);
});

test('Birdeye leaderboard and the Birdeye provider both stop at the shared budget (no HTTP once exhausted)', async () => {
  const db = freshDb();
  const budget = createBudget(db, { provider: 'birdeye', dailyLimit: 2 });
  let calls = 0; const urls = [];
  const fetchImpl = async (url) => { calls++; urls.push(url); return jsonResp({ data: { items: Array.from({ length: 10 }, (_, i) => ({ address: addr(i), pnl: 1000 + i })) } }); };
  const src = S.createBirdeyeLeaderboardSource({ SMART_MONEY_BIRDEYE_LB: '1', BIRDEYE_API_KEY: 'k', BIRDEYE_LB_PERIODS: '1W,1M', BIRDEYE_LB_PAGES: '3' },
    { budget, fetchImpl, queue: fastQueue() });
  assert.equal(src.enabled, true);
  const r = await src.discover({ tokens: [addr(99)] });
  assert.equal(calls, 2);
  assert.equal(r.budgetBlocked, true);
  assert.equal(r.candidates.length, 20);
  assert.ok(urls[0].includes('/trader/gainers-losers?type=1W') && urls[0].includes('sort_by=PnL'));
  // provider sharing the same budget is blocked too
  const prov = createBirdeyeProvider({ BIRDEYE_API_KEY: 'k' }, { budget, fetchImpl, queue: fastQueue() });
  await assert.rejects(() => prov.getWalletTrades(addr(1)), (e) => e.budgetExceeded === true);
  assert.equal(calls, 2);
  assert.equal(budget.used(), 2);
});

// ── reported PnL is never trusted ───────────────────────────────────────────────────────────────────────────────────
test('untrusted reported PnL is recorded but ignored: wallets are re-scored from on-chain trades', async () => {
  const db = freshDb();
  const [liar, liar2, honest] = [addr(1), addr(2), addr(3)];
  const buyTs = END + 5_000;
  const live = (tx) => ({ token_id: 'MEME', ts: buyTs, side: 'buy', amount_token: 500, price_usd: 0.01, amount_usd: 5, tx });
  const provider = createMockProvider({
    trades: {
      [liar]: [...trips(BAD, { prefix: 'L' }), live('l1')],
      [liar2]: [...trips(BAD, { prefix: 'L' }), live('l2')],       // identical bad history, but NO reported pnl
      [honest]: [...trips(SKILLED, { prefix: 'H' }), live('h1')],  // skilled, but the source claims it LOST money
    },
  });
  const seeds = seedsFile([{ wallet: liar, reported_pnl: 1e9, period: '30d' }, { wallet: liar2 }, { wallet: honest, reported_pnl: -5000, period: '30d' }]);
  const src = S.createSeedsSource({ SMART_MONEY_SEEDS: '1' }, { seedsPath: seeds });
  const common = { providers: [provider], discoverySources: [src], getTrending: async () => [{ address: 'MEME' }], env: {}, ...quiet };
  const s1 = await runCycle(db, { ...common, now: END });
  assert.equal(s1.discovery.sources.seeds.recorded, 3);
  const row = db.prepare('SELECT * FROM wallet_candidate WHERE wallet_id = ?').get(liar);
  assert.equal(row.reported_pnl, 1e9);
  assert.equal(row.leaderboard_survivor, 1);
  assert.equal(row.role, 'candidate');
  await runCycle(db, { ...common, now: END + 10_000 });

  const snap = (w) => db.prepare('SELECT * FROM wallet_skill_snapshot WHERE wallet_id = ? ORDER BY as_of_ts LIMIT 1').get(w);
  assert.equal(snap(liar).passed_holdout, 0);
  assert.equal(snap(liar).skill_score, 0);
  const strip = (r) => ({ ...r, wallet_id: 'x' });
  assert.deepEqual(strip(snap(liar)), strip(snap(liar2)), 'reported pnl changes nothing about the on-chain score');
  assert.equal(snap(honest).passed_holdout, 1, 'a claimed loss does not stop a genuinely skilled wallet');
  const ev = db.prepare('SELECT * FROM smart_money_event').all();
  assert.deepEqual(ev.map((e) => e.wallet_id), [honest], 'only the wallet that passed the holdout produces a smart_money_event');
});

test('a lucky-one-trade leaderboard wallet fails the holdout and never produces an event', async () => {
  const db = freshDb();
  const lucky = addr(7);
  const buyTs = END + 5_000;
  const fetchImpl = async () => jsonResp({ data: { items: [{ address: lucky, pnl: 2_500_000 }] } });
  const src = S.createBirdeyeLeaderboardSource({ SMART_MONEY_BIRDEYE_LB: '1', BIRDEYE_API_KEY: 'k' }, { budget: createBudget(db, { dailyLimit: 10 }), fetchImpl, queue: fastQueue() });
  const provider = createMockProvider({ trades: { [lucky]: [...trips(LUCKY, { prefix: 'K' }), { token_id: 'MEME', ts: buyTs, side: 'buy', amount_token: 1, price_usd: 1, amount_usd: 1, tx: 'k1' }] } });
  const common = { providers: [provider], discoverySources: [src], getTrending: async () => [{ address: 'MEME' }], env: {}, ...quiet };
  await runCycle(db, { ...common, now: END });
  await runCycle(db, { ...common, now: END + 10_000 });
  const c = db.prepare('SELECT * FROM wallet_candidate').get();
  assert.equal(c.source, 'birdeye_gainers');
  assert.equal(c.reported_pnl, 2_500_000);
  const sk = db.prepare('SELECT * FROM wallet_skill_snapshot WHERE wallet_id = ? ORDER BY as_of_ts DESC LIMIT 1').get(lucky);
  assert.ok(sk.realized_pnl_usd > 0, 'the one lucky trade does make it profitable on paper');
  assert.ok(sk.top_trade_share > 0.5);
  assert.equal(sk.passed_holdout, 0);
  assert.equal(sk.skill_score, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM smart_money_event').get().n, 0);
});

test('leakage: trades at/after as_of are never used for scoring or for the pre-discovery window', async () => {
  // direct
  const hist = trips(BAD, { prefix: 'P' });
  const future = trips(SKILLED, { prefix: 'F', base: END + 10 });
  assert.deepEqual(computeSkill([...hist, ...future], END), computeSkill(hist, END));
  // through the collector: great trades dated just AFTER `now` (still inside the 60s ingest tolerance) are stored but not scored
  const db = freshDb();
  const w = addr(11);
  const fut = trips(SKILLED, { prefix: 'F', base: END + 5, step: 4 });
  const src = S.createSeedsSource({ SMART_MONEY_SEEDS: '1' }, { seedsPath: seedsFile([w]) });
  await runCycle(db, { providers: [createMockProvider({ trades: { [w]: [...hist, ...fut] } })], discoverySources: [src], getTrending: async () => [], env: {}, now: END, ...quiet });
  const s = db.prepare('SELECT * FROM wallet_skill_snapshot WHERE wallet_id = ?').get(w);
  assert.equal(s.n_trades, BAD.length);
  assert.equal(s.passed_holdout, 0);
  // forward evaluation: pre window = strictly before discovered_ts, post = closes in [discovered, discovered+7d)
  const e = freshDb();
  const disc = END;
  C.recordCandidates(e, [{ wallet: w, source: 'seed', survivor: true }], { now: disc });
  const ins = e.prepare('INSERT INTO wallet_trade (wallet_id, token_id, ts, side, amount_token, price_usd, amount_usd, tx, event_ts, ingested_ts) VALUES (?,?,?,?,?,?,?,?,?,?)');
  for (const t of [...hist, ...trips(SKILLED, { prefix: 'F', base: disc + 1000 })]) ins.run(w, t.token_id, t.ts, t.side, t.amount_token, t.price_usd, t.amount_usd, t.tx, t.ts, t.ts);
  const later = disc + 7 * 86400 + 5;
  e.prepare('INSERT INTO wallet_skill_snapshot (wallet_id, as_of_ts, n_trades, passed_holdout, skill_score, event_ts, ingested_ts) VALUES (?,?,?,?,?,?,?)').run(w, later, 0, 0, 0, later, later);
  assert.equal(C.evaluateForward(e, { now: later }), 1);
  const ev = e.prepare('SELECT * FROM wallet_candidate_eval').get();
  assert.equal(ev.pre_n, BAD.length, 'pre window holds only the BAD trades made before discovery');
  assert.ok(ev.pre_pnl_usd < 0);
  assert.equal(ev.post_n, SKILLED.length, 'post window holds only the later trades');
  assert.ok(ev.post_pnl_usd > 0);
  assert.equal(C.evaluateForward(e, { now: later }), 0, 'evaluated once');
});

// ── append-only + recording ─────────────────────────────────────────────────────────────────────────────────────────
test('wallet_candidate and wallet_candidate_eval are append-only; re-discovery keeps the first discovered_ts; bad addresses dropped', () => {
  const db = freshDb();
  const w = addr(5);
  const r1 = C.recordCandidates(db, [{ wallet: w, source: 'fomoapi', reported_pnl: 10, reported_period: '7d', survivor: true }, { wallet: 'not-a-wallet', source: 'fomoapi' }, { wallet: "x'; DROP TABLE wallet;--", source: 'x' }], { now: 1000 });
  assert.equal(r1.inserted, 1); assert.equal(r1.invalid, 2);
  C.recordCandidates(db, [{ wallet: w, source: 'fomoapi', reported_pnl: 99999, reported_period: '7d', survivor: true }], { now: 5000 });
  const rows = db.prepare('SELECT * FROM wallet_candidate').all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].discovered_ts, 1000);
  assert.equal(rows[0].reported_pnl, 10);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM wallet WHERE wallet_id = ?').get(w).n, 1);
  assert.throws(() => db.prepare('UPDATE wallet_candidate SET reported_pnl = 1').run(), /append-only/);
  assert.throws(() => db.prepare('DELETE FROM wallet_candidate').run(), /append-only/);
  // a control never duplicates a wallet that is already a candidate
  C.recordCandidates(db, [{ wallet: w, source: 'control_trending' }], { now: 2000, role: 'control' });
  assert.equal(db.prepare("SELECT COUNT(*) n FROM wallet_candidate WHERE role = 'control'").get().n, 0);
});

// ── orchestrator ────────────────────────────────────────────────────────────────────────────────────────────────────
test('runDiscovery: min interval is persisted, a failing source never throws, controls are sampled and deduped', async () => {
  const db = freshDb();
  let runs = 0;
  const good = { name: 'good', enabled: true, survivor: true, minIntervalMs: 3600_000, async discover() { runs++; return { candidates: [{ wallet: addr(1), reported_pnl: 5 }, { wallet: 'junk' }], controlPool: [{ wallet: addr(20), source: 'control_late_buyers' }, { wallet: addr(21), source: 'control_late_buyers' }] }; } };
  const bad = { name: 'bad', enabled: true, minIntervalMs: 0, async discover() { throw new Error('upstream down'); } };
  const off = { name: 'off', enabled: false, reason: 'no key' };
  const ctx = { sources: [good, bad, off], now: 10_000, trendingTraders: [addr(1), addr(30)], env: {}, log: { warn() {} }, controlsPerCycle: 5 };
  const r = await runDiscovery(db, ctx);
  assert.equal(r.sources.good.recorded, 1);
  assert.equal(r.sources.bad.error, 'upstream down');
  assert.deepEqual(r.sources.off, { enabled: false, reason: 'no key' });
  const ctrl = db.prepare("SELECT wallet_id, source FROM wallet_candidate WHERE role = 'control' ORDER BY wallet_id").all();
  assert.ok(ctrl.some((c) => c.source === 'control_late_buyers'));
  assert.ok(ctrl.some((c) => c.wallet_id === addr(30) && c.source === 'control_trending'));
  assert.ok(!ctrl.some((c) => c.wallet_id === addr(1)), 'a wallet that is a candidate is not also a control');
  const r2 = await runDiscovery(db, { ...ctx, now: 10_060 });   // 60s later: inside the 1h interval
  assert.equal(runs, 1);
  assert.equal(r2.sources.good.skipped, 'min interval');
  const r3 = await runDiscovery(db, { ...ctx, now: 10_000 + 3601 });
  assert.equal(runs, 2);
  assert.equal(r3.sources.good.recorded, 0);
  // no enabled source -> nothing, in particular no controls
  const db2 = freshDb();
  const r4 = await runDiscovery(db2, { sources: [off], now: 1, trendingTraders: [addr(30)], env: {} });
  assert.equal(r4.controls, 0);
  assert.equal(db2.prepare('SELECT COUNT(*) n FROM wallet_candidate').get().n, 0);
});

// ── third-party adapters (single config object, field mapping) ──────────────────────────────────────────────────────
test('FOMO API and SolanaTracker adapters map fields from one config object and keep the key in the header only', async () => {
  const seen = [];
  const fetchImpl = async (url, { headers }) => {
    seen.push({ url, headers });
    if (url.includes('fomo')) return jsonResp({ data: [{ wallet_address: addr(1), pnl_usd: '1234.5', period: '30d' }, { wallet_address: 'bad' }] });
    return jsonResp({ wallets: [{ wallet: addr(2), summary: { total: 777, realized: 1 } }], hasNext: false });
  };
  const fomo = S.createLeaderboardAdapter('fomoapi', { SMART_MONEY_FOMOAPI: '1', FOMOAPI_KEY: 'sekret' }, { fetchImpl, queue: fastQueue() });
  const r = await fomo.discover();
  assert.deepEqual(r.candidates.map((c) => [c.wallet, c.reported_pnl, c.reported_period, c.source]), [[addr(1), 1234.5, '30d', 'fomoapi']]);
  assert.equal(seen[0].headers['x-api-key'], 'sekret');
  assert.ok(!seen[0].url.includes('sekret'));
  const st = S.createLeaderboardAdapter('solanatracker', { SMART_MONEY_SOLANATRACKER: '1', SOLANATRACKER_API_KEY: 'k2' }, { fetchImpl, queue: fastQueue(), config: { maxPages: 1 } });
  const r2 = await st.discover();
  assert.deepEqual(r2.candidates.map((c) => [c.wallet, c.reported_pnl, c.reported_period]), [[addr(2), 777, 'all-time']]);
  assert.ok(seen[1].url.startsWith('https://data.solanatracker.io/top-traders/all'));
  // unexpected response shape is an error, not silent success
  const broken = S.createLeaderboardAdapter('fomoapi', { SMART_MONEY_FOMOAPI: '1', FOMOAPI_KEY: 'k' }, { fetchImpl: async () => jsonResp({ nope: 1 }), queue: fastQueue() });
  await assert.rejects(() => broken.discover(), /unexpected response shape/);
});

test('seeds: strings and objects, invalid/duplicate ignored, shipped example is empty and therefore disabled', () => {
  const [a, b] = [addr(1), addr(2)];
  const list = S.readSeeds(seedsFile([a, { wallet: b, reported_pnl: 5, period: '7d' }, a, 'garbage', { wallet: 'x' }]));
  assert.deepEqual(list.map((x) => [x.wallet, x.reported_pnl, x.reported_period]), [[a, null, 'manual'], [b, 5, '7d']]);
  const example = JSON.parse(fs.readFileSync(S.DEFAULT_SEEDS_PATH, 'utf8'));
  assert.deepEqual(example.wallets, []);
  assert.equal(S.createSeedsSource({ SMART_MONEY_SEEDS: '1' }).enabled, false);
});

// ── winner back-buyers ──────────────────────────────────────────────────────────────────────────────────────────────
function radarDb() {
  const d = new DatabaseSync(':memory:');
  d.exec(`CREATE TABLE token (token_address TEXT PRIMARY KEY, symbol TEXT, creator TEXT, pool_created_ts INTEGER, dead_ts INTEGER);
    CREATE TABLE market_snapshot (token_address TEXT, ts INTEGER, price_usd REAL, liquidity_usd REAL, vol_h1 REAL);
    CREATE TABLE trade (token_address TEXT, ts_ms INTEGER, sig TEXT, wallet TEXT, is_buy INTEGER);`);
  return d;
}

test('winner back-buyers: finds wallets that bought BEFORE the move, late buyers become controls, losers ignored, each winner once', async () => {
  const r = radarDb();
  const T0 = 1_700_000_000, now = T0 + 20 * 3600;
  const WIN = addr(40), LOSE = addr(41), creator = addr(42);
  const addTok = (a, mult) => {
    r.prepare('INSERT INTO token VALUES (?,?,?,?,NULL)').run(a, 'S', creator, T0);
    for (const [dt, p] of [[900, 1], [1800, mult * 0.6], [3600, mult], [3 * 3600, mult * 0.8], [7 * 3600, mult * 0.5]]) {
      r.prepare('INSERT INTO market_snapshot VALUES (?,?,?,?,?)').run(a, T0 + dt, p, 5000, 100);
    }
  };
  addTok(WIN, 3.5); addTok(LOSE, 1.2);
  const ins = r.prepare('INSERT INTO trade VALUES (?,?,?,?,?)');
  const early1 = addr(50), early2 = addr(51), lateBuyer = addr(52);
  ins.run(WIN, (T0 + 100) * 1000, 's1', early1, 1);
  ins.run(WIN, (T0 + 300) * 1000, 's2', early2, 1);
  ins.run(WIN, (T0 + 400) * 1000, 's3', creator, 1);          // dev buy: excluded
  ins.run(WIN, (T0 + 400) * 1000, 's4', addr(53), 0);         // a sell is not a back-buy
  ins.run(WIN, (T0 + 1500) * 1000, 's5', lateBuyer, 1);       // bought after the reference time: control, not candidate
  ins.run(LOSE, (T0 + 100) * 1000, 's6', addr(54), 1);
  const db = freshDb();
  const src = S.createWinnerBackBuyersSource({ SMART_MONEY_WINNER_BACKBUY: '1' }, { radarDb: () => r, finders: [S.radarTradeFinder(() => r)] });
  assert.equal(src.enabled, true);
  const out = await src.discover({ db, now });
  assert.deepEqual(out.candidates.map((c) => c.wallet).sort(), [early1, early2].sort());
  assert.ok(out.candidates.every((c) => c.source === 'winner_backbuyers' && c.reported_pnl === null && c.reported_period === `winner:${WIN}`));
  assert.deepEqual(out.controlPool.map((c) => c.wallet), [lateBuyer]);
  const again = await src.discover({ db, now });
  assert.equal(again.candidates.length, 0, 'the winner is processed once');
});

test('winner back-buyers: falls back to Helius parsed swaps only when the free radar data is thin, and the Helius parse picks the receiving wallet', async () => {
  const mint = addr(60), buyer = addr(61);
  assert.equal(S.heliusBuyer({ events: { swap: { tokenOutputs: [{ mint, userAccount: buyer }] } } }, mint), buyer);
  assert.equal(S.heliusBuyer({ events: { swap: { tokenOutputs: [{ mint: addr(1), userAccount: buyer }] } } }, mint), null);
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    return jsonResp([
      { timestamp: 1500, signature: 'sigB', events: { swap: { tokenOutputs: [{ mint, userAccount: addr(62) }] } } },   // late
      { timestamp: 500, signature: 'sigA', events: { swap: { tokenOutputs: [{ mint, userAccount: buyer }] } } },        // early
      { timestamp: 50, signature: 'sigO', events: { swap: { tokenOutputs: [{ mint, userAccount: addr(63) }] } } },      // before creation
    ]);
  };
  const f = S.heliusFinder({ HELIUS_API_KEY: 'hk' }, { fetchImpl, queue: fastQueue() });
  const r = await f({ token: mint, createdTs: 100, refTs: 1000 });
  assert.deepEqual(r.early, [{ wallet: buyer, ts: 500 }]);
  assert.deepEqual(r.late, [addr(62)]);
  assert.equal(urls.length, 1);
  // free finder is enough -> the paid/limited finder is not called
  const rdb = radarDb();
  const T0 = 1_700_000_000;
  rdb.prepare('INSERT INTO token VALUES (?,?,?,?,NULL)').run(mint, 'S', null, T0);
  for (const [dt, p] of [[900, 1], [3600, 4]]) rdb.prepare('INSERT INTO market_snapshot VALUES (?,?,?,?,?)').run(mint, T0 + dt, p, 5000, 1);
  for (let i = 0; i < 6; i++) rdb.prepare('INSERT INTO trade VALUES (?,?,?,?,?)').run(mint, (T0 + 10 + i) * 1000, `s${i}`, addr(70 + i), 1);
  let paid = 0;
  const src = S.createWinnerBackBuyersSource({ SMART_MONEY_WINNER_BACKBUY: '1' }, { radarDb: () => rdb, finders: [S.radarTradeFinder(() => rdb), async () => { paid++; return { early: [], late: [] }; }] });
  const out = await src.discover({ db: freshDb(), now: T0 + 20 * 3600 });
  assert.equal(out.candidates.length, 6);
  assert.equal(paid, 0);
});

// ── forward test vs random control ──────────────────────────────────────────────────────────────────────────────────
const DAY = 86400;
function seedForward(db, { n, role, source, survivor, preMult, postFor, startIdx }) {
  const disc = BASE + 30 * DAY, fwd = 7 * DAY;
  const ins = db.prepare('INSERT INTO wallet_trade (wallet_id, token_id, ts, side, amount_token, price_usd, amount_usd, tx, event_ts, ingested_ts) VALUES (?,?,?,?,?,?,?,?,?,?)');
  for (let i = 0; i < n; i++) {
    const w = addr(startIdx + i);
    C.recordCandidates(db, [{ wallet: w, source, survivor, reported_pnl: role === 'candidate' ? 1e6 : null }], { now: disc, role });
    const pre = trips(Array(8).fill(preMult), { base: disc - 20 * DAY, step: 3000, prefix: `p${i}` });
    const post = trips(postFor(i), { base: disc + 2 * DAY, step: 3000, prefix: `q${i}` });
    for (const t of [...pre, ...post]) ins.run(w, t.token_id, t.ts, t.side, t.amount_token, t.price_usd, t.amount_usd, t.tx, t.ts, t.ts);
    db.prepare('INSERT INTO wallet_skill_snapshot (wallet_id, as_of_ts, n_trades, passed_holdout, skill_score, event_ts, ingested_ts) VALUES (?,?,?,?,?,?,?)').run(w, disc + fwd + 60, 0, 0, 0, 0, 0);
  }
  return disc + fwd + 120;
}
const POS = [1.2, 1.1, 1.3, 1.2], NEG = [0.8, 0.9, 0.7, 0.8];

test('forward test: survivors that only regress to the mean are NOT reported as persisting; real persistence is', () => {
  // survivors look great before discovery; afterwards they behave like controls (half win, half lose)
  const db = freshDb();
  seedForward(db, { n: 30, role: 'candidate', source: 'solanatracker', survivor: true, preMult: 1.5, postFor: (i) => (i % 2 ? POS : NEG), startIdx: 100 });
  const now = seedForward(db, { n: 30, role: 'control', source: 'control_trending', survivor: false, preMult: 1.0, postFor: (i) => (i % 2 ? POS : NEG), startIdx: 300 });
  assert.equal(C.evaluateForward(db, { now }), 60);
  const rep = C.buildCandidateReport(db, { now });
  assert.equal(rep.forward.verdict, 'NO_PERSISTENCE_DETECTED');
  assert.equal(rep.forward.candidates.withForwardTrades, 30);
  assert.equal(rep.forward.candidates.positiveRate, 0.5);
  assert.ok(rep.forward.candidates.medianPreMeanReturn > 0.4);
  assert.ok(rep.forward.candidates.medianPostMeanReturn < rep.forward.candidates.medianPreMeanReturn, 'regression to the mean is visible');
  assert.ok(rep.perSource.find((p) => p.source === 'solanatracker').wallets === 30);
  assert.ok(rep.caveats.some((c) => /survivors/i.test(c)));
  // genuine persistence against the same controls
  const db2 = freshDb();
  seedForward(db2, { n: 30, role: 'candidate', source: 'seed', survivor: true, preMult: 1.5, postFor: () => POS, startIdx: 100 });
  const now2 = seedForward(db2, { n: 30, role: 'control', source: 'control_trending', survivor: false, preMult: 1.0, postFor: (i) => (i % 2 ? POS : NEG), startIdx: 300 });
  C.evaluateForward(db2, { now: now2 });
  const rep2 = C.buildCandidateReport(db2, { now: now2 });
  assert.equal(rep2.forward.verdict, 'CANDIDATES_PERSIST');
  assert.ok(rep2.forward.pCandidatesVsControl < 0.05);
});

test('forward test: nothing is evaluated before the window ends or before the wallet was refreshed; small samples give INSUFFICIENT_DATA', () => {
  const db = freshDb();
  const now = seedForward(db, { n: 3, role: 'candidate', source: 'seed', survivor: true, preMult: 1.5, postFor: () => POS, startIdx: 100 });
  assert.equal(C.evaluateForward(db, { now: now - 8 * DAY }), 0, 'window not elapsed');
  const db2 = freshDb();
  C.recordCandidates(db2, [{ wallet: addr(1), source: 'seed' }], { now: 1000 });
  assert.equal(C.evaluateForward(db2, { now: 1000 + 30 * DAY }), 0, 'wallet never refreshed after the window: no (empty) forward result is locked in');
  C.evaluateForward(db, { now });
  const rep = C.buildCandidateReport(db, { now });
  assert.equal(rep.forward.verdict, 'INSUFFICIENT_DATA');
  assert.match(rep.forward.text, /Too early/);
  // empty db is fine too
  assert.equal(C.buildCandidateReport(freshDb(), { now }).forward.verdict, 'INSUFFICIENT_DATA');
});

test('buildDiscoveryReport: per-source counts, holdout passes, budget and source status; never throws', () => {
  const db = freshDb();
  const [a, b] = [addr(1), addr(2)];
  C.recordCandidates(db, [{ wallet: a, source: 'fomoapi', survivor: true, reported_pnl: 9 }, { wallet: b, source: 'fomoapi', survivor: true }], { now: 1000 });
  const snap = db.prepare('INSERT INTO wallet_skill_snapshot (wallet_id, as_of_ts, n_trades, passed_holdout, skill_score, event_ts, ingested_ts) VALUES (?,?,?,?,?,?,?)');
  snap.run(a, 2000, 12, 1, 0.7, 2000, 2000);
  snap.run(b, 2000, 12, 0, 0, 2000, 2000);
  const rep = buildDiscoveryReport(db, { env: { SMART_MONEY_COLLECTOR: '1', SMART_MONEY_FOMOAPI: '1', BIRDEYE_DAILY_BUDGET: '40' }, now: 3000 });
  const row = rep.perSource.find((p) => p.source === 'fomoapi');
  assert.deepEqual([row.wallets, row.scored, row.passedHoldout, row.smart, row.withReportedPnl], [2, 2, 1, 1, 1]);
  assert.equal(rep.budget.limit, 40);
  assert.equal(rep.sources.length, 5);
  assert.equal(rep.sources.find((s) => s.name === 'fomoapi').flagOn, true);
  assert.match(rep.sources.find((s) => s.name === 'fomoapi').reason, /FOMOAPI_KEY/);
  assert.equal(rep.collectorEnabled, true);
  assert.ok(Array.isArray(rep.caveats) && rep.caveats.length >= 4);
});

test('wallet_candidate_eval rows are append-only', () => {
  const db = freshDb();
  db.prepare('INSERT INTO wallet_candidate_eval (candidate_id, wallet_id, source, role, leaderboard_survivor, discovered_ts, forward_days, pre_n, pre_passed_holdout, post_n, evaluated_ts, ingested_ts) VALUES (1,?,?,?,1,1,7,0,0,0,1,1)').run(addr(1), 's', 'candidate');
  assert.throws(() => db.prepare('UPDATE wallet_candidate_eval SET post_n = 9').run(), /append-only/);
  assert.throws(() => db.prepare('DELETE FROM wallet_candidate_eval').run(), /append-only/);
});
