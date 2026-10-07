// Bridge between the radar (backend/src/radar, own radar.sqlite) and the API/terminal.
// The radar is THE signal engine: this module computes the CURRENT score of a tracked token from stored data up to
// "now" only (point-in-time, same feature code and same model functions the research report replays), and maps it to
// the API shape. Pure mapping helpers (no I/O) are at the top and unit-tested; DB access is lazy and never throws.
//
// Honest framing: the score is a hand-set activity/risk composite (market_v2), NOT a fitted or validated prediction.
// Cross-sectional features (rank vs other new tokens, market regime) and creator_rug_rate_own are only available in the
// batch research universe and are left null here; the model treats null as "no contribution".

const RADAR_MODEL = 'market_v2';
const GATE_THRESHOLD = { top1: 35, top10: 60, creator: 20, insider: 25, prevDead: 0.8 }; // mirror features.isSafe
const MIN = 60;
const LIST_MAX_STALE_SEC = 15 * 60;   // snapshots older than this are not "current"
const DEFAULT_MAX_AGE_HOURS = 24;

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const lin = (x, lo, hi) => (x === null || x === undefined ? 0 : clamp01((x - lo) / (hi - lo)));
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const r1 = (x) => (isNum(x) ? Math.round(x * 10) / 10 : null);
const r3 = (x) => (isNum(x) ? Math.round(x * 1000) / 1000 : null);

// ── pure helpers ─────────────────────────────────────────────────────────────

// Radar security/behaviour flags in the same {code,label,detail} shape as the activity-v0 riskFlags.
// `severity`: 'danger' (hard rug indicators) | 'warn'.
function radarRiskFlags(f) {
  const out = [];
  const add = (code, label, detail, severity = 'warn') => out.push({ code, label, detail, severity, source: 'radar' });
  if (!f || f.has_sec !== 1) {
    add('UNVETTED', 'Not yet vetted', 'No holder/authority check yet; treated as unsafe until Rugcheck data arrives');
  } else {
    if (f.rugged) add('RUGGED', 'Flagged rugged', 'Rugcheck marks this token as rugged', 'danger');
    if (f.mint_auth) add('MINT_AUTHORITY', 'Mint authority active', 'Supply can still be increased', 'danger');
    if (f.freeze_auth) add('FREEZE_AUTHORITY', 'Freeze authority active', 'Holder accounts can be frozen', 'danger');
    if (isNum(f.top1_pct_ex) && f.top1_pct_ex >= GATE_THRESHOLD.top1) {
      add('TOP_HOLDER', 'Whale holder', `Largest holder owns ${r1(f.top1_pct_ex)}% (excl. pool/curve)`, 'danger');
    }
    if (isNum(f.top10_pct_ex) && f.top10_pct_ex >= GATE_THRESHOLD.top10) {
      add('HOLDER_CONCENTRATION', 'Concentrated holders', `Top 10 hold ${r1(f.top10_pct_ex)}% (excl. pool/curve)`, 'danger');
    }
    if (isNum(f.creator_pct) && f.creator_pct >= GATE_THRESHOLD.creator) {
      add('CREATOR_HOLDS', 'Creator holds a lot', `Creator wallet holds ${r1(f.creator_pct)}% of supply`, 'warn');
    }
    if (isNum(f.insider_pct) && f.insider_pct >= GATE_THRESHOLD.insider) {
      add('INSIDERS', 'Insider cluster', `Linked/insider wallets hold ${r1(f.insider_pct)}%`, 'danger');
    }
    if (isNum(f.creator_prev_dead_share) && f.creator_prev_dead_share >= GATE_THRESHOLD.prevDead) {
      add('SERIAL_RUGGER', 'Creator history', `${Math.round(f.creator_prev_dead_share * 100)}% of the creator's earlier tokens died`, 'danger');
    }
    if (isNum(f.danger_count) && f.danger_count > 0) {
      add('RUGCHECK_DANGER', 'Rugcheck danger items', `${f.danger_count} danger-level risk(s) reported`, 'warn');
    }
    if (isNum(f.lp_locked_pct) && f.lp_locked_pct < 1 && f.migrated === 1) {
      add('LP_NOT_LOCKED', 'Liquidity not locked', 'No locked LP detected on the AMM pool', 'warn');
    }
  }
  if (f && f.dev_sold) add('DEV_SOLD', 'Creator sold', 'Creator wallet has sold in the watched trade stream', 'danger');
  if (f && isNum(f.buyer_hhi_5m) && f.buyer_hhi_5m >= 0.5 && (f.unique_buyers_5m ?? 99) >= 1) {
    add('CONCENTRATED_BUYING', 'One wallet dominates buying', 'Recent buying is concentrated in very few wallets (possible fake volume)', 'warn');
  }
  return out;
}

