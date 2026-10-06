const { loadUniverse, MODELS, MODEL_THRESHOLD } = require('./features');
const { simulate, buildRandomPool, randomMeans, DEFAULTS } = require('./simulator');
const { fitModel } = require('./fit');
const { summarize, mean, quantile, blockBootstrapCI, permutationP } = require('./stats');
const { getRadarDb } = require('./db');

const HORIZONS = [5, 15, 60, 240];

function precedence(trades) {
  if (!trades.length) return null;
  const reactive = trades.filter((t) => t.preMove15m !== null && t.preMove15m > 0.2);
  const early = trades.filter((t) => t.preMove15m === null || t.preMove15m <= 0.2);
  const hit = trades.filter((t) => t.mfe60 >= 0.3);
  const leads = hit.map((t) => t.minsTo30pct).filter((x) => x !== null);
  return {
    // "Reactive" = price had already run >20% in the 15 min before the signal: the model is chasing, not leading.
    shareReactive: reactive.length / trades.length,
    meanRetReactive: mean(reactive.map((t) => t.netReturn)),
    meanRetEarly: mean(early.map((t) => t.netReturn)),
    hitRate30in60m: hit.length / trades.length,
    medianMinsTo30pct: quantile(leads, 0.5),
    p25MinsTo30pct: quantile(leads, 0.25),
  };
}

function dataQuality(universe) {
  const db = getRadarDb();
  const lag = db.prepare('SELECT first_seen_ts - pool_created_ts d FROM token').all().map((r) => r.d).filter((d) => d >= 0);
  let snapshots = 0;
  for (const u of universe.values()) snapshots += u.series.length;
  return {
    tokensWithHistory: universe.size, snapshots,
    tokensTotal: db.prepare('SELECT COUNT(*) c FROM token').get().c,
    securityChecked: db.prepare('SELECT COUNT(DISTINCT token_address) c FROM token_security').get().c,
    migrated: db.prepare('SELECT COUNT(*) c FROM token WHERE migrated_ts IS NOT NULL').get().c,
    deadGone: db.prepare("SELECT COUNT(*) c FROM token WHERE dead_reason = 'gone'").get().c,
    deadInactive: db.prepare("SELECT COUNT(*) c FROM token WHERE dead_reason = 'inactive'").get().c,
    discoveryLagSec: { median: quantile(lag, 0.5), p90: quantile(lag, 0.9) },   // how late we see launches
  };
}

function subset(universe, pick) {
  return new Map([...universe].filter(([, u]) => pick(u.token)));
}

function evaluate(universe, pool, model, strategy, opt, comparisons) {
  // The smallest p a permutation test can report is 1/(draws+1); it must sit well below the corrected alpha or
  // nothing could ever pass. 10/alpha draws gives ~10x headroom.
  const draws = Math.max(1000, Math.ceil(10 / (0.05 / comparisons)));
  const sim = simulate(universe, { model, strategy, ...opt });
  const rets = sim.trades.map((t) => t.netReturn);
  const s = summarize(rets);
  let baseline = null, p = null;
  if (rets.length >= 10) {
    const means = randomMeans(pool, sim.trades.map((t) => t.ageMin), draws);
    baseline = { meanOfMeans: mean(means), p95: quantile(means, 0.95) };
    p = permutationP(s.mean, means);
  }
  const byDay = {};
  for (const t of sim.trades) (byDay[t.day] = byDay[t.day] || []).push(t.netReturn);
  const exits = {};
  for (const t of sim.trades) exits[t.how] = (exits[t.how] || 0) + 1;
  return {
    ...s, fired: sim.fired, eligibleRows: sim.eligibleRows, censored: sim.censored, skippedFills: sim.skipped,
    meanCI95: blockBootstrapCI(sim.trades, mean), baseline, pVsRandom: p,
    // Bonferroni: this grid is `comparisons` tests, so one p<0.05 means little by itself
    significantAfterCorrection: p !== null && p < 0.05 / comparisons,
    exits, precedence: precedence(sim.trades),
    perDayMean: Object.fromEntries(Object.entries(byDay).map(([d, r]) => [d, { n: r.length, mean: mean(r) }])),
  };
}

