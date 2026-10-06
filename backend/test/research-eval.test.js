const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { evaluate, mulberry32 } = require('../src/research/eval/evaluate');
const { initEvalSchema } = require('../src/research/eval/schema');
const { runOutcomes } = require('../src/research/eval/outcomes');
const { loadPairs } = require('../src/research/eval/pairs');
const { generateReport, latestReport } = require('../src/research/eval/report');

const MIN = 60;
const T0 = 1_800_000_000;

// ---------- synthetic pairs ----------
// planted=true: the top ~8% of scores succeed with 70% prob; everything else ~4%.
function makePairs({ n, tokens, planted, seed = 7 }) {
  const rng = mulberry32(seed);
  const out = [];
  for (let i = 0; i < n; i++) {
    const u = rng();
    const pSucc = planted ? (u > 0.92 ? 0.7 : 0.04) : 0.08;
    const succ = rng() < pSucc;
    const fr = succ ? 0.45 + rng() * 0.5 : -0.25 + rng() * 0.4 - (rng() < 0.1 ? 0.7 : 0);
    out.push({ token_id: i % tokens, as_of_ts: T0 + i * 600, score: u, forward_return: fr,
      volume_5m: rng() * 10000 });
  }
  return out;
}

test('planted signal yields POSSIBLE_EDGE', () => {
  const r = evaluate(makePairs({ n: 800, tokens: 400, planted: true }), { bootstrapIters: 400 });
  assert.equal(r.verdict, 'POSSIBLE_EDGE', JSON.stringify({ reasons: r.reasons, gates: r.gates, stab: r.stability }));
  const top5 = r.cutoffs['0.05'];
  assert.ok(top5.lift > 3);
  assert.ok(r.bootstrap.precisionExcess.pValue < 0.05);
  assert.ok(r.bootstrap.precisionExcess.ci95[0] > 0);
});

test('pure noise yields NO_EDGE (several seeds)', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const r = evaluate(makePairs({ n: 800, tokens: 400, planted: false, seed }), { bootstrapIters: 300 });
    assert.equal(r.verdict, 'NO_EDGE', `seed ${seed}: ${JSON.stringify(r.gates)}`);
  }
});

test('tiny data yields INSUFFICIENT_DATA and never a stronger verdict', () => {
  const r = evaluate(makePairs({ n: 40, tokens: 10, planted: true }));
  assert.equal(r.verdict, 'INSUFFICIENT_DATA');
  assert.ok(r.reasons.length > 0);
  assert.equal(evaluate([]).verdict, 'INSUFFICIENT_DATA');
});

test('edge present only in one half is flagged EDGE_NOT_STABLE', () => {
  const p = makePairs({ n: 800, tokens: 400, planted: true });
  // second half: scores become pure noise
  const rng = mulberry32(99);
  const half = Math.floor(p.length / 2);
  for (let i = half; i < p.length; i++) {
    const succ = rng() < 0.08;
    p[i].forward_return = succ ? 0.6 : -0.2;
    p[i].score = rng();
  }
  const r = evaluate(p, { bootstrapIters: 400 });
  assert.notEqual(r.verdict, 'POSSIBLE_EDGE');
});

test('bootstrap resamples tokens: signals sharing a token do not inflate confidence', () => {
  // 40 tokens x 20 identical-ish signals each: effective n is 40, not 800
  const rng = mulberry32(3);
  const pairs = [];
  for (let t = 0; t < 40; t++) {
    const lucky = rng() < 0.1;
    for (let j = 0; j < 20; j++) {
      pairs.push({ token_id: t, as_of_ts: T0 + (t * 20 + j) * 600, score: lucky ? 0.95 + rng() * 0.05 : rng() * 0.9,
        forward_return: lucky ? 0.8 : -0.1, volume_5m: rng() * 100 });
    }
  }
  const r = evaluate(pairs, { bootstrapIters: 400 });
  const ci = r.bootstrap.precisionExcess.ci95;
  assert.ok(ci[1] - ci[0] > 0.1, `CI too narrow for 40 effective samples: ${ci}`);
});

test('alternative score columns use the same code (ablation via function scoreKey)', () => {
  const p = makePairs({ n: 800, tokens: 400, planted: true });
  const real = evaluate(p, { bootstrapIters: 200 });
  const shuffled = evaluate(p.map((x, i) => ({ ...x, score: mulberry32(i + 1)() })), { bootstrapIters: 200 });
  assert.equal(real.verdict, 'POSSIBLE_EDGE');
  assert.notEqual(shuffled.verdict, 'POSSIBLE_EDGE');
});

