'use strict';
// Smart-money FAST loop. The full wallet collector (collector.js) runs every ~15 min, but live scoring only looks at a
// 30 min window of smart_money_event, so a fresh skilled buy could stay invisible for up to ~15 min. This loop only
// polls RECENT transactions of the wallets that are currently skilled (latest snapshot passed the holdout and clears
// the skill bar) and writes smart_money_event immediately. It never re-scores skill and never discovers wallets.
//
// Rules shared with the slow loop (so the two can never disagree):
//   * a buy only becomes an event if the wallet's skill snapshot PREDATES the buy (getSkillAsOf: as_of_ts < buy ts)
//     and that snapshot passes isSmart (holdout + score), i.e. exactly the look-ahead rule of collector.js step (d);
//   * rows are INSERT OR IGNORE keyed like the slow loop, so a buy seen by both loops is stored once;
//   * `since` is the wallet's newest stored trade (same as the slow loop), so the two loops never leave a gap.
// Cost control: one provider (Helius if enabled, else Birdeye), at most FAST_MAX_WALLETS wallets per cycle, rotated
// least-recently-polled first so every skilled wallet gets its turn, one request charged per wallet poll against a
// PERSISTED per-hour budget (api_budget, key = clock hour; fail-closed) on top of the provider's own rate limiter and
// (for Birdeye) the shared daily budget. When Birdeye is the provider the fast loop also leaves a reserve of the daily
// budget for the slow loop. Never throws.
//
// env: SMART_MONEY_FAST_MS (default 60000, minimum 30000, 0/off disables)  SMART_MONEY_FAST_MAX_WALLETS (default 10)
//      SMART_MONEY_FAST_HOURLY_BUDGET (default 120 for Helius, 5 for Birdeye)  SMART_MONEY_FAST_BIRDEYE_RESERVE (default 60)
//      SMART_MONEY_FAST_LOOKBACK_SEC (default 1800: how far back to look for a wallet with no stored trade)

const { getSkillAsOf } = require('./schema');
const { isSmart } = require('./skill');
const { createBudget, parseDailyBudget } = require('./budget');

const DEFAULT_MS = 60_000;
const MIN_MS = 30_000;
const DEFAULT_MAX_WALLETS = 10;
const DEFAULT_HOURLY = { helius: 120, birdeye: 5 };
const DEFAULT_BIRDEYE_RESERVE = 60;
const PROVIDER_ORDER = ['helius', 'birdeye'];
const CURSOR_KEY = 'fast_last_polled';

let timer = null;
let running = false;
let stopped = true;

const nowSecFn = () => Math.floor(Date.now() / 1000);

function parseIntervalMs(env = process.env) {
  const raw = env.SMART_MONEY_FAST_MS;
  if (raw === undefined || raw === '') return DEFAULT_MS;
  if (/^(off|none|false)$/i.test(String(raw).trim())) return 0;
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_MS;
  if (n <= 0) return 0;
  return Math.max(MIN_MS, Math.floor(n));
}

function pickProvider(providers) {
  const usable = (providers || []).filter((p) => p && p.enabled && typeof p.getWalletTrades === 'function');
  for (const name of PROVIDER_ORDER) { const p = usable.find((x) => x.name === name); if (p) return p; }
  return usable[0] || null;
}

// Wallets whose LATEST snapshot is skilled right now.
function skilledWallets(db) {
  const rows = db.prepare(`SELECT s.* FROM wallet_skill_snapshot s
    JOIN (SELECT wallet_id, MAX(as_of_ts) AS m FROM wallet_skill_snapshot GROUP BY wallet_id) l
      ON l.wallet_id = s.wallet_id AND l.m = s.as_of_ts`).all();
  return rows.filter((r) => isSmart(r)).map((r) => r.wallet_id);
}

