// Report generation + hourly scheduler.
//   generateReport(db, opts)  -> report object (also INSERTed into eval_report)
//   start(db)                 -> starts the hourly job iff env EVAL_JOB=1; returns a handle or null
const { initEvalSchema } = require('./schema');
const { runOutcomes, HORIZONS_MIN } = require('./outcomes');
const { evaluate } = require('./evaluate');
const { loadPairs, listModelVersions, listComponents } = require('./pairs');

const PRIMARY_HORIZON_MIN = 60;      // the ONE horizon the headline verdict uses (fixed in advance,
                                     // so we do not pick the best of 5 horizons after the fact)
const DEFAULT_MODEL = 'activity-v0';

const pct = (x, d = 1) => (x == null ? 'n/a' : `${(x * 100).toFixed(d)}%`);
const hLabel = (m) => (m >= 60 ? `${m / 60}h` : `${m}m`);

function outcomeCounts(db, modelVersion, horizonMin) {
  const rows = db.prepare(`
    SELECT o.status AS status, COUNT(*) AS n FROM outcome_window o
    JOIN signal_snapshot s ON s.signal_id = o.signal_snapshot_id
    WHERE o.horizon_min = ? AND s.model_version = ? GROUP BY o.status`).all(horizonMin, modelVersion);
  const c = { ok: 0, dead: 0, missing: 0 };
  rows.forEach((r) => { c[r.status] = r.n; });
  const total = db.prepare(`SELECT COUNT(*) AS n FROM signal_snapshot WHERE model_version = ?`).get(modelVersion).n;
  c.pending = Math.max(0, total - c.ok - c.dead - c.missing);
  return c;
}

function trim(ev) {
  return { verdict: ev.verdict, n: ev.n, nTokens: ev.nTokens, baseRate: ev.baseRate,
    cutoffs: ev.cutoffs, returns: ev.returns, reasons: ev.reasons };
}

function explain(ev, ctx) {
  const lines = [];
  const p = ev.cutoffs[String(ev.config.primaryFrac)];
  const cfg = ev.config;
  const crit = `a "success" means a net return above +${pct(cfg.successThreshold, 0)} after an assumed ${pct(cfg.cost, 0)} round-trip cost`;
  switch (ev.verdict) {
    case 'INSUFFICIENT_DATA':
      lines.push(`Not enough data yet to judge the ${ctx.model} signal (${ctx.horizon} horizon). We have ${ev.n} scored signals across ${ev.nTokens} tokens with measured outcomes. ${ev.reasons.join('; ')}.`);
      lines.push('Keep collecting; no conclusion either way should be drawn from this.');
      break;
    case 'NO_EDGE':
      lines.push(`No edge detected for ${ctx.model} at the ${ctx.horizon} horizon. ${crit}; the base rate is ${pct(ev.baseRate)}.`);
      if (p) lines.push(`The top ${pct(cfg.primaryFrac, 0)} highest-scored signals succeeded ${pct(p.precision)} of the time (${p.lift != null ? p.lift.toFixed(2) + 'x' : 'n/a'} the base rate), which is not statistically distinguishable from luck or from simple baselines.`);
      break;
    case 'POSSIBLE_EDGE':
      lines.push(`Possible edge for ${ctx.model} at the ${ctx.horizon} horizon - not a proven one. ${crit}; the base rate is ${pct(ev.baseRate)}.`);
      if (p) lines.push(`The top ${pct(cfg.primaryFrac, 0)} signals succeeded ${pct(p.precision)} of the time (${p.lift.toFixed(2)}x base rate), beat random picks and the "highest 5m volume" baseline, and held in both halves of the data.`);
      lines.push('Treat this as a hypothesis to confirm on fresh, untouched data before risking money.');
      break;
    case 'EDGE_NOT_STABLE':
      lines.push(`The ${ctx.model} signal looks positive overall at the ${ctx.horizon} horizon but is not stable across time. ${crit}.`);
      if (ev.stability) lines.push(`First half precision excess ${pct(ev.stability.firstHalf.precisionExcess)}, second half ${pct(ev.stability.secondHalf.precisionExcess)}. An edge that only works in part of the sample is more likely luck or a regime that has ended.`);
      break;
    default: break;
  }
  if (ev.returns && ev.verdict !== 'INSUFFICIENT_DATA') {
    lines.push(`Across all signals, mean net return is ${pct(ev.returns.meanNet)}, median ${pct(ev.returns.medianNet)}, and the worst 10% lose ${pct(ev.returns.worstDecileNet)} or more.`);
  }
  return lines.join(' ');
}

