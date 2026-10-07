// OPTIONAL feature groups built from the MAIN database's research collectors (research/wallets, research/social).
// They are separate from the radar's own market/security/flow features so ablation can ask: does this group add
// anything beyond market + security? Nothing here is on by default; features.js attaches a group only when a source is
// configured (setExtraFeatureSource or RADAR_EXTRA_FEATURES=smartmoney,social).
//
// POINT-IN-TIME RULE (same as features.js): a feature at time t uses only records with event ts <= t AND (when the
// record carries it) ingested_ts <= t, i.e. only what we could actually have known then. Smart-money events count only
// if the wallet's skill snapshot predates the event (skill_as_of_ts < ts) and passed the holdout with a score >= 0.5.
//
// DATA ACCESS: the radar has its own radar.sqlite; this data lives in the main sqlite. A "provider" hides that:
//   smartMoney(token) -> { from, events: [{wallet, ts, side, amount_usd, skill_as_of_ts, skill_score, passed_holdout?, ingested_ts?}] } | null
//   social(token)     -> { from, posts:  [{kind:'post'|'telegram', platform, account, ts, ingested_ts?}] } | null
// All timestamps in unix SECONDS. `from` = earliest time the collector is known to have been running (so "zero
// mentions" is a real zero only after it); a null return = no data/tables at all -> every feature null (never guessed).

const MIN = 60;
const SM_WINDOW = 30 * MIN;
const SOC_WINDOW = 15 * MIN;
const SOC_DIVERSITY_WINDOW = 60 * MIN;
const MIN_SKILL = 0.5;               // same bar as research/wallets/skill.js isSmart
const ACCEL_CAP = 30;

const GROUPS = {
  smartmoney: ['sm_buyers_30m', 'sm_net_usd_30m'],
  social: ['mention_unique_accounts_15m', 'mention_accel', 'telegram_mentions_15m', 'source_diversity'],
};
const GROUP_NAMES = Object.keys(GROUPS);

function normalizeGroups(groups) {
  return (groups || []).filter((g) => GROUPS[g]);
}

function nullFeatures(groups) {
  const out = {};
  for (const g of normalizeGroups(groups)) for (const k of GROUPS[g]) out[k] = null;
  return out;
}

const knownAt = (e, t) => e.ts <= t && (e.ingested_ts === undefined || e.ingested_ts === null || e.ingested_ts <= t);

function smartMoneyFeatures(src, t) {
  const out = { sm_buyers_30m: null, sm_net_usd_30m: null };
  if (!src || !Array.isArray(src.events) || src.from === null || src.from === undefined || src.from > t) return out;
  const buyers = new Set();
  let net = 0;
  for (const e of src.events) {
    if (!knownAt(e, t) || e.ts <= t - SM_WINDOW) continue;
    // skilled AS OF THE EVENT: the skill snapshot must predate the event, pass holdout, and clear the score bar
    if (!(e.skill_as_of_ts < e.ts) || !(e.skill_score >= MIN_SKILL) || e.passed_holdout === 0) continue;
    const usd = Number(e.amount_usd) || 0;
    if (e.side === 'buy') { buyers.add(e.wallet); net += usd; } else if (e.side === 'sell') net -= usd;
  }
  out.sm_buyers_30m = buyers.size;
  out.sm_net_usd_30m = net;
  return out;
}

function median(xs) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function socialFeatures(src, t) {
  const out = { mention_unique_accounts_15m: null, mention_accel: null, telegram_mentions_15m: null, source_diversity: null };
  if (!src || !Array.isArray(src.posts) || src.from === null || src.from === undefined || src.from > t) return out;
  const seen = src.posts.filter((p) => knownAt(p, t));
  const inWin = (p, end, len) => p.ts <= end && p.ts > end - len;

  const cur = seen.filter((p) => inWin(p, t, SOC_WINDOW));
  out.mention_unique_accounts_15m = new Set(cur.filter((p) => p.kind !== 'telegram').map((p) => p.account)).size;
  out.telegram_mentions_15m = cur.filter((p) => p.kind === 'telegram').length;
  out.source_diversity = new Set(seen.filter((p) => inWin(p, t, SOC_DIVERSITY_WINDOW)).map((p) => (p.kind === 'telegram' ? 'telegram' : p.platform || 'x'))).size;

  // Acceleration vs the trailing median of the four previous 15-minute windows; needs the collector to have been
  // running for that whole hour, else the baseline would be an artefact of coverage, not of the token.
  if (src.from <= t - SOC_DIVERSITY_WINDOW) {
    const base = [1, 2, 3, 4].map((k) => seen.filter((p) => inWin(p, t - k * SOC_WINDOW, SOC_WINDOW)).length);
    out.mention_accel = Math.min(cur.length / Math.max(median(base), 1), ACCEL_CAP);
  }
  return out;
}

// One token's features at one time. Never throws: a broken provider yields nulls.
function extraFeaturesAt(provider, token, t, groups) {
  const gs = normalizeGroups(groups);
  const out = nullFeatures(gs);
  try {
    if (gs.includes('smartmoney')) Object.assign(out, smartMoneyFeatures(provider.smartMoney(token), t));
    if (gs.includes('social')) Object.assign(out, socialFeatures(provider.social(token), t));
  } catch { /* leave nulls */ }
  return out;
}

