// Research evaluation API. Mount (behind requireAuth, as with other routes):
//   app.use('/api/research/eval', requireAuth, require('./routes/researchEval'));
const express = require('express');
const router = express.Router();

function db() {
  const d = require('../db/schema').getDb();
  require('../research/eval/schema').initEvalSchema(d);
  return d;
}

// Admin/dev guard for POST /run: same mechanism as gov-trades refresh (x-admin-secret === ADMIN_SECRET).
// With no ADMIN_SECRET configured it is only open outside production.
function adminOnly(req, res, next) {
  const secret = process.env.ADMIN_SECRET;
  if (secret) {
    if (req.headers['x-admin-secret'] === secret) return next();
    return res.status(403).json({ error: true, message: 'Forbidden.' });
  }
  if (process.env.NODE_ENV !== 'production') return next();
  return res.status(403).json({ error: true, message: 'Forbidden.' });
}

const TS_COLUMNS = ['ts', 'as_of_ts', 'created_ts', 'ingested_ts', 'computed_ts', 'observed_ts', 'timestamp'];

function tableInfo(d, table) {
  try {
    const cols = d.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
    const tsCol = TS_COLUMNS.find((c) => cols.includes(c)) || null;
    const n = d.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
    const last = tsCol ? d.prepare(`SELECT MAX(${tsCol}) AS t FROM ${table}`).get().t : null;
    const first = tsCol ? d.prepare(`SELECT MIN(${tsCol}) AS t FROM ${table}`).get().t : null;
    return { table, rows: n, firstTs: first, lastTs: last, hasData: n > 0 };
  } catch (_) {
    return { table, rows: 0, firstTs: null, lastTs: null, hasData: false };
  }
}

function buildStatus(d) {
  const now = Math.floor(Date.now() / 1000);
  const tables = new Set(d.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all().map((r) => r.name));
  const count = (t) => (tables.has(t) ? d.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n : 0);
  // Collectors: the core ones plus any research table (wallet / smart money / social / holders)
  const core = ['market_snapshot', 'signal_snapshot', 'outcome_window'];
  const extra = [...tables].filter((t) => /^(wallet|smart_money|social|holder|tweet|mention|kol)/i.test(t));
  const collectors = [...core, ...extra].filter((t) => tables.has(t)).map((t) => tableInfo(d, t));
  const firstTs = collectors.map((c) => c.firstTs).filter((x) => x != null);
  const firstAny = firstTs.length ? Math.min(...firstTs) : null;
  const signalFirst = tables.has('signal_snapshot') ? d.prepare('SELECT MIN(as_of_ts) AS t FROM signal_snapshot').get().t : null;
  const snapFirst = tables.has('market_snapshot') ? d.prepare('SELECT MIN(ts) AS t FROM market_snapshot').get().t : null;
  const models = tables.has('signal_snapshot')
    ? d.prepare('SELECT model_version, COUNT(*) AS signals FROM signal_snapshot GROUP BY model_version').all() : [];
  const outcomes = tables.has('outcome_window')
    ? d.prepare('SELECT horizon_min, status, COUNT(*) AS n FROM outcome_window GROUP BY horizon_min, status ORDER BY horizon_min').all() : [];
  return {
    now,
    tokens: count('token'),
    snapshots: count('market_snapshot'),
    signals: count('signal_snapshot'),
    outcomes: count('outcome_window'),
    firstTs: firstAny,
    snapshotFirstTs: snapFirst,
    signalFirstTs: signalFirst,
    daysOfData: firstAny ? Math.max(0, (now - firstAny) / 86400) : 0,
    models, outcomesByHorizon: outcomes, collectors,
    evalJobEnabled: process.env.EVAL_JOB === '1',
  };
}

router.get('/status', (req, res) => {
  try {
    const d = db();
    const cb = require('../research/eval/combined');
    res.json({ ...buildStatus(d), radar: cb.radarStatus(), collectorStatus: cb.collectorStatus(d) });
  } catch (e) {
    console.error('[researchEval] status:', e.message);
    res.status(500).json({ error: true, message: 'Internal error' });
  }
});

// Radar (primary) + activity-v0 baseline + collector status + conservative overall verdict. Never throws.
router.get('/combined', (req, res) => {
  try {
    res.json(require('../research/eval/combined').buildCombined(db(), {
      refresh: req.query.refresh === '1',
      latestReport: require('../research/eval/report').latestReport,
    }));
  } catch (e) {
    console.error('[researchEval] combined:', e.message);
    res.json({
      overall: { verdict: 'INSUFFICIENT_DATA', headline: 'Status unavailable.', reasons: [e.message], missing: [], facts: {} },
      radarStatus: { enabled: false }, radar: { enabled: false }, baseline: null, collectors: {},
    });
  }
});

router.get('/report/latest', (req, res) => {
  try {
    const rep = require('../research/eval/report').latestReport(db());
    if (!rep) return res.status(404).json({ error: true, message: 'No report yet.' });
    res.json(rep);
  } catch (e) {
    console.error('[researchEval] latest:', e.message);
    res.status(500).json({ error: true, message: 'Internal error' });
  }
});

router.post('/run', adminOnly, (req, res) => {
  try {
    const r = require('../research/eval/report').runAll(db());
    res.status(r.ok ? 200 : 500).json(r);
  } catch (e) {
    console.error('[researchEval] run:', e.message);
    res.status(500).json({ error: true, message: 'Internal error' });
  }
});

// "Who mentions winners early?" Latest stored report (404 = none yet). Never exposes post text.
router.get('/winner-first', (req, res) => {
  try {
    const wf = require('../research/eval/winnerFirst');
    const rep = wf.latestWinnerFirst(db());
    if (!rep) return res.status(404).json({ error: true, message: 'No winner-first report yet.', jobEnabled: process.env.WINNER_FIRST_JOB === '1' });
    res.json({ ...rep, jobEnabled: process.env.WINNER_FIRST_JOB === '1' });
  } catch (e) {
    console.error('[researchEval] winner-first:', e.message);
    res.status(500).json({ error: true, message: 'Internal error' });
  }
});

router.post('/winner-first/run', adminOnly, (req, res) => {
  try {
    const wf = require('../research/eval/winnerFirst');
    const r = wf.runWinnerFirst(require('../radar/db').getRadarDb(), db());
    res.status(r.ok ? 200 : 500).json({ ok: r.ok, verdict: r.verdict, counts: r.counts, error: r.error });
  } catch (e) {
    console.error('[researchEval] winner-first run:', e.message);
    res.status(500).json({ error: true, message: 'Internal error' });
  }
});

// On-chain top-earner wallet discovery: per-source candidate counts, holdout passes, forward test vs control.
// Aggregates only (no per-wallet reported PnL is trusted or shown).
router.get('/wallet-discovery', (req, res) => {
  try {
    res.json(require('../research/wallets/discovery').buildDiscoveryReport(db()));
  } catch (e) {
    console.error('[researchEval] wallet-discovery:', e.message);
    res.status(500).json({ error: true, message: 'Internal error' });
  }
});

module.exports = router;
module.exports.buildStatus = buildStatus;
