'use strict';
/**
 * "Winner-first" lookback: do mentions in our OWN stored social posts (4chan /biz, Reddit, X, Telegram) come BEFORE
 * a token's move more often for winners than for matched non-winners?
 *
 * DEFINITIONS (all configurable, see DEFAULTS)
 *  - reference time t_ref of a token = its first market_snapshot at/after pool_created_ts + refAgeSec (default 15 min).
 *    It is the "move start": the move is measured FROM the price at t_ref, never from earlier.
 *  - winner  = max price within (t_ref, t_ref + H] >= price(t_ref) * (1 + X)   (default +100% within 6h)
 *  - control = NOT a winner and the snapshots cover the horizon (or the token died). Controls are MATCHED to winners
 *    on age at t_ref, liquidity bucket and h1-volume bucket at t_ref (point-in-time), drawn with a SEEDED RNG.
 *  - EARLY mention = a post with ts STRICTLY < t_ref (and, by default, ingested_ts <= t_ref, i.e. we could have
 *    known it). Posts at/after t_ref are never early; those inside (t_ref, t_ref + H] are "reactive".
 *  - lead time = t_ref - ts of a source's first early mention of that token.
 *
 * All timestamps in the report are unix SECONDS. Social tables store epoch MILLISECONDS and radar tables store
 * SECONDS; conversion happens only in loadMentions().
 *
 * Statistics: per source, early-mention rate among winners vs controls (difference), token-level bootstrap 95% CI and a
 * one-sided pooled-bootstrap p-value; Bonferroni and Benjamini-Hochberg across all sources that pass the minimum-sample
 * rules. The same is done for the post-t_ref ("chasing") rate to separate MOSTLY_REACTIVE from NO_EDGE.
 * Verdicts: INSUFFICIENT_DATA | NO_EDGE | POSSIBLE_EDGE | MOSTLY_REACTIVE.
 */
const { mulberry32, quantile } = require('./evaluate');

const DEFAULTS = {
  winnerReturn: 1.0,            // +100%
  horizonSec: 6 * 3600,
  refAgeSec: 15 * 60,
  refSlackSec: 10 * 60,         // first snapshot must be within this of the target ref time
  coverageFrac: 0.8,            // non-winners need snapshots covering this fraction of the horizon (or be dead)
  controlsPerWinner: 3,
  seed: 42,
  lookbackDays: 14,
  maxTokens: 5000,
  earlyLookbackSec: 24 * 3600,
  cashtagMaxAgeSec: 24 * 3600,  // an unresolved $TICKER only counts within this long after the token's creation
  requireKnowable: true,        // early mention also needs ingested_ts <= t_ref
  // minimum-sample rules (per source)
  minWinners: 20, minControls: 20, minMentionedTokens: 10, minEarlyWinners: 5, minLeadSec: 60,
  alpha: 0.05, bootstrapIters: 2000, reactiveShare: 0.7, maxSourcesReported: 60,
};

const CAVEATS = [
  'Selection bias: we only see tokens the radar tracked and posts our collectors stored. Winners are picked with hindsight, so a source that posts about everything will look good unless the matched controls say otherwise.',
  '4chan is anonymous: posts have no account identity, so 4chan results are per board and per thread (a thread-level poster id only where the board provides one). They tell you whether /biz chatter leads, not whether any person does.',
  'Small samples: a handful of winners can produce a striking rate by luck. Sources below the minimum sample are reported as insufficient and excluded from significance tests; many sources are tested, so p-values are corrected (Bonferroni and Benjamini-Hochberg).',
  'Mentions are time-stamped at the real post time; a post only counts as early if it is strictly earlier than the move start and was already in our database by then. The move start is a fixed reference point (token age), not the price low, so very early pump chatter may be classed as reactive or missed.',
  'Cashtag matches ($TICKER) are only accepted when the symbol is unambiguous among tokens we track; copycat tickers outside our universe can create false matches. Contract addresses are exact.',
  'This is a research lookback on stored data, not a backtest of a tradable strategy: no fills, fees or slippage, and a source that leads is not proven to be causal.',
];