// Batch version used by loadUniverse: load the token's records once, then evaluate at every row time.
function attachExtraFeatures(rows, token, provider, groups) {
  const gs = normalizeGroups(groups);
  let sm = null, soc = null;
  try { if (gs.includes('smartmoney')) sm = provider.smartMoney(token); } catch { sm = null; }
  try { if (gs.includes('social')) soc = provider.social(token); } catch { soc = null; }
  for (const f of rows) {
    if (gs.includes('smartmoney')) Object.assign(f, smartMoneyFeatures(sm, f.ts));
    if (gs.includes('social')) Object.assign(f, socialFeatures(soc, f.ts));
  }
}

// In-memory provider (tests, synthetic worlds). `sm` / `social`: Map or plain object of token -> array.
function createMemoryProvider({ sm = {}, social = {}, smFrom = 0, socialFrom = 0 } = {}) {
  const get = (m, k) => (m instanceof Map ? m.get(k) : m[k]) || [];
  return {
    smartMoney: (token) => (smFrom === null ? null : { from: smFrom, events: get(sm, token) }),
    social: (token) => (socialFrom === null ? null : { from: socialFrom, posts: get(social, token) }),
  };
}

// Provider over the MAIN db (research tables). Read-only SELECTs; every table is optional.
function createMainDbProvider({ db: injected } = {}) {
  let db = injected || null;
  const handle = () => {
    if (!db) db = require('../db/schema').getDb();
    return db;
  };
  const tryAll = (sql, ...args) => { try { return handle().prepare(sql).all(...args); } catch { return null; } };
  const tryGet = (sql, ...args) => { try { return handle().prepare(sql).get(...args); } catch { return null; } };
  let smFrom, socFrom;                      // undefined = not looked up yet
  const skillAsOf = (wallet, ts) => {
    try { return require('../research/wallets/schema').getSkillAsOf(handle(), wallet, ts); } catch { return undefined; }   // undefined = lookup unavailable; null = no snapshot before the event
  };

  return {
    smartMoney(token) {
      // only a FOUND coverage start is cached: a null (no events yet) is re-checked, otherwise a long-running server whose
      // first lookup preceded the first event would stay blind to smart money until restart
      if (smFrom === undefined || smFrom === null) { const r = tryGet('SELECT MIN(ts) m FROM smart_money_event'); smFrom = r && r.m != null ? r.m : null; }
      if (smFrom === null) return null;
      const rows = tryAll('SELECT wallet_id, ts, side, amount_usd, skill_as_of_ts, skill_score, ingested_ts FROM smart_money_event WHERE token_id = ? ORDER BY ts', token);
      if (!rows) return null;
      const events = rows.map((r) => {
        // re-verify against the look-ahead-safe snapshot lookup; if that lookup is unavailable, trust the stored columns,
        // but if it works and finds no snapshot before the event, the wallet was not provably skilled then -> rejected
        const snap = skillAsOf(r.wallet_id, r.ts);
        const base = { wallet: r.wallet_id, ts: r.ts, side: r.side, amount_usd: r.amount_usd, ingested_ts: r.ingested_ts };
        if (snap === undefined) return { ...base, skill_as_of_ts: r.skill_as_of_ts, skill_score: r.skill_score };
        if (snap === null) return { ...base, skill_as_of_ts: Infinity, skill_score: 0 };
        return { ...base, skill_as_of_ts: snap.as_of_ts, skill_score: snap.skill_score, passed_holdout: snap.passed_holdout };
      });
      return { from: smFrom, events };
    },
    social(token) {
      if (socFrom === undefined || socFrom === null) {
        const a = tryGet('SELECT MIN(ts) m FROM account_post'), b = tryGet('SELECT MIN(ts) m FROM telegram_message');
        const ms = [a && a.m, b && b.m].filter((x) => x !== null && x !== undefined);
        socFrom = ms.length ? Math.min(...ms) / 1000 : null;      // social tables store epoch MILLISECONDS
      }
      if (socFrom === null) return null;
      const posts = tryAll('SELECT account_id, platform, ts, ingested_ts FROM account_post WHERE token_address = ? ORDER BY ts', token) || [];
      const tg = tryAll('SELECT channel_id, message_id, ts, ingested_ts FROM telegram_message WHERE token_address = ? ORDER BY ts', token) || [];
      return {
        from: socFrom,
        posts: [
          ...posts.map((p) => ({ kind: 'post', platform: p.platform, account: p.account_id, ts: p.ts / 1000, ingested_ts: p.ingested_ts / 1000 })),
          ...tg.map((m) => ({ kind: 'telegram', platform: 'telegram', account: m.channel_id, ts: m.ts / 1000, ingested_ts: m.ingested_ts / 1000 })),
        ],
      };
    },
  };
}

module.exports = {
  GROUPS, GROUP_NAMES, MIN_SKILL, nullFeatures, smartMoneyFeatures, socialFeatures, extraFeaturesAt, attachExtraFeatures,
  createMemoryProvider, createMainDbProvider, normalizeGroups,
};
