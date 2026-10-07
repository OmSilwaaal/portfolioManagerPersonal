// Server-side memecoin alerting: polls the trending/new lists, scores them with the
// same activity-v0 model the terminal shows, and records an alert per user whose
// thresholds are met. Opt-in per user; off entirely unless ENABLE_MEMECOIN_ALERTS=true.
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

  // List data only: no OHLCV spend here, so this never competes with the terminal's
  // own call budget. Confidence is lower by construction, and min_confidence gates it.
  const signals = new Map();
  for (const t of tokens) {
    try {
      signals.set(t.address, computeSignal({ token: t, now }));
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
        const key = `${alert.address}|${alert.kind}`;
        if (!offCooldown(lastSent.get(key), now, prefs.cooldown_min)) continue;

        try {
          insertMemeAlertEvent({
            user_id: row.user_id,
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
          continue;
        }
        // Mark the cooldown locally so a move AND a signal on the same token in the
        // same sweep don't both re-fire on the next one.
        lastSent.set(key, now);
        sentThisCycle += 1;
        written += 1;

        if (prefs.sms) {
          notifyUser(row.user_id, `Travauxus: ${alert.message}. Reply STOP to opt out.`, { kind: 'price_alerts' })
            .catch((err) => console.error('[meme-alerts] sms failed:', err.message));
        }
      }
    }
  }

  try {
    pruneMemeAlertEvents(now - RETAIN_DAYS * 86_400_000);
  } catch { /* pruning is best-effort */ }

  return { users: users.length, alerts: written };
}

function startMemecoinAlertPoller(intervalMs = 2 * 60 * 1000) {
  if (process.env.ENABLE_MEMECOIN_ALERTS !== 'true') {
    console.log('[meme-alerts] disabled (set ENABLE_MEMECOIN_ALERTS=true to enable)');
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

module.exports = { startMemecoinAlertPoller, runOnce };
