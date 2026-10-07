'use strict';
// Smart-money collector. Opt-in via SMART_MONEY_COLLECTOR=1. Never throws out of start()/runCycle().
//
// Wallet discovery (all optional, per-source flags, none needs social data):
//   SMART_MONEY_BIRDEYE_LB=1 (+BIRDEYE_API_KEY)   SMART_MONEY_WINNER_BACKBUY=1 (+ENABLE_RADAR)   SMART_MONEY_SEEDS=1
//   SMART_MONEY_FOMOAPI=1 (+FOMOAPI_KEY)          SMART_MONEY_SOLANATRACKER=1 (+SOLANATRACKER_API_KEY)
// Every discovered wallet is only a CANDIDATE: reported PnL is ignored and the wallet is re-scored here from on-chain
// trades (skill.js, holdout rule, trades strictly before as_of). Only wallets that pass produce smart_money_event.

const { initWalletSchema, getSkillAsOf } = require('./schema');
const { computeSkill, isSmart } = require('./skill');
const { getProviders } = require('./providers');
const { createBudget, parseDailyBudget } = require('./budget');
const { getDiscoverySources, FLAGS: DISCOVERY_FLAGS } = require('./discoverySources');
const { runDiscovery } = require('./discovery');
const { evaluateForward, FORWARD_DAYS_DEFAULT } = require('./candidates');

let timer = null;
let running = false;
let stopped = true;

const nowSec = () => Math.floor(Date.now() / 1000);

function loadTrending() {
  return require('../../services/memecoinData').getTrending();
}

async function firstOk(providers, method, arg, ...rest) {
  let lastErr = null;
  for (const p of providers) {
    if (typeof p[method] !== 'function') continue;
    try { return await p[method](arg, ...rest); } catch (e) { lastErr = e; }
  }
  if (lastErr) throw lastErr;
  return [];
}

