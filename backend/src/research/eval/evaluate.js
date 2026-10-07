// Pure evaluation functions: no DB, no clock, no I/O. Deterministic given opts.seed.
//
// A "pair" is { token_id, as_of_ts, score, forward_return, volume_5m? , dead? }.
//   forward_return is a fraction (0.3 = +30%) and is GROSS; costs are subtracted here.
//   "success" = (forward_return - cost) > successThreshold   (defaults: 30% net of 3% round trip)
//
// The verdict never claims a proven edge. Vocabulary:
//   INSUFFICIENT_DATA  not enough distinct tokens / signals / successes / top-bucket picks to judge
//   NO_EDGE            no statistically distinguishable advantage over base rate and baselines
//   POSSIBLE_EDGE      clears every gate (bootstrap p, lift, return excess, beats baselines, stable halves)
//   EDGE_NOT_STABLE    looked positive overall but fails or cannot confirm first/second-half stability

const DEFAULTS = {
  successThreshold: 0.30,   // X: required net return
  cost: 0.03,               // assumed round-trip cost (fees + slippage), subtracted from every return
  topFracs: [0.01, 0.05],   // score cutoffs reported
  primaryFrac: 0.05,        // cutoff used for the verdict
  bootstrapIters: 1000,
  randomIters: 500,
  alpha: 0.01,              // one-sided p-value gate on precision excess (strict: several gates, many looks)
  alphaReturn: 0.05,        // one-sided p-value gate on mean-net-return excess
  minLift: 1.5,
  minTokens: 30,
  minSignals: 150,
  minSuccesses: 10,
  minTopK: 8,               // picks in the primary bucket
  minHalfTopK: 3,
  dedupeGapSec: 0,          // keep at most one signal per token per this many seconds (0 = keep all)
  seed: 12345,
};

// ---------- small numeric helpers ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
const sortedCopy = (a) => a.slice().sort((x, y) => x - y);
const median = (a) => quantile(sortedCopy(a), 0.5);
const kFor = (frac, n) => Math.max(1, Math.ceil(frac * n));

/** Normalise and filter pairs, attach net return + success flag, optionally de-duplicate. */
function prepPairs(pairs, o) {
  let rows = [];
  for (const p of pairs || []) {
    const fr = Number(p.forward_return);
    const sc = Number(p.score);
    if (!Number.isFinite(fr) || !Number.isFinite(sc) || p.token_id == null) continue;
    const net = fr - o.cost;
    const v = p.volume_5m == null ? NaN : Number(p.volume_5m);
    rows.push({ token_id: p.token_id, ts: Number(p.as_of_ts) || 0, score: sc, fr, net,
      success: net > o.successThreshold ? 1 : 0, vol: Number.isFinite(v) ? v : null, dead: !!p.dead });
  }
  if (o.dedupeGapSec > 0) {
    rows.sort((a, b) => a.ts - b.ts);
    const lastKept = new Map();
    rows = rows.filter((r) => {
      const l = lastKept.get(r.token_id);
      if (l !== undefined && r.ts - l < o.dedupeGapSec) return false;
      lastKept.set(r.token_id, r.ts);
      return true;
    });
  }
  return rows;
}

// Top-k indices by key desc; ties broken by original order (deterministic, no hidden luck).
function topK(rows, key, k) {
  const idx = [];
  for (let i = 0; i < rows.length; i++) if (rows[i][key] != null) idx.push(i);
  idx.sort((a, b) => rows[b][key] - rows[a][key] || a - b);
  return idx.slice(0, k);
}

function bucketStats(rows, idx, totals) {
  const sel = idx.map((i) => rows[i]);
  const succ = sel.reduce((s, r) => s + r.success, 0);
  const nets = sel.map((r) => r.net);
  const sorted = sortedCopy(nets);
  const k = sel.length;
  const precision = k ? succ / k : null;
  return {
    k, successes: succ, precision,
    recall: totals.successes ? succ / totals.successes : null,
    lift: precision != null && totals.baseRate > 0 ? precision / totals.baseRate : null,
    meanNet: mean(nets),
    medianNet: quantile(sorted, 0.5),
    worstDecileNet: quantile(sorted, 0.1),
    deadShare: k ? sel.filter((r) => r.dead).length / k : null,
  };
}

function totalsOf(rows) {
  const n = rows.length;
  const successes = rows.reduce((s, r) => s + r.success, 0);
  const nets = rows.map((r) => r.net);
  return { n, successes, baseRate: n ? successes / n : 0, meanNet: mean(nets) };
}

// precision & mean-net excess of the score top-k bucket (statistic used for bootstrap/halves)
function excessStats(rows, frac) {
  const t = totalsOf(rows);
  if (!t.n) return { precEx: null, retEx: null, k: 0, ...t };
  const k = kFor(frac, t.n);
  const idx = topK(rows, 'score', k);
  const b = bucketStats(rows, idx, t);
  return { precEx: b.precision - t.baseRate, retEx: b.meanNet - t.meanNet, k, precision: b.precision, ...t };
}