// ---------- small pure helpers ----------
const sortedCopy = (a) => a.slice().sort((x, y) => x - y);
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const logBucket = (x) => (x == null || !(x >= 0) ? -1 : Math.floor(Math.log10(x + 1) * 2));   // half-decades

/**
 * Classify one token. tok = {address, symbol?, created (s), dead_ts?, snaps: [{ts, price, liq, vol}]}.
 * Returns {status:'winner'|'control'|'skip', reason?, ref?, maxRet?, bucket?}.
 */
function classifyToken(tok, cfg = DEFAULTS) {
  const snaps = (tok.snaps || []).filter((s) => Number.isFinite(s.ts) && s.price > 0).sort((a, b) => a.ts - b.ts);
  const target = tok.created + cfg.refAgeSec;
  const ref = snaps.find((s) => s.ts >= target);
  if (!ref || ref.ts > target + cfg.refSlackSec) return { status: 'skip', reason: 'no_reference_snapshot' };
  const end = ref.ts + cfg.horizonSec;
  let peak = ref.price;
  for (const s of snaps) if (s.ts > ref.ts && s.ts <= end && s.price > peak) peak = s.price;
  const maxRet = peak / ref.price - 1;
  const base = { ref: { ts: ref.ts, price: ref.price, liq: ref.liq, vol: ref.vol }, maxRet };
  base.bucket = { age: Math.floor(Math.log2(Math.max(1, (ref.ts - tok.created) / 60))), liq: logBucket(ref.liq), vol: logBucket(ref.vol) };
  if (maxRet >= cfg.winnerReturn) return { status: 'winner', ...base };
  const last = snaps[snaps.length - 1].ts;
  const covered = last >= ref.ts + cfg.horizonSec * cfg.coverageFrac;
  const dead = tok.dead_ts != null && tok.dead_ts <= end;
  if (!covered && !dead) return { status: 'skip', reason: 'horizon_not_covered' };
  return { status: 'control', ...base };
}

/** Match up to controlsPerWinner controls per winner on (age, liquidity, volume) buckets, without replacement. */
function matchControls(winners, pool, cfg = DEFAULTS, rng = mulberry32(cfg.seed)) {
  const strata = new Map();
  const key = (b) => `${b.age}|${b.liq}|${b.vol}`;
  for (const c of shuffle(pool, rng)) {
    const k = key(c.bucket);
    if (!strata.has(k)) strata.set(k, []);
    strata.get(k).push(c);
  }
  const picked = []; let unmatched = 0;
  for (const w of shuffle(winners, rng)) {
    let got = 0;
    const tries = [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1]];       // exact, then neighbouring buckets
    for (const [dl, dv] of tries) {
      const arr = strata.get(key({ age: w.bucket.age, liq: w.bucket.liq + dl, vol: w.bucket.vol + dv }));
      while (arr && arr.length && got < cfg.controlsPerWinner) { picked.push(arr.pop()); got++; }
      if (got >= cfg.controlsPerWinner) break;
    }
    if (got === 0) unmatched++;
  }
  return { controls: picked, unmatchedWinners: unmatched };
}

/**
 * Resolve raw mention records to tokens. raw: {ts, ingested_ts (s), platform, srcs:[[level,id]], addresses[], cashtags[]}.
 * tokens: [{address, symbol, created}]. Returns Map(address -> [{ts, ingested_ts, platform, srcs}]).
 * Mentions before a token's creation are impossible/noise and dropped; cashtags only match unambiguous symbols
 * among tokens that already existed at the post time, within cashtagMaxAgeSec.
 */
function resolveMentions(raws, tokens, cfg = DEFAULTS) {
  const byAddr = new Map(tokens.map((t) => [t.address, t]));
  const bySym = new Map();
  for (const t of tokens) {
    if (!t.symbol) continue;
    const k = String(t.symbol).toUpperCase();
    if (!bySym.has(k)) bySym.set(k, []);
    bySym.get(k).push(t);
  }
  const out = new Map();
  for (const r of raws) {
    const hit = new Set();
    for (const a of r.addresses || []) { const t = byAddr.get(a); if (t && r.ts >= t.created) hit.add(t.address); }
    for (const c of r.cashtags || []) {
      const cands = (bySym.get(String(c).toUpperCase()) || []).filter((t) => t.created <= r.ts);
      if (cands.length === 1 && r.ts - cands[0].created <= cfg.cashtagMaxAgeSec) hit.add(cands[0].address);
    }
    for (const a of hit) {
      if (!out.has(a)) out.set(a, []);
      out.get(a).push({ ts: r.ts, ingested_ts: r.ingested_ts, platform: r.platform, srcs: r.srcs });
    }
  }
  return out;
}

