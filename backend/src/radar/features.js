const { getRadarDb } = require('./db');

// All features for a row at time t use only snapshots with ts <= t of the SAME token (point-in-time).
// Models below are pure functions of these features, so any model can be replayed over stored history.

const MIN = 60;

function atOrBefore(series, i, targetTs, tolerance) {
  for (let j = i; j >= 0; j--) {
    if (series[j].ts <= targetTs) return targetTs - series[j].ts <= tolerance ? series[j] : null;
  }
  return null;
}

function stdev(xs) {
  if (xs.length < 3) return null;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

function rowFeatures(series, i, createdTs) {
  const r = series[i];
  const n5 = (r.buys_m5 ?? 0) + (r.sells_m5 ?? 0);
  const p15 = atOrBefore(series, i, r.ts - 15 * MIN, 3 * MIN);

  const rets = [];
  for (let j = i; j > 0 && series[j].ts >= r.ts - 30 * MIN; j--) {
    const a = series[j - 1].price_usd, b = series[j].price_usd;
    if (a > 0 && b > 0) rets.push(Math.log(b / a));
  }

  return {
    ts: r.ts,
    age_min: (r.ts - createdTs) / MIN,
    liquidity_usd: r.liquidity_usd,
    price_usd: r.price_usd,
    volume_accel: r.vol_h1 > 0 ? Math.min(r.vol_m5 / Math.max(r.vol_h1 / 12, 1), 50) : null,
    buy_pressure: n5 >= 5 ? r.buys_m5 / n5 : null,
    price_chg_15m: p15 && p15.price_usd > 0 ? r.price_usd / p15.price_usd - 1 : null,
    liq_delta_15m: p15 && p15.liquidity_usd > 0 ? r.liquidity_usd / p15.liquidity_usd - 1 : null,
    realized_vol_30m: stdev(rets),
  };
}

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const lin = (x, lo, hi) => (x === null || x === undefined ? 0 : clamp01((x - lo) / (hi - lo)));

// Each model = a named feature group, so the ablation (nested addition / leave-one-out) is just a different list here.
// v1 weights are a hand-set HYPOTHESIS, not fitted — they get refit on a validation window, never on test data.
const MODELS = {
  volume_only:   (f) => 100 * lin(Math.log1p(f.volume_accel ?? 0), Math.log1p(1), Math.log1p(10)),
  buy_only:      (f) => 100 * lin(f.buy_pressure, 0.5, 0.8),
  price_only:    (f) => 100 * lin(f.price_chg_15m, 0, 0.5),
  market_v1: (f) =>
    100 * (
      0.35 * lin(Math.log1p(f.volume_accel ?? 0), Math.log1p(1), Math.log1p(10)) +
      0.25 * lin(f.buy_pressure, 0.5, 0.8) +
      0.20 * lin(f.price_chg_15m, 0, 0.5) +
      0.10 * lin(f.liq_delta_15m, 0, 0.5) +
      0.10 * (1 - lin(f.realized_vol_30m, 0.05, 0.4))
    ),
};

// Tradeable universe: thin or brand-new pools can't be bought at the sizes we simulate.
const ELIGIBLE = { minLiquidity: 5000, minAgeMin: 15, maxAgeMin: 6 * 60 };

function isEligible(f) {
  return f.liquidity_usd >= ELIGIBLE.minLiquidity && f.age_min >= ELIGIBLE.minAgeMin && f.age_min <= ELIGIBLE.maxAgeMin;
}

// Load every token's snapshot series + computed features. Returns Map(pool -> {token, series, rows}).
function loadUniverse({ sinceTs = 0 } = {}) {
  const db = getRadarDb();
  const tokens = db.prepare('SELECT * FROM token WHERE pool_created_ts >= ?').all(sinceTs);
  const snapStmt = db.prepare('SELECT * FROM market_snapshot WHERE pool_address = ? ORDER BY ts');
  const out = new Map();
  for (const t of tokens) {
    const series = snapStmt.all(t.pool_address).filter((s) => s.price_usd > 0);
    if (series.length < 3) continue;
    const rows = series.map((_, i) => rowFeatures(series, i, t.pool_created_ts));
    out.set(t.pool_address, { token: t, series, rows });
  }
  return out;
}

module.exports = { MODELS, ELIGIBLE, isEligible, loadUniverse, rowFeatures };