function groupByToken(rows) {
  const m = new Map();
  rows.forEach((r) => {
    if (!m.has(r.token_id)) m.set(r.token_id, []);
    m.get(r.token_id).push(r);
  });
  return [...m.values()];
}

function percentileCI(vals, lo = 0.025, hi = 0.975) {
  const s = sortedCopy(vals);
  return [quantile(s, lo), quantile(s, hi)];
}

/**
 * Token-level (block) bootstrap: resample WHOLE TOKENS with replacement, keeping all of a token's
 * signals together, then recompute the statistics (including re-selecting the top bucket).
 * p-value = one-sided P(statistic <= 0) across replicates (+1 smoothing); approximate, not exact.
 */
function tokenBootstrap(rows, o, rng) {
  const groups = groupByToken(rows);
  const G = groups.length;
  const prec = [], ret = [], dVol = [];
  for (let b = 0; b < o.bootstrapIters; b++) {
    const sample = [];
    for (let g = 0; g < G; g++) {
      const grp = groups[Math.floor(rng() * G)];
      for (const r of grp) sample.push(r);
    }
    const st = excessStats(sample, o.primaryFrac);
    prec.push(st.precEx);
    ret.push(st.retEx);
    if (o._hasVolume) {
      const t = totalsOf(sample);
      const k = kFor(o.primaryFrac, t.n);
      const vi = topK(sample, 'vol', k);
      const vb = bucketStats(sample, vi, t);
      dVol.push(st.precision - vb.precision);
    }
  }
  const summarize = (arr, est) => {
    const [lo, hi] = percentileCI(arr);
    const p = (arr.filter((x) => x <= 0).length + 1) / (arr.length + 1);
    return { estimate: est, ci95: [lo, hi], pValue: p };
  };
  return { prec, ret, dVol, summarize };
}

function splitHalves(rows) {
  if (rows.length < 2) return [rows, []];
  const ts = rows.map((r) => r.ts).sort((a, b) => a - b);
  const cut = ts[Math.floor(ts.length / 2)];
  const first = rows.filter((r) => r.ts < cut);
  const second = rows.filter((r) => r.ts >= cut);
  return [first, second];
}

/**
 * evaluate(pairs, opts) -> full report object (see fields below). Pure.
 */
