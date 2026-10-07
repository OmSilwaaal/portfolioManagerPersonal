const test = require('node:test');
const assert = require('node:assert/strict');
const rs = require('../src/services/radarSignals');

const safe = () => ({
  ts: 1_800_000_000, age_min: 30, has_sec: 1, mint_auth: 0, freeze_auth: 0, rugged: 0, top1_pct_ex: 5, top10_pct_ex: 30,
  creator_pct: 2, insider_pct: 0, creator_prev_dead_share: 0, danger_count: 0, lp_locked_pct: 0, migrated: 0,
  volume_accel: 6, buy_pressure: 0.7, txn_accel: 3, price_chg_15m: 0.3, realized_vol_30m: 0.1, liq_delta_15m: 0.1,
  curve_progress: 0.5, liq_estimated: 1, price_usd: 0.001, liquidity_usd: 20000, fdv: 30000,
});
const tok = (o = {}) => ({ token_address: 'A'.repeat(44), symbol: 'TST', name: 'Test', pool_created_ts: 1_800_000_000 - 1800, first_seen_ts: 1_800_000_000 - 1795, ...o });

test('clean vetted token has no radar flags and passes gate', () => {
  assert.deepEqual(rs.radarRiskFlags(safe()), []);
  assert.equal(rs.passesSafetyGate(safe()), true);
});

test('unvetted token is flagged and fails the gate', () => {
  const f = { ...safe(), has_sec: 0 };
  assert.deepEqual(rs.radarRiskFlags(f).map((x) => x.code), ['UNVETTED']);
  assert.equal(rs.passesSafetyGate(f), false);
  assert.deepEqual(rs.radarRiskFlags(null).map((x) => x.code), ['UNVETTED']);
});

test('rug / insider / concentration / authority / dev-sold flags', () => {
  const f = { ...safe(), rugged: 1, mint_auth: 1, freeze_auth: 1, top1_pct_ex: 40, top10_pct_ex: 70, creator_pct: 25,
    insider_pct: 30, creator_prev_dead_share: 0.9, dev_sold: 1, buyer_hhi_5m: 0.8, unique_buyers_5m: 2 };
  const codes = rs.radarRiskFlags(f).map((x) => x.code);
  for (const c of ['RUGGED', 'MINT_AUTHORITY', 'FREEZE_AUTHORITY', 'TOP_HOLDER', 'HOLDER_CONCENTRATION', 'CREATOR_HOLDS',
    'INSIDERS', 'SERIAL_RUGGER', 'DEV_SOLD', 'CONCENTRATED_BUYING']) assert.ok(codes.includes(c), c);
  assert.equal(rs.passesSafetyGate(f), false);
});

test('levels and confidence', () => {
  assert.equal(rs.levelFor(60), 'HOT');
  assert.equal(rs.levelFor(45), 'ACTIVE');
  assert.equal(rs.levelFor(25), 'WARMING');
  assert.equal(rs.levelFor(5), 'QUIET');
  const full = rs.radarConfidence(safe());
  const bare = rs.radarConfidence({ has_sec: 0, age_min: 1 });
  assert.ok(full > 0.8 && bare === 0, `${full} ${bare}`);
});

test('mapRadarSignal: bonding state, features, flags, no-snapshot token', () => {
  const m = rs.mapRadarSignal({ token: tok(), f: safe(), score: 57.26, nowSec: 1_800_000_000 });
  assert.equal(m.source, 'radar');
  assert.equal(m.score, 57.3);
  assert.equal(m.level, 'HOT');
  assert.equal(m.launch.state, 'bonding');
  assert.equal(m.launch.ageMin, 30);
  assert.equal(m.firesAtThreshold, true);
  assert.equal(m.components.volume_accel.weight, 0.25);
  assert.equal(m.components.rank_vs_cohort.score, null);

  const g = rs.mapRadarSignal({ token: tok({ migrated_ts: 1_799_999_000 }), f: { ...safe(), liq_estimated: 0 }, score: 10, nowSec: 1_800_000_000 });
  assert.equal(g.launch.state, 'graduated');
  assert.equal(g.firesAtThreshold, false);

  const fresh = rs.mapRadarSignal({ token: tok(), f: null, score: null, nowSec: 1_800_000_000 });
  assert.equal(fresh.score, null);
  assert.equal(fresh.confidence, 0);
  assert.equal(fresh.riskFlags[0].code, 'UNVETTED');
  assert.equal(fresh.asOf, null);
});

test('attachContext uses only security/promos at or before the row time', () => {
  const f = { ts: 1000 };
  rs.attachContext(f, {
    sec: { ts: 900, top1_pct_ex: 10, mint_auth: 0 },
    launch: { dev_buy_sol: 1.5, has_twitter: 1 },
    promos: [{ kind: 'boost', amount_key: 50, ts: 950 }, { kind: 'boost', amount_key: 500, ts: 1100 },
      { kind: 'profile', amount_key: 0, ts: 960, links_json: '["telegram"]' }],
  });
  assert.equal(f.has_sec, 1);
  assert.equal(f.boost_total, 50);
  assert.equal(f.has_profile, 1);
  assert.equal(f.has_twitter, 1);
  assert.equal(f.has_telegram, 1);
  assert.equal(f.dev_buy_sol, 1.5);
  const none = rs.attachContext({ ts: 1000 }, {});
  assert.equal(none.has_sec, 0);
});

test('mergeRiskFlags dedupes by code, radar first; toMemecoinSignal shape', () => {
  const radar = [{ code: 'UNVETTED', label: 'x', source: 'radar' }, { code: 'VERY_NEW', label: 'radar new' }];
  const mine = [{ code: 'VERY_NEW', label: 'mine' }, { code: 'LOW_LIQUIDITY', label: 'low' }];
  const merged = rs.mergeRiskFlags(radar, mine);
  assert.deepEqual(merged.map((x) => x.code), ['UNVETTED', 'VERY_NEW', 'LOW_LIQUIDITY']);
  assert.equal(merged[1].label, 'radar new');

  const r = rs.mapRadarSignal({ token: tok(), f: safe(), score: 50, nowSec: 1_800_000_000 });
  const s = rs.toMemecoinSignal(r, { riskFlags: mine });
  assert.equal(s.source, 'radar');
  assert.equal(s.mode, 'radar');
  assert.equal(s.level, 'ACTIVE');
  assert.deepEqual(s.riskFlags.map((x) => x.code), ['VERY_NEW', 'LOW_LIQUIDITY']);
});

test('disabled radar returns {enabled:false, reason} and never throws', () => {
  const prev = process.env.ENABLE_RADAR;
  delete process.env.ENABLE_RADAR;
  try {
    const l = rs.listSignals();
    assert.equal(l.enabled, false);
    assert.match(l.reason, /ENABLE_RADAR=true/);
    assert.equal(rs.getSignal('A'.repeat(44)).enabled, false);
    assert.equal(rs.lookupMany(['x']).size, 0);
  } finally { if (prev !== undefined) process.env.ENABLE_RADAR = prev; }
});
