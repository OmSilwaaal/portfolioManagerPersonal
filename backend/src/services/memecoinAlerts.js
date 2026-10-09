// Alert rules for memecoin tickers: "a major price movement" and "a good signal".
// Pure functions, no I/O, no clock of their own — everything is passed in, so the
// rules can be unit-tested exactly as the poller runs them.
//
// Deliberate stances:
//  * A move alert fires in BOTH directions. A -60% dump matters as much as a pump,
//    and the activity score itself is direction-blind (it uses |z|), so direction
//    is derived here from the raw change and carried in the payload.
//  * A signal alert is a "this looks interesting" nudge, so it is suppressed when
//    the token carries a hard rug indicator. Telling someone a mint-authority-open
//    token is a good signal is worse than staying quiet.
//  * Every rule is gated on liquidity and on signal confidence, because the score
//    is most volatile exactly where the data is thinnest.

const DEFAULT_PREFS = {
  enabled: 0,
  move_pct_5m: 25,      // |5m change| that counts as major
  move_pct_1h: 100,     // |1h change| that counts as major
  min_score: 75,        // composite score that counts as a good signal (HOT)
  min_confidence: 0.5,  // below this the score is too thin to act on
  min_liquidity: 20_000,
  cooldown_min: 60,     // per user + token + kind
  sms: 0,
};

// Hard rug indicators: a "good signal" is never announced while one of these is set.
const DISQUALIFYING_FLAGS = new Set([
  'RUGGED', 'MINT_AUTHORITY', 'FREEZE_AUTHORITY', 'SERIAL_RUGGER', 'INSIDERS', 'DEV_SOLD',
]);

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const pct = (x) => `${x > 0 ? '+' : ''}${x.toFixed(1)}%`;

function normalisePrefs(row) {
  const p = { ...DEFAULT_PREFS, ...(row || {}) };
  // A stored null/''/garbage must fall back to the default, and a below-range value
  // must not silently disable a gate. Note Number(null) === 0 and Number('') === 0,
  // so absence has to be rejected before coercing.
  const num = (v, d, min = 0) => {
    if (v === null || v === undefined || v === '') return d;
    const n = Number(v);
    return isNum(n) && n >= min ? n : d;
  };
  return {
    enabled: Number(p.enabled) === 1,
    sms: Number(p.sms) === 1,
    move_pct_5m: num(p.move_pct_5m, DEFAULT_PREFS.move_pct_5m, 1),
    move_pct_1h: num(p.move_pct_1h, DEFAULT_PREFS.move_pct_1h, 1),
    min_score: Math.min(100, num(p.min_score, DEFAULT_PREFS.min_score, 1)),
    min_confidence: Math.min(1, num(p.min_confidence, DEFAULT_PREFS.min_confidence, 0)),
    min_liquidity: num(p.min_liquidity, DEFAULT_PREFS.min_liquidity, 0),
    cooldown_min: num(p.cooldown_min, DEFAULT_PREFS.cooldown_min, 1),
  };
}

/** True when enough time has passed since the last alert of this kind for this token. */
function offCooldown(lastSentTs, now, cooldownMin) {
  if (!isNum(lastSentTs)) return true;
  return now - lastSentTs >= cooldownMin * 60_000;
}

function flagCodes(signal) {
  return new Set((signal?.riskFlags || []).map((f) => f && f.code).filter(Boolean));
}

/**
 * Candidate alerts for one token. Does NOT consider cooldown — the caller owns
 * that, so the rules stay a pure function of the current observation.
 *
 * @returns {Array<{kind, direction, changePct, window, score, confidence, symbol, address, message, flags}>}
 */