function runReport({ models, horizons = HORIZONS, sinceHours = null, includeTpsl = true, ...rawOpt } = {}) {
  // Drop unset overrides so an absent query param can't clobber a default (undefined would disable the threshold)
  const opt = Object.fromEntries(Object.entries(rawOpt).filter(([, v]) => v !== undefined && !Number.isNaN(v)));
  const sinceTs = sinceHours ? Math.floor(Date.now() / 1000) - sinceHours * 3600 : 0;
  const universe = loadUniverse({ sinceTs });

  const strategies = horizons.map((m) => ({ type: 'horizon', minutes: m, label: `${m}m` }));
  if (includeTpsl) strategies.push({ type: 'tpsl', label: 'tpsl' });

  const fit = fitModel(universe, opt);
  const hand = models || Object.keys(MODELS);
  const names = fit.status === 'ok' ? [...hand, 'fitted_lr'] : hand;
  const fn = (name) => (name === 'fitted_lr' ? fit.score : name);

  // Window 'all' = every token (hand-set models only, they never saw the data). Window 'test' = the held-out final
  // slice, the only place the fitted model may be judged. Compare models within a window, never across.
  const windows = [{ name: 'all', universe, names: hand }];
  if (fit.status === 'ok') windows.push({ name: 'test', universe: subset(universe, (t) => t.pool_created_ts >= fit.testFromTs), names });
  const comparisons = windows.reduce((a, w) => a + w.names.length, 0) * strategies.length;

  const results = [];
  for (const w of windows) {
    for (const strategy of strategies) {
      const pool = buildRandomPool(w.universe, { strategy, ...opt });
      for (const name of w.names) {
        const o = name === 'fitted_lr' ? { ...opt, threshold: fit.threshold }
          : opt.threshold === undefined && MODEL_THRESHOLD[name] ? { ...opt, threshold: MODEL_THRESHOLD[name] } : opt;
        results.push({ window: w.name, model: name, strategy: strategy.label, tokens: w.universe.size,
          ...evaluate(w.universe, pool, fn(name), strategy, o, comparisons) });
      }
    }
  }

  return {
    assumptions: { ...DEFAULTS, ...opt },
    data: dataQuality(universe),
    fit: fit.status === 'ok' ? { status: 'ok', threshold: fit.threshold, ...fit.meta } : fit,
    comparisons, bonferroniAlpha: 0.05 / comparisons,
    results,
    caveats: [
      'Snapshots are 1-minute (young tokens) / 5-minute: intrabar highs/lows and exact fill prices are not observed.',
      "'gone' tokens (no pairs anywhere for 3 checks) count as -100%; pump.fun graduations are tracked by token so they are not mistaken for rugs.",
      'Entry-per-token is the first threshold crossing; hand-set thresholds are fixed constants, the fitted threshold comes from validation only.',
      'Security features use the latest check at or before each row; tokens not yet vetted are treated as unsafe by the *_safe models.',
      'Fitted model is judged on the held-out test window only; never compare its numbers with the all-window rows.',
    ],
  };
}

// "How fast must a user act?" Re-runs one model with different signal→fill delays. If the edge only exists at a
// few seconds' latency, it belongs to bots and a human-facing ticker can't deliver it — this measures that directly.
function latencySweep({ model = 'market_v1_safe', strategy = '60m', latencies = [5, 15, 45, 90, 180, 300], sinceHours = null, ...rawOpt } = {}) {
  const opt = Object.fromEntries(Object.entries(rawOpt).filter(([, v]) => v !== undefined && !Number.isNaN(v)));
  const universe = loadUniverse({ sinceTs: sinceHours ? Math.floor(Date.now() / 1000) - sinceHours * 3600 : 0 });
  const strat = strategy === 'tpsl' ? { type: 'tpsl' } : { type: 'horizon', minutes: Number(String(strategy).replace('m', '')) };
  const threshold = opt.threshold ?? MODEL_THRESHOLD[model];
  return {
    model, strategy, assumptions: { ...DEFAULTS, ...opt, threshold: threshold ?? DEFAULTS.threshold },
    rows: latencies.map((latencySec) => {
      const o = { ...opt, latencySec, ...(threshold !== undefined ? { threshold } : {}) };
      const sim = simulate(universe, { model, strategy: strat, ...o });
      const s = summarize(sim.trades.map((t) => t.netReturn));
      return { latencySec, n: s.n, winRate: s.winRate, mean: s.mean, median: s.median, rugRate: s.rugRate };
    }),
  };
}

module.exports = { runReport, latencySweep };

if (require.main === module) {
  const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > -1 ? process.argv[i + 1] : d; };
  const out = runReport({
    sinceHours: arg('since-hours') ? Number(arg('since-hours')) : null,
    threshold: arg('threshold') ? Number(arg('threshold')) : undefined,
    sizeUsd: arg('size') ? Number(arg('size')) : undefined,
  });
  const f = (x, d = 1, pct = true) => (x === null || x === undefined ? '  —  ' : (pct ? (x * 100).toFixed(d) + '%' : x.toFixed(d)));
  console.log('DATA', JSON.stringify(out.data));
  console.log('FIT ', JSON.stringify({ status: out.fit.status, lift: out.fit.valLift, reason: out.fit.reason }));
  console.log(`tests=${out.comparisons}  Bonferroni α=${out.bonferroniAlpha.toFixed(5)}`);
  console.log('win   model          strat    n   win%   mean   median   p10    rug%   PF    randMean  p     reactive%');
  for (const r of out.results) {
    console.log(
      `${r.window.padEnd(5)} ${r.model.padEnd(14)} ${r.strategy.padStart(5)} ${String(r.n).padStart(4)} ${f(r.winRate, 0).padStart(6)} ${f(r.mean).padStart(7)} ` +
      `${f(r.median).padStart(7)} ${f(r.p10, 0).padStart(6)} ${f(r.rugRate, 0).padStart(6)} ${f(r.profitFactor, 2, false).padStart(5)} ` +
      `${f(r.baseline && r.baseline.meanOfMeans).padStart(8)} ${r.pVsRandom === null ? '  —  ' : r.pVsRandom.toFixed(3)}${r.significantAfterCorrection ? '✓' : ' '} ` +
      `${r.precedence ? f(r.precedence.shareReactive, 0) : '—'}`);
  }
}
