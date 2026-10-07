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

module.exports = {
  DEFAULT_PREFS,
  DISQUALIFYING_FLAGS,
  normalisePrefs,
  offCooldown,
  evaluateToken,
};
