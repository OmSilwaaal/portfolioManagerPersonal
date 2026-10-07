'use strict';
// Live radar scores -> signal_snapshot ('radar-<model>') -> outcomes (measured on radar.sqlite) -> eval report next to
// activity-v0. Uses the real better-sqlite3 when it loads, else the node:sqlite adapter (see test/_sqlite.js).
const test = require('node:test');
const assert = require('node:assert/strict');

const sqlite = require('./_sqlite');
sqlite.installBetterSqlite3Adapter();
process.env.DB_PATH = ':memory:';
process.env.RADAR_DB_PATH = ':memory:';
process.env.ENABLE_RADAR = 'true';
delete process.env.RADAR_EXTRA_FEATURES;
delete process.env.RADAR_PERSIST_SCORES;
delete process.env.RADAR_SNAPSHOT_MIN_GAP_MIN;

const { getDb } = require('../src/db/schema');
const { getRadarDb } = require('../src/radar/db');
const F = require('../src/radar/features');
const RS = require('../src/services/radarSignals');
const store = require('../src/services/signalStore');
const { initEvalSchema } = require('../src/research/eval/schema');
const { runOutcomes } = require('../src/research/eval/outcomes');
const { generateReport } = require('../src/research/eval/report');
const { loadPairs, listModelVersions, listComponents } = require('../src/research/eval/pairs');

const main = getDb();
initEvalSchema(main);
const radar = getRadarDb();
const T0 = 1_800_000_000;
const tokA = 'A'.repeat(43) + '1';
const tokB = 'B'.repeat(43) + '1';
const tokG = 'G'.repeat(43) + '1';

// scheduler stub: nothing is written until we flush by hand (proves the request path does not touch the DB)
let scheduled = [];
store._setFlushScheduler((fn) => scheduled.push(fn));
const runScheduled = () => { const q = scheduled; scheduled = []; q.forEach((f) => f()); };
const rows = () => main.prepare('SELECT s.*, t.contract_address AS addr FROM signal_snapshot s JOIN token t ON t.token_id = s.token_id ORDER BY s.signal_id').all();

