// Plain-JS stats for heavy-tailed, clustered memecoin returns. Medians and worst-decile are reported next to the
// mean because a single 50x can carry an entire average.

const sum = (a) => a.reduce((x, y) => x + y, 0);
const mean = (a) => (a.length ? sum(a) / a.length : null);

function quantile(a, q) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

function summarize(rets) {
  const wins = rets.filter((r) => r > 0), losses = rets.filter((r) => r <= 0);
  const gl = Math.abs(sum(losses));
  return {
    n: rets.length,
    winRate: rets.length ? wins.length / rets.length : null,   // net of costs: precision of "this trade made money"
    mean: mean(rets),
    median: quantile(rets, 0.5),
    p10: quantile(rets, 0.1),                                   // worst-decile outcome
    p90: quantile(rets, 0.9),
    rugRate: rets.length ? rets.filter((r) => r <= -0.95).length / rets.length : null,
    profitFactor: gl > 0 ? sum(wins) / gl : (wins.length ? Infinity : null),
  };
}

// Resample whole tokens (not rows) so one token's correlated outcomes can't masquerade as many independent wins.
// Each trade here is already one-per-token, so token-level resampling = trade-level; day blocks capture regime clustering.
function blockBootstrapCI(trades, stat, iters = 1000) {
  const byDay = new Map();
  for (const t of trades) { if (!byDay.has(t.day)) byDay.set(t.day, []); byDay.get(t.day).push(t.netReturn); }
  const days = [...byDay.values()];
  if (days.length < 2) return { lo: null, hi: null, note: 'need ≥2 days of data for a block bootstrap' };
  const out = [];
  for (let k = 0; k < iters; k++) {
    const sample = [];
    for (let d = 0; d < days.length; d++) sample.push(...days[Math.floor(Math.random() * days.length)]);
    out.push(stat(sample));
  }
  return { lo: quantile(out, 0.025), hi: quantile(out, 0.975) };
}

// P(random baseline mean ≥ model mean). Small = model beat blind picking from the same universe.
function permutationP(modelMean, baselineMeans) {
  if (!baselineMeans.length) return null;
  return (1 + baselineMeans.filter((m) => m >= modelMean).length) / (1 + baselineMeans.length);
}

module.exports = { summarize, mean, quantile, blockBootstrapCI, permutationP };