// Same gate as radar/features.isSafe, duplicated so this stays pure/testable (test pins them together when radar loads).
function passesSafetyGate(f) {
  return !!f && f.has_sec === 1 && !f.mint_auth && !f.freeze_auth && !f.rugged &&
    (f.top10_pct_ex ?? 100) < GATE_THRESHOLD.top10 && (f.top1_pct_ex ?? 100) < GATE_THRESHOLD.top1 &&
    (f.creator_pct ?? 0) < GATE_THRESHOLD.creator && (f.insider_pct ?? 0) < GATE_THRESHOLD.insider &&
    (f.creator_prev_dead_share ?? 0) < GATE_THRESHOLD.prevDead && (f.creator_rug_rate_own ?? 0) < 0.6;
}

function levelFor(score) {
  if (!isNum(score)) return 'QUIET';
  // Bands sit below activity-v0's because market_v2's attainable ceiling for an early setup is lower (radar fires at 55).
  if (score >= 55) return 'HOT';
  if (score >= 40) return 'ACTIVE';
  if (score >= 20) return 'WARMING';
  return 'QUIET';
}

// Component breakdown of market_v2's base terms, 0-100 each, for display. Same weights as the model.
function radarComponents(f) {
  const logVol = lin(Math.log1p(f.volume_accel ?? 0), Math.log1p(1), Math.log1p(10));
  const mk = (score, weight, have) => ({ score: have ? r1(100 * score) : null, weight });
  return {
    volume_accel: mk(logVol, 0.25, f.volume_accel != null),
    rank_vs_cohort: mk(lin(f.rank_vol_accel, 0.7, 1), 0.15, f.rank_vol_accel != null),
    buy_pressure: mk(lin(f.buy_pressure, 0.5, 0.8), 0.15, f.buy_pressure != null),
    txn_accel: mk(lin(f.txn_accel, 1, 6), 0.10, f.txn_accel != null),
    price_momentum: mk(lin(f.price_chg_15m, 0, 0.6), 0.10, f.price_chg_15m != null),
    curve_progress: mk(lin(f.curve_progress, 0.15, 0.8), 0.10, f.curve_progress != null),
    market_regime: mk(lin(f.mkt_buy_pressure, 0.45, 0.6), 0.05, f.mkt_buy_pressure != null),
    calm_price: mk(1 - lin(f.realized_vol_30m, 0.05, 0.4), 0.10, f.realized_vol_30m != null),
  };
}

function radarConfidence(f) {
  const keys = ['volume_accel', 'buy_pressure', 'price_chg_15m', 'txn_accel', 'liq_delta_15m', 'realized_vol_30m'];
  const market = keys.filter((k) => f[k] != null).length / keys.length;
  const c = 0.5 * market + 0.35 * (f.has_sec === 1 ? 1 : 0) + 0.15 * (f.age_min >= 15 ? 1 : 0);
  return Math.round(clamp01(c) * 100) / 100;
}

function bondingState(f, token) {
  if (token && token.migrated_ts) return 'graduated';
  if (!f) return 'new';
  if (f && f.liq_estimated === 1) return 'bonding';
  if (f && f.curve_progress != null) return 'bonding';
  return token && /pump/i.test(token.launchpad || token.dex || '') && !(f && f.liquidity_usd > 0) ? 'bonding' : 'amm';
}

// Overlay launch/promo/socials and the latest security row (as of now) onto a market feature row (mutates + returns f).
function attachContext(f, { sec, launch, promos } = {}) {
  const SEC = ['top1_pct_ex', 'top10_pct_ex', 'creator_pct', 'insider_pct', 'mint_auth', 'freeze_auth', 'rc_score',
    'danger_count', 'holders', 'lp_locked_pct', 'rugged', 'creator_prev_count', 'creator_prev_dead_share'];
  f.has_sec = sec ? 1 : 0;
  f.sec_age_min = sec ? (f.ts - sec.ts) / MIN : null;
  for (const k of SEC) f[k] = sec ? sec[k] : null;
  let boost = 0, profile = 0, cto = 0, links = null;
  for (const p of promos || []) {
    if (p.ts > f.ts) continue;
    if (p.kind === 'boost') boost = Math.max(boost, p.amount_key);
    if (p.kind === 'profile') { profile = 1; links = p.links_json; }
    if (p.kind === 'cto') cto = 1;
  }
  const link = (n) => (links && links.includes(n) ? 1 : 0);
  f.dev_buy_sol = launch ? launch.dev_buy_sol : null;
  f.mayhem = launch ? launch.mayhem : null;
  f.has_twitter = Math.max(launch?.has_twitter || 0, link('twitter'));
  f.has_telegram = Math.max(launch?.has_telegram || 0, link('telegram'));
  f.has_website = Math.max(launch?.has_website || 0, link('website'));
  f.boost_total = boost;
  f.has_profile = profile;
  f.cto = cto;
  return f;
}