function seedRadarToken(tok, symbol, { until = T0, price = (i) => 0.001 * (1 + i * 0.004), deadReason = null, deadTs = null } = {}) {
  radar.prepare(`INSERT INTO token (token_address, symbol, name, creator, first_pool, current_pool, dex, launchpad, pool_created_ts, first_seen_ts, last_snapshot_ts, last_vol_h1, last_liq, dead_ts, dead_reason)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(tok, symbol, symbol, 'creator' + symbol, 'p' + symbol, 'p' + symbol, 'pumpswap', 'pumpfun', T0 - 3600, T0 - 3590, T0, 20000, 30000, deadTs, deadReason);
  const ins = radar.prepare(`INSERT INTO market_snapshot (token_address, ts, pool_address, price_usd, liquidity_usd, liq_estimated, fdv, vol_m5, vol_h1, buys_m5, sells_m5, buys_h1, sells_h1)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (let i = 0; i <= 50; i++) ins.run(tok, T0 - (50 - i) * 60, 'p' + symbol, price(i), 30000, 0, 40000, 3000 + (i % 5) * 100, 20000, 40, 12, 300, 120);
  radar.prepare(`INSERT INTO token_security (token_address, ts, creator, rc_score, danger_count, top1_pct_ex, top10_pct_ex, creator_pct, insider_pct, mint_auth, freeze_auth, holders, lp_locked_pct, rugged, creator_prev_count, creator_prev_dead_share, risks_json)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(tok, T0 - 1800, 'creator' + symbol, 5, 0, 4, 20, 1, 0, 0, 0, 400, 100, 0, 0, null, '[]');
}
function addFuture(tok, fn, minutes) {
  const ins = radar.prepare(`INSERT INTO market_snapshot (token_address, ts, pool_address, price_usd, liquidity_usd, liq_estimated, fdv, vol_m5, vol_h1, buys_m5, sells_m5, buys_h1, sells_h1)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const m of minutes) ins.run(tok, T0 + m * 60, 'p', fn(m), 30000, 0, 40000, 3000, 20000, 40, 12, 300, 120);
}
const tokenRow = (a) => radar.prepare('SELECT * FROM token WHERE token_address = ?').get(a);

const sig = (o = {}) => ({ address: 'Q1', symbol: 'AAA', model: 'market_v2', score: 51.2, confidence: 0.8, passesSafetyGate: true,
  components: { volume_accel: { score: 40, weight: 0.25 }, buy_pressure: { score: 70, weight: 0.15 }, rank_vs_cohort: { score: null, weight: 0.15 } },
  riskFlags: [{ code: 'CREATOR_HOLDS' }], ...o });
const feat = (o = {}) => ({ ts: T0 - 30, age_min: 60, vol_m5: 3100, price_usd: 0.001, liquidity_usd: 30000, volume_accel: 6, buy_pressure: 0.7, has_sec: 1, sm_buyers_30m: null, rank_vol_accel: null, ...o });

test('buildRadarSnapshot: radar-<model> version, feature values, risk flags, numeric components, stable hash', () => {
  const r = store.buildRadarSnapshot(sig(), feat(), T0);
  assert.equal(r.modelVersion, 'radar-market_v2');
  assert.equal(r.asOfTs, T0);
  assert.equal(r.composite, 51.2);
  assert.match(r.hash, /^[0-9a-f]{32}$/);
  const c = JSON.parse(r.componentScores);
  assert.equal(c.volume_accel, 40);
  assert.ok(!('rank_vs_cohort' in c), 'null components are not stored as numbers (not ablatable without data)');
  assert.equal(c.features.volume_accel, 6);
  assert.equal(c.features.vol_m5, 3100);
  assert.equal(c.features.sm_buyers_30m, null, 'a collector with no data is stored as null, not 0');
  assert.equal(c.features.ts, T0 - 30, 'features are tagged with the market snapshot time they came from');
  assert.deepEqual(c.riskFlags, ['CREATOR_HOLDS']);
  assert.equal(c.mode, 'radar');
  assert.equal(store.buildRadarSnapshot(sig(), feat(), T0 + 99).hash, r.hash, 'hash depends on the features only');
  assert.notEqual(store.buildRadarSnapshot(sig(), feat({ volume_accel: 7 }), T0).hash, r.hash);
});

test('queue + flush: nothing is written on the request path; dedupe per token per N minutes; batched', () => {
  store._resetRadarQueue(); scheduled = [];
  const env = {};
  assert.equal(store.queueRadarSignal(sig(), feat(), T0, env), true);
  assert.equal(store.queueRadarSignal(sig(), feat(), T0 + 60, env), false, 'within 5 minutes: skipped');
  assert.equal(store.queueRadarSignal(sig({ address: 'Q2' }), feat(), T0 + 60, env), true, 'another token is independent');
  assert.equal(store.queueRadarSignal(sig({ model: 'market_v2_sm' }), feat(), T0 + 120, env), true, 'another model version is independent');
  assert.equal(rows().length, 0, 'request path wrote nothing');
  assert.equal(scheduled.length, 1, 'one deferred flush scheduled for the whole batch');
  runScheduled();
  assert.equal(rows().length, 3);
  assert.equal(store.queueRadarSignal(sig(), feat(), T0 + 299, env), false);
  assert.equal(store.queueRadarSignal(sig(), feat(), T0 + 301, env), true, 'after 5 minutes: new row');
  runScheduled();
  const r = rows().filter((x) => x.addr === 'Q1' && x.model_version === 'radar-market_v2');
  assert.deepEqual(r.map((x) => x.as_of_ts), [T0, T0 + 301]);
  assert.deepEqual(rows().map((x) => x.model_version).sort(), ['radar-market_v2', 'radar-market_v2', 'radar-market_v2', 'radar-market_v2_sm']);
});

test('gap is configurable; DB re-checks after a restart (in-memory state lost) so rows are not duplicated', () => {
  store._resetRadarQueue(); scheduled = [];
  const before = rows().length;
  const t = T0 + 5000;
  assert.equal(store.queueRadarSignal(sig({ address: 'Q3' }), feat(), t, { RADAR_SNAPSHOT_MIN_GAP_MIN: '1' }), true);
  runScheduled();
  assert.equal(rows().length, before + 1);
  assert.equal(store.queueRadarSignal(sig({ address: 'Q3' }), feat(), t + 90, { RADAR_SNAPSHOT_MIN_GAP_MIN: '1' }), true, '90s later with a 1 minute gap');
  runScheduled();
  assert.equal(rows().length, before + 2);
  store._resetRadarQueue();                                          // "restart"
  assert.equal(store.queueRadarSignal(sig({ address: 'Q3' }), feat(), t + 120, {}), true);   // default 5 min gap: queued, but...
  runScheduled();
  assert.equal(rows().length, before + 2, '...the DB already has a row within 5 minutes, so the flush skips it');
  assert.equal(store.radarGapSec({ RADAR_SNAPSHOT_MIN_GAP_MIN: 'nonsense' }), 300);
});

test('never throws or blocks: bad input, disabled flag, broken db; failed flush drops the batch', () => {
  store._resetRadarQueue(); scheduled = [];
  assert.equal(store.queueRadarSignal(null, feat(), T0), false);
  assert.equal(store.queueRadarSignal(sig({ score: null }), feat(), T0), false);
  assert.equal(store.queueRadarSignal(sig(), null, T0), false);
  assert.equal(store.queueRadarSignal(sig({ address: 'OFF1' }), feat(), T0, { RADAR_PERSIST_SCORES: 'off' }), false);
  assert.equal(store.queueRadarSignal(sig({ address: 'BAD1' }), feat(), T0, {}), true);
  const origErr = console.error; console.error = () => {};
  try {
    assert.equal(store.flushRadarQueue({ prepare() { throw new Error('db gone'); } }), 0);
  } finally { console.error = origErr; }
  assert.equal(store._radarQueueLength(), 0, 'the failed batch is dropped, not retried forever');
  scheduled = [];
});

test('computeForTokens persists the live score (radar-market_v2) with feature values; outcomes use radar.sqlite prices; eval shows it next to activity-v0', () => {
  store._resetRadarQueue(); scheduled = [];
  main.exec('DELETE FROM outcome_window'); // (append-only triggers are not installed on these tables)
  seedRadarToken(tokA, 'AAA');
  seedRadarToken(tokB, 'BBB');
  seedRadarToken(tokG, 'GGG', { deadReason: 'gone', deadTs: T0 + 10 * 60 });
  F.setExtraFeatureSource(null);
  const before = rows().length;
  const sigs = RS.computeForTokens(radar, F, [tokenRow(tokA), tokenRow(tokB), tokenRow(tokG)], T0 + 20);
  assert.equal(rows().length, before, 'scoring a request does not write synchronously');
  runScheduled();
  const added = rows().slice(before);
  assert.equal(added.length, 3);
  for (const r of added) {
    assert.equal(r.model_version, 'radar-market_v2');
    assert.equal(r.as_of_ts, T0 + 20);
    assert.match(r.feature_vector_hash, /^[0-9a-f]{32}$/);
    const c = JSON.parse(r.component_scores);
    assert.equal(typeof c.features.volume_accel, 'number');
    assert.ok(Array.isArray(c.riskFlags));
    assert.equal(r.composite_score, sigs.find((s) => s.address === r.addr).score);
  }
  // a second scoring pass within 5 minutes is deduped
  RS.computeForTokens(radar, F, [tokenRow(tokA)], T0 + 80);
  runScheduled();
  assert.equal(rows().length, before + 3);

  // future prices, written AFTER scoring. A: +50% at +60m. B: goes quiet at +10m (inactive: carried at last price). G: gone.
  addFuture(tokA, (m) => (m <= 1 ? 0.001 : 0.0015), [1, 61, 100, 200]);
  addFuture(tokB, (m) => (m <= 1 ? 0.001 : 0.0012), [1, 5, 10]);
  radar.prepare("UPDATE token SET dead_ts = ?, dead_reason = 'inactive' WHERE token_address = ?").run(T0 + 10 * 60, tokB);
  addFuture(tokG, (m) => (m <= 1 ? 0.001 : 0.0005), [1, 5, 10]);

  const res = runOutcomes(main, { nowSec: T0 + 8 * 3600, radarDb: radar, horizons: [60] });
  assert.ok(res.inserted >= 3, JSON.stringify(res));
  const out = (a) => main.prepare(`SELECT o.* FROM outcome_window o JOIN signal_snapshot s ON s.signal_id = o.signal_snapshot_id
    JOIN token t ON t.token_id = s.token_id WHERE t.contract_address = ? AND s.model_version = 'radar-market_v2' AND s.as_of_ts = ?`).get(a, T0 + 20);
  const oa = out(tokA), ob = out(tokB), og = out(tokG);
  assert.equal(oa.status, 'ok');
  assert.ok(Math.abs(oa.forward_return - 0.5) < 1e-9, `A ${oa.forward_return}`);   // entry 0.001 at +1m, exit 0.0015 at +61m
  assert.equal(ob.status, 'ok');
  assert.ok(Math.abs(ob.forward_return - (0.0012 / ob.entry_price - 1)) < 1e-9, 'inactive token is marked at its last observed price');
  assert.equal(og.status, 'dead');
  assert.equal(og.forward_return, -1);

  // eval: radar-* is evaluated by the same machinery and shown beside activity-v0
  main.prepare("INSERT OR IGNORE INTO token (chain, contract_address, first_seen_ts, symbol) VALUES ('solana', 'ACT1', ?, 'ACT')").run(T0);
  const tid = main.prepare("SELECT token_id FROM token WHERE contract_address = 'ACT1'").get().token_id;
  main.prepare("INSERT INTO signal_snapshot (token_id, as_of_ts, model_version, component_scores, composite_score, feature_vector_hash) VALUES (?,?,?,?,?,?)")
    .run(tid, T0, 'activity-v0', '{"confidence":1,"volume":50}', 50, 'h');
  const versions = listModelVersions(main).map((v) => v.model_version);
  assert.ok(versions.includes('activity-v0') && versions.includes('radar-market_v2'));
  const pairs = loadPairs(main, { modelVersion: 'radar-market_v2', horizonMin: 60 });
  assert.equal(pairs.length, 3);
  assert.ok(pairs.every((p) => p.volume_5m != null), 'volume baseline falls back to the raw 5m volume stored with the radar score');
  const comps = listComponents(main, 'radar-market_v2');
  assert.ok(comps.includes('volume_accel') && comps.includes('buy_pressure'));
  assert.ok(!comps.includes('features') && !comps.includes('ts'), 'raw feature dump / timestamps are not offered as ablation components');
  const rep = generateReport(main, { nowSec: T0 + 8 * 3600 });
  assert.ok(rep.models['radar-market_v2'] && rep.models['activity-v0']);
  const cmp = rep.comparison.map((c) => [c.modelVersion, c.kind]);
  assert.deepEqual(cmp[0], ['activity-v0', 'baseline'], 'primary model first');
  assert.ok(cmp.some(([m, k]) => m === 'radar-market_v2' && k === 'radar'));
  assert.equal(rep.models['radar-market_v2'].horizons[60].evaluation.verdict, 'INSUFFICIENT_DATA', 'tiny sample: no verdict is claimed');
});
