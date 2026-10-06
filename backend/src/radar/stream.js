const WebSocket = require('ws');
const { getRadarDb, kvGet, kvSet } = require('./db');
const { now } = require('./util');

// PumpPortal real-time feed over ONE websocket (their rules: never one connection per token).
//   Free:  new pump.fun tokens the instant they launch (+ creator, dev buy, curve state) and graduations.
//   Paid:  every trade on chosen tokens, 0.01 SOL per 10,000 messages — only when PUMPPORTAL_API_KEY is set, only for
//          a short list of live candidates, and hard-capped by a daily budget so it can never run up a bill.

const API_KEY = process.env.PUMPPORTAL_API_KEY || '';
const URL = `wss://pumpportal.fun/api/data${API_KEY ? `?api-key=${encodeURIComponent(API_KEY)}` : ''}`;

const FLUSH_MS = 1000;                 // batch DB writes: one transaction per second instead of one per message
const STALL_MS = 90 * 1000;            // launches arrive every few seconds; this much silence = dead socket
const SUB_REFRESH_MS = 30 * 1000;
const MAX_TRADE_TOKENS = Number(process.env.RADAR_TRADE_MAX_TOKENS || 25);
const BUDGET_SOL_PER_DAY = Number(process.env.RADAR_TRADE_BUDGET_SOL || 0.05);
const MESSAGES_PER_SOL = 10000 / 0.01;
const DAILY_MESSAGE_CAP = Math.floor(BUDGET_SOL_PER_DAY * MESSAGES_PER_SOL);
const CANDIDATE_MIN_VOL_H1 = 1000;     // only spend paid messages on tokens with real activity…
const CANDIDATE_AGE = [10 * 60, 3 * 3600]; // …inside the window where models can actually fire

const state = {
  connected: false, connects: 0, lastMessageAt: 0, created: 0, migrations: 0, trades: 0,
  tradeMode: !!API_KEY, tradeDisabledReason: API_KEY ? null : 'PUMPPORTAL_API_KEY not set',
  subscribed: new Set(), migrationSample: null,
};

let ws = null, flushTimer = null, subTimer = null, stallTimer = null, reconnectDelay = 1000, stopped = true;
let buf = { creates: [], trades: [], migrations: [] };

const today = () => new Date().toISOString().slice(0, 10);
const msgKey = () => `pumpportal_trade_msgs:${today()}`;
const usedToday = () => Number(kvGet(msgKey()) || 0);

