// Combined research view: radar (primary engine) + activity-v0 evaluator (baseline) + collector status,
// and one conservative plain-English overall verdict. Pure verdict logic is in overallVerdict().
// Never claims a proven edge: the strongest outcome is POSSIBLE_EDGE.

const DEFAULTS = { minDays: 7, minTokens: 100, minTestTrades: 30, reactiveShare: 0.5, minPositiveDayShare: 0.6 };
const PRIMARY_STRATEGY = '60m';   // fixed in advance, like the baseline evaluator's headline horizon

const pct = (x, d = 0) => (x == null || Number.isNaN(x) ? 'n/a' : `${(x * 100).toFixed(d)}%`);

/** The one radar row judged out-of-sample: fitted model on the held-out test window at the primary horizon. */
function pickTestSlice(radar) {
  const rows = (radar && radar.results) || [];
  return rows.find((r) => r.window === 'test' && r.model === 'fitted_lr' && r.strategy === PRIMARY_STRATEGY)
    || rows.find((r) => r.window === 'test' && r.strategy === PRIMARY_STRATEGY) || null;
}

/** Does the baseline evaluator's top-cutoff precision beat the simple "highest 5m volume" pick? null = unknown. */
function beatsVolumeBaseline(baseline) {
  const h = baseline && baseline.headline;
  if (!h || !h.cutoffs || !h.baselines || !h.baselines.volume5m || !h.config) return null;
  const top = h.cutoffs[String(h.config.primaryFrac)];
  if (!top || top.precision == null || h.baselines.volume5m.precision == null) return null;
  return top.precision > h.baselines.volume5m.precision;
}

function positiveDayShare(row) {
  const days = Object.values((row && row.perDayMean) || {}).filter((d) => d && d.n > 0 && d.mean != null);
  if (days.length < 3) return null;
  return days.filter((d) => d.mean > 0).length / days.length;
}

/**
 * input: { radarEnabled, daysOfData, tokens, radar (runReport output or null), baseline (latest eval report or null) }
 * returns { verdict, headline, reasons[], missing[], facts{} }. verdict is one of
 * INSUFFICIENT_DATA | NO_EDGE | MOSTLY_REACTIVE | EDGE_NOT_STABLE | POSSIBLE_EDGE. There is deliberately no "PROVEN".
 */
function overallVerdict(input, cfg = {}) {
  const c = { ...DEFAULTS, ...cfg };
  const { radarEnabled, daysOfData = 0, tokens = 0, radar = null, baseline = null } = input || {};
  const test = pickTestSlice(radar);
  const beatsVolume = beatsVolumeBaseline(baseline);
  const reactiveShare = test && test.precedence ? test.precedence.shareReactive : null;
  const facts = {
    daysOfData, tokens, minDays: c.minDays, minTokens: c.minTokens,
    testSlice: test ? {
      model: test.model, strategy: test.strategy, n: test.n, meanReturn: test.mean, medianReturn: test.median,
      winRate: test.winRate, pVsRandom: test.pVsRandom, significantAfterCorrection: !!test.significantAfterCorrection,
    } : null,
    shareReactive: reactiveShare,
    beatsVolumeBaseline: beatsVolume,
    baselineVerdict: baseline ? baseline.verdict : null,
  };
  const out = (verdict, headline, reasons, missing = []) => ({ verdict, headline, reasons, missing, facts });

  const missing = [];
  if (!radarEnabled) missing.push('radar is off');
  if (daysOfData < c.minDays) missing.push(`only ${daysOfData.toFixed(1)} of ${c.minDays} days of data`);
  if (tokens < c.minTokens) missing.push(`only ${tokens} of ${c.minTokens} tokens with history`);
  if (missing.length) {
    return out('INSUFFICIENT_DATA', 'Too early to tell. Keep collecting; no conclusion either way.', missing, missing);
  }
  if (!test) {
    return out('INSUFFICIENT_DATA', 'Enough data collected, but there is no out-of-sample (held-out) test result yet, so nothing can be judged fairly.',
      ['the radar has not produced a held-out test slice for the 1h strategy yet'], ['no out-of-sample test result']);
  }
  if (test.n < c.minTestTrades) {
    return out('INSUFFICIENT_DATA', `The held-out test slice has only ${test.n} trades (need ${c.minTestTrades}).`,
      [`test slice too small: ${test.n} trades`], ['more trades in the test slice']);
  }

  const reasons = [];
  reasons.push(`Out-of-sample test (${test.n} trades): mean return ${pct(test.mean, 1)}, median ${pct(test.median, 1)}; ` +
    (test.significantAfterCorrection ? 'it beat random picks after correcting for the many comparisons run.' : 'it did NOT clearly beat random picks after correcting for the many comparisons run.'));
  if (reactiveShare != null) reasons.push(`${pct(reactiveShare)} of signals fired after the price had already jumped 20%+ (reactive, chasing rather than predicting).`);
  if (beatsVolume === true) reasons.push('It did better than simply picking the highest-volume coins (activity-v0 baseline).');
  else if (beatsVolume === false) reasons.push('It did NOT do better than simply picking the highest-volume coins.');
  else reasons.push('No comparison against the "highest volume" baseline is available yet.');

  const positive = test.mean > 0 && test.significantAfterCorrection;
  if (!positive) return out('NO_EDGE', 'No edge detected. The held-out test does not show this beating luck.', reasons);
  if (reactiveShare != null && reactiveShare >= c.reactiveShare) {
    return out('MOSTLY_REACTIVE', 'Looks profitable on paper, but most signals fire after the move has already happened. Not predictive, and probably not tradeable by a human.', reasons);
  }
  const dayShare = positiveDayShare(test);
  if (dayShare != null) reasons.push(`Profitable on ${pct(dayShare)} of days.`);
  if ((dayShare != null && dayShare < c.minPositiveDayShare) || (baseline && baseline.verdict === 'EDGE_NOT_STABLE')) {
    return out('EDGE_NOT_STABLE', 'Positive overall but not consistent over time. More likely luck or a regime that has ended.', reasons);
  }
  if (beatsVolume === false) return out('NO_EDGE', 'No edge detected: it is no better than just picking the highest-volume coins.', reasons);
  if (beatsVolume == null) {
    return out('INSUFFICIENT_DATA', 'Promising on the held-out test, but it cannot be compared with the simple volume baseline yet, so no claim is made.',
      reasons, ['activity-v0 baseline comparison (SNAPSHOT_COLLECTOR + EVAL_JOB)']);
  }
  return out('POSSIBLE_EDGE', 'Possible edge, NOT a proven one. Confirm on fresh data that was never used for tuning before risking money.', reasons);
}