function evaluate(pairs, userOpts = {}) {
  const o = { ...DEFAULTS, ...userOpts };
  const rows = prepPairs(pairs, o);
  const totals = totalsOf(rows);
  const nTokens = new Set(rows.map((r) => r.token_id)).size;
  const warnings = [];
  const reasons = [];
  const hasVolume = rows.filter((r) => r.vol != null).length >= 0.5 * rows.length && rows.length > 0;
  o._hasVolume = hasVolume;

  const result = {
    verdict: 'INSUFFICIENT_DATA', reasons, warnings,
    config: { successThreshold: o.successThreshold, cost: o.cost, topFracs: o.topFracs,
      primaryFrac: o.primaryFrac, alpha: o.alpha, minLift: o.minLift, bootstrapIters: o.bootstrapIters,
      minTokens: o.minTokens, minSignals: o.minSignals, minSuccesses: o.minSuccesses, minTopK: o.minTopK,
      dedupeGapSec: o.dedupeGapSec },
    n: totals.n, nTokens, successes: totals.successes, baseRate: totals.baseRate,
    returns: null, cutoffs: {}, bootstrap: null, baselines: null, stability: null,
  };

  if (rows.length) {
    const nets = sortedCopy(rows.map((r) => r.net));
    const w = Math.max(1, Math.floor(nets.length * 0.1));
    result.returns = {
      meanNet: mean(nets), medianNet: quantile(nets, 0.5), worstDecileNet: quantile(nets, 0.1),
      worstDecileMeanNet: mean(nets.slice(0, w)), bestDecileNet: quantile(nets, 0.9),
      deadShare: rows.filter((r) => r.dead).length / rows.length,
    };
    for (const f of o.topFracs) {
      const k = kFor(f, rows.length);
      const b = bucketStats(rows, topK(rows, 'score', k), totals);
      b.frac = f;
      if (k < o.minTopK) b.warning = `only ${k} picks in this bucket - too few to trust`;
      result.cutoffs[String(f)] = b;
    }
    if (result.returns.deadShare > 0.2) {
      warnings.push(`${(result.returns.deadShare * 100).toFixed(0)}% of outcomes are 'dead' (-100%). Results lean heavily on the survivorship rule.`);
    }
  }

  // ---- sample-size gates: refuse a verdict ----
  const kPrimary = rows.length ? kFor(o.primaryFrac, rows.length) : 0;
  if (nTokens < o.minTokens) reasons.push(`only ${nTokens} distinct tokens (need ${o.minTokens})`);
  if (totals.n < o.minSignals) reasons.push(`only ${totals.n} signals with outcomes (need ${o.minSignals})`);
  if (totals.successes < o.minSuccesses) reasons.push(`only ${totals.successes} successes overall (need ${o.minSuccesses}); success is rare so precision is unmeasurable`);
  if (kPrimary < o.minTopK) reasons.push(`top ${(o.primaryFrac * 100).toFixed(0)}% bucket holds only ${kPrimary} picks (need ${o.minTopK})`);
  if (reasons.length) {
    warnings.unshift('Sample too small to call a verdict.');
    return result;
  }
  if (totals.n > 0 && nTokens < totals.n / 20) {
    warnings.push(`signals are concentrated: ${totals.n} signals from ${nTokens} tokens. Effective sample is closer to the token count.`);
  }

  // ---- baselines ----
  const rng = mulberry32(o.seed);
  const k = kPrimary;
  const primary = result.cutoffs[String(o.primaryFrac)] || bucketStats(rows, topK(rows, 'score', k), totals);
  const rndPrec = [], rndRet = [];
  for (let it = 0; it < o.randomIters; it++) {
    let s = 0, r = 0;
    for (let j = 0; j < k; j++) {
      const row = rows[Math.floor(rng() * rows.length)];
      s += row.success; r += row.net;
    }
    rndPrec.push(s / k); rndRet.push(r / k);
  }
  const rp = sortedCopy(rndPrec);
  const baselines = {
    random: {
      k, iterations: o.randomIters, expectedPrecision: totals.baseRate,
      precisionP95: quantile(rp, 0.95), meanNet: mean(rndRet),
      signalPercentile: rp.filter((x) => x < primary.precision).length / rp.length,
    },
    volume5m: null,
  };
  let beatsVolume = true;
  if (hasVolume) {
    const vb = bucketStats(rows, topK(rows, 'vol', k), totals);
    baselines.volume5m = { k, precision: vb.precision, lift: vb.lift, meanNet: vb.meanNet,
      recall: vb.recall, worstDecileNet: vb.worstDecileNet };
    beatsVolume = primary.precision > vb.precision && primary.meanNet >= vb.meanNet;
  } else {
    warnings.push('volume_5m missing for most signals: the "highest 5m volume" baseline could not be computed.');
  }
  result.baselines = baselines;

  // ---- token-level bootstrap on the primary bucket ----
  const est = excessStats(rows, o.primaryFrac);
  const bs = tokenBootstrap(rows, o, rng);
  result.bootstrap = {
    iterations: o.bootstrapIters, unit: 'token',
    precisionExcess: bs.summarize(bs.prec, est.precEx),
    meanNetExcess: bs.summarize(bs.ret, est.retEx),
    vsVolumeBaseline: hasVolume
      ? bs.summarize(bs.dVol, primary.precision - baselines.volume5m.precision) : null,
  };

  // ---- stability: first vs second half by time ----
  const [h1, h2] = splitHalves(rows);
  const half = (hr) => {
    const s = excessStats(hr, o.primaryFrac);
    return { n: hr.length, nTokens: new Set(hr.map((r) => r.token_id)).size, baseRate: s.baseRate,
      precision: s.precision ?? null, precisionExcess: s.precEx, meanNetExcess: s.retEx, k: s.k,
      ok: s.k >= o.minHalfTopK && s.successes >= 1 };
  };
  const a = half(h1), b = half(h2);
  const halvesPositive = a.ok && b.ok
    && a.precisionExcess > 0 && b.precisionExcess > 0 && a.meanNetExcess > 0 && b.meanNetExcess > 0;
  result.stability = { firstHalf: a, secondHalf: b, stable: halvesPositive };

  // ---- verdict ----
  const pe = result.bootstrap.precisionExcess, re = result.bootstrap.meanNetExcess;
  const gates = {
    precisionSignificant: pe.estimate > 0 && pe.pValue < o.alpha,
    liftOk: primary.lift != null && primary.lift >= o.minLift,
    returnExcessOk: re.estimate > 0 && re.pValue < o.alphaReturn,
    beatsRandom: primary.precision > baselines.random.precisionP95,
    beatsVolume,
  };
  result.gates = gates;
  const overall = Object.values(gates).every(Boolean);
  if (overall && halvesPositive) {
    result.verdict = 'POSSIBLE_EDGE';
    reasons.push('Top-bucket picks beat base rate, the random and volume baselines, and held in both halves of the data.');
    warnings.push('POSSIBLE_EDGE is not proof: one backtest window, selection effects, and survivorship assumptions remain. Re-check on fresh data.');
  } else if (overall) {
    result.verdict = 'EDGE_NOT_STABLE';
    reasons.push(a.ok && b.ok
      ? 'Positive overall but the advantage does not appear in both halves of the data.'
      : 'Positive overall but a half of the data has too few picks to confirm stability.');
  } else {
    result.verdict = 'NO_EDGE';
    const failed = Object.entries(gates).filter(([, v]) => !v).map(([kk]) => kk);
    reasons.push(`No distinguishable edge (failed: ${failed.join(', ')}).`);
  }
  if (primary.k < 30) warnings.push(`Top bucket has only ${primary.k} picks; confidence intervals are wide.`);
  return result;
}

module.exports = { evaluate, prepPairs, mulberry32, quantile, mean, median, DEFAULTS };