const KEY_FEATURES = ['volume_accel', 'buy_pressure', 'txn_accel', 'price_chg_5m', 'price_chg_15m', 'price_chg_60m',
  'liq_delta_15m', 'realized_vol_30m', 'drawdown_from_peak', 'turnover', 'curve_progress'];

const EXTRA_KEYS = ['sm_buyers_30m', 'sm_net_usd_30m', 'mention_unique_accounts_15m', 'mention_accel', 'telegram_mentions_15m', 'source_diversity'];

// Map one token (+ features and score computed by the caller) to the public radar signal shape.
// `token`: radar token row; `f`: feature row (may be null for a token with no snapshot yet); `score`: number|null.
function mapRadarSignal({ token, f, score, nowSec, model = RADAR_MODEL }) {
  const hasF = !!f;
  const features = {};
  if (hasF) for (const k of KEY_FEATURES) features[k] = r3(f[k]);
  // optional smart-money / social group features: present only when a group is enabled; null = collector has no data
  if (hasF) for (const k of EXTRA_KEYS) if (k in f) features[k] = r3(f[k]);
  const security = hasF && f.has_sec === 1 ? {
    top1Pct: r1(f.top1_pct_ex), top10Pct: r1(f.top10_pct_ex), creatorPct: r1(f.creator_pct), insiderPct: r1(f.insider_pct),
    mintAuthority: !!f.mint_auth, freezeAuthority: !!f.freeze_auth, rugged: !!f.rugged, holders: f.holders ?? null,
    rcScore: r1(f.rc_score), lpLockedPct: r1(f.lp_locked_pct), creatorPrevDeadShare: r3(f.creator_prev_dead_share),
    checkedAgeMin: r1(f.sec_age_min),
  } : null;
  const riskFlags = radarRiskFlags(hasF ? f : null);
  const ageMin = (nowSec - token.pool_created_ts) / MIN;
  const scored = isNum(score);
  return {
    address: token.token_address,
    symbol: token.symbol || null,
    name: token.name || null,
    source: 'radar',
    model,
    score: scored ? r1(score) : null,
    level: scored ? levelFor(score) : null,
    confidence: hasF ? radarConfidence(f) : 0,
    passesSafetyGate: hasF ? passesSafetyGate(f) : false,
    firesAtThreshold: scored && score >= 55 && hasF && passesSafetyGate(f),
    components: hasF ? radarComponents(f) : {},
    features,
    security,
    riskFlags,
    launch: {
      createdTs: token.pool_created_ts,
      ageMin: r1(ageMin),
      firstSeenLagSec: token.first_seen_ts != null ? token.first_seen_ts - token.pool_created_ts : null,
      creator: token.creator || null,
      launchpad: token.launchpad || null,
      dex: token.dex || null,
      state: bondingState(f, token),
      curveProgress: hasF ? r3(f.curve_progress) : null,
      migratedTs: token.migrated_ts || null,
      devBuySol: hasF ? r3(f.dev_buy_sol) : null,
    },
    promo: hasF ? {
      boostTotal: f.boost_total || 0, hasProfile: !!f.has_profile, cto: !!f.cto,
      twitter: !!f.has_twitter, telegram: !!f.has_telegram, website: !!f.has_website,
    } : { boostTotal: 0, hasProfile: false, cto: false, twitter: false, telegram: false, website: false },
    market: hasF ? { priceUsd: f.price_usd, liquidityUsd: f.liquidity_usd, fdv: f.fdv } : null,
    asOf: hasF ? f.ts * 1000 : null,
    modelVersion: `radar-${model}`,
    notes: [
      'Hand-set activity/risk composite, not a fitted or validated prediction.',
      ...(hasF ? [] : ['No market snapshot yet (just launched).']),
      ...(hasF && f.has_sec !== 1 ? ['Security check pending; safety gate treated as failed.'] : []),
    ],
  };
}

// Merge radar flags with activity-v0 flags (same code => radar wins; keeps order: radar first).
function mergeRiskFlags(radarFlags = [], mineFlags = []) {
  const seen = new Set();
  const out = [];
  for (const f of [...radarFlags, ...mineFlags]) {
    if (!f || seen.has(f.code)) continue;
    seen.add(f.code);
    out.push(f);
  }
  return out;
}