/** Pooled token-level bootstrap for a difference of binary rates (winners xs - controls ys). One-sided p(diff >= observed). */
function bootstrapRateDiff(xs, ys, iters, rng) {
  const nx = xs.length, ny = ys.length;
  const obs = mean(xs) - mean(ys);
  const diffs = new Array(iters);
  let ge = 0;
  const z = xs.concat(ys), nz = z.length;
  for (let b = 0; b < iters; b++) {
    let sx = 0, sy = 0;
    for (let i = 0; i < nx; i++) sx += xs[(rng() * nx) | 0];
    for (let i = 0; i < ny; i++) sy += ys[(rng() * ny) | 0];
    diffs[b] = sx / nx - sy / ny;
    let nx0 = 0, ny0 = 0;
    for (let i = 0; i < nx; i++) nx0 += z[(rng() * nz) | 0];
    for (let i = 0; i < ny; i++) ny0 += z[(rng() * nz) | 0];
    if (nx0 / nx - ny0 / ny >= obs - 1e-12) ge++;
  }
  const sorted = sortedCopy(diffs);
  return { diff: obs, ci95: [quantile(sorted, 0.025), quantile(sorted, 0.975)], p: (1 + ge) / (iters + 1) };
}

/** Benjamini-Hochberg adjusted p-values (q-values), same order as input. */
function bhAdjust(ps) {
  const m = ps.length;
  const idx = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]);
  const q = new Array(m);
  let prev = 1;
  for (let k = m - 1; k >= 0; k--) {
    prev = Math.min(prev, (idx[k][0] * m) / (k + 1));
    q[idx[k][1]] = Math.min(1, prev);
  }
  return q;
}
const bonferroni = (ps) => ps.map((p) => Math.min(1, p * ps.length));

/**
 * Per-source analysis on a classified sample.
 * sample: [{address, group:'winner'|'control', created, ref:{ts}}]; mentions: Map(address -> mentions);
 * coverage: {platform: earliestIngestedSec} (a token is only evaluable for a source whose platform was being
 * collected when the token was created).
 */
