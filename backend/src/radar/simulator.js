const { MODELS, isEligible } = require('./features');

// Paper-trade assumptions. Stated up front so they can't be tuned to flatter results.
const DEFAULTS = {
  sizeUsd: 100,          // position size
  latencySec: 45,        // delay between signal and fill (detect → decide → send → land)
  feePct: 0.01,          // per side (pump.fun 1%; Raydium ~0.25%) — conservative end
  fixedCostUsd: 0.5,     // priority fee + tip per round trip
  threshold: 70,         // absolute score cutoff (fixed, NOT a quantile of future data)
  maxEntryGapSec: 300,   // skip if no snapshot within 5 min after the latency delay
  tp: 1.0,               // take-profit for the 'tpsl' strategy: +100% mark-to-market
  sl: -0.5,              // stop-loss: -50% mark-to-market
  tpslMaxMin: 120,       // 'tpsl' gives up and exits at market after this long
};

// Constant-product impact: pool quote-side reserve ≈ liquidity_usd / 2.
function buyTokensUsd(spend, liqUsd, feePct) {
  const s = spend * (1 - feePct);
  return s / (1 + s / (liqUsd / 2));            // USD value of tokens at the pre-trade price
}
function sellProceeds(valueUsd, liqUsd, feePct) {
  const out = valueUsd * (liqUsd / 2) / (liqUsd / 2 + valueUsd);
  return out * (1 - feePct);
}

function firstAtOrAfter(series, ts) {
  let lo = 0, hi = series.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (series[mid].ts < ts) lo = mid + 1; else hi = mid; }
  return lo < series.length ? lo : -1;
}

// Net return for one round trip including slippage on both legs, fees and fixed costs. Floors at -100%.
function roundTrip(entry, exitSnap, opt) {
  const tokensValueAtEntryPrice = buyTokensUsd(opt.sizeUsd, entry.liquidity_usd, opt.feePct);
  const tokens = tokensValueAtEntryPrice / entry.price_usd;
  const valueAtExit = tokens * exitSnap.price_usd;
  const proceeds = sellProceeds(valueAtExit, Math.max(exitSnap.liquidity_usd || 0, 1), opt.feePct) - opt.fixedCostUsd;
  return Math.max(proceeds / opt.sizeUsd - 1, -1);
}

// Strategy: {type:'horizon', minutes} sells at a fixed time; {type:'tpsl'} sells at the first snapshot that shows
// +tp / -sl (a coarse-sampled stop fills at the NEXT observed price, which is realistically worse than the trigger).
function execute(token, series, f, opt, strategy, nowTs) {
  const ei = firstAtOrAfter(series, f.ts + opt.latencySec);
  if (ei < 0 || series[ei].ts - (f.ts + opt.latencySec) > opt.maxEntryGapSec) return { status: 'skipped' };
  const entry = series[ei];
  const horizonMin = strategy.type === 'tpsl' ? opt.tpslMaxMin : strategy.minutes;
  const exitTs = entry.ts + horizonMin * 60;
  const last = series[series.length - 1];

  // Token died before we could exit: 'gone' = pool/pairs vanished (rug) → total loss;
  // 'inactive' = liquidity/volume dried up → sell into whatever the last observed pool offered.
  const diedFirst = token.dead_ts && token.dead_ts <= exitTs + 15 * 60;
  const settleDead = () => (token.dead_reason === 'gone' ? { status: 'ok', entry, exit: last, ret: -1, how: 'gone' }
    : { status: 'ok', entry, exit: last, ret: roundTrip(entry, last, opt), how: 'inactive' });

  if (strategy.type === 'tpsl') {
    for (let j = ei + 1; j < series.length && series[j].ts <= exitTs + 15 * 60; j++) {
      const mtm = series[j].price_usd / entry.price_usd - 1;
      if (mtm >= opt.tp) return { status: 'ok', entry, exit: series[j], ret: roundTrip(entry, series[j], opt), how: 'tp' };
      if (mtm <= opt.sl) return { status: 'ok', entry, exit: series[j], ret: roundTrip(entry, series[j], opt), how: 'sl' };
    }
  }
  const xi = firstAtOrAfter(series, exitTs);
  if (xi >= 0 && series[xi].ts - exitTs <= 15 * 60) {
    return { status: 'ok', entry, exit: series[xi], ret: roundTrip(entry, series[xi], opt), how: 'time' };
  }
  if (diedFirst) return settleDead();
  return { status: 'censored' };                      // exit hasn't happened yet — never counted
}