/* ─── data gathering (each part tolerant of missing tables / disabled collectors) ───────────────────── */

function tableCount(d, tables, t) {
  if (!tables.has(t)) return { rows: 0, exists: false };
  try { return { rows: d.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n, exists: true }; } catch (_) { return { rows: 0, exists: false }; }
}

function collectorStatus(d, env = process.env) {
  let tables = new Set();
  try { tables = new Set(d.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all().map((r) => r.name)); } catch (_) { /* keep empty */ }
  const rows = {};
  for (const t of ['smart_money_event', 'wallet_skill_snapshot', 'account_post', 'telegram_message', 'follow_edge_snapshot', 'account_wallet_link']) {
    rows[t] = tableCount(d, tables, t);
  }
  const has = (k) => !!env[k];
  return {
    flags: {
      ENABLE_RADAR: env.ENABLE_RADAR === 'true',
      SNAPSHOT_COLLECTOR: env.SNAPSHOT_COLLECTOR === '1',
      SMART_MONEY_COLLECTOR: env.SMART_MONEY_COLLECTOR === '1',
      SOCIAL_COLLECTOR: env.SOCIAL_COLLECTOR === '1',
      EVAL_JOB: env.EVAL_JOB === '1',
    },
    keys: {
      walletProvider: has('HELIUS_API_KEY') || has('BIRDEYE_API_KEY'),
      x: has('X_BEARER_TOKEN') || has('TWITTERAPI_IO_KEY'),
      telegram: has('TELEGRAM_API_ID') && has('TELEGRAM_API_HASH') && has('TELEGRAM_SESSION'),
    },
    tables: rows,
  };
}

function radarStatus(env = process.env) {
  if (env.ENABLE_RADAR !== 'true') return { enabled: false };
  try {
    const rdb = require('../../radar/db').getRadarDb();
    const now = Math.floor(Date.now() / 1000);
    const one = (sql) => { try { return rdb.prepare(sql).get(); } catch (_) { return {}; } };
    const snap = one('SELECT MIN(ts) AS m, MAX(ts) AS x, COUNT(*) AS n FROM market_snapshot');
    return {
      enabled: true,
      tokens: one('SELECT COUNT(*) AS n FROM token').n || 0,
      snapshots: snap.n || 0,
      daysOfData: snap.m ? Math.max(0, (now - snap.m) / 86400) : 0,
      lastSnapshotAgeSec: snap.x ? now - snap.x : null,
    };
  } catch (e) {
    return { enabled: true, error: e.message, tokens: 0, snapshots: 0, daysOfData: 0 };
  }
}

let cache = { ts: 0, value: null };
function radarReport({ refresh = false, ttlMs = 5 * 60 * 1000, env = process.env } = {}) {
  if (env.ENABLE_RADAR !== 'true') return { enabled: false };
  if (!refresh && cache.value && Date.now() - cache.ts < ttlMs) return cache.value;
  try {
    const rep = { enabled: true, ...require('../../radar/report').runReport({}) };
    cache = { ts: Date.now(), value: rep };
    return rep;
  } catch (e) {
    return { enabled: true, error: e.message };
  }
}

function buildCombined(d, { refresh = false, env = process.env, latestReport } = {}) {
  const safe = (fn, fallback) => { try { return fn(); } catch (e) { return fallback(e); } };
  const status = radarStatus(env);
  const radar = radarReport({ refresh, env });
  const baseline = safe(() => (latestReport ? latestReport(d) : null), () => null);
  const collectors = safe(() => collectorStatus(d, env), (e) => ({ error: e.message }));
  const cfg = {};
  if (env.RESEARCH_MIN_DAYS) cfg.minDays = Number(env.RESEARCH_MIN_DAYS) || DEFAULTS.minDays;
  if (env.RESEARCH_MIN_TOKENS) cfg.minTokens = Number(env.RESEARCH_MIN_TOKENS) || DEFAULTS.minTokens;
  const tokens = radar && radar.data ? radar.data.tokensWithHistory : (status.tokens || 0);
  const overall = overallVerdict({
    radarEnabled: !!status.enabled && !radar.error,
    daysOfData: status.daysOfData || 0,
    tokens,
    radar: radar.error ? null : radar, baseline,
  }, cfg);
  return { overall, radarStatus: status, radar, baseline, collectors };
}

module.exports = { overallVerdict, buildCombined, collectorStatus, radarStatus, radarReport, pickTestSlice, beatsVolumeBaseline, DEFAULTS };