// One collection pass. All dependencies injectable for tests.
async function runCycle(db, opts = {}) {
  const log = opts.log || console;
  const now = opts.now != null ? opts.now : nowSec();
  const providers = (opts.providers || getProviders()).filter((p) => p.enabled);
  const getTrending = opts.getTrending || loadTrending;
  const maxTokens = opts.maxTokens || 10;
  const maxWallets = opts.maxWallets || 40;
  const lookbackSec = (opts.lookbackDays || 30) * 86400;
  const eventWindowSec = opts.eventWindowSec || 86400;
  const stats = { tokens: 0, wallets: 0, newTrades: 0, snapshots: 0, events: 0, errors: 0 };
  const discoverySources = opts.discoverySources || [];
  const forwardDays = opts.forwardDays || FORWARD_DAYS_DEFAULT;

  const insWallet = db.prepare('INSERT OR IGNORE INTO wallet (wallet_id, chain, first_seen_ts, event_ts, ingested_ts) VALUES (?, ?, ?, ?, ?)');
  const insTrade = db.prepare('INSERT OR IGNORE INTO wallet_trade (wallet_id, token_id, ts, side, amount_token, price_usd, amount_usd, tx, event_ts, ingested_ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const insSnap = db.prepare('INSERT OR IGNORE INTO wallet_skill_snapshot (wallet_id, as_of_ts, n_trades, win_rate, sortino_like, consistency_score, realized_pnl_usd, top_trade_share, passed_holdout, skill_score, event_ts, ingested_ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const insEvt = db.prepare('INSERT OR IGNORE INTO smart_money_event (token_id, wallet_id, ts, side, amount_usd, skill_as_of_ts, skill_score, event_ts, ingested_ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');

  // (a) discover
  let tokens = [];
  try {
    tokens = ((await getTrending()) || []).map((t) => t && t.address).filter(Boolean).slice(0, maxTokens);
  } catch (e) { stats.errors++; log.warn(`[smart-money] getTrending failed: ${e.message}`); }
  stats.tokens = tokens.length;

  const cand = new Set();
  const trendingTraders = [];
  for (const tok of tokens) {
    try { for (const w of await firstOk(providers, 'discoverCandidateWallets', tok)) { cand.add(w); trendingTraders.push(w); } }
    catch (e) { stats.errors++; log.warn(`[smart-money] discover ${tok} failed: ${e.message}`); }
  }
  // on-chain top-earner discovery (candidates are recorded in wallet_candidate and registered in `wallet`; never throws)
  if (discoverySources.some((s) => s && s.enabled)) {
    try {
      stats.discovery = await runDiscovery(db, { sources: discoverySources, now, tokens, trendingTraders, env: opts.env, log });
      stats.errors += stats.discovery.errors;
    } catch (e) { stats.errors++; log.warn(`[smart-money] discovery failed: ${e.message}`); }
  }
  // known wallets, least recently re-scored first (never-scored candidates first) so every wallet keeps getting refreshed
  for (const r of db.prepare(`SELECT w.wallet_id FROM wallet w
      LEFT JOIN (SELECT wallet_id, MAX(as_of_ts) AS m FROM wallet_skill_snapshot GROUP BY wallet_id) s ON s.wallet_id = w.wallet_id
      ORDER BY COALESCE(s.m, 0) ASC, w.rowid ASC`).all()) cand.add(r.wallet_id);
  const wallets = [...cand].slice(0, maxWallets);

  for (const w of wallets) {
    try {
      insWallet.run(w, 'solana', now, now, now);
      // (b) trades
      const last = db.prepare('SELECT MAX(ts) AS m FROM wallet_trade WHERE wallet_id = ?').get(w);
      const since = last && last.m ? last.m : now - lookbackSec;
      const trades = await firstOk(providers, 'getWalletTrades', w, since);
      for (const t of trades) {
        if (!t || !(t.ts < now + 60)) continue;
        const r = insTrade.run(w, t.token_id, t.ts, t.side, t.amount_token, t.price_usd, t.amount_usd, t.tx, t.ts, now);
        stats.newTrades += Number(r.changes || 0);
      }
      // (c) skill snapshot using only trades before `now`
      const all = db.prepare('SELECT * FROM wallet_trade WHERE wallet_id = ? AND ts < ?').all(w, now);
      const s = computeSkill(all, now);
      const r = insSnap.run(w, now, s.n_trades, s.win_rate, s.sortino_like, s.consistency_score, s.realized_pnl_usd, s.top_trade_share, s.passed_holdout, s.skill_score, now, now);
      stats.snapshots += Number(r.changes || 0);
      stats.wallets++;
    } catch (e) { stats.errors++; log.warn(`[smart-money] wallet ${w} failed: ${e.message}`); }
  }

  // (d) smart-money events: ANY recent buy (not just of today's top-10 trending tokens: the radar tracks brand-new
  // launches that are never in that list) by a wallet that was skilled BEFORE the trade. token_id = mint address.
  try {
    const buys = db.prepare("SELECT * FROM wallet_trade WHERE side = 'buy' AND ts >= ? ORDER BY ts").all(now - eventWindowSec);
    for (const b of buys) {
      const snap = getSkillAsOf(db, b.wallet_id, b.ts);
      if (!isSmart(snap)) continue;
      const r = insEvt.run(b.token_id, b.wallet_id, b.ts, 'buy', b.amount_usd, snap.as_of_ts, snap.skill_score, b.ts, now);
      stats.events += Number(r.changes || 0);
    }
  } catch (e) { stats.errors++; log.warn(`[smart-money] event scan failed: ${e.message}`); }

  // (e) forward test of discovered candidates vs controls (append-only, only once the forward window has elapsed)
  try { stats.forwardEvaluated = evaluateForward(db, { now, forwardDays }); }
  catch (e) { stats.errors++; log.warn(`[smart-money] forward evaluation failed: ${e.message}`); }

  return stats;
}

function start(db, opts = {}) {
  const env = opts.env || process.env;
  const log = opts.log || console;
  try {
    if (env.SMART_MONEY_COLLECTOR !== '1') {
      log.log('[smart-money] disabled: SMART_MONEY_COLLECTOR != 1');
      return { started: false, reason: 'SMART_MONEY_COLLECTOR != 1' };
    }
    initWalletSchema(db);
    // one persisted daily budget shared by EVERY Birdeye call (provider + leaderboard + back-buyer lookups)
    const budget = opts.budget || createBudget(db, { provider: 'birdeye', dailyLimit: parseDailyBudget(env) });
    const providers = opts.providers || getProviders(env, { budget });
    const discoverySources = opts.discoverySources || getDiscoverySources(env, {
      budget, radarDb: opts.radarDb, seedsPath: opts.seedsPath,
    });
    for (const s of discoverySources) if (!s.enabled && (env[DISCOVERY_FLAGS[s.name]] === '1')) log.log(`[smart-money] discovery ${s.name} disabled: ${s.reason}`);
    for (const p of providers) if (!p.enabled) log.log(`[smart-money] provider ${p.name} disabled: ${p.reason}`);
    const active = providers.filter((p) => p.enabled);
    if (!active.some((p) => typeof p.getWalletTrades === 'function')) {
      log.log('[smart-money] disabled: no provider can fetch wallet trades (set HELIUS_API_KEY or BIRDEYE_API_KEY)');
      return { started: false, reason: 'no trade provider enabled' };
    }
    if (!active.some((p) => typeof p.discoverCandidateWallets === 'function')) {
      log.log('[smart-money] warning: no discovery provider; only already-known wallets will be refreshed');
    }
    const interval = Number(env.SMART_MONEY_INTERVAL_MS) || 15 * 60_000;
    const cycleOpts = {
      ...opts, providers, log, discoverySources, env,
      forwardDays: Number(env.SMART_MONEY_FORWARD_DAYS) || opts.forwardDays,
      maxTokens: Number(env.SMART_MONEY_MAX_TOKENS) || opts.maxTokens,
      maxWallets: Number(env.SMART_MONEY_MAX_WALLETS) || opts.maxWallets,
      lookbackDays: Number(env.SMART_MONEY_LOOKBACK_DAYS) || opts.lookbackDays,
    };
    stopped = false;
    const tick = async () => {
      if (stopped) return;
      if (!running) {
        running = true;
        try { log.log('[smart-money] cycle', JSON.stringify(await runCycle(db, cycleOpts))); }
        catch (e) { log.warn(`[smart-money] cycle failed: ${e.message}`); }
        finally { running = false; }
      }
      if (!stopped) { timer = setTimeout(tick, interval); if (timer.unref) timer.unref(); }
    };
    timer = setTimeout(tick, opts.initialDelayMs != null ? opts.initialDelayMs : 15_000);
    if (timer.unref) timer.unref();
    // fast loop: polls only skilled wallets' recent trades so fresh buys reach smart_money_event within ~1 min
    // (SMART_MONEY_FAST_MS=0 disables). Never throws; shares the Birdeye daily budget with this loop.
    try { require('./fast').start(db, { env, log, providers: active, birdeyeBudget: budget }); }
    catch (e) { log.warn(`[smart-money] fast loop not started: ${e.message}`); }
    log.log(`[smart-money] collector started (every ${interval}ms; providers: ${active.map((p) => p.name).join(', ')}; discovery: ${discoverySources.filter((s) => s.enabled).map((s) => s.name).join(', ') || 'none'})`);
    return { started: true };
  } catch (e) {
    log.warn(`[smart-money] start failed: ${e.message}`);
    return { started: false, reason: e.message };
  }
}

function stop() {
  try { require('./fast').stop(); } catch { /* ignore */ }
  stopped = true;
  if (timer) clearTimeout(timer);
  timer = null;
}

module.exports = { start, stop, runCycle };