// Public shape consumed by routes/memecoins.js (compatible with its existing `shape()` output).
function toMemecoinSignal(r, mineSig) {
  return {
    address: r.address, symbol: r.symbol,
    score: r.score, level: r.level || 'QUIET', confidence: r.confidence, mode: 'radar',
    source: 'radar', model: r.model, components: r.components,
    riskFlags: mergeRiskFlags(r.riskFlags, mineSig ? mineSig.riskFlags : []),
    asOf: r.asOf, modelVersion: r.modelVersion,
    notes: r.notes,
    radar: { passesSafetyGate: r.passesSafetyGate, firesAtThreshold: r.firesAtThreshold, launch: r.launch, promo: r.promo, security: r.security },
  };
}

// ── data access (lazy, never throws) ─────────────────────────────────────────

function radarEnabled() { return process.env.ENABLE_RADAR === 'true'; }

function loadRadar() {
  const { getRadarDb } = require('../radar/db');
  const feat = require('../radar/features');
  return { db: getRadarDb(), feat };
}

// Compute the current signal for each token row. Returns mapped signals (possibly with null score).
function computeForTokens(db, feat, tokens, nowSec) {
  const snapStmt = db.prepare('SELECT * FROM market_snapshot WHERE token_address = ? AND ts >= ? ORDER BY ts');
  const peakStmt = db.prepare('SELECT price_usd AS price, ts FROM market_snapshot WHERE token_address = ? AND price_usd > 0 ORDER BY price_usd DESC, ts DESC LIMIT 1');
  const secStmt = db.prepare('SELECT * FROM token_security WHERE token_address = ? AND ts <= ? ORDER BY ts DESC LIMIT 1');
  const launchStmt = db.prepare('SELECT * FROM token_launch WHERE token_address = ?');
  const promoStmt = db.prepare('SELECT * FROM token_promo WHERE token_address = ? ORDER BY ts');
  // Optional smart-money / social groups (main-db collectors). With no source configured this is exactly market_v2.
  // A configured source with no collector data yields NULL features, which add nothing to the score (never zeros/errors).
  const extraSrc = typeof feat.getExtraSource === 'function' ? feat.getExtraSource() : null;
  const modelName = extraSrc ? feat.liveModelFor(extraSrc.groups) : RADAR_MODEL;
  const model = feat.MODELS[modelName];
  const extraMod = extraSrc ? require('../radar/extraFeatures') : null;
  const out = [];
  for (const t of tokens) {
    let f = null, score = null;
    try {
      const lastTs = t.last_snapshot_ts;
      if (lastTs) {
        const series = snapStmt.all(t.token_address, lastTs - 75 * MIN).filter((s) => s.price_usd > 0);
        if (series.length) {
          const peak = peakStmt.get(t.token_address) || { price: series[series.length - 1].price_usd, ts: series[series.length - 1].ts };
          f = feat.marketFeatures(series, series.length - 1, t, peak);
          attachContext(f, {
            sec: secStmt.get(t.token_address, nowSec),
            launch: launchStmt.get(t.token_address),
            promos: promoStmt.all(t.token_address),
          });
          // no wallet-flow window here: trades-based features stay null (flow_v1 is not the radar score)
          if (extraSrc) extraMod.attachExtraFeatures([f], t.token_address, extraSrc.provider, extraSrc.groups);
          score = model(f);
        }
      }
    } catch (e) {
      f = null; score = null;
      console.error('[radarSignals] token', t.token_address, e.message);
    }
    const sig = mapRadarSignal({ token: t, f, score, nowSec, model: modelName });
    if (f && extraSrc) {
      // bonus components (not part of market_v2's weights): null score = no data from that collector
      const have = (k) => f[k] !== null && f[k] !== undefined;
      if (extraSrc.groups.includes('smartmoney')) sig.components.smart_money = { score: have('sm_buyers_30m') ? r1(100 * feat.EXTRA_SCORES.smartmoney(f)) : null, weight: 'bonus' };
      if (extraSrc.groups.includes('social')) sig.components.social = { score: have('mention_unique_accounts_15m') ? r1(100 * feat.EXTRA_SCORES.social(f)) : null, weight: 'bonus' };
      sig.notes = [...sig.notes, `Score includes optional ${extraSrc.groups.join(' + ')} bonus (${modelName}); unvalidated.`];
    }
    out.push(sig);
  }
  return out;
}

function disabled(reason) { return { enabled: false, reason }; }

