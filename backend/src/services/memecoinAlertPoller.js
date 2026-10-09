// Server-side memecoin alerting: polls the trending/new lists, scores them with the
// same activity-v0 model the terminal shows, and records an alert per user whose
// thresholds are met. Opt-in per user; ENABLE_MEMECOIN_ALERTS=false turns the sweep off.
//
// Alerts are always written to memecoin_alert_events (the in-app feed). SMS is a
// second, separate opt-in on top, and goes through notifyUser, which enforces phone
// verification and the per-user daily cap.

const data = require('./memecoinData');
const { computeSignal } = require('./signalScore');
const { evaluateToken, normalisePrefs, offCooldown } = require('./memecoinAlerts');
const { notifyUser } = require('./sms');
const {
  listEnabledMemeAlertPrefs,
  getMemeAlertLastSent,
  insertMemeAlertEvent,
  pruneMemeAlertEvents,
} = require('../db/queries');

const TOKENS_PER_LIST = 30;
const RETAIN_DAYS = 14;
// One user should never be able to trigger a flood from a single sweep.
const MAX_ALERTS_PER_USER_PER_CYCLE = 8;

async function loadTokens() {
  const [trending, fresh] = await Promise.all([
    data.getTrending().catch(() => []),
    data.getNew().catch(() => []),
  ]);
  const seen = new Set();
  const out = [];
  for (const t of [...(trending || []), ...(fresh || [])]) {
    if (!t?.address || seen.has(t.address)) continue;
    seen.add(t.address);
    out.push(t);
    if (out.length >= TOKENS_PER_LIST * 2) break;
  }
  return out;
}

/**
 * One alert -> one row in the in-app feed (+ SMS when that is separately opted into).
 * `lastSent` is mutated so a move AND a signal on the same token in the same sweep
 * don't both re-fire on the next one. Returns whether anything was written.
 */
function writeAlert(userId, alert, now, lastSent, prefs) {
  const key = `${alert.address}|${alert.kind}`;
  if (!offCooldown(lastSent.get(key), now, prefs.cooldown_min)) return false;
  try {
    insertMemeAlertEvent({
      user_id: userId,
      address: alert.address,
      symbol: alert.symbol,
      kind: alert.kind,
      direction: alert.direction,
      window: alert.window,
      change_pct: alert.changePct,
      score: alert.score,
      confidence: alert.confidence,
      message: alert.message,
      created_ts: now,
    });
  } catch (err) {
    console.error('[meme-alerts] insert failed:', err.message);
    return false;
  }
  lastSent.set(key, now);
  if (prefs.sms) {
    notifyUser(userId, `Travauxus: ${alert.message}. Reply STOP to opt out.`, { kind: 'price_alerts' })
      .catch((err) => console.error('[meme-alerts] sms failed:', err.message));
  }
  return true;
}

/**
 * Deliver already-evaluated, market-wide candidates (the SSE hub's volatility alerts) to
 * every opted-in user. The rules ran once for everyone; what stays per user is consent,
 * the liquidity floor and the cooldown. Synchronous and best-effort: a caller on a hot
 * path must never be made to wait on, or be broken by, the alert feed.
 */
function deliverAlerts(candidates, now = Date.now()) {
  if (!Array.isArray(candidates) || !candidates.length) return 0;
  let users;
  try { users = listEnabledMemeAlertPrefs(); } catch { return 0; }
  let written = 0;
  for (const row of users) {
    const prefs = normalisePrefs(row);
    if (!prefs.enabled) continue;
    let lastSent;
    try { lastSent = getMemeAlertLastSent(row.user_id); } catch { continue; }
    let sent = 0;
    for (const alert of candidates) {
      if (sent >= MAX_ALERTS_PER_USER_PER_CYCLE) break;
      const liq = alert.liquidityUsd;
      if (typeof liq === 'number' && Number.isFinite(liq) && liq < prefs.min_liquidity) continue;
      if (writeAlert(row.user_id, alert, now, lastSent, prefs)) { sent += 1; written += 1; }
    }
  }
  return written;
}

