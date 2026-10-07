'use strict';
// Startup + periodic (every 30 min) self-check: ONE compact log block saying which research subsystems are on or off
// (and why) and whether top-earner data is actually flowing. Read-only counts, every query optional, never throws.
//
//   [research] self-check @ 2026-10-06T12:00:00Z
//   [research]  radar ON | extra groups smartmoney,social (live model market_v2_sm_social) | score persistence ON (gap 5m)
//   [research]  smart-money collector ON via helius,birdeye | fast loop ON 60000ms (helius, 7/120 req this hour) | discovery: birdeye_lb,seeds
//   [research]  social collector OFF (SOCIAL_COLLECTOR != 1) | eval job ON | winner-first job OFF (WINNER_FIRST_JOB != 1)
//   [research]  data: wallets scored 120, passed holdout 9 (skilled now 7), smart_money_event 24h 14, social posts 24h 330, radar scores 24h 5120
//
// env: RESEARCH_SELFCHECK_MS (default 1800000 = 30 min, minimum 60000, 0/off disables)

const { FLAGS: DISCOVERY_FLAGS } = require('./wallets/discoverySources');
const fast = require('./wallets/fast');

const DEFAULT_MS = 30 * 60_000;
const MIN_MS = 60_000;
let timer = null;
let first = null;

const flagOn = (env, k) => env[k] === '1';
const onOff = (on, reasonIfOff) => (on ? 'ON' : `OFF (${reasonIfOff})`);

function one(db, sql, ...args) {
  try { const r = db.prepare(sql).get(...args); return r ? Object.values(r)[0] : null; } catch { return null; }
}

function providerNames(env) {
  const n = [];
  if (env.HELIUS_API_KEY) n.push('helius');
  if (env.BIRDEYE_API_KEY) n.push('birdeye');
  return n;
}