function evaluateToken({ token, signal, prefs }) {
  const p = normalisePrefs(prefs);
  const out = [];
  if (!p.enabled || !token || !token.address) return out;

  // Liquidity gate first: below it, both price and score are mostly noise.
  if (!isNum(token.liquidity_usd) || token.liquidity_usd < p.min_liquidity) return out;

  const symbol = token.symbol || token.name || token.address.slice(0, 6);
  const flags = flagCodes(signal);

  // ── major price movement (either direction) ──────────────────────────────
  const c5 = isNum(token.change_5m) ? token.change_5m : null;
  const c1h = isNum(token.change_1h) ? token.change_1h : null;
  let moveWindow = null; let moveChange = null;
  if (c5 !== null && Math.abs(c5) >= p.move_pct_5m) { moveWindow = '5m'; moveChange = c5; }
  else if (c1h !== null && Math.abs(c1h) >= p.move_pct_1h) { moveWindow = '1h'; moveChange = c1h; }

  if (moveWindow) {
    const dir = moveChange > 0 ? 'up' : 'down';
    out.push({
      kind: 'move',
      direction: dir,
      changePct: Number(moveChange.toFixed(2)),
      window: moveWindow,
      score: isNum(signal?.score) ? signal.score : null,
      confidence: isNum(signal?.confidence) ? signal.confidence : null,
      address: token.address,
      symbol,
      flags: [...flags],
      message: `${symbol} ${dir === 'up' ? 'jumped' : 'dropped'} ${pct(moveChange)} in ${moveWindow}`
        + (isNum(token.liquidity_usd) ? ` · liq $${Math.round(token.liquidity_usd).toLocaleString('en-US')}` : ''),
    });
  }

  // ── good signal ─────────────────────────────────────────────────────────
  const score = signal?.score;
  const conf = signal?.confidence;
  if (isNum(score) && score >= p.min_score && isNum(conf) && conf >= p.min_confidence) {
    const blocking = [...flags].filter((f) => DISQUALIFYING_FLAGS.has(f));
    if (blocking.length === 0) {
      out.push({
        kind: 'signal',
        direction: isNum(c5) ? (c5 >= 0 ? 'up' : 'down') : null,
        changePct: isNum(c5) ? Number(c5.toFixed(2)) : null,
        window: '5m',
        score,
        confidence: conf,
        address: token.address,
        symbol,
        flags: [...flags],
        message: `${symbol} signal ${Math.round(score)}/100 (${signal.level || 'HOT'})`
          + `, confidence ${Math.round(conf * 100)}%`
          + (isNum(c5) ? ` · ${pct(c5)} 5m` : ''),
      });
    }
  }

  return out;
}

// ── volatility ──────────────────────────────────────────────────────────────
// evaluateToken reads the 5m/1h change the upstream feed reports. That is a fixed
// window and it lags: a token that doubles in 40 seconds reports a modest 5m change
// until the window catches up. This rule instead compares two observations we made
// ourselves, which is what makes a pump.fun-style "it is moving RIGHT NOW" alert
// possible at all.
//
// Deliberate stances, matching the rules above:
//  * A price move alone never fires. One bad upstream tick on a thin token can
//    print any number; corroborating flow (volume above its own baseline, or
//    enough trades in the 5m window) is required.
//  * Fires in both directions, and is NOT suppressed by DISQUALIFYING_FLAGS.
//    Unlike "good signal", "this is moving violently" is more useful, not less,
//    when the token is also a rug — the flags ride along in the payload.
const VOLATILITY_DEFAULTS = {
  min_liquidity: 15_000,
  window_ms: 150_000,    // widest gap between the two samples that still counts as "a short window"
  min_window_ms: 20_000, // closer than this and we are mostly measuring one upstream tick
  price_pct: 12,         // |move| between the samples
  vol_ratio: 3,          // 5m volume against its own 1h-derived baseline
  min_trades_5m: 8,      // flow corroboration when volume data is missing
};

function normaliseVolatilityCfg(cfg) {
  const c = { ...VOLATILITY_DEFAULTS, ...(cfg || {}) };
  // Same trap as normalisePrefs: Number(null) === 0, so absence is rejected before coercing.
  const num = (v, d, min) => {
    if (v === null || v === undefined || v === '') return d;
    const n = Number(v);
    return isNum(n) && n >= min ? n : d;
  };
  return {
    min_liquidity: num(c.min_liquidity, VOLATILITY_DEFAULTS.min_liquidity, 0),
    window_ms: num(c.window_ms, VOLATILITY_DEFAULTS.window_ms, 1000),
    min_window_ms: num(c.min_window_ms, VOLATILITY_DEFAULTS.min_window_ms, 0),
    price_pct: num(c.price_pct, VOLATILITY_DEFAULTS.price_pct, 1),
    vol_ratio: num(c.vol_ratio, VOLATILITY_DEFAULTS.vol_ratio, 1),
    min_trades_5m: num(c.min_trades_5m, VOLATILITY_DEFAULTS.min_trades_5m, 1),
  };
}

