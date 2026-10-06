const { getRadarDb } = require('./db');

// POINT-IN-TIME RULE: a feature for the row at time t may only use data with ts <= t (cross-sectional features use the
// previous completed 5-minute bucket, security features use the latest check with ts <= t, creator history only counts
// earlier tokens already resolved by t). Models are pure functions of these features, so any model can be replayed
// over stored history and ablated by changing its feature list.

const FEATURE_VERSION = 2;
const MIN = 60;
const BUCKET = 300;
const GRADUATION_FDV = 69000;        // approx pump.fun curve completion market cap (USD)
const CREATOR_RESOLVE_SECONDS = 6 * 3600;

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

const ratio = (a, b) => (a > 0 && b > 0 ? a / b - 1 : null);

// Market features for one snapshot row. `peak` = running max price up to and including row i (precomputed).
function marketFeatures(series, i, token, peak) {
  const r = series[i];
  const n5 = (r.buys_m5 ?? 0) + (r.sells_m5 ?? 0);
  const nh = (r.buys_h1 ?? 0) + (r.sells_h1 ?? 0);
  const p5 = atOrBefore(series, i, r.ts - 5 * MIN, 2 * MIN);
  const p15 = atOrBefore(series, i, r.ts - 15 * MIN, 3 * MIN);
  const p60 = atOrBefore(series, i, r.ts - 60 * MIN, 8 * MIN);

  const rets = [];
  for (let j = i; j > 0 && series[j].ts >= r.ts - 30 * MIN; j--) {
    const a = series[j - 1].price_usd, b = series[j].price_usd;
    if (a > 0 && b > 0) rets.push(Math.log(b / a));
  }
  let streak = 0;
  for (let j = i; j > 0 && streak < 10 && series[j].price_usd > series[j - 1].price_usd; j--) streak++;

  const onCurve = r.liq_estimated === 1;
  const migrated = token.migrated_ts && r.ts >= token.migrated_ts ? 1 : 0;

  return {
    ts: r.ts,
    age_min: (r.ts - token.pool_created_ts) / MIN,
    liquidity_usd: r.liquidity_usd,
    price_usd: r.price_usd,
    fdv: r.fdv,
    volume_accel: r.vol_h1 > 0 ? Math.min(r.vol_m5 / Math.max(r.vol_h1 / 12, 1), 50) : null,
    vol_trend: p15 && p15.vol_m5 > 0 ? Math.min(r.vol_m5 / p15.vol_m5, 20) : null,
    txn_accel: nh >= 12 ? Math.min(n5 / (nh / 12), 30) : null,
    buy_pressure: n5 >= 5 ? r.buys_m5 / n5 : null,
    buy_pressure_h1: nh >= 20 ? r.buys_h1 / nh : null,
    avg_trade_usd: n5 > 0 ? r.vol_m5 / n5 : null,
    turnover: r.liquidity_usd > 0 ? r.vol_h1 / r.liquidity_usd : null,
    price_chg_5m: p5 ? ratio(r.price_usd, p5.price_usd) : null,
    price_chg_15m: p15 ? ratio(r.price_usd, p15.price_usd) : null,
    price_chg_60m: p60 ? ratio(r.price_usd, p60.price_usd) : null,
    liq_delta_15m: p15 ? ratio(r.liquidity_usd, p15.liquidity_usd) : null,
    realized_vol_30m: stdev(rets),
    drawdown_from_peak: peak.price > 0 ? r.price_usd / peak.price - 1 : null,
    mins_since_peak: (r.ts - peak.ts) / MIN,
    up_streak: streak,
    curve_progress: onCurve && r.fdv > 0 ? Math.min(r.fdv / GRADUATION_FDV, 1.5) : null,
    migrated,
    mins_since_migration: migrated ? (r.ts - token.migrated_ts) / MIN : null,
  };
}

const SEC_FIELDS = ['top1_pct_ex', 'top10_pct_ex', 'creator_pct', 'insider_pct', 'mint_auth', 'freeze_auth', 'rc_score',
  'danger_count', 'holders', 'lp_locked_pct', 'rugged', 'creator_prev_count', 'creator_prev_dead_share'];

function attachSecurity(rows, secRows) {
  let k = -1;
  for (const f of rows) {
    while (k + 1 < secRows.length && secRows[k + 1].ts <= f.ts) k++;
    const s = k >= 0 ? secRows[k] : null;
    f.has_sec = s ? 1 : 0;
    f.sec_age_min = s ? (f.ts - s.ts) / MIN : null;
    for (const key of SEC_FIELDS) f[key] = s ? s[key] : null;
  }
}

