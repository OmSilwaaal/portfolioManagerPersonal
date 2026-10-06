const { MODELS, isEligible } = require('./features');

// Paper-trade assumptions. Stated up front so they can't be tuned to flatter results.
const DEFAULTS = {
  sizeUsd: 100,          // position size
  latencySec: 45,        // delay between signal and fill (detect → decide → send → land)
  feePct: 0.01,          // per side (pump.fun 1%; Raydium ~0.25%) — conservative end
  fixedCostUsd: 0.5,     // priority fee + tip per round trip
  threshold: 70,         // absolute score cutoff (fixed, NOT a quantile of future data)
  maxEntryGapSec: 300,   // skip if no snapshot within 5 min after the latency delay
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
  return lo < series.length ? series[lo] : null;
}

// Net return for one round trip, or {status} when it can't be resolved yet / isn't a real trade.
function roundTrip(entry, exitSnap, opt) {
  const tokensValueAtEntryPrice = buyTokensUsd(opt.sizeUsd, entry.liquidity_usd, opt.feePct);
  const tokens = tokensValueAtEntryPrice / entry.price_usd;
  const valueAtExit = tokens * exitSnap.price_usd;
  const proceeds = sellProceeds(valueAtExit, Math.max(exitSnap.liquidity_usd, 1), opt.feePct) - opt.fixedCostUsd;
  return Math.max(proceeds / opt.sizeUsd - 1, -1);
}

// Fill + exit for one signal row. Shared by model replays and the random baseline so both face identical rules.
function execute(token, series, f, opt, horizonMin) {
  const entry = firstAtOrAfter(series, f.ts + opt.latencySec);
  if (!entry || entry.ts - (f.ts + opt.latencySec) > opt.maxEntryGapSec) return { status: 'skipped' };
  const exitTs = entry.ts + horizonMin * 60;
  const exit = firstAtOrAfter(series, exitTs);
  if (exit && exit.ts - exitTs <= 15 * 60) return { status: 'ok', entry, ret: roundTrip(entry, exit, opt) };
  if (token.dead_ts && token.dead_ts <= exitTs + 15 * 60) return { status: 'ok', entry, ret: -1 }; // pool vanished = rug
  return { status: 'censored' };                                                                    // not resolvable yet
}

/**
 * Random baseline: n tokens drawn uniformly from those with an eligible row, one random eligible row each,
 * same fill/exit rules. "Did the model beat picking blindly from the same universe?" — the honest null.
 */
function simulateRandom(universe, { n, horizonMin, ...overrides }) {
  const opt = { ...DEFAULTS, ...overrides };
  const pool = [];
  for (const { token, series, rows } of universe.values()) {
    const elig = rows.filter(isEligible);
    if (elig.length) pool.push({ token, series, elig });
  }
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const rets = [];
  for (const { token, series, elig } of pool) {
    if (rets.length >= n) break;
    const res = execute(token, series, elig[Math.floor(Math.random() * elig.length)], opt, horizonMin);
    if (res.status === 'ok') rets.push(res.ret);
  }
  return rets;
}

/**
 * Replay one model over the universe. For each token, enter ONCE at the first eligible row whose score crosses the
 * threshold (no overlapping positions per token). Exit after `horizonMin`. Tokens that vanish before the exit count
 * as total losses (rug); positions whose exit time hasn't happened yet are censored, never counted.
 */
function simulate(universe, { model, horizonMin, nowTs = Math.floor(Date.now() / 1000), ...overrides }) {
  const opt = { ...DEFAULTS, ...overrides };
  const score = typeof model === 'function' ? model : MODELS[model];
  const trades = [];
  let eligibleRows = 0, censored = 0, skipped = 0;

  for (const { token, series, rows } of universe.values()) {
    let fired = false;
    for (let i = 0; i < rows.length && !fired; i++) {
      const f = rows[i];
      if (!isEligible(f)) continue;
      eligibleRows++;
      if (score(f) < opt.threshold) continue;
      fired = true;

      const res = execute(token, series, f, opt, horizonMin);
      if (res.status === 'skipped') { skipped++; continue; }
      if (res.status === 'censored') { censored++; continue; }
      const { entry, ret } = res;

      trades.push({
        pool: token.pool_address, symbol: token.symbol, signalTs: f.ts, entryTs: entry.ts,
        score: score(f), netReturn: ret, day: new Date(entry.ts * 1000).toISOString().slice(0, 10),
      });
    }
  }
  return { trades, eligibleRows, censored, skipped };
}

module.exports = { simulate, simulateRandom, DEFAULTS, roundTrip };
