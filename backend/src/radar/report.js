const { loadUniverse, MODELS } = require('./features');
const { simulate, simulateRandom, DEFAULTS } = require('./simulator');
const { summarize, mean, quantile, blockBootstrapCI, permutationP } = require('./stats');

const HORIZONS = [5, 15, 60, 240];
const BASELINE_DRAWS = 1000;

function runReport({ models = Object.keys(MODELS), horizons = HORIZONS, sinceHours = null, ...rawOpt } = {}) {
  // Drop unset overrides so an absent query param can't clobber a default (undefined would disable the threshold)
  const opt = Object.fromEntries(Object.entries(rawOpt).filter(([, v]) => v !== undefined && !Number.isNaN(v)));
  const sinceTs = sinceHours ? Math.floor(Date.now() / 1000) - sinceHours * 3600 : 0;
  const universe = loadUniverse({ sinceTs });
  const comparisons = models.length * horizons.length;
  const results = [];

  for (const horizonMin of horizons) {
    for (const model of models) {
      const sim = simulate(universe, { model, horizonMin, ...opt });
      const rets = sim.trades.map((t) => t.netReturn);
      const s = summarize(rets);

      let baseline = null, p = null;
      if (rets.length >= 10) {
        const means = [];
        for (let i = 0; i < BASELINE_DRAWS; i++) {
          const r = simulateRandom(universe, { n: rets.length, horizonMin, ...opt });
          if (r.length) means.push(mean(r));
        }
        baseline = { meanOfMeans: mean(means), p95: quantile(means, 0.95) };
        p = permutationP(s.mean, means);
      }
      const byDay = {};
      for (const t of sim.trades) (byDay[t.day] = byDay[t.day] || []).push(t.netReturn);

      results.push({
        model, horizonMin, ...s,
        meanCI95: blockBootstrapCI(sim.trades, mean),
        baseline, pVsRandom: p,
        // Bonferroni: this grid is `comparisons` tests, so one p<0.05 means little by itself
        significantAfterCorrection: p !== null && p < 0.05 / comparisons,
        censored: sim.censored, skippedFills: sim.skipped,
        perDayMean: Object.fromEntries(Object.entries(byDay).map(([d, r]) => [d, { n: r.length, mean: mean(r) }])),
      });
    }
  }

  const tokens = universe.size;
  let snapshots = 0;
  for (const u of universe.values()) snapshots += u.series.length;
  return {
    assumptions: { ...DEFAULTS, ...opt },
    universe: { tokens, snapshots },
    comparisons, bonferroniAlpha: 0.05 / comparisons,
    results,
    caveats: [
      'Snapshots are 1-minute (young tokens) / 5-minute: intrabar highs/lows and exact fill prices are not observed.',
      'Pool disappearance is treated as a -100% rug; some may be migrations (pump.fun → Raydium) and be slightly pessimistic.',
      'Entry-per-token is first threshold crossing; thresholds are fixed constants, not tuned on this data.',
    ],
  };
}

module.exports = { runReport };

if (require.main === module) {
  const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > -1 ? process.argv[i + 1] : d; };
  const out = runReport({
    sinceHours: arg('since-hours') ? Number(arg('since-hours')) : null,
    threshold: Number(arg('threshold', DEFAULTS.threshold)),
    sizeUsd: Number(arg('size', DEFAULTS.sizeUsd)),
  });
  const f = (x, d = 1, pct = true) => (x === null || x === undefined ? '  —  ' : (pct ? (x * 100).toFixed(d) + '%' : x.toFixed(d)));
  console.log(`tokens=${out.universe.tokens} snapshots=${out.universe.snapshots}  tests=${out.comparisons}  Bonferroni α=${out.bonferroniAlpha.toFixed(4)}`);
  console.log('model        h(min)   n   win%   mean   median   p10    rug%   PF     randMean  p-vs-rand');
  for (const r of out.results) {
    console.log(
      `${r.model.padEnd(12)} ${String(r.horizonMin).padStart(5)} ${String(r.n).padStart(4)} ${f(r.winRate, 0).padStart(6)} ${f(r.mean).padStart(7)} ` +
      `${f(r.median).padStart(7)} ${f(r.p10, 0).padStart(6)} ${f(r.rugRate, 0).padStart(6)} ${f(r.profitFactor, 2, false).padStart(5)} ` +
      `${f(r.baseline && r.baseline.meanOfMeans).padStart(9)} ${r.pVsRandom === null ? '   —' : r.pVsRandom.toFixed(3)}${r.significantAfterCorrection ? ' ✓' : ''}`);
  }
}