function analyzeSources(sample, mentions, coverage, cfg = DEFAULTS, rng = mulberry32(cfg.seed + 1)) {
  const srcs = new Map();
  let lateIngested = 0;
  for (const tok of sample) {
    for (const m of mentions.get(tok.address) || []) {
      const lead = tok.ref.ts - m.ts;
      let kind = null;
      if (m.ts < tok.ref.ts) {
        if (lead > cfg.earlyLookbackSec) continue;
        if (cfg.requireKnowable && !(m.ingested_ts <= tok.ref.ts)) { lateIngested++; continue; }   // posted earlier, but not in our DB by then
        kind = 'early';
      } else if (m.ts <= tok.ref.ts + cfg.horizonSec) kind = 'after';   // strictly >= t_ref: never early
      if (!kind) continue;
      for (const [level, id] of m.srcs) {
        const k = `${level}:${id}`;
        if (!srcs.has(k)) srcs.set(k, { key: k, level, id, platform: m.platform, tokens: new Map() });
        const s = srcs.get(k);
        const rec = s.tokens.get(tok.address) || { lead: null, after: false };
        if (kind === 'early') rec.lead = rec.lead == null ? lead : Math.max(rec.lead, lead);
        else rec.after = true;
        s.tokens.set(tok.address, rec);
      }
    }
  }
  const out = [];
  for (const s of srcs.values()) {
    const cov = coverage ? coverage[s.platform] : null;
    const elig = sample.filter((t) => cov != null && t.created >= cov);
    const W = elig.filter((t) => t.group === 'winner'), C = elig.filter((t) => t.group === 'control');
    const ind = (list, f) => list.map((t) => { const r = s.tokens.get(t.address); return r && f(r) ? 1 : 0; });
    const earlyW = ind(W, (r) => r.lead != null), earlyC = ind(C, (r) => r.lead != null);
    const afterW = ind(W, (r) => r.after), afterC = ind(C, (r) => r.after);
    const reactOnlyW = ind(W, (r) => r.after && r.lead == null);
    const leadsW = W.map((t) => (s.tokens.get(t.address) || {}).lead).filter((x) => x != null);
    const leadsC = C.map((t) => (s.tokens.get(t.address) || {}).lead).filter((x) => x != null);
    const sum = (a) => a.reduce((x, y) => x + y, 0);
    const mentionedTokens = elig.filter((t) => s.tokens.has(t.address)).length;
    const stat = {
      key: s.key, level: s.level, id: s.id, platform: s.platform,
      nWinners: W.length, nControls: C.length, mentionedTokens,
      winnersPreceded: sum(earlyW), controlsPreceded: sum(earlyC),
      rateWinners: W.length ? mean(earlyW) : null, rateControls: C.length ? mean(earlyC) : null,
      reactiveWinners: sum(reactOnlyW), afterWinners: sum(afterW), afterControls: sum(afterC),
      leadWinners: { n: leadsW.length, medianSec: quantile(sortedCopy(leadsW), 0.5), p25Sec: quantile(sortedCopy(leadsW), 0.25) },
      leadControls: { n: leadsC.length, medianSec: quantile(sortedCopy(leadsC), 0.5), p25Sec: quantile(sortedCopy(leadsC), 0.25) },
      _x: { earlyW, earlyC, afterW, afterC },
    };
    const why = [];
    if (W.length < cfg.minWinners) why.push(`only ${W.length} winners evaluable (need ${cfg.minWinners})`);
    if (C.length < cfg.minControls) why.push(`only ${C.length} controls evaluable (need ${cfg.minControls})`);
    if (mentionedTokens < cfg.minMentionedTokens) why.push(`only ${mentionedTokens} tokens mentioned (need ${cfg.minMentionedTokens})`);
    stat.insufficientReasons = why;
    stat.tested = why.length === 0;
    out.push(stat);
  }
  const tested = out.filter((s) => s.tested);
  for (const s of tested) {
    s.early = bootstrapRateDiff(s._x.earlyW, s._x.earlyC, cfg.bootstrapIters, rng);
    s.after = bootstrapRateDiff(s._x.afterW, s._x.afterC, cfg.bootstrapIters, rng);
  }
  const m = tested.length;
  const qE = bhAdjust(tested.map((s) => s.early.p)), bE = bonferroni(tested.map((s) => s.early.p));
  const qA = bhAdjust(tested.map((s) => s.after.p));
  tested.forEach((s, i) => {
    s.early.qBH = qE[i]; s.early.pBonferroni = bE[i]; s.after.qBH = qA[i];
    s.testsInFamily = m;
  });
  for (const s of out) { s.verdict = classifySource(s, cfg); delete s._x; }
  return { sources: out, lateIngested };
}

function classifySource(s, cfg = DEFAULTS) {
  if (!s.tested) return 'INSUFFICIENT_DATA';
  const e = s.early, med = s.leadWinners.medianSec;
  if (s.winnersPreceded >= cfg.minEarlyWinners && e.diff > 0 && e.ci95[0] > 0 && e.qBH < cfg.alpha && med != null && med >= cfg.minLeadSec) return 'POSSIBLE_EDGE';
  const mentioned = s.winnersPreceded + s.reactiveWinners;
  const earlyShare = mentioned ? s.winnersPreceded / mentioned : 1;
  if (s.reactiveWinners >= cfg.minEarlyWinners && s.after.diff > 0 && s.after.qBH < cfg.alpha && earlyShare <= 1 - cfg.reactiveShare) return 'MOSTLY_REACTIVE';
  return 'NO_EDGE';
}