/** "95s" / "2m" — the real elapsed window, not a nominal one, so the message cannot lie. */
function windowLabel(ms) {
  const s = Math.round(ms / 1000);
  return s < 90 ? `${s}s` : `${Math.round(s / 60)}m`;
}

/**
 * One volatility candidate for one token, from two observations of it.
 * Pure: the caller owns the sample history and the cooldown.
 *
 * @param {object} input
 *   prev:   {price, ts, volume_5m?} an earlier observation of the SAME token
 *   token:  the current normalised token from memecoinData
 *   signal: optional, only to carry score/confidence/flags into the payload
 *   now:    ms epoch
 *   cfg:    partial override of VOLATILITY_DEFAULTS
 * @returns {null | {kind:'volatility', ...}} shaped like evaluateToken's entries
 */
function evaluateVolatility({ prev, token, signal, now = Date.now(), cfg } = {}) {
  const c = normaliseVolatilityCfg(cfg);
  if (!token || !token.address || !isNum(token.price) || token.price <= 0) return null;
  if (!isNum(token.liquidity_usd) || token.liquidity_usd < c.min_liquidity) return null;
  if (!prev || !isNum(prev.price) || prev.price <= 0 || !isNum(prev.ts)) return null;

  const elapsed = now - prev.ts;
  if (elapsed < c.min_window_ms || elapsed > c.window_ms) return null;

  const changePct = (token.price / prev.price - 1) * 100;
  if (!isNum(changePct) || Math.abs(changePct) < c.price_pct) return null;

  // Flow corroboration. volume_1h/12 is the same coarse baseline signalScore uses when
  // it has no candles; it is crude, but it is the token's own history rather than a
  // constant, so a quiet token needs much less volume to look abnormal than a busy one.
  const baseline = isNum(token.volume_1h) && token.volume_1h > 0 ? token.volume_1h / 12 : null;
  const volumeRatio = baseline !== null && isNum(token.volume_5m) ? token.volume_5m / Math.max(baseline, 1) : null;
  const trades5m = isNum(token.buys_5m) && isNum(token.sells_5m) ? token.buys_5m + token.sells_5m : null;
  const corroborated = volumeRatio !== null
    ? volumeRatio >= c.vol_ratio
    : trades5m !== null && trades5m >= c.min_trades_5m;
  if (!corroborated) return null;

  const symbol = token.symbol || token.name || token.address.slice(0, 6);
  const direction = changePct > 0 ? 'up' : 'down';
  const window = windowLabel(elapsed);
  return {
    kind: 'volatility',
    direction,
    changePct: Number(changePct.toFixed(2)),
    window,
    windowMs: elapsed,
    volumeRatio: volumeRatio === null ? null : Number(volumeRatio.toFixed(2)),
    // Carried so a market-wide candidate can still be held to each user's own liquidity floor.
    liquidityUsd: token.liquidity_usd,
    score: isNum(signal?.score) ? signal.score : null,
    confidence: isNum(signal?.confidence) ? signal.confidence : null,
    address: token.address,
    symbol,
    flags: [...flagCodes(signal)],
    message: `${symbol} ${direction === 'up' ? 'spiking' : 'dumping'} ${pct(changePct)} in ${window}`
      + (volumeRatio !== null ? ` · volume ${volumeRatio.toFixed(1)}x normal` : '')
      + (isNum(token.liquidity_usd) ? ` · liq $${Math.round(token.liquidity_usd).toLocaleString('en-US')}` : ''),
  };
}

module.exports = {
  DEFAULT_PREFS,
  DISQUALIFYING_FLAGS,
  VOLATILITY_DEFAULTS,
  normalisePrefs,
  normaliseVolatilityCfg,
  offCooldown,
  evaluateToken,
  evaluateVolatility,
};