function loadCursor(db) {
  try {
    const r = db.prepare('SELECT value FROM discovery_state WHERE key = ?').get(CURSOR_KEY);
    const o = r && r.value ? JSON.parse(r.value) : {};
    return o && typeof o === 'object' ? o : {};
  } catch { return {}; }
}
function saveCursor(db, cur) {
  try { db.prepare('INSERT INTO discovery_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(CURSOR_KEY, JSON.stringify(cur)); }
  catch { /* rotation state is best-effort: worst case the same wallets are polled first again */ }
}

// One fast pass. All dependencies injectable for tests. Returns stats; never throws.
async function runFastCycle(db, opts = {}) {
  const log = opts.log || console;
  const now = opts.now != null ? opts.now : nowSecFn();
  const stats = { skilled: 0, polled: 0, newTrades: 0, events: 0, budgetBlocked: 0, errors: 0, provider: null };
  try {
    const env = opts.env || process.env;
    const provider = opts.provider || pickProvider(opts.providers);
    if (!provider) { stats.reason = 'no wallet-trade provider enabled'; return stats; }
    stats.provider = provider.name;
    const maxWallets = Math.max(1, Math.floor(opts.maxWallets || Number(env.SMART_MONEY_FAST_MAX_WALLETS) || DEFAULT_MAX_WALLETS));
    const hourlyLimit = opts.hourlyLimit != null ? opts.hourlyLimit
      : parseDailyBudget(env, 'SMART_MONEY_FAST_HOURLY_BUDGET', DEFAULT_HOURLY[provider.name] != null ? DEFAULT_HOURLY[provider.name] : 5);
    const budget = opts.hourBudget || createBudget(db, { provider: `fast-${provider.name}`, dailyLimit: hourlyLimit, nowSec: () => now, period: 'hour' });
    const lookbackSec = opts.lookbackSec || Number(env.SMART_MONEY_FAST_LOOKBACK_SEC) || 1800;
    const eventWindowSec = opts.eventWindowSec || 3600;
    const reserve = opts.birdeyeReserve != null ? opts.birdeyeReserve : (parseDailyBudget(env, 'SMART_MONEY_FAST_BIRDEYE_RESERVE', DEFAULT_BIRDEYE_RESERVE));
    const maxCycleMs = opts.maxCycleMs || 45_000;
    const t0 = Date.now();

    const skilled = skilledWallets(db);
    stats.skilled = skilled.length;
    if (!skilled.length) return stats;

    // fair rotation: never-polled first, then least recently polled; the cursor is persisted so a restart keeps the order
    const cur = loadCursor(db);
    const order = [...skilled].sort((a, b) => (cur[a] || 0) - (cur[b] || 0) || (a < b ? -1 : 1));

    const lastTrade = db.prepare('SELECT MAX(ts) AS m FROM wallet_trade WHERE wallet_id = ?');
    const insTrade = db.prepare('INSERT OR IGNORE INTO wallet_trade (wallet_id, token_id, ts, side, amount_token, price_usd, amount_usd, tx, event_ts, ingested_ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const insEvt = db.prepare('INSERT OR IGNORE INTO smart_money_event (token_id, wallet_id, ts, side, amount_usd, skill_as_of_ts, skill_score, event_ts, ingested_ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const recentBuys = db.prepare("SELECT * FROM wallet_trade WHERE wallet_id = ? AND side = 'buy' AND ts >= ? ORDER BY ts");

    for (const w of order) {
      if (stats.polled >= maxWallets) break;
      if (Date.now() - t0 > maxCycleMs) break;
      // Birdeye shares one small daily budget with the slow loop: keep a reserve for it
      if (provider.name === 'birdeye' && opts.birdeyeBudget && opts.birdeyeBudget.remaining() <= reserve) { stats.budgetBlocked++; stats.reason = 'birdeye daily budget reserve'; break; }
      if (!budget.tryConsume(1)) { stats.budgetBlocked++; stats.reason = 'hourly request budget exhausted'; break; }
      cur[w] = now;                                    // counts as this wallet's turn even if the request fails
      stats.polled++;
      try {
        const last = lastTrade.get(w);
        const since = last && last.m ? last.m : now - lookbackSec;
        const trades = await provider.getWalletTrades(w, since);
        for (const t of trades || []) {
          if (!t || !(t.ts < now + 60)) continue;
          const r = insTrade.run(w, t.token_id, t.ts, t.side, t.amount_token, t.price_usd, t.amount_usd, t.tx, t.ts, now);
          stats.newTrades += Number(r.changes || 0);
        }
        // events: any recent buy (any token) by this wallet if it was skilled BEFORE the buy (look-ahead safe)
        for (const b of recentBuys.all(w, now - eventWindowSec)) {
          const snap = getSkillAsOf(db, b.wallet_id, b.ts);
          if (!isSmart(snap)) continue;
          const r = insEvt.run(b.token_id, b.wallet_id, b.ts, 'buy', b.amount_usd, snap.as_of_ts, snap.skill_score, b.ts, now);
          stats.events += Number(r.changes || 0);
        }
      } catch (e) {
        stats.errors++;
        log.warn(`[smart-money:fast] wallet ${String(w).slice(0, 8)} failed: ${e.message}`);
        if (e && e.budgetExceeded) { stats.reason = 'provider budget exhausted'; break; }
      }
    }
    saveCursor(db, Object.fromEntries(Object.entries(cur).filter(([k]) => skilled.includes(k))));
  } catch (e) {
    stats.errors++;
    try { log.warn(`[smart-money:fast] cycle failed: ${e.message}`); } catch { /* ignore */ }
  }
  return stats;
}

// Start the loop. Returns {started, reason?}. Never throws.
function start(db, opts = {}) {
  const env = opts.env || process.env;
  const log = opts.log || console;
  try {
    const interval = parseIntervalMs(env);
    if (!interval) { log.log('[smart-money:fast] disabled: SMART_MONEY_FAST_MS=0/off'); return { started: false, reason: 'disabled by SMART_MONEY_FAST_MS' }; }
    const provider = pickProvider(opts.providers);
    if (!provider) { log.log('[smart-money:fast] disabled: no provider can fetch wallet trades'); return { started: false, reason: 'no trade provider enabled' }; }
    if (timer) return { started: true, already: true };
    stopped = false;
    const cycleOpts = { ...opts, env, log, provider };
    const tick = async () => {
      if (stopped) return;
      if (!running) {
        running = true;
        try {
          const s = await runFastCycle(db, cycleOpts);
          if (s.events || s.errors || s.budgetBlocked) log.log('[smart-money:fast] cycle', JSON.stringify(s));
        } catch (e) { log.warn(`[smart-money:fast] cycle failed: ${e.message}`); }
        finally { running = false; }
      }
      if (!stopped) { timer = setTimeout(tick, interval); if (timer.unref) timer.unref(); }
    };
    timer = setTimeout(tick, opts.initialDelayMs != null ? opts.initialDelayMs : 30_000);
    if (timer.unref) timer.unref();
    log.log(`[smart-money:fast] started (every ${interval}ms via ${provider.name}; hourly request budget ${parseDailyBudget(env, 'SMART_MONEY_FAST_HOURLY_BUDGET', DEFAULT_HOURLY[provider.name] != null ? DEFAULT_HOURLY[provider.name] : 5)})`);
    return { started: true, intervalMs: interval, provider: provider.name };
  } catch (e) {
    try { log.warn(`[smart-money:fast] start failed: ${e.message}`); } catch { /* ignore */ }
    return { started: false, reason: e.message };
  }
}

function stop() {
  stopped = true;
  if (timer) clearTimeout(timer);
  timer = null;
}

module.exports = { start, stop, runFastCycle, skilledWallets, parseIntervalMs, pickProvider, DEFAULT_MS, MIN_MS };
