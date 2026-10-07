'use strict';
// Orchestrates the discovery sources for one collector cycle. Never throws. Each source has its own minimum interval
// (persisted, so restarts do not re-hit paid/limited APIs) and a cap on candidates per run.

const { recordCandidates, getState, setState, buildCandidateReport } = require('./candidates');
const { mulberry32 } = require('../eval/evaluate');

const nowSec = () => Math.floor(Date.now() / 1000);

/**
 * ctx: { sources, now (s), tokens (trending token addresses), trendingTraders (wallets seen on those tokens, used as the
 * generic control pool), env, log, maxPerSource, controlsPerCycle, seed }
 * Returns { sources:{name:{enabled,reason?|ran,found,recorded,error?,note?}}, recorded, controls, errors }.
 */
async function runDiscovery(db, ctx = {}) {
  const env = ctx.env || process.env;
  const log = ctx.log || console;
  const now = ctx.now != null ? ctx.now : nowSec();
  const maxPerSource = Number(env.SMART_MONEY_DISCOVERY_MAX_PER_SOURCE) || ctx.maxPerSource || 50;
  const controlsPerCycle = ctx.controlsPerCycle != null ? ctx.controlsPerCycle : (Number(env.SMART_MONEY_CONTROLS_PER_CYCLE) || 10);
  const out = { sources: {}, recorded: 0, controls: 0, errors: 0, wallets: [] };
  const controlPool = [];
  let anyEnabled = false;
  for (const src of ctx.sources || []) {
    if (!src || !src.name) continue;
    if (!src.enabled) { out.sources[src.name] = { enabled: false, reason: src.reason }; continue; }
    anyEnabled = true;
    const entry = (out.sources[src.name] = { enabled: true, ran: false, found: 0, recorded: 0 });
    try {
      const key = `last_run:${src.name}`;
      const last = Number(getState(db, key)) || 0;
      if (src.minIntervalMs && (now - last) * 1000 < src.minIntervalMs) { entry.skipped = 'min interval'; continue; }
      setState(db, key, now);                                  // charge the interval even if the call fails (no hammering)
      let res;
      try { res = await src.discover({ db, now, tokens: ctx.tokens || [], log }); }
      catch (e) { entry.error = e.message; out.errors++; log.warn && log.warn(`[smart-money] discovery ${src.name} failed: ${e.message}`); res = { candidates: e.partial || [] }; }
      entry.ran = true;
      if (res.note) entry.note = res.note;
      if (res.budgetBlocked) entry.budgetBlocked = true;
      const rows = (res.candidates || []).slice(0, maxPerSource).map((c) => ({ source: src.name, survivor: src.survivor !== false, ...c }));
      entry.found = rows.length;
      const r = recordCandidates(db, rows, { now });
      entry.recorded = r.inserted;
      out.recorded += r.inserted;
      out.wallets.push(...r.wallets);
      for (const c of res.controlPool || []) controlPool.push(c);
    } catch (e) {
      entry.error = e.message; out.errors++;
      log.warn && log.warn(`[smart-money] discovery ${src.name} crashed: ${e.message}`);
    }
  }
  // Random-wallet controls from the SAME tokens (late buyers of winners; volume-ranked traders on trending tokens).
  // They are not picked for performance, so they show what a typical wallet on these tokens does after "discovery".
  if (anyEnabled && controlsPerCycle > 0) {
    try {
      for (const w of ctx.trendingTraders || []) controlPool.push({ wallet: w, source: 'control_trending' });
      const bySource = new Map();
      for (const c of controlPool) { if (!bySource.has(c.source)) bySource.set(c.source, new Map()); bySource.get(c.source).set(c.wallet, c); }
      const rng = mulberry32((ctx.seed != null ? ctx.seed : now) >>> 0);
      for (const [source, m] of bySource) {
        const arr = [...m.values()];
        for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
        const r = recordCandidates(db, arr.slice(0, controlsPerCycle).map((c) => ({ wallet: c.wallet, source, reported_period: '', survivor: false })), { now, role: 'control' });
        out.controls += r.inserted;
        out.wallets.push(...r.wallets);
      }
    } catch (e) { out.errors++; log.warn && log.warn(`[smart-money] control sampling failed: ${e.message}`); }
  }
  return out;
}

/** Dashboard payload: per-source status + budget + candidate counts + forward test. Never throws. */
function buildDiscoveryReport(db, { env = process.env, now = nowSec() } = {}) {
  const { initWalletSchema } = require('./schema');
  const { createBudget, parseDailyBudget } = require('./budget');
  const { getDiscoverySources, FLAGS } = require('./discoverySources');
  try { initWalletSchema(db); } catch { /* read what exists */ }
  let sources = [], budget = null;
  try {
    const b = createBudget(db, { provider: 'birdeye', dailyLimit: parseDailyBudget(env) });
    budget = b.status();
    sources = getDiscoverySources(env, { budget: b }).map((s) => ({
      name: s.name, flag: FLAGS[s.name], flagOn: env[FLAGS[s.name]] === '1', enabled: !!s.enabled, reason: s.reason || null,
      lastRunTs: Number(getState(db, `last_run:${s.name}`)) || null,
    }));
  } catch { /* status is best effort */ }
  const fd = Number(env.SMART_MONEY_FORWARD_DAYS) || undefined;
  return { collectorEnabled: env.SMART_MONEY_COLLECTOR === '1', ...buildCandidateReport(db, { now, sources, budget, forwardDays: fd }) };
}

module.exports = { runDiscovery, buildDiscoveryReport };