// Status gate shared by endpoints. Returns {ok:true, db, feat} | {ok:false, reason}.
function openRadar() {
  if (!radarEnabled()) return { ok: false, reason: 'Radar is off. Set ENABLE_RADAR=true on the backend to enable it.' };
  try {
    const r = loadRadar();
    const n = r.db.prepare('SELECT COUNT(*) c FROM token').get().c;
    if (!n) return { ok: false, reason: 'Radar is enabled but has not collected any tokens yet.' };
    return { ok: true, ...r };
  } catch (e) {
    console.error('[radarSignals] open:', e.message);
    return { ok: false, reason: 'Radar database is unavailable.' };
  }
}

// Top tracked tokens. sort: 'score' (default) | 'new'. Never throws.
function listSignals({ sort = 'score', limit = 30, maxAgeHours = DEFAULT_MAX_AGE_HOURS, minScore = null, safeOnly = false } = {}) {
  const r = openRadar();
  if (!r.ok) return disabled(r.reason);
  try {
    const nowSec = Math.floor(Date.now() / 1000);
    const lim = Math.max(1, Math.min(100, Math.floor(Number(limit)) || 30));
    const ageH = Math.max(0.1, Math.min(72, Number(maxAgeHours) || DEFAULT_MAX_AGE_HOURS));
    // Candidates: live tokens, either just launched (no snapshot yet) or with a recent snapshot.
    const cand = r.db.prepare(`SELECT * FROM token WHERE dead_ts IS NULL AND pool_created_ts >= ?
      AND (last_snapshot_ts IS NULL OR last_snapshot_ts >= ?)
      ORDER BY ${sort === 'new' ? 'pool_created_ts DESC' : 'COALESCE(last_vol_h1, 0) DESC'} LIMIT ?`)
      .all(nowSec - ageH * 3600, nowSec - LIST_MAX_STALE_SEC, sort === 'new' ? lim : Math.min(200, lim * 4));
    let signals = computeForTokens(r.db, r.feat, cand, nowSec);
    if (minScore != null) signals = signals.filter((s) => s.score != null && s.score >= Number(minScore));
    if (safeOnly) signals = signals.filter((s) => s.passesSafetyGate);
    if (sort === 'new') signals.sort((a, b) => b.launch.createdTs - a.launch.createdTs);
    else signals.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    return { enabled: true, asOf: Date.now(), model: (signals[0] && signals[0].model) || RADAR_MODEL, sort, signals: signals.slice(0, lim) };
  } catch (e) {
    console.error('[radarSignals] list:', e.message);
    return disabled('Radar signals are temporarily unavailable.');
  }
}

// One tracked token. Returns {enabled:true, tracked:false} when the radar does not know the address.
function getSignal(address) {
  const r = openRadar();
  if (!r.ok) return disabled(r.reason);
  try {
    const t = r.db.prepare('SELECT * FROM token WHERE token_address = ?').get(address);
    if (!t) return { enabled: true, tracked: false, address };
    const nowSec = Math.floor(Date.now() / 1000);
    const [signal] = computeForTokens(r.db, r.feat, [t], nowSec);
    return { enabled: true, tracked: true, dead: t.dead_ts ? { ts: t.dead_ts, reason: t.dead_reason } : null, signal };
  } catch (e) {
    console.error('[radarSignals] get:', e.message);
    return disabled('Radar signals are temporarily unavailable.');
  }
}

// Batch lookup for memecoins routes: Map(address -> radar signal) for tracked, live, scored tokens with a recent snapshot.
function lookupMany(addresses) {
  const map = new Map();
  if (!radarEnabled() || !addresses.length) return map;
  const r = openRadar();
  if (!r.ok) return map;
  try {
    const nowSec = Math.floor(Date.now() / 1000);
    const uniq = [...new Set(addresses)].slice(0, 100);
    const rows = r.db.prepare(`SELECT * FROM token WHERE token_address IN (${uniq.map(() => '?').join(',')})
      AND dead_ts IS NULL AND last_snapshot_ts >= ?`).all(...uniq, nowSec - LIST_MAX_STALE_SEC);
    for (const s of computeForTokens(r.db, r.feat, rows, nowSec)) if (s.score != null) map.set(s.address, s);
  } catch (e) {
    console.error('[radarSignals] lookup:', e.message);
  }
  return map;
}

module.exports = {
  RADAR_MODEL, radarRiskFlags, passesSafetyGate, levelFor, radarComponents, radarConfidence, bondingState,
  attachContext, mapRadarSignal, mergeRiskFlags, toMemecoinSignal,
  radarEnabled, computeForTokens, listSignals, getSignal, lookupMany,
};