function overallVerdict(sources) {
  const tested = sources.filter((s) => s.verdict !== 'INSUFFICIENT_DATA');
  if (!tested.length) return 'INSUFFICIENT_DATA';
  if (tested.some((s) => s.verdict === 'POSSIBLE_EDGE')) return 'POSSIBLE_EDGE';
  if (tested.filter((s) => s.verdict === 'MOSTLY_REACTIVE').length * 2 > tested.length) return 'MOSTLY_REACTIVE';
  return 'NO_EDGE';
}

const hmm = (s) => (s == null ? 'n/a' : s >= 3600 ? `${(s / 3600).toFixed(1)}h` : `${Math.round(s / 60)}m`);
function explain(verdict, sources, counts) {
  const top = sources.filter((s) => s.verdict === 'POSSIBLE_EDGE').slice(0, 3);
  const base = `${counts.winners} winners vs ${counts.controls} matched non-winners.`;
  if (verdict === 'INSUFFICIENT_DATA') return `Not enough data to say who mentions winners early (${base}) Keep the collectors running; no conclusion either way.`;
  if (verdict === 'POSSIBLE_EDGE') {
    return `Possible early-mention signal (unproven): ${top.map((s) => `${s.key} preceded ${s.winnersPreceded}/${s.nWinners} winners vs ${s.controlsPreceded}/${s.nControls} controls, median lead ${hmm(s.leadWinners.medianSec)}`).join('; ')}. ${base} Confirm on fresh data before relying on it.`;
  }
  if (verdict === 'MOSTLY_REACTIVE') return `Mentions mostly arrive after the move: sources talk about winners once they are already up. ${base} That is chasing, not leading.`;
  return `No source shows a reliable lead over matched non-winners. ${base}`;
}

/** Full pure pipeline over already-loaded data. tokens: [{address,symbol,created,dead_ts,snaps}]. */
function computeWinnerFirst({ tokens, raws, coverage }, userCfg = {}) {
  const cfg = { ...DEFAULTS, ...userCfg };
  const rng = mulberry32(cfg.seed);
  const winners = [], pool = [], skipped = {};
  for (const t of tokens) {
    const c = classifyToken(t, cfg);
    if (c.status === 'skip') { skipped[c.reason] = (skipped[c.reason] || 0) + 1; continue; }
    const row = { address: t.address, created: t.created, ...c, group: c.status };
    (c.status === 'winner' ? winners : pool).push(row);
  }
  const { controls, unmatchedWinners } = matchControls(winners, pool, cfg, rng);
  controls.forEach((c) => { c.group = 'control'; });
  const sample = [...winners, ...controls];
  const symOf = new Map(tokens.map((t) => [t.address, t.symbol]));
  const mentions = resolveMentions(raws || [], sample.map((r) => ({ address: r.address, created: r.created, symbol: symOf.get(r.address) })), cfg);
  const { sources, lateIngested } = analyzeSources(sample, mentions, coverage || {}, cfg, mulberry32(cfg.seed + 1));
  const order = { POSSIBLE_EDGE: 0, MOSTLY_REACTIVE: 1, NO_EDGE: 2, INSUFFICIENT_DATA: 3 };
  sources.sort((a, b) => order[a.verdict] - order[b.verdict] || (a.early ? a.early.p : 2) - (b.early ? b.early.p : 2) || b.mentionedTokens - a.mentionedTokens);
  const counts = { winners: winners.length, controls: controls.length, candidatesNonWinners: pool.length, unmatchedWinners, skipped, lateIngested };
  const verdict = overallVerdict(sources);
  const keep = sources.filter((s, i) => i < cfg.maxSourcesReported || s.level === 'platform');
  return { verdict, summary: explain(verdict, sources, counts), counts, sources: keep, sourcesTotal: sources.length, config: cfg, caveats: CAVEATS };
}

