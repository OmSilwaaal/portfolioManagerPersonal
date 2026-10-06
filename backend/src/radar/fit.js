const { isEligible } = require('./features');
const { execute, DEFAULTS } = require('./simulator');

// Walk-forward logistic regression. Train on the past, pick the firing threshold on a later validation slice, and let
// the report judge it only on a still-later TEST slice. An embargo between slices stops a token's multi-hour outcome
// window from straddling a boundary (the classic time-series leakage). Hand-set models never see any of this.

const NUMERIC = ['volume_accel', 'vol_trend', 'txn_accel', 'buy_pressure', 'buy_pressure_h1', 'avg_trade_usd', 'turnover',
  'price_chg_5m', 'price_chg_15m', 'price_chg_60m', 'liq_delta_15m', 'realized_vol_30m', 'drawdown_from_peak',
  'mins_since_peak', 'up_streak', 'curve_progress', 'age_min', 'liquidity_usd', 'rank_vol_accel', 'mkt_buy_pressure',
  'mkt_activity', 'top10_pct_ex', 'top1_pct_ex', 'creator_pct', 'insider_pct', 'rc_score', 'danger_count',
  'creator_prev_dead_share', 'creator_rug_rate_own'];
const BINARY = ['has_sec', 'mint_auth', 'freeze_auth', 'migrated'];
const INTERACTIONS = [['volume_accel', 'buy_pressure'], ['price_chg_15m', 'volume_accel'], ['rank_vol_accel', 'txn_accel']];

const EMBARGO_SEC = 8 * 3600;
const STRIDE_SEC = 300;            // one training row per token per 5 min: consecutive minutes are near-duplicates
const slog = (x) => Math.sign(x) * Math.log1p(Math.abs(x));
const sigmoid = (z) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));

function rawVector(f) {
  const v = NUMERIC.map((k) => (f[k] === null || f[k] === undefined ? null : slog(f[k])));
  const inter = INTERACTIONS.map(([a, b]) => (f[a] == null || f[b] == null ? null : slog(f[a]) * slog(f[b])));
  const bin = BINARY.map((k) => (f[k] ? 1 : 0));
  return { v: [...v, ...inter], bin, onCurve: f.curve_progress != null ? 1 : 0 };
}

function splitTokens(universe) {
  const toks = [...universe.values()].map((u) => u.token.pool_created_ts).sort((a, b) => a - b);
  if (toks.length < 40) return null;
  return { t1: toks[Math.floor(toks.length * 0.5)], t2: toks[Math.floor(toks.length * 0.75)] };
}

function labelledRows(universe, pick, opt) {
  const out = [];
  for (const u of universe.values()) {
    if (!pick(u.token)) continue;
    let lastBucket = -1;
    for (const f of u.rows) {
      if (!isEligible(f)) continue;
      const b = Math.floor(f.ts / STRIDE_SEC);
      if (b === lastBucket) continue;
      lastBucket = b;
      const res = execute(u.token, u.series, f, opt, { type: 'horizon', minutes: 60 });
      if (res.status !== 'ok') continue;
      out.push({ f, y: res.ret > 0 ? 1 : 0, ret: res.ret, token: u.token.token_address });
    }
  }
  return out;
}