/**
 * Generate and store a report. Evaluates every model_version present at every horizon, plus
 * feature-group (component) ablations for each model at the primary horizon. The headline verdict
 * is the primary model at PRIMARY_HORIZON_MIN only; everything else is exploratory.
 */
function generateReport(db, o = {}) {
  initEvalSchema(db);
  const nowSec = o.nowSec != null ? o.nowSec : Math.floor(Date.now() / 1000);
  const evalOpts = o.evalOpts || {};
  const primaryHorizon = o.primaryHorizonMin || PRIMARY_HORIZON_MIN;
  const versions = listModelVersions(db);
  const primaryModel = o.modelVersion
    || (versions.find((v) => v.model_version === DEFAULT_MODEL) || versions[0] || {}).model_version
    || DEFAULT_MODEL;

  const models = {};
  for (const v of versions) {
    const mv = v.model_version;
    const horizons = {};
    for (const h of HORIZONS_MIN) {
      const pairs = loadPairs(db, { modelVersion: mv, horizonMin: h });
      horizons[h] = { evaluation: evaluate(pairs, evalOpts), outcomes: outcomeCounts(db, mv, h) };
    }
    const components = {};
    for (const name of listComponents(db, mv)) {
      const pairs = loadPairs(db, { modelVersion: mv, horizonMin: primaryHorizon, scoreKey: `component:${name}` });
      components[name] = trim(evaluate(pairs, evalOpts));
    }
    models[mv] = { signals: v.n, firstTs: v.first_ts, lastTs: v.last_ts, horizons, components };
  }

  const headline = models[primaryModel] && models[primaryModel].horizons[primaryHorizon]
    ? models[primaryModel].horizons[primaryHorizon].evaluation
    : evaluate([], evalOpts);
  const warnings = [...headline.warnings];
  if (!versions.length) warnings.push('No signal_snapshot rows yet.');
  warnings.push(`Headline verdict uses only the ${hLabel(primaryHorizon)} horizon (fixed in advance). Other horizons, model versions and component ablations are exploratory: with this many comparisons some will look good by chance.`);

  const summary = explain(headline, { model: primaryModel, horizon: hLabel(primaryHorizon) });
  const report = {
    created_ts: nowSec,
    primaryModel, primaryHorizonMin: primaryHorizon,
    verdict: headline.verdict, summary, warnings,
    headline, models,
    methodology: 'Outcomes use only market_snapshot rows at/after the signal time, computed after the horizon elapsed. Tokens whose liquidity collapsed or whose snapshots stopped are scored -100% (survivorship rule). Confidence intervals resample whole tokens, not rows.',
  };
  db.prepare('INSERT INTO eval_report (created_ts, model_version, json) VALUES (?, ?, ?)')
    .run(nowSec, primaryModel, JSON.stringify(report));
  return report;
}

function latestReport(db) {
  initEvalSchema(db);
  const row = db.prepare('SELECT report_id, created_ts, model_version, json FROM eval_report ORDER BY report_id DESC LIMIT 1').get();
  if (!row) return null;
  try { return { report_id: row.report_id, ...JSON.parse(row.json) }; } catch (_) { return null; }
}

/** Outcomes then report. Never throws. */
function runAll(db, o = {}) {
  try {
    const outcomes = runOutcomes(db, o);
    const report = generateReport(db, o);
    return { ok: true, outcomes, verdict: report.verdict, created_ts: report.created_ts };
  } catch (err) {
    console.error('[eval] run failed:', err.message);
    return { ok: false, error: err.message };
  }
}

let timer = null;
function start(db, { intervalMs = 3600 * 1000, initialDelayMs = 60 * 1000 } = {}) {
  if (process.env.EVAL_JOB !== '1') return null;
  if (timer) return timer;
  const tick = () => { const r = runAll(db); console.log('[eval] hourly run', JSON.stringify(r)); };
  const first = setTimeout(tick, initialDelayMs);
  timer = setInterval(tick, intervalMs);
  if (first.unref) first.unref();
  if (timer.unref) timer.unref();
  return timer;
}
function stop() { if (timer) { clearInterval(timer); timer = null; } }

module.exports = { generateReport, latestReport, runAll, start, stop, explain, PRIMARY_HORIZON_MIN };