// ---------- storage + loading (I/O) ----------
function initWinnerFirstSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS winner_first_report (
      report_id  INTEGER PRIMARY KEY AUTOINCREMENT,
      created_ts INTEGER NOT NULL,
      verdict    TEXT NOT NULL,
      json       TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_winner_first_created ON winner_first_report(created_ts);
    CREATE TRIGGER IF NOT EXISTS winner_first_report_no_update BEFORE UPDATE ON winner_first_report BEGIN SELECT RAISE(ABORT, 'winner_first_report is append-only'); END;
    CREATE TRIGGER IF NOT EXISTS winner_first_report_no_delete BEFORE DELETE ON winner_first_report BEGIN SELECT RAISE(ABORT, 'winner_first_report is append-only'); END;
  `);
}

/** Tokens + snapshots from the radar db (seconds). Only tokens whose full horizon has elapsed. */
function loadTokens(radarDb, cfg, nowSec) {
  const minCreated = nowSec - cfg.lookbackDays * 86400;
  const maxCreated = nowSec - cfg.refAgeSec - cfg.refSlackSec - cfg.horizonSec;
  const rows = radarDb.prepare('SELECT token_address, symbol, pool_created_ts, dead_ts FROM token WHERE pool_created_ts >= ? AND pool_created_ts <= ? ORDER BY pool_created_ts DESC LIMIT ?')
    .all(minCreated, maxCreated, cfg.maxTokens);
  const q = radarDb.prepare('SELECT ts, price_usd, liquidity_usd, vol_h1 FROM market_snapshot WHERE token_address = ? AND ts >= ? AND ts <= ? ORDER BY ts');
  return rows.map((r) => ({
    address: r.token_address, symbol: r.symbol, created: r.pool_created_ts, dead_ts: r.dead_ts,
    snaps: q.all(r.token_address, r.pool_created_ts, r.pool_created_ts + cfg.refAgeSec + cfg.refSlackSec + cfg.horizonSec + 3600)
      .map((s) => ({ ts: s.ts, price: s.price_usd, liq: s.liquidity_usd, vol: s.vol_h1 })),
  }));
}

const safeJson = (s) => { try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; } catch { return []; } };

/** Stored posts (ms in DB) -> raw mention records (s). Every table is optional. */
function loadMentions(mainDb, fromSec, toSec) {
  const raws = [];
  const coverage = {};
  const tryAll = (sql, ...a) => { try { return mainDb.prepare(sql).all(...a); } catch { return []; } };
  for (const r of tryAll('SELECT platform, MIN(ingested_ts) m FROM social_post_raw GROUP BY platform')
    .concat(tryAll("SELECT platform, MIN(ingested_ts) m FROM account_post WHERE platform NOT IN ('4chan','reddit') GROUP BY platform"))) coverage[r.platform] = r.m / 1000;
  for (const r of tryAll("SELECT MIN(ingested_ts) m FROM telegram_message")) if (r.m != null) coverage.telegram = r.m / 1000;
  for (const r of tryAll('SELECT platform, source_id, thread_id, author_id, ts, ingested_ts, addresses_json, cashtags_json FROM social_post_raw WHERE ts >= ? AND ts <= ?', fromSec * 1000, toSec * 1000)) {
    const srcs = [['platform', r.platform], ['community', `${r.platform}:${r.source_id}`]];
    if (r.thread_id) srcs.push(['thread', r.thread_id]);
    if (r.author_id) srcs.push(['account', r.author_id]);      // null for anonymous 4chan posts
    raws.push({ ts: r.ts / 1000, ingested_ts: r.ingested_ts / 1000, platform: r.platform, srcs, addresses: safeJson(r.addresses_json), cashtags: safeJson(r.cashtags_json) });
  }
  for (const r of tryAll("SELECT platform, account_id, token_address, ts, ingested_ts FROM account_post WHERE token_address IS NOT NULL AND platform NOT IN ('4chan','reddit') AND ts >= ? AND ts <= ?", fromSec * 1000, toSec * 1000)) {
    raws.push({ ts: r.ts / 1000, ingested_ts: r.ingested_ts / 1000, platform: r.platform, srcs: [['platform', r.platform], ['account', r.account_id]], addresses: [r.token_address], cashtags: [] });
  }
  for (const r of tryAll('SELECT channel_id, token_address, ts, ingested_ts FROM telegram_message WHERE token_address IS NOT NULL AND ts >= ? AND ts <= ?', fromSec * 1000, toSec * 1000)) {
    raws.push({ ts: r.ts / 1000, ingested_ts: r.ingested_ts / 1000, platform: 'telegram', srcs: [['platform', 'telegram'], ['community', `telegram:${r.channel_id}`]], addresses: [r.token_address], cashtags: [] });
  }
  return { raws, coverage };
}

/** Run + store. radarDb: radar.sqlite handle; mainDb: main sqlite (social tables + report table). Never throws. */
function runWinnerFirst(radarDb, mainDb, opts = {}) {
  try {
    initWinnerFirstSchema(mainDb);
    const cfg = { ...DEFAULTS, ...(opts.config || {}) };
    const nowSec = opts.nowSec != null ? opts.nowSec : Math.floor(Date.now() / 1000);
    const tokens = loadTokens(radarDb, cfg, nowSec);
    const { raws, coverage } = loadMentions(mainDb, nowSec - (cfg.lookbackDays + 2) * 86400, nowSec + 60);
    const result = computeWinnerFirst({ tokens, raws, coverage }, cfg);
    result.counts.tokensConsidered = tokens.length;
    result.counts.postsLoaded = raws.length;
    result.coverageStartTs = coverage;
    const report = { created_ts: nowSec, ...result };
    const info = mainDb.prepare('INSERT INTO winner_first_report (created_ts, verdict, json) VALUES (?,?,?)').run(nowSec, report.verdict, JSON.stringify(report));
    return { ok: true, report_id: Number(info.lastInsertRowid), ...report };
  } catch (e) {
    console.error('[winnerFirst] run failed:', e.message);
    return { ok: false, error: e.message };
  }
}

function latestWinnerFirst(mainDb) {
  initWinnerFirstSchema(mainDb);
  const row = mainDb.prepare('SELECT report_id, json FROM winner_first_report ORDER BY report_id DESC LIMIT 1').get();
  if (!row) return null;
  try { return { report_id: row.report_id, ...JSON.parse(row.json) }; } catch { return null; }
}

let timer = null;
/**
 * Scheduler, guarded by env WINNER_FIRST_JOB=1. getRadarDb may be a function (lazy) or a db handle.
 * Add to backend/src/index.js after `require('./research/eval/report').start(rdb);`:
 *   require('./research/eval/winnerFirst').start(() => require('./radar/db').getRadarDb(), rdb);
 */
function start(getRadarDb, mainDb, { intervalMs = Number(process.env.WINNER_FIRST_INTERVAL_MS) || 6 * 3600 * 1000, initialDelayMs = 5 * 60 * 1000, config } = {}) {
  if (process.env.WINNER_FIRST_JOB !== '1') return null;
  if (timer) return timer;
  const envCfg = {};
  if (process.env.WINNER_FIRST_RETURN_PCT) envCfg.winnerReturn = Number(process.env.WINNER_FIRST_RETURN_PCT) / 100;
  if (process.env.WINNER_FIRST_HORIZON_HOURS) envCfg.horizonSec = Number(process.env.WINNER_FIRST_HORIZON_HOURS) * 3600;
  if (process.env.WINNER_FIRST_REF_AGE_MIN) envCfg.refAgeSec = Number(process.env.WINNER_FIRST_REF_AGE_MIN) * 60;
  if (process.env.WINNER_FIRST_SEED) envCfg.seed = Number(process.env.WINNER_FIRST_SEED);
  const tick = () => {
    try {
      const radar = typeof getRadarDb === 'function' ? getRadarDb() : getRadarDb;
      const r = runWinnerFirst(radar, mainDb, { config: { ...envCfg, ...config } });
      console.log('[winnerFirst] run', JSON.stringify({ ok: r.ok, verdict: r.verdict, counts: r.counts }));
    } catch (e) { console.error('[winnerFirst] tick failed:', e.message); }
  };
  const first = setTimeout(tick, initialDelayMs);
  timer = setInterval(tick, intervalMs);
  if (first.unref) first.unref();
  if (timer.unref) timer.unref();
  return timer;
}
function stop() { if (timer) { clearInterval(timer); timer = null; } }

module.exports = {
  DEFAULTS, CAVEATS, classifyToken, matchControls, resolveMentions, analyzeSources, classifySource, overallVerdict,
  computeWinnerFirst, bootstrapRateDiff, bhAdjust, bonferroni, initWinnerFirstSchema, loadTokens, loadMentions,
  runWinnerFirst, latestWinnerFirst, start, stop,
};