// Did this token end up a rug within its first 6h? Used ONLY for creator history of earlier tokens, and only
// counted once resolved (created+6h, or when it died), so it never uses outcomes unknown at decision time.
function resolveOutcome(token, series) {
  const horizon = token.pool_created_ts + CREATOR_RESOLVE_SECONDS;
  const inWindow = series.filter((s) => s.ts <= horizon);
  if (!inWindow.length) return null;
  const peak = Math.max(...inWindow.map((s) => s.price_usd));
  const last = inWindow[inWindow.length - 1].price_usd;
  const dead = token.dead_ts && token.dead_ts <= horizon;
  if (dead) return { resolvedTs: token.dead_ts, rug: token.dead_reason === 'gone' || last / peak < 0.1 };
  if (series[series.length - 1].ts < horizon) return null;   // not enough history yet — unknown, not "fine"
  return { resolvedTs: horizon, rug: last / peak < 0.1 };
}

function attachCreatorHistory(universe) {
  const byCreator = new Map();
  for (const u of universe.values()) {
    u.outcome = resolveOutcome(u.token, u.series);
    if (!u.token.creator) continue;
    if (!byCreator.has(u.token.creator)) byCreator.set(u.token.creator, []);
    byCreator.get(u.token.creator).push(u);
  }
  for (const u of universe.values()) {
    const sibs = u.token.creator ? byCreator.get(u.token.creator).filter((s) => s !== u && s.token.pool_created_ts < u.token.pool_created_ts && s.outcome) : [];
    for (const f of u.rows) {
      const done = sibs.filter((s) => s.outcome.resolvedTs <= f.ts);
      f.creator_seen_resolved = done.length;
      f.creator_rug_rate_own = done.length ? done.filter((s) => s.outcome.rug).length / done.length : null;
    }
  }
}

// Cross-sectional context from the PREVIOUS completed bucket only: relative strength vs other new tokens, and
// market-wide regime (is the whole memecoin tape hot or dead right now?).
function attachCrossSection(universe) {
  const buckets = new Map();
  for (const u of universe.values()) {
    for (const f of u.rows) {
      const b = Math.floor(f.ts / BUCKET);
      if (!buckets.has(b)) buckets.set(b, { va: [], bp: [] });
      const x = buckets.get(b);
      if (f.volume_accel !== null) x.va.push(f.volume_accel);
      if (f.buy_pressure !== null) x.bp.push(f.buy_pressure);
    }
  }
  for (const x of buckets.values()) { x.va.sort((a, b) => a - b); x.bp.sort((a, b) => a - b); }
  const median = (a) => (a.length ? a[a.length >> 1] : null);
  const rank = (sorted, v) => {
    if (!sorted.length || v === null) return null;
    let lo = 0, hi = sorted.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] <= v) lo = m + 1; else hi = m; }
    return lo / sorted.length;
  };
  for (const u of universe.values()) {
    for (const f of u.rows) {
      const prev = buckets.get(Math.floor(f.ts / BUCKET) - 1);
      f.rank_vol_accel = prev ? rank(prev.va, f.volume_accel) : null;
      f.mkt_buy_pressure = prev ? median(prev.bp) : null;
      f.mkt_activity = prev ? prev.va.length : null;
    }
  }
}

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const lin = (x, lo, hi) => (x === null || x === undefined ? 0 : clamp01((x - lo) / (hi - lo)));
const logVol = (f) => lin(Math.log1p(f.volume_accel ?? 0), Math.log1p(1), Math.log1p(10));

// Hard safety gate. Unknown (not yet vetted) counts as unsafe: we would not buy blind, so the replay can't either.
function isSafe(f) {
  return f.has_sec === 1 && !f.mint_auth && !f.freeze_auth && !f.rugged &&
    (f.top10_pct_ex ?? 100) < 60 && (f.top1_pct_ex ?? 100) < 35 && (f.creator_pct ?? 0) < 20 &&
    (f.insider_pct ?? 0) < 25 && (f.creator_prev_dead_share ?? 0) < 0.8 && (f.creator_rug_rate_own ?? 0) < 0.6;
}