function send(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function onMessage(raw) {
  state.lastMessageAt = Date.now();
  let m;
  try { m = JSON.parse(raw); } catch { return; }
  if (m.message) {
    if (/API key/i.test(m.message) && /only available/i.test(m.message)) {
      state.tradeMode = false;
      state.tradeDisabledReason = m.message;
    }
    if (!/Successfully|Subscribed|Unsubscribed/i.test(m.message)) console.log('[radar] pumpportal:', m.message.slice(0, 200));
    return;
  }
  if (m.txType === 'create') buf.creates.push({ ...m, _ts: now() });
  else if (m.txType === 'buy' || m.txType === 'sell') buf.trades.push({ ...m, _ms: Date.now() });
  else if (m.mint && (m.txType === 'migrate' || m.txType === 'migration' || !m.txType)) {
    if (!state.migrationSample) state.migrationSample = JSON.stringify(m).slice(0, 400);
    buf.migrations.push({ mint: m.mint, _ts: now() });
  }
}

function flush() {
  const { creates, trades, migrations } = buf;
  if (!creates.length && !trades.length && !migrations.length) return;
  buf = { creates: [], trades: [], migrations: [] };
  const db = getRadarDb();
  db.transaction(() => {
    if (creates.length) {
      const tok = db.prepare(`INSERT OR IGNORE INTO token
        (token_address, symbol, name, creator, first_pool, current_pool, dex, launchpad, pool_created_ts, first_seen_ts)
        VALUES (@mint, @symbol, @name, @creator, @curve, @curve, 'pumpfun', 'pumpfun', @ts, @ts)`);
      const fillCreator = db.prepare('UPDATE token SET creator = COALESCE(creator, @creator) WHERE token_address = @mint');
      const launch = db.prepare(`INSERT OR IGNORE INTO token_launch
        (token_address, ts, creator, dev_buy_sol, dev_buy_tokens, mcap_sol, uri, mayhem)
        VALUES (@mint, @ts, @creator, @sol, @tokens, @mcap, @uri, @mayhem)`);
      for (const c of creates) {
        const row = {
          mint: c.mint, symbol: c.symbol || null, name: c.name || null, creator: c.traderPublicKey || null,
          curve: c.bondingCurveKey || null, ts: c._ts, sol: c.solAmount ?? null, tokens: c.initialBuy ?? null,
          mcap: c.marketCapSol ?? null, uri: c.uri || null, mayhem: c.is_mayhem_mode ? 1 : 0,
        };
        tok.run(row);
        fillCreator.run(row);
        launch.run(row);
      }
      state.created += creates.length;
    }
    if (migrations.length) {
      const mig = db.prepare(`UPDATE token SET migrated_ts = COALESCE(migrated_ts, @ts) WHERE token_address = @mint`);
      for (const x of migrations) mig.run({ mint: x.mint, ts: x._ts });
      state.migrations += migrations.length;
    }
    if (trades.length) {
      const ins = db.prepare(`INSERT OR IGNORE INTO trade (token_address, ts_ms, sig, wallet, is_buy, sol, tokens, mcap_sol, v_sol)
        VALUES (@mint, @ms, @sig, @wallet, @buy, @sol, @tokens, @mcap, @vsol)`);
      for (const t of trades) {
        ins.run({ mint: t.mint, ms: t._ms, sig: t.signature || String(t._ms), wallet: t.traderPublicKey || null,
          buy: t.txType === 'buy' ? 1 : 0, sol: t.solAmount ?? null, tokens: t.tokenAmount ?? null,
          mcap: t.marketCapSol ?? null, vsol: t.vSolInBondingCurve ?? null });
      }
      state.trades += trades.length;
    }
  })();
  // Every trade message is billed, so the counter is persisted (a restart must not reset the budget).
  if (trades.length) {
    const used = usedToday() + trades.length;
    kvSet(msgKey(), used);
    if (used >= DAILY_MESSAGE_CAP) stopAllTrades(`daily budget reached (${used} msgs ≈ ${(used / MESSAGES_PER_SOL).toFixed(4)} SOL)`);
  }
}

function stopAllTrades(reason) {
  if (state.subscribed.size) send({ method: 'unsubscribeTokenTrade', keys: [...state.subscribed] });
  state.subscribed.clear();
  if (reason && state.tradeDisabledReason !== reason) console.log(`[radar] trade stream paused: ${reason}`);
  state.tradeDisabledReason = reason;
}

// Watch trades only on the most active live tokens in the window where models can fire, skipping ones the security
// check already flagged as dangerous. Highest-volume tokens burn budget fastest, so the cap is per-day, not per-token.
function refreshSubscriptions() {
  if (!API_KEY || !state.tradeMode || !state.connected) return;
  if (usedToday() >= DAILY_MESSAGE_CAP) return stopAllTrades('daily budget reached');
  if (state.tradeDisabledReason && state.tradeDisabledReason.startsWith('daily budget')) state.tradeDisabledReason = null;
  const ts = now();
  const want = new Set(getRadarDb().prepare(`
    SELECT t.token_address FROM token t
    WHERE t.dead_ts IS NULL AND t.pool_created_ts BETWEEN ? AND ? AND t.last_vol_h1 >= ?
      AND NOT EXISTS (SELECT 1 FROM token_security s WHERE s.token_address = t.token_address AND s.danger_count >= 2)
    ORDER BY t.last_vol_h1 DESC LIMIT ?
  `).all(ts - CANDIDATE_AGE[1], ts - CANDIDATE_AGE[0], CANDIDATE_MIN_VOL_H1, MAX_TRADE_TOKENS).map((r) => r.token_address));
  const add = [...want].filter((k) => !state.subscribed.has(k));
  const drop = [...state.subscribed].filter((k) => !want.has(k));
  if (drop.length) { send({ method: 'unsubscribeTokenTrade', keys: drop }); drop.forEach((k) => state.subscribed.delete(k)); }
  if (add.length) { send({ method: 'subscribeTokenTrade', keys: add }); add.forEach((k) => state.subscribed.add(k)); }
}

function connect() {
  if (stopped) return;
  ws = new WebSocket(URL);
  ws.on('open', () => {
    state.connected = true;
    state.connects++;
    state.lastMessageAt = Date.now();
    reconnectDelay = 1000;
    state.subscribed.clear();                       // a new connection starts with no subscriptions
    send({ method: 'subscribeNewToken' });
    send({ method: 'subscribeMigration' });
    console.log(`[radar] pumpportal connected (trades: ${API_KEY ? 'enabled, budget ' + BUDGET_SOL_PER_DAY + ' SOL/day' : 'off — no API key'})`);
    refreshSubscriptions();
  });
  ws.on('message', onMessage);
  ws.on('error', (e) => console.warn('[radar] pumpportal socket error:', e.message));
  ws.on('close', () => {
    state.connected = false;
    if (stopped) return;
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 30000);  // exponential backoff — repeated reconnects get you timed out
  });
}

function start() {
  if (!stopped) return;
  stopped = false;
  connect();
  flushTimer = setInterval(() => { try { flush(); } catch (e) { console.error('[radar] stream flush error:', e.message); } }, FLUSH_MS);
  subTimer = setInterval(() => { try { refreshSubscriptions(); } catch (e) { console.error('[radar] subscription error:', e.message); } }, SUB_REFRESH_MS);
  stallTimer = setInterval(() => {
    if (state.connected && Date.now() - state.lastMessageAt > STALL_MS) {
      console.warn('[radar] pumpportal stalled, reconnecting');
      ws.terminate();
    }
  }, 15000);
}

function stop() {
  stopped = true;
  [flushTimer, subTimer, stallTimer].forEach(clearInterval);
  if (ws) ws.close();
  flush();
}

function status() {
  const used = API_KEY ? usedToday() : 0;
  return {
    connected: state.connected, reconnects: Math.max(0, state.connects - 1),
    lastMessageSecAgo: state.lastMessageAt ? Math.round((Date.now() - state.lastMessageAt) / 1000) : null,
    launchesSeen: state.created, migrationsSeen: state.migrations, tradesSeen: state.trades,
    trades: {
      enabled: !!API_KEY && state.tradeMode, reason: state.tradeDisabledReason, watching: state.subscribed.size,
      messagesToday: used, dailyCap: DAILY_MESSAGE_CAP, spentTodaySol: +(used / MESSAGES_PER_SOL).toFixed(4),
      budgetSolPerDay: BUDGET_SOL_PER_DAY,
    },
    migrationSample: state.migrationSample,
  };
}

module.exports = { start, stop, status, flush, onMessage };
