'use strict';
// Wallet candidates from discovery sources + the forward-performance (regression-to-the-mean) check.
//
// TRUST MODEL: a source's reported PnL is a CLAIM. It is stored in wallet_candidate.reported_pnl for audit and is never
// used by anything that scores wallets. A candidate only matters once collector.js has re-scored it from on-chain trades
// with skill.js (holdout rule, trades strictly before as_of). Leaderboards are SURVIVORS: they list wallets because
// they already did well, so even their on-chain history looks better than it will going forward. evaluateForward()
// measures that: skill in the window BEFORE discovered_ts vs realized results AFTER it, for candidates and for random
// control wallets seen on the same tokens.

const { computeSkill, pairTrades } = require('./skill');
const { isSolanaAddress } = require('../social/entityLinking');

const MIN_SMART_SCORE = 0.5;   // same bar as skill.js isSmart / radar extraFeatures
const FORWARD_DAYS_DEFAULT = 7;

const nowSec = () => Math.floor(Date.now() / 1000);

// ── small mutable state (discovery run clocks, processed winners) ──────────────────────────────────────────────────
function getState(db, key) {
  try { const r = db.prepare('SELECT value FROM discovery_state WHERE key = ?').get(key); return r ? r.value : null; } catch { return null; }
}
function setState(db, key, value) {
  try { db.prepare('INSERT INTO discovery_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value)); } catch { /* best effort */ }
}
function stateKeys(db, prefix) {
  try { return db.prepare('SELECT key FROM discovery_state WHERE key LIKE ?').all(`${prefix}%`).map((r) => r.key); } catch { return []; }
}

// ── recording ───────────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * rows: [{ wallet, source, reported_pnl?, reported_period?, survivor? }]. Invalid addresses are dropped.
 * Re-discovering the same (wallet, source, period) is a no-op, so discovered_ts stays the FIRST time we learned of it.
 * Also registers the wallet in `wallet` so the collector's normal path fetches trades and re-scores it.
 * Controls (role 'control') are skipped for wallets that are already proposed candidates.
 */
function recordCandidates(db, rows, { now = nowSec(), role = 'candidate' } = {}) {
  const insC = db.prepare('INSERT OR IGNORE INTO wallet_candidate (wallet_id, source, role, reported_pnl, reported_period, leaderboard_survivor, discovered_ts, ingested_ts) VALUES (?,?,?,?,?,?,?,?)');
  const insW = db.prepare("INSERT OR IGNORE INTO wallet (wallet_id, chain, first_seen_ts, event_ts, ingested_ts) VALUES (?, 'solana', ?, ?, ?)");
  const isCand = db.prepare("SELECT 1 AS x FROM wallet_candidate WHERE wallet_id = ? AND role = 'candidate' LIMIT 1");
  let inserted = 0, invalid = 0;
  const wallets = new Set();
  for (const r of rows || []) {
    const w = r && r.wallet;
    if (!isSolanaAddress(w)) { invalid++; continue; }
    if (role === 'control' && isCand.get(w)) continue;
    const pnl = Number(r.reported_pnl);
    const res = insC.run(w, String(r.source).slice(0, 60), role, Number.isFinite(pnl) ? pnl : null, String(r.reported_period || '').slice(0, 120), r.survivor ? 1 : 0, now, now);
    insW.run(w, now, now, now);
    if (Number(res.changes) > 0) { inserted++; wallets.add(w); }
  }
  return { inserted, invalid, wallets: [...wallets] };
}

// ── forward evaluation ─────────────────────────────────────────────────────────────────────────────────────────────
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

function tripStats(trips) {
  const n = trips.length;
  return {
    n,
    pnl: trips.reduce((s, t) => s + t.pnl, 0),
    meanRet: n ? mean(trips.map((t) => t.ret)) : null,
    winRate: n ? trips.filter((t) => t.pnl > 0).length / n : null,
  };
}

/**
 * For every candidate/control whose forward window [discovered_ts, discovered_ts + forwardDays) has fully elapsed AND
 * whose wallet was refreshed after the window ended, append one wallet_candidate_eval row.
 *   pre  = computeSkill / round trips using ONLY trades with ts < discovered_ts (what the leaderboard "saw")
 *   post = round trips that CLOSED in the forward window (positions opened earlier may close inside it)
 * Never throws. Returns the number of rows written.
 */
function evaluateForward(db, { now = nowSec(), forwardDays = FORWARD_DAYS_DEFAULT, limit = 300, skillOptions } = {}) {
  let written = 0;
  try {
    const fwd = Math.round(forwardDays * 86400);
    const due = db.prepare(`
      SELECT c.* FROM wallet_candidate c
      WHERE c.discovered_ts + ? <= ?
        AND NOT EXISTS (SELECT 1 FROM wallet_candidate_eval e WHERE e.candidate_id = c.candidate_id)
        AND COALESCE((SELECT MAX(s.as_of_ts) FROM wallet_skill_snapshot s WHERE s.wallet_id = c.wallet_id), 0) >= c.discovered_ts + ?
      ORDER BY c.discovered_ts LIMIT ?`).all(fwd, now, fwd, limit);
    const trades = db.prepare('SELECT * FROM wallet_trade WHERE wallet_id = ? AND ts < ?');
    const ins = db.prepare(`INSERT OR IGNORE INTO wallet_candidate_eval
      (candidate_id, wallet_id, source, role, leaderboard_survivor, discovered_ts, forward_days, pre_n, pre_pnl_usd, pre_mean_ret, pre_win_rate,
       pre_passed_holdout, pre_skill_score, post_n, post_pnl_usd, post_mean_ret, post_win_rate, evaluated_ts, ingested_ts)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    for (const c of due) {
      try {
        const end = c.discovered_ts + fwd;
        const all = trades.all(c.wallet_id, end);
        const pre = computeSkill(all, c.discovered_ts, skillOptions);          // trades strictly before discovery only
        const preS = tripStats(pairTrades(all, c.discovered_ts));
        const post = tripStats(pairTrades(all, end).filter((t) => t.close_ts >= c.discovered_ts));
        const r = ins.run(c.candidate_id, c.wallet_id, c.source, c.role, c.leaderboard_survivor, c.discovered_ts, forwardDays,
          preS.n, preS.pnl, preS.meanRet, preS.winRate, pre.passed_holdout, pre.skill_score,
          post.n, post.pnl, post.meanRet, post.winRate, now, now);
        written += Number(r.changes || 0);
      } catch { /* one bad wallet must not stop the rest */ }
    }
  } catch { /* never throw */ }
  return written;
}

// ── statistics for the report ──────────────────────────────────────────────────────────────────────────────────────
function wilson(k, n, z = 1.96) {
  if (!n) return null;
  const p = k / n, d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d, h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}
function normCdf(x) { // Abramowitz-Stegun
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}
/** One-sided two-proportion z-test: H1 = rate1 > rate0. */
function twoPropP(k1, n1, k0, n0) {
  if (!n1 || !n0) return null;
  const p = (k1 + k0) / (n1 + n0), se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n0));
  if (se === 0) return k1 / n1 > k0 / n0 ? 0 : 1;
  return 1 - normCdf((k1 / n1 - k0 / n0) / se);
}

function groupStats(rows, { minPostTrips = 3, minPreTrips = 3 } = {}) {
  const enough = rows.filter((r) => r.post_n >= minPostTrips);
  const pos = (r) => r.post_mean_ret > 0 && r.post_pnl_usd > 0;
  const k = enough.filter(pos).length;
  const preWinners = enough.filter((r) => r.pre_n >= minPreTrips && r.pre_pnl_usd > 0);
  const kp = preWinners.filter(pos).length;
  const holdoutPre = enough.filter((r) => r.pre_passed_holdout === 1);
  const kh = holdoutPre.filter(pos).length;
  const preMed = median(rows.filter((r) => r.pre_n > 0).map((r) => r.pre_mean_ret));
  const postMed = median(enough.map((r) => r.post_mean_ret));
  return {
    evaluated: rows.length, withForwardTrades: enough.length,
    positive: k, positiveRate: enough.length ? k / enough.length : null, positiveCi95: wilson(k, enough.length),
    preWinners: preWinners.length, preWinnersStayedPositive: kp, persistenceRate: preWinners.length ? kp / preWinners.length : null,
    passedHoldoutBefore: holdoutPre.length, passedHoldoutBeforeStayedPositive: kh,
    medianPreMeanReturn: preMed, medianPostMeanReturn: postMed,
    shrinkage: preMed && preMed > 0 && postMed != null ? postMed / preMed : null,   // 1 = fully persists, 0 = all gone, <0 = reversed
  };
}

const CAVEATS = [
  'Reported PnL from leaderboards and third-party APIs is never trusted. Every wallet here is re-scored from its own on-chain trades with the same holdout rule as any other wallet, using only trades before the scoring time. Only wallets that pass that holdout can ever produce a smart-money signal.',
  'Leaderboards are survivors: they list wallets because they already did well, mostly by luck in a market this noisy. Even the on-chain history of such a wallet looks better than its future. The forward test below measures that shrinkage directly.',
  'Forward test: for each wallet we compare results in the window before we discovered it with results after (default 7 days, trades that closed after discovery). The control is wallets seen on the same tokens that were not picked for performance. Wallets with fewer than 3 closed forward trades are not counted (so inactive wallets are excluded from both groups).',
  'Small samples: with few wallets per group a difference is noise. Sources below the minimum sample are labelled INSUFFICIENT_DATA and no conclusion is drawn. Many sources are compared, so treat any single p-value as exploratory.',
  'Winner back-buyers are selected with hindsight (they bought something that later went up), which is the strongest form of survivorship. A late buyer of the same token is used as its control.',
  'Not an executable strategy: no fills, fees, slippage or copy-trading latency are modelled, and the third-party field names and endpoints are taken from public documentation and have not been tested against the live services.',
];

/** Plain-language report for the dashboard. Never throws; every table is optional. */
function buildCandidateReport(db, { now = nowSec(), forwardDays = FORWARD_DAYS_DEFAULT, minGroup = 20, minPostTrips = 3, sources = null, budget = null } = {}) {
  const out = { now, forwardDays, minGroup, minPostTrips, sources: sources || [], budget, perSource: [], forward: null, caveats: CAVEATS };
  const tryAll = (sql, ...a) => { try { return db.prepare(sql).all(...a); } catch { return []; } };
  out.perSource = tryAll(`
    WITH latest AS (
      SELECT s.* FROM wallet_skill_snapshot s
      JOIN (SELECT wallet_id, MAX(as_of_ts) m FROM wallet_skill_snapshot GROUP BY wallet_id) x ON x.wallet_id = s.wallet_id AND x.m = s.as_of_ts)
    SELECT c.source, c.role, MAX(c.leaderboard_survivor) AS survivor, COUNT(DISTINCT c.wallet_id) AS wallets,
           COUNT(DISTINCT l.wallet_id) AS scored,
           COUNT(DISTINCT CASE WHEN l.passed_holdout = 1 THEN l.wallet_id END) AS passedHoldout,
           COUNT(DISTINCT CASE WHEN l.passed_holdout = 1 AND l.skill_score >= ${MIN_SMART_SCORE} THEN l.wallet_id END) AS smart,
           SUM(CASE WHEN c.reported_pnl IS NOT NULL THEN 1 ELSE 0 END) AS withReportedPnl,
           MIN(c.discovered_ts) AS firstDiscoveredTs, MAX(c.discovered_ts) AS lastDiscoveredTs
    FROM wallet_candidate c LEFT JOIN latest l ON l.wallet_id = c.wallet_id
    GROUP BY c.source, c.role ORDER BY c.role, wallets DESC`);
  const evals = tryAll(`SELECT e.* FROM wallet_candidate_eval e
    WHERE e.role = 'candidate' OR e.wallet_id NOT IN (SELECT wallet_id FROM wallet_candidate WHERE role = 'candidate')`);
  const opt = { minPostTrips };
  const cand = evals.filter((e) => e.role === 'candidate'), ctrl = evals.filter((e) => e.role === 'control');
  const candS = groupStats(cand, opt), ctrlS = groupStats(ctrl, opt);
  const survivors = groupStats(cand.filter((e) => e.leaderboard_survivor === 1), opt);
  const bySource = {};
  for (const e of evals) (bySource[`${e.role}:${e.source}`] ||= []).push(e);
  const per = Object.entries(bySource).map(([k, rows]) => ({ key: k, role: rows[0].role, source: rows[0].source, ...groupStats(rows, opt) }));
  const p = twoPropP(candS.positive, candS.withForwardTrades, ctrlS.positive, ctrlS.withForwardTrades);
  const pSurv = twoPropP(survivors.positive, survivors.withForwardTrades, ctrlS.positive, ctrlS.withForwardTrades);
  let verdict = 'INSUFFICIENT_DATA', text;
  const pct = (x) => (x == null ? 'n/a' : `${(x * 100).toFixed(0)}%`);
  if (candS.withForwardTrades < minGroup || ctrlS.withForwardTrades < minGroup) {
    text = `Too early: ${candS.withForwardTrades} candidate and ${ctrlS.withForwardTrades} control wallets have 3+ forward trades (need ${minGroup} of each). No conclusion either way.`;
  } else if (candS.positiveRate > ctrlS.positiveRate && p != null && p < 0.05) {
    verdict = 'CANDIDATES_PERSIST';
    text = `Candidate wallets stayed profitable more often than the control (${pct(candS.positiveRate)} vs ${pct(ctrlS.positiveRate)}, one-sided p=${p.toFixed(3)}). Still exploratory: confirm on fresh data before relying on it.`;
  } else {
    verdict = 'NO_PERSISTENCE_DETECTED';
    text = `Candidate wallets did not stay profitable more often than the control (${pct(candS.positiveRate)} vs ${pct(ctrlS.positiveRate)}, p=${p == null ? 'n/a' : p.toFixed(3)}). Their past results look like selection plus luck so far.`;
  }
  out.forward = { verdict, text, candidates: candS, survivors, control: ctrlS, pCandidatesVsControl: p, pSurvivorsVsControl: pSurv, bySource: per };
  return out;
}

module.exports = {
  recordCandidates, evaluateForward, buildCandidateReport, groupStats, wilson, twoPropP, getState, setState, stateKeys,
  CAVEATS, MIN_SMART_SCORE, FORWARD_DAYS_DEFAULT,
};