// Each model = a named feature group, so ablation (nested addition / leave-one-out) is just a different function here.
// Hand-set weights are a HYPOTHESIS, not fitted; the fitted model (fit.js) is trained on past data and judged on future data.
const MODELS = {
  volume_only: (f) => 100 * logVol(f),
  buy_only:    (f) => 100 * lin(f.buy_pressure, 0.5, 0.8),
  price_only:  (f) => 100 * lin(f.price_chg_15m, 0, 0.5),
  market_v1: (f) =>
    100 * (0.35 * logVol(f) + 0.25 * lin(f.buy_pressure, 0.5, 0.8) + 0.20 * lin(f.price_chg_15m, 0, 0.5) +
      0.10 * lin(f.liq_delta_15m, 0, 0.5) + 0.10 * (1 - lin(f.realized_vol_30m, 0.05, 0.4))),
  // v2 adds: relative strength vs the cohort, transaction acceleration, "don't chase" (penalise already-extended moves),
  // curve position (tokens climbing toward graduation attract buyers), and the market regime.
  market_v2: (f) => {
    const chase = lin(f.price_chg_15m, 1.0, 4.0);           // already up 100–400%: late
    const base = 0.25 * logVol(f) + 0.15 * lin(f.rank_vol_accel, 0.7, 1) + 0.15 * lin(f.buy_pressure, 0.5, 0.8) +
      0.10 * lin(f.txn_accel, 1, 6) + 0.10 * lin(f.price_chg_15m, 0, 0.6) + 0.10 * lin(f.curve_progress, 0.15, 0.8) +
      0.05 * lin(f.mkt_buy_pressure, 0.45, 0.6) + 0.10 * (1 - lin(f.realized_vol_30m, 0.05, 0.4));
    return 100 * base * (1 - 0.6 * chase) * (1 + Math.min(0, f.drawdown_from_peak ?? 0) * 0.5);
  },
  market_v1_safe: (f) => (isSafe(f) ? MODELS.market_v1(f) : 0),
  market_v2_safe: (f) => (isSafe(f) ? MODELS.market_v2(f) : 0),
  // Diagnostic: how "clean" a token is, with NO momentum. Shows what the filters alone contribute.
  sec_only: (f) => (f.has_sec !== 1 ? 0 : isSafe(f) ? 100 * (1 - 0.01 * (f.rc_score ?? 50)) : 0),
};

// v2 mixes more terms and penalises already-extended moves, so its attainable ceiling for an EARLY setup is lower than
// v1's. Per-model cutoffs are fixed constants written down before any real-data run, never tuned on results.
const MODEL_THRESHOLD = { market_v2: 55, market_v2_safe: 55 };

// Tradeable universe: thin or brand-new pools can't be bought at the sizes we simulate.
const ELIGIBLE = { minLiquidity: 5000, minAgeMin: 15, maxAgeMin: 6 * 60 };

function isEligible(f) {
  return f.liquidity_usd >= ELIGIBLE.minLiquidity && f.age_min >= ELIGIBLE.minAgeMin && f.age_min <= ELIGIBLE.maxAgeMin;
}

// Load every token's snapshot series + point-in-time features. Market features come from the cache when present.
function loadUniverse({ sinceTs = 0 } = {}) {
  const db = getRadarDb();
  const tokens = db.prepare('SELECT * FROM token WHERE pool_created_ts >= ?').all(sinceTs);
  const snapStmt = db.prepare('SELECT * FROM market_snapshot WHERE token_address = ? ORDER BY ts');
  const cacheStmt = db.prepare('SELECT ts, json FROM feature_snapshot WHERE token_address = ? AND version = ?');
  const putCache = db.prepare('INSERT OR REPLACE INTO feature_snapshot (token_address, ts, version, json) VALUES (?, ?, ?, ?)');
  const secStmt = db.prepare('SELECT * FROM token_security WHERE token_address = ? ORDER BY ts');
  const out = new Map();

  for (const t of tokens) {
    const series = snapStmt.all(t.token_address).filter((s) => s.price_usd > 0);
    if (series.length < 3) continue;
    const cached = new Map(cacheStmt.all(t.token_address, FEATURE_VERSION).map((c) => [c.ts, c.json]));
    const fresh = [];
    let peak = { price: 0, ts: series[0].ts };
    const rows = series.map((s, i) => {
      if (s.price_usd >= peak.price) peak = { price: s.price_usd, ts: s.ts };
      const hit = cached.get(s.ts);
      if (hit) return JSON.parse(hit);
      const f = marketFeatures(series, i, t, peak);
      fresh.push(f);
      return f;
    });
    if (fresh.length) db.transaction(() => { for (const f of fresh) putCache.run(t.token_address, f.ts, FEATURE_VERSION, JSON.stringify(f)); })();
    attachSecurity(rows, secStmt.all(t.token_address));
    out.set(t.token_address, { token: t, series, rows });
  }
  attachCreatorHistory(out);
  attachCrossSection(out);
  return out;
}

module.exports = { MODELS, MODEL_THRESHOLD, ELIGIBLE, FEATURE_VERSION, isEligible, isSafe, loadUniverse, marketFeatures };
