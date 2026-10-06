const axios = require('axios');
const { getRadarDb } = require('./db');

// Holder / authority / creator-history data from Rugcheck (free, no key). Each check is stored as a timestamped row,
// and features only read the latest row with ts <= t, so a check can never leak into the past.
const REPORT = (mint) => `https://api.rugcheck.xyz/v1/tokens/${mint}/report`;

const CHECK_EVERY_MS = 45 * 1000;
const PER_TICK = 25;                 // ~0.5 req/s average; Rugcheck tolerated 15 back-to-back requests in testing
const SPACING_MS = 400;
const FIRST_CHECK_AGE = 4 * 60;      // wait for a few minutes of trading before spending a request
const RECHECK_AGE = 30 * 60;         // holders change fast; look again once at ~30 min
const MIN_VOL_H1 = 300;              // only vet tokens that have real activity — the candidate set

const now = () => Math.floor(Date.now() / 1000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseReport(r, tokenCreatedTs) {
  const supply = Number(r.token?.supply) || 0;
  const known = r.knownAccounts || {};
  // Curve / AMM / locker accounts legitimately hold huge supply shares and are NOT whales — exclude them.
  const excluded = (h) => ['AMM', 'LOCKER'].includes((known[h.owner] || known[h.address] || {}).type);
  const wallets = (r.topHolders || []).filter((h) => !excluded(h));
  const pcts = wallets.map((h) => Number(h.pct) || 0).sort((a, b) => b - a);

  // Creator's earlier tokens only (a later launch can't be known at decision time).
  const prev = (r.creatorTokens || []).filter((t) => t.createdAt && Date.parse(t.createdAt) / 1000 < tokenCreatedTs);
  const dead = prev.filter((t) => Number(t.marketCap) < 5000).length;

  const risks = r.risks || [];
  return {
    creator: r.creator || null,
    rc_score: Number.isFinite(r.score_normalised) ? r.score_normalised : null,
    danger_count: risks.filter((x) => x.level === 'danger').length,
    top1_pct_ex: pcts[0] ?? 0,
    top10_pct_ex: pcts.slice(0, 10).reduce((a, b) => a + b, 0),
    creator_pct: supply > 0 && r.creatorBalance != null ? (Number(r.creatorBalance) / supply) * 100 : null,
    insider_pct: (r.topHolders || []).filter((h) => h.insider).reduce((a, h) => a + (Number(h.pct) || 0), 0),
    mint_auth: r.mintAuthority ? 1 : 0,
    freeze_auth: r.freezeAuthority ? 1 : 0,
    holders: r.totalHolders ?? null,
    lp_locked_pct: Math.max(0, ...(r.markets || []).map((m) => Number(m.lp?.lpLockedPct) || 0)),
    rugged: r.rugged ? 1 : 0,
    creator_prev_count: prev.length,
    creator_prev_dead_share: prev.length ? dead / prev.length : null,
    risks_json: JSON.stringify(risks.map((x) => x.name)),
  };
}

function pending() {
  const db = getRadarDb();
  const ts = now();
  return db.prepare(`
    SELECT t.token_address, t.pool_created_ts,
           (SELECT MAX(ts) FROM token_security x WHERE x.token_address = t.token_address) AS last_check,
           (SELECT vol_h1 FROM market_snapshot s WHERE s.token_address = t.token_address ORDER BY ts DESC LIMIT 1) AS vol_h1
    FROM token t
    WHERE t.dead_ts IS NULL AND ? - t.pool_created_ts BETWEEN ? AND 6 * 3600
  `).all(ts, FIRST_CHECK_AGE).filter((t) => {
    if ((t.vol_h1 || 0) < MIN_VOL_H1) return false;
    if (!t.last_check) return true;
    return ts - t.pool_created_ts >= RECHECK_AGE && t.last_check - t.pool_created_ts < RECHECK_AGE;
  }).sort((a, b) => b.pool_created_ts - a.pool_created_ts).slice(0, PER_TICK);
}

async function checkSecurity() {
  const db = getRadarDb();
  const ins = db.prepare(`INSERT OR IGNORE INTO token_security
    (token_address, ts, creator, rc_score, danger_count, top1_pct_ex, top10_pct_ex, creator_pct, insider_pct, mint_auth, freeze_auth,
     holders, lp_locked_pct, rugged, creator_prev_count, creator_prev_dead_share, risks_json)
    VALUES (@tok, @ts, @creator, @rc_score, @danger_count, @top1_pct_ex, @top10_pct_ex, @creator_pct, @insider_pct, @mint_auth, @freeze_auth,
     @holders, @lp_locked_pct, @rugged, @creator_prev_count, @creator_prev_dead_share, @risks_json)`);
  const setCreator = db.prepare('UPDATE token SET creator = ? WHERE token_address = ? AND creator IS NULL');
  let done = 0, failed = 0;
  for (const t of pending()) {
    try {
      const { data } = await axios.get(REPORT(t.token_address), { timeout: 15000 });
      const row = parseReport(data, t.pool_created_ts);
      // ts = when we READ it, so any feature row timestamped earlier can never see it.
      ins.run({ tok: t.token_address, ts: now(), ...row });
      if (row.creator) setCreator.run(row.creator, t.token_address);
      done++;
    } catch (e) {
      failed++;
      if (e.response?.status === 429) { console.warn('[radar] rugcheck rate limited, backing off this tick'); break; }
    }
    await sleep(SPACING_MS);
  }
  return { checked: done, failed };
}

let timer = null;
function start() {
  if (timer) return;
  timer = setInterval(async () => {
    try { const r = await checkSecurity(); if (r.checked || r.failed) console.log('[radar] security', r); }
    catch (e) { console.error('[radar] security error:', e.message); }
  }, CHECK_EVERY_MS);
}
function stop() { clearInterval(timer); timer = null; }

module.exports = { start, stop, checkSecurity, parseReport };