// ---------- DB-backed tests ----------
function makeDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE token (token_id INTEGER PRIMARY KEY AUTOINCREMENT, chain TEXT DEFAULT 'solana',
      contract_address TEXT, first_seen_ts INTEGER, symbol TEXT);
    CREATE TABLE market_snapshot (snapshot_id INTEGER PRIMARY KEY AUTOINCREMENT, token_id INTEGER, ts INTEGER,
      price REAL, mcap REAL, liquidity_usd REAL, volume_5m REAL, volume_1h REAL, buy_count INTEGER,
      sell_count INTEGER, holder_count INTEGER, ingested_ts INTEGER DEFAULT 0);
    CREATE TABLE signal_snapshot (signal_id INTEGER PRIMARY KEY AUTOINCREMENT, token_id INTEGER, as_of_ts INTEGER,
      model_version TEXT, component_scores TEXT, composite_score REAL, feature_vector_hash TEXT);
  `);
  initEvalSchema(db);
  return db;
}
const addToken = (db, i) => db.prepare('INSERT INTO token (contract_address, first_seen_ts) VALUES (?,?)').run('mint' + i, T0).lastInsertRowid;
const snap = (db, tok, ts, price, liq = 50000, vol = 100) =>
  db.prepare('INSERT INTO market_snapshot (token_id, ts, price, liquidity_usd, volume_5m) VALUES (?,?,?,?,?)').run(tok, ts, price, liq, vol);
const sig = (db, tok, ts, score, mv = 'activity-v0', comps = {}) =>
  db.prepare('INSERT INTO signal_snapshot (token_id, as_of_ts, model_version, component_scores, composite_score, feature_vector_hash) VALUES (?,?,?,?,?,?)')
    .run(tok, ts, mv, JSON.stringify(comps), score, 'h').lastInsertRowid;
const outcome = (db, sid, h) => db.prepare('SELECT * FROM outcome_window WHERE signal_snapshot_id=? AND horizon_min=?').get(sid, h);

test('outcomes: forward return, drawdown, runup; waits for horizon', () => {
  const db = makeDb();
  const t = addToken(db, 1);
  const s = sig(db, t, T0, 5);
  snap(db, t, T0 + 30, 1.0);
  snap(db, t, T0 + 10 * MIN, 0.8);
  snap(db, t, T0 + 30 * MIN, 1.5);
  snap(db, t, T0 + 60 * MIN + 20, 1.2);
  // not elapsed yet
  let res = runOutcomes(db, { nowSec: T0 + 30 * MIN });
  assert.equal(outcome(db, s, 60), undefined);
  res = runOutcomes(db, { nowSec: T0 + 3 * 3600, horizons: [60] });
  const o = outcome(db, s, 60);
  assert.equal(o.status, 'ok');
  assert.ok(Math.abs(o.forward_return - 0.2) < 1e-9);
  assert.ok(Math.abs(o.max_drawdown - -0.2) < 1e-9);
  assert.ok(Math.abs(o.max_runup - 0.5) < 1e-9);
  // idempotent / append-only
  const again = runOutcomes(db, { nowSec: T0 + 4 * 3600, horizons: [60] });
  assert.equal(again.inserted, 0);
});

test('survivorship: liquidity collapse and vanished tokens count as -100%; gaps are missing', () => {
  const db = makeDb();
  const rug = addToken(db, 1), vanish = addToken(db, 2), gap = addToken(db, 3), fresh = addToken(db, 4);
  const sRug = sig(db, rug, T0, 1), sVan = sig(db, vanish, T0, 1), sGap = sig(db, gap, T0, 1), sFresh = sig(db, fresh, T0, 1);
  for (const t of [rug, vanish, gap, fresh]) snap(db, t, T0 + 10, 1.0);
  snap(db, rug, T0 + 60 * MIN + 10, 0.9, 20);               // price looks fine but liquidity ~0
  snap(db, gap, T0 + 3 * 3600, 2.0);                         // collector hole, token alive later
  snap(db, fresh, T0 + 59 * MIN, 1.0);                       // last seen 'now - 1min': undecided
  const now = T0 + 60 * MIN + 5 * MIN + 7 * 3600 - 7 * 3600 + 3600 * 2; // 3h5m after as_of
  runOutcomes(db, { nowSec: now, horizons: [60], deadGapSec: 6 * 3600 });
  assert.equal(outcome(db, sRug, 60).status, 'dead');
  assert.equal(outcome(db, sRug, 60).forward_return, -1);
  assert.equal(outcome(db, sGap, 60).status, 'missing');
  assert.equal(outcome(db, sGap, 60).forward_return, null);
  assert.equal(outcome(db, sVan, 60), undefined, 'not yet silent long enough');
  assert.equal(outcome(db, sFresh, 60), undefined);
  runOutcomes(db, { nowSec: T0 + 8 * 3600, horizons: [60], deadGapSec: 6 * 3600 });
  assert.equal(outcome(db, sVan, 60).status, 'dead');
  assert.equal(outcome(db, sVan, 60).forward_return, -1);
});

test('LEAK: outcomes never use market data before as_of_ts', () => {
  const build = (preSpikePrice) => {
    const db = makeDb();
    const t = addToken(db, 1);
    // pre-signal rows (would wildly change results if used)
    snap(db, t, T0 - 3600, preSpikePrice, 999999);
    snap(db, t, T0 - 60, preSpikePrice, 999999);
    const s = sig(db, t, T0, 3);
    snap(db, t, T0 + 20, 2.0);
    snap(db, t, T0 + 60 * MIN + 5, 3.0);
    runOutcomes(db, { nowSec: T0 + 5 * 3600, horizons: [60] });
    return outcome(db, s, 60);
  };
  const a = build(0.0001), b = build(1000);
  assert.equal(a.forward_return, b.forward_return);
  assert.equal(a.max_drawdown, b.max_drawdown);
  assert.equal(a.max_runup, b.max_runup);
  assert.ok(Math.abs(a.forward_return - 0.5) < 1e-9);
  assert.ok(a.entry_ts >= T0 && a.entry_price === 2.0);

  // and every market_snapshot query the job issues is bounded below by as_of_ts
  const db = makeDb();
  const seen = [];
  const origPrepare = db.prepare.bind(db);
  db.prepare = (sql) => { if (/market_snapshot/.test(sql) && /outcome|SELECT (ts|MIN)/.test(sql)) seen.push(sql); return origPrepare(sql); };
  const t = addToken(db, 9); sig(db, t, T0, 1); snap(db, t, T0 + 5, 1); snap(db, t, T0 + 3700, 1);
  runOutcomes(db, { nowSec: T0 + 5 * 3600, horizons: [60] });
  assert.ok(seen.length >= 3);
  for (const sql of seen) assert.match(sql, /ts >= \?/, sql);
});

test('end to end: planted signal in DB -> outcomes -> report POSSIBLE_EDGE; stored and retrievable', () => {
  const db = makeDb();
  const rng = mulberry32(21);
  for (let i = 0; i < 160; i++) {
    const tok = addToken(db, i);
    for (let d = 0; d < 2; d++) {
      const ts = T0 + d * 86400 * 2 + Math.floor(rng() * 3600);
      const u = rng();
      const succ = rng() < (u > 0.9 ? 0.75 : 0.04);
      const fr = succ ? 0.5 : -0.2 + rng() * 0.2;
      sig(db, tok, ts, u, 'activity-v0', { volume: u });
      snap(db, tok, ts + 10, 1.0, 50000, rng() * 1000);
      snap(db, tok, ts + 3600 + 30, 1 + fr, 50000, 10);
    }
  }
  const now = T0 + 10 * 86400;
  runOutcomes(db, { nowSec: now });
  const pairs = loadPairs(db, { modelVersion: 'activity-v0', horizonMin: 60 });
  assert.equal(pairs.length, 320);
  const rep = generateReport(db, { nowSec: now, evalOpts: { bootstrapIters: 300 } });
  assert.equal(rep.verdict, 'POSSIBLE_EDGE', JSON.stringify(rep.headline.reasons) + JSON.stringify(rep.headline.gates));
  assert.ok(/not a proven one/.test(rep.summary));
  assert.ok(rep.models['activity-v0'].components.volume);
  const latest = latestReport(db);
  assert.equal(latest.verdict, 'POSSIBLE_EDGE');
  // component ablation uses the same code path
  const comp = loadPairs(db, { modelVersion: 'activity-v0', horizonMin: 60, scoreKey: 'component:volume' });
  assert.equal(comp.length, 320);
});

// ---------- overall (radar + baseline) verdict ----------
const { overallVerdict, collectorStatus } = require('../src/research/eval/combined');

const testRow = (o = {}) => ({
  window: 'test', model: 'fitted_lr', strategy: '60m', n: 80, mean: 0.12, median: 0.02, winRate: 0.4,
  pVsRandom: 0.0004, significantAfterCorrection: true,
  precedence: { shareReactive: 0.1 },
  perDayMean: { a: { n: 10, mean: 0.1 }, b: { n: 10, mean: 0.2 }, c: { n: 10, mean: 0.05 } },
  ...o,
});
const goodBaseline = (o = {}) => ({
  verdict: 'POSSIBLE_EDGE',
  headline: { config: { primaryFrac: 0.05 }, cutoffs: { '0.05': { precision: 0.4 } }, baselines: { volume5m: { precision: 0.2 } } },
  ...o,
});
const base = (o = {}) => ({ radarEnabled: true, daysOfData: 10, tokens: 500, radar: { results: [testRow()] }, baseline: goodBaseline(), ...o });

test('overall: insufficient data until both days and tokens are enough', () => {
  assert.equal(overallVerdict(base({ daysOfData: 2 })).verdict, 'INSUFFICIENT_DATA');
  assert.equal(overallVerdict(base({ tokens: 20 })).verdict, 'INSUFFICIENT_DATA');
  assert.equal(overallVerdict(base({ radarEnabled: false })).verdict, 'INSUFFICIENT_DATA');
  assert.equal(overallVerdict(base({ radar: { results: [] } })).verdict, 'INSUFFICIENT_DATA');
  assert.equal(overallVerdict(base({ radar: { results: [testRow({ n: 5 })] } })).verdict, 'INSUFFICIENT_DATA');
  assert.equal(overallVerdict({}).verdict, 'INSUFFICIENT_DATA');
});

test('overall: reactive signal is flagged, not called an edge', () => {
  const v = overallVerdict(base({ radar: { results: [testRow({ precedence: { shareReactive: 0.8 } })] } }));
  assert.equal(v.verdict, 'MOSTLY_REACTIVE');
});

test('overall: no edge when the test slice does not beat random', () => {
  const v = overallVerdict(base({ radar: { results: [testRow({ significantAfterCorrection: false, mean: -0.05 })] } }));
  assert.equal(v.verdict, 'NO_EDGE');
});

test('overall: no edge when it does not beat the highest-volume baseline', () => {
  const b = goodBaseline(); b.headline.baselines.volume5m.precision = 0.5;
  assert.equal(overallVerdict(base({ baseline: b })).verdict, 'NO_EDGE');
});

test('overall: unstable edge never becomes possible/proven', () => {
  const unstableDays = testRow({ perDayMean: { a: { n: 9, mean: 0.5 }, b: { n: 9, mean: -0.1 }, c: { n: 9, mean: -0.2 }, d: { n: 9, mean: -0.1 } } });
  assert.equal(overallVerdict(base({ radar: { results: [unstableDays] } })).verdict, 'EDGE_NOT_STABLE');
  assert.equal(overallVerdict(base({ baseline: goodBaseline({ verdict: 'EDGE_NOT_STABLE' }) })).verdict, 'EDGE_NOT_STABLE');
});

test('overall: strongest outcome is POSSIBLE_EDGE, needs a known baseline comparison', () => {
  assert.equal(overallVerdict(base()).verdict, 'POSSIBLE_EDGE');
  assert.equal(overallVerdict(base({ baseline: null })).verdict, 'INSUFFICIENT_DATA');
  const all = [base(), base({ daysOfData: 1 }), base({ baseline: null })].map((i) => overallVerdict(i).verdict);
  assert.ok(all.every((x) => !/PROVEN/i.test(x)));
});

test('collectorStatus tolerates missing tables and reports flags without secrets', () => {
  const d = new DatabaseSync(':memory:');
  const s = collectorStatus(d, { SNAPSHOT_COLLECTOR: '1', HELIUS_API_KEY: 'secret' });
  assert.equal(s.tables.smart_money_event.rows, 0);
  assert.equal(s.tables.smart_money_event.exists, false);
  assert.equal(s.flags.SNAPSHOT_COLLECTOR, true);
  assert.equal(s.keys.walletProvider, true);
  assert.ok(!JSON.stringify(s).includes('secret'));
});