function maxFavourable(series, entry, windowMin) {
  let best = 0, first30 = null;
  for (const s of series) {
    if (s.ts <= entry.ts) continue;
    if (s.ts > entry.ts + windowMin * 60) break;
    const g = s.price_usd / entry.price_usd - 1;
    if (g > best) best = g;
    if (first30 === null && g >= 0.3) first30 = (s.ts - entry.ts) / 60;
  }
  return { mfe: best, minutes: first30 };
}

function tradeRecord(token, f, res, score, series) {
  const mf = maxFavourable(series, res.entry, 60);
  return {
    token: token.token_address, symbol: token.symbol, signalTs: f.ts, entryTs: res.entry.ts,
    score, netReturn: res.ret, how: res.how,
    day: new Date(res.entry.ts * 1000).toISOString().slice(0, 10), ageMin: f.age_min,
    preMove15m: f.price_chg_15m, mfe60: mf.mfe, minsTo30pct: mf.minutes,   // evaluation-only (uses the future); never fed into scoring
  };
}

// Entry-age buckets (minutes since launch). A model that fires early must be compared with RANDOM EARLY entries,
// otherwise the "edge" can just be that early entries differ from late ones (rug exposure, decay) — a fake signal.
const AGE_BUCKETS = [[15, 30], [30, 60], [60, 120], [120, 240], [240, 361]];
const ageBucket = (ageMin) => AGE_BUCKETS.findIndex(([lo, hi]) => ageMin >= lo && ageMin < hi);

/**
 * Random baseline: "did the model beat picking blindly from the same universe, at the same stage of token life,
 * under the same fill/exit rules?" Precomputes, per age bucket and token, K random-entry net returns; a baseline draw
 * then matches each model trade's age bucket and samples a token/outcome — thousands of draws cost almost nothing.
 */
function buildRandomPool(universe, { strategy, k = 8, ...overrides }) {
  const opt = { ...DEFAULTS, ...overrides };
  const pool = AGE_BUCKETS.map(() => []);
  for (const { token, series, rows } of universe.values()) {
    const elig = rows.filter(isEligible);
    for (let b = 0; b < AGE_BUCKETS.length; b++) {
      const inB = elig.filter((f) => ageBucket(f.age_min) === b);
      if (!inB.length) continue;
      const outcomes = [];
      for (let i = 0; i < k; i++) {
        const res = execute(token, series, inB[Math.floor(Math.random() * inB.length)], opt, strategy);
        if (res.status === 'ok') outcomes.push(res.ret);
      }
      if (outcomes.length) pool[b].push(outcomes);
    }
  }
  return pool;
}

function randomMeans(pool, tradeAges, draws = 1000) {
  const buckets = tradeAges.map(ageBucket);
  if (!buckets.length || buckets.some((b) => b < 0 || pool[b].length < 5)) return [];
  const means = [];
  for (let d = 0; d < draws; d++) {
    let sum = 0;
    for (const b of buckets) {
      const o = pool[b][Math.floor(Math.random() * pool[b].length)];
      sum += o[Math.floor(Math.random() * o.length)];
    }
    means.push(sum / buckets.length);
  }
  return means;
}

/**
 * Replay one model over the universe. For each token, enter ONCE at the first eligible row whose score crosses the
 * threshold (no overlapping positions per token). Positions whose exit hasn't happened yet are censored, never counted.
 */
function simulate(universe, { model, strategy, ...overrides }) {
  const opt = { ...DEFAULTS, ...overrides };
  const score = typeof model === 'function' ? model : MODELS[model];
  const trades = [];
  let eligibleRows = 0, censored = 0, skipped = 0, fired = 0;

  for (const { token, series, rows } of universe.values()) {
    for (let i = 0; i < rows.length; i++) {
      const f = rows[i];
      if (!isEligible(f)) continue;
      eligibleRows++;
      const sc = score(f);
      if (sc < opt.threshold) continue;
      fired++;
      const res = execute(token, series, f, opt, strategy);
      if (res.status === 'skipped') skipped++;
      else if (res.status === 'censored') censored++;
      else trades.push(tradeRecord(token, f, res, sc, series));
      break;                                     // one entry per token
    }
  }
  return { trades, eligibleRows, fired, censored, skipped };
}

module.exports = { simulate, buildRandomPool, randomMeans, execute, DEFAULTS, roundTrip };