async function runOnce(now = Date.now()) {
  let users;
  try {
    users = listEnabledMemeAlertPrefs();
  } catch {
    return { users: 0, alerts: 0 };
  }
  if (!users.length) return { users: 0, alerts: 0 };

  const tokens = await loadTokens();
  if (!tokens.length) return { users: users.length, alerts: 0 };

  // No OHLCV spend here, so this never competes with the terminal's own call budget.
  //
  // A list-data-only score cannot clear min_confidence: with no candles the only
  // components available are volume_accel (estimated from the 1h total) and the
  // buy/sell split, which caps confidence at 0.5 x 0.8 x 0.85 = 0.29, under the 0.5
  // default. That is why "good signal" alerts never fired. So prefer a full-mode
  // score the terminal has already paid for — whatever anyone is looking at is
  // scored properly and alertable — and fall back to list-only (which still drives
  // the price-move rule, whose gate is the move itself, not confidence).
  const cachedFullSignal = (() => {
    try { return require('../routes/memecoins').cachedFullSignal; } catch (_) { return () => null; }
  })();
  const signals = new Map();
  for (const t of tokens) {
    try {
      signals.set(t.address, cachedFullSignal(t.address) || computeSignal({ token: t, now }));
    } catch (err) {
      console.error('[meme-alerts] scoring failed for', t.address, err.message);
    }
  }

  let written = 0;
  for (const row of users) {
    const prefs = normalisePrefs(row);
    let lastSent;
    try {
      lastSent = getMemeAlertLastSent(row.user_id);
    } catch {
      continue;
    }
    let sentThisCycle = 0;

    for (const token of tokens) {
      if (sentThisCycle >= MAX_ALERTS_PER_USER_PER_CYCLE) break;
      const signal = signals.get(token.address);
      if (!signal) continue;

      let candidates;
      try {
        candidates = evaluateToken({ token, signal, prefs });
      } catch (err) {
        console.error('[meme-alerts] rule evaluation failed for', token.address, err.message);
        continue;
      }

      for (const alert of candidates) {
        if (sentThisCycle >= MAX_ALERTS_PER_USER_PER_CYCLE) break;
        if (writeAlert(row.user_id, alert, now, lastSent, prefs)) {
          sentThisCycle += 1;
          written += 1;
        }
      }
    }
  }

  try {
    pruneMemeAlertEvents(now - RETAIN_DAYS * 86_400_000);
  } catch { /* pruning is best-effort */ }

  return { users: users.length, alerts: written };
}

// On by default, off only when switched off explicitly.
//
// This used to require ENABLE_MEMECOIN_ALERTS=true, which was never set in any
// environment — so no alert row was ever written and the bell was permanently empty
// however the user configured it. An opt-out flag is the honest default here: the
// sweep returns immediately when no user has enabled alerts (one indexed SELECT), it
// reads nothing but the already-cached trending/new lists, and a user who has not
// opted in cannot be sent anything.
function startMemecoinAlertPoller(intervalMs = 2 * 60 * 1000) {
  if (process.env.ENABLE_MEMECOIN_ALERTS === 'false') {
    console.log('[meme-alerts] disabled (ENABLE_MEMECOIN_ALERTS=false)');
    return;
  }
  const tick = () => {
    runOnce().then(
      ({ users, alerts }) => { if (alerts) console.log(`[meme-alerts] ${alerts} alert(s) for ${users} user(s)`); },
      (err) => console.error('[meme-alerts] cycle failed:', err.message),
    );
  };
  tick();
  setInterval(tick, intervalMs);
  console.log(`[meme-alerts] poller started, every ${intervalMs / 1000}s`);
}

module.exports = { startMemecoinAlertPoller, runOnce, deliverAlerts };