// Pure-ish: returns { lines, counts }. `db` = main research DB (may be null), `radarOn` from env unless overridden.
function buildSelfCheck({ env = process.env, db = null, now = Math.floor(Date.now() / 1000), extraGroups = null, liveModel = null } = {}) {
  const lines = [];
  const radarOn = env.ENABLE_RADAR === 'true';
  const persist = !/^(0|off|false|no)$/i.test(String(env.RADAR_PERSIST_SCORES || ''));
  const gapMin = (() => { const m = Number(env.RADAR_SNAPSHOT_MIN_GAP_MIN); return Number.isFinite(m) && m >= 0 && env.RADAR_SNAPSHOT_MIN_GAP_MIN !== undefined && env.RADAR_SNAPSHOT_MIN_GAP_MIN !== '' ? m : 5; })();
  const groups = extraGroups || [];
  lines.push(`radar ${onOff(radarOn, 'ENABLE_RADAR != true')}`
    + ` | extra groups ${groups.length ? `${groups.join(',')} (live model ${liveModel || 'market_v2'})` : 'none (market_v2)'}`
    + ` | score persistence ${radarOn ? onOff(persist, 'RADAR_PERSIST_SCORES=off') + (persist ? ` (gap ${gapMin}m)` : '') : 'n/a'}`);

  const smOn = flagOn(env, 'SMART_MONEY_COLLECTOR');
  const provs = providerNames(env);
  let smTxt;
  if (!smOn) smTxt = 'smart-money collector OFF (SMART_MONEY_COLLECTOR != 1)';
  else if (!provs.length) smTxt = 'smart-money collector OFF (no HELIUS_API_KEY or BIRDEYE_API_KEY)';
  else smTxt = `smart-money collector ON via ${provs.join(',')}`;
  const disc = Object.entries(DISCOVERY_FLAGS).filter(([, flag]) => flagOn(env, flag)).map(([name]) => name);
  const fastMs = fast.parseIntervalMs(env);
  let fastTxt = 'fast loop ';
  let fastUsed = null;
  if (!smOn || !provs.length) fastTxt += 'OFF (collector off)';
  else if (!fastMs) fastTxt += 'OFF (SMART_MONEY_FAST_MS=0)';
  else {
    const p = provs.includes('helius') ? 'helius' : 'birdeye';
    const lim = Number(env.SMART_MONEY_FAST_HOURLY_BUDGET);
    const limit = Number.isFinite(lim) && env.SMART_MONEY_FAST_HOURLY_BUDGET !== '' && env.SMART_MONEY_FAST_HOURLY_BUDGET !== undefined ? lim : (p === 'helius' ? 120 : 5);
    if (db) fastUsed = one(db, 'SELECT used FROM api_budget WHERE provider = ? AND day = ?', `fast-${p}`, new Date(now * 1000).toISOString().slice(0, 13));
    fastTxt += `ON ${fastMs}ms (${p}, ${fastUsed || 0}/${limit} req this hour)`;
  }
  lines.push(`${smTxt} | ${fastTxt} | discovery: ${disc.length ? disc.join(',') : 'none'}`);

  const socOn = flagOn(env, 'SOCIAL_COLLECTOR');
  const evalOn = flagOn(env, 'EVAL_JOB');
  const wfOn = flagOn(env, 'WINNER_FIRST_JOB');
  const snapOn = flagOn(env, 'SNAPSHOT_COLLECTOR');
  lines.push(`social collector ${onOff(socOn, 'SOCIAL_COLLECTOR != 1')} | snapshot collector ${onOff(snapOn, 'SNAPSHOT_COLLECTOR != 1')}`
    + ` | eval job ${onOff(evalOn, 'EVAL_JOB != 1')} | winner-first job ${onOff(wfOn, 'WINNER_FIRST_JOB != 1')}`);

  const counts = { walletsScored: null, passedHoldout: null, skilledNow: null, smartMoneyEvents24h: null, socialPosts24h: null, radarScores24h: null };
  if (db) {
    counts.walletsScored = one(db, 'SELECT COUNT(DISTINCT wallet_id) FROM wallet_skill_snapshot');
    counts.passedHoldout = one(db, 'SELECT COUNT(DISTINCT wallet_id) FROM wallet_skill_snapshot WHERE passed_holdout = 1');
    try { counts.skilledNow = fast.skilledWallets(db).length; } catch { counts.skilledNow = null; }
    counts.smartMoneyEvents24h = one(db, 'SELECT COUNT(*) FROM smart_money_event WHERE ts >= ?', now - 86400);
    const a = one(db, 'SELECT COUNT(*) FROM account_post WHERE ts >= ?', (now - 86400) * 1000);     // social tables store epoch ms
    const t = one(db, 'SELECT COUNT(*) FROM telegram_message WHERE ts >= ?', (now - 86400) * 1000);
    counts.socialPosts24h = a === null && t === null ? null : (a || 0) + (t || 0);
    counts.radarScores24h = one(db, "SELECT COUNT(*) FROM signal_snapshot WHERE model_version LIKE 'radar-%' AND as_of_ts >= ?", now - 86400);
  }
  const f = (v) => (v === null || v === undefined ? 'n/a' : String(v));
  lines.push(`data: wallets scored ${f(counts.walletsScored)}, passed holdout ${f(counts.passedHoldout)} (skilled now ${f(counts.skilledNow)}),`
    + ` smart_money_event 24h ${f(counts.smartMoneyEvents24h)}, social posts 24h ${f(counts.socialPosts24h)}, radar scores 24h ${f(counts.radarScores24h)}`);
  const warn = [];
  if (smOn && provs.length && counts.walletsScored === 0) warn.push('no wallets scored yet: add a discovery source (SMART_MONEY_BIRDEYE_LB / SMART_MONEY_SEEDS ...) or wait for the first cycle');
  if (smOn && counts.skilledNow === 0 && counts.walletsScored > 0) warn.push('no wallet is skilled right now: smart-money features will stay at 0 buyers');
  if (radarOn && persist && counts.radarScores24h === 0) warn.push('no radar score persisted in 24h (needs API traffic on /api/radar or /api/memecoins to score tokens)');
  if (warn.length) lines.push(`note: ${warn.join('; ')}`);
  return { lines, counts };
}

function logSelfCheck(opts = {}) {
  const log = opts.log || console;
  try {
    const { lines, counts } = buildSelfCheck(opts);
    const stamp = new Date((opts.now || Math.floor(Date.now() / 1000)) * 1000).toISOString().slice(0, 19) + 'Z';
    log.log([`[research] self-check @ ${stamp}`, ...lines.map((l) => `[research]  ${l}`)].join('\n'));
    return counts;
  } catch (e) {
    try { log.warn(`[research] self-check failed: ${e.message}`); } catch { /* ignore */ }
    return null;
  }
}

// opts.getContext() -> { db, extraGroups, liveModel } evaluated at each run so late configuration is picked up.
function start(opts = {}) {
  const env = opts.env || process.env;
  const raw = env.RESEARCH_SELFCHECK_MS;
  if (/^(0|off|none|false)$/i.test(String(raw || ''))) return null;
  const n = Number(raw);
  const interval = Number.isFinite(n) && n > 0 ? Math.max(MIN_MS, n) : DEFAULT_MS;
  if (timer) return timer;
  const run = () => {
    let ctx = {};
    try { ctx = (opts.getContext && opts.getContext()) || {}; } catch { ctx = {}; }
    logSelfCheck({ env, log: opts.log, ...ctx });
  };
  first = setTimeout(run, opts.initialDelayMs != null ? opts.initialDelayMs : 10_000);
  timer = setInterval(run, interval);
  if (first.unref) first.unref();
  if (timer.unref) timer.unref();
  return timer;
}

function stop() {
  if (timer) clearInterval(timer);
  if (first) clearTimeout(first);
  timer = null; first = null;
}

module.exports = { buildSelfCheck, logSelfCheck, start, stop, DEFAULT_MS };