function fitModel(universe, overrides = {}) {
  const opt = { ...DEFAULTS, ...overrides };
  const cut = splitTokens(universe);
  if (!cut) return { status: 'insufficient_data', reason: 'need at least ~40 tokens with history' };
  const { t1, t2 } = cut;

  const train = labelledRows(universe, (t) => t.pool_created_ts < t1 - EMBARGO_SEC, opt);
  const val = labelledRows(universe, (t) => t.pool_created_ts >= t1 && t.pool_created_ts < t2 - EMBARGO_SEC, opt);
  const pos = train.filter((r) => r.y).length;
  if (train.length < 300 || val.length < 100 || pos < 15 || train.length - pos < 15) {
    return { status: 'insufficient_data', reason: `train rows=${train.length} (wins=${pos}), val rows=${val.length}; need ≥300/≥15 wins/≥100` };
  }

  // Standardise on TRAIN only. Missing → 0 after standardising (= "average"), plus an explicit missing flag per column.
  const raw = train.map((r) => rawVector(r.f));
  const dim = raw[0].v.length;
  const mu = new Array(dim).fill(0), sd = new Array(dim).fill(1), missRate = new Array(dim).fill(0);
  for (let j = 0; j < dim; j++) {
    const xs = raw.map((r) => r.v[j]).filter((x) => x !== null);
    missRate[j] = 1 - xs.length / raw.length;
    if (xs.length > 1) {
      mu[j] = xs.reduce((a, b) => a + b, 0) / xs.length;
      sd[j] = Math.sqrt(xs.reduce((a, b) => a + (b - mu[j]) ** 2, 0) / (xs.length - 1));
      if (!(sd[j] > 1e-9)) sd[j] = 1;   // near-constant column: don't amplify float noise
    }
  }
  const flagCols = missRate.map((m, j) => (m > 0.05 ? j : -1)).filter((j) => j >= 0);
  const names = [...NUMERIC, ...INTERACTIONS.map(([a, b]) => `${a}*${b}`), ...BINARY, 'on_curve', ...flagCols.map((j) => `missing:${j < NUMERIC.length ? NUMERIC[j] : 'interaction' + (j - NUMERIC.length)}`)];

  const vectorize = (f) => {
    const { v, bin, onCurve } = rawVector(f);
    return [...v.map((x, j) => (x === null ? 0 : (x - mu[j]) / sd[j])), ...bin, onCurve, ...flagCols.map((j) => (v[j] === null ? 1 : 0))];
  };

  const X = train.map((r) => vectorize(r.f));
  const y = train.map((r) => r.y);
  const w = new Array(X[0].length).fill(0);
  let b = Math.log(pos / (train.length - pos));
  // Balanced class weights so a ~20% win rate doesn't collapse the model to "always predict loss".
  const wPos = train.length / (2 * pos), wNeg = train.length / (2 * (train.length - pos));
  const L2 = 0.002, LR = 0.6;
  for (let it = 0; it < 600; it++) {
    const g = new Array(w.length).fill(0);
    let gb = 0;
    for (let i = 0; i < X.length; i++) {
      let z = b;
      for (let j = 0; j < w.length; j++) z += w[j] * X[i][j];
      const err = (sigmoid(z) - y[i]) * (y[i] ? wPos : wNeg);
      for (let j = 0; j < w.length; j++) g[j] += err * X[i][j];
      gb += err;
    }
    for (let j = 0; j < w.length; j++) w[j] -= LR * (g[j] / X.length + L2 * w[j]);
    b -= LR * (gb / X.length);
  }

  const score = (f) => {
    const x = vectorize(f);
    let z = b;
    for (let j = 0; j < w.length; j++) z += w[j] * x[j];
    return 100 * sigmoid(z);
  };

  // Threshold from VALIDATION only. Real signals are rare, so a fixed "top 5%" can be mostly noise. Pick, from a small
  // fixed grid of quantiles, the cutoff with the best validation mean net return minus one standard error (a mild
  // guard against picking a lucky tiny bucket). The TEST slice is never consulted.
  const scored = val.map((r) => ({ s: score(r.f), r })).sort((a, c) => a.s - c.s);
  const baseWin = val.filter((r) => r.y).length / val.length;
  let best = null;
  for (const q of [0.9, 0.95, 0.98, 0.99, 0.995, 0.998]) {
    const cut = scored[Math.floor(scored.length * q)].s;
    const sel = scored.filter((x) => x.s >= cut).map((x) => x.r);
    if (sel.length < 20) continue;
    const m = sel.reduce((a, r) => a + r.ret, 0) / sel.length;
    const se = Math.sqrt(sel.reduce((a, r) => a + (r.ret - m) ** 2, 0) / (sel.length - 1)) / Math.sqrt(sel.length);
    const obj = m - se;
    if (!best || obj > best.obj) best = { q, cut, sel, m, obj };
  }
  if (!best) return { status: 'insufficient_data', reason: 'validation slice too small to choose a cutoff' };
  const threshold = best.cut;
  const topWin = best.sel.filter((r) => r.y).length / best.sel.length;

  return {
    status: 'ok', score, threshold, testFromTs: t2,
    meta: {
      trainRows: train.length, valRows: val.length, trainWinRate: pos / train.length,
      valBaseWinRate: baseWin, valTopBucketWinRate: topWin, valLift: topWin && baseWin ? topWin / baseWin : null,
      valTopBucketMeanRet: best.m, valChosenQuantile: best.q, valTopBucketRows: best.sel.length,
      splitTimes: { trainBefore: t1 - EMBARGO_SEC, valBefore: t2 - EMBARGO_SEC, testFrom: t2 },
      topWeights: names.map((n, j) => [n, +w[j].toFixed(3)]).sort((a, c) => Math.abs(c[1]) - Math.abs(a[1])).slice(0, 10),
    },
  };
}

module.exports = { fitModel };
