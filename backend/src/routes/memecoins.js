const express = require('express');
const { recordWin } = require('../services/wins');
const { recordTrade } = require('../services/elo');
const router = express.Router();
const data = require('../services/memecoinData');

const { computeSignal, MODEL_VERSION } = require('../services/signalScore');
const radarSignals = require('../services/radarSignals');
const positionsSvc = require('../services/memecoinPositions');

// The radar is the primary signal engine: tokens it tracks get the radar score; others fall back to activity-v0.
// Radar problems (disabled, empty, DB error) always degrade to an empty result, never an error.
function radarLookup(addresses) {
  try { return radarSignals.lookupMany(addresses); } catch (_) { return new Map(); }
}
// Radar score + radar risk flags merged with the activity-v0 flags computed from list data.
function radarShape(token, r, mineSig) {
  return radarSignals.toMemecoinSignal({ ...r, symbol: data.cleanSymbol(r.symbol || token.symbol, token.address) }, mineSig);
}

// DB persistence is best-effort and loaded lazily so a DB problem never breaks the API.
function persistSignal(...a) {
  try { return require('../services/signalStore').persistSignal(...a); } catch (e) { console.error('[signal] persist:', e.message); return false; }
}
function previousLiquidity(...a) {
  try { return require('../services/signalStore').previousLiquidity(...a); } catch (_) { return null; }
}

// Paper trades reuse the Supabase paper_* tables used by routes/paperTrading.js
// (position `ticker` column holds the Solana mint address; cash is USD).
let supabase = null;
function getSupabase() {
  if (!supabase) supabase = require('../services/supabaseAdmin').supabase;
  return supabase;
}
router.__setSupabase = (client) => { supabase = client; }; // test hook

// Wrap async handlers: map known data errors to status codes, never crash.
const h = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[memecoins]', req.method, req.path, err.message);
    res.status(status).json({ error: true, message: status >= 500 && !err.status ? 'Internal error' : err.message });
  }
};

function needAddress(req) {
  if (!data.isValidAddress(req.params.address)) {
    throw new data.MemecoinDataError('Invalid Solana address', 400);
  }
  return req.params.address;
}

router.get('/trending', h(async (_req, res) => res.json(await data.getTrending())));
router.get('/new', h(async (_req, res) => res.json(await data.getNew())));
router.get('/search', h(async (req, res) => res.json(await data.search(req.query.q))));

async function ensurePortfolio(userId) {
  const sb = getSupabase();
  const { data: existing, error: e1 } = await sb.from('paper_portfolios').select('*').eq('user_id', userId).maybeSingle();
  if (e1) throw e1;
  if (existing) return existing;
  const { data: created, error } = await sb.from('paper_portfolios')
    .insert({ user_id: userId, cash_balance: 500 }).select().single();
  if (error) throw error;
  return created;
}

// ── order input validation ──────────────────────────────────────────────────
const NUM_RE = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
// number | numeric string -> finite positive number, else null (rejects booleans, arrays, NaN, Infinity, negatives)
function positiveNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : null;
  if (typeof v === 'string' && NUM_RE.test(v.trim())) { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; }
  return null;
}
function parseOrder(body) {
  const { address, side, amountSol, amountTokens, slippageBps, clientOrderId } = body || {};
  if (!data.isValidAddress(address)) throw new data.MemecoinDataError('Invalid Solana address', 400);
  if (side !== 'buy' && side !== 'sell') throw new data.MemecoinDataError("side must be 'buy' or 'sell'", 400);
  const hasTokens = amountTokens !== undefined && amountTokens !== null && amountTokens !== '';
  let sol;
  let tokens;
  if (side === 'sell' && hasTokens) {
    tokens = positiveNumber(amountTokens);
    if (tokens == null || tokens > 1e21) throw new data.MemecoinDataError('amountTokens must be a positive number', 400);
  } else {
    sol = positiveNumber(amountSol);
    if (sol == null) throw new data.MemecoinDataError('amountSol must be a positive number', 400);
    if (sol > 1000) throw new data.MemecoinDataError('amountSol too large', 400);
  }
  const noSlip = slippageBps === undefined || slippageBps === null || slippageBps === '';
  const slip = noSlip ? 100 : Number(slippageBps);
  if (!Number.isFinite(slip) || typeof slippageBps === 'boolean') throw new data.MemecoinDataError('slippageBps must be a number', 400);
  const cid = typeof clientOrderId === 'string' && /^[\w.:-]{1,64}$/.test(clientOrderId) ? clientOrderId : null;
  return { address, side, amountSol: sol, amountTokens: tokens, slippageBps: slip, clientOrderId: cid };
}

router.post('/quote', h(async (req, res) => {
  const o = parseOrder(req.body);
  res.json(await data.getQuote(o));
}));

// ── trade execution ─────────────────────────────────────────────────────────
// DB precision: paper_portfolios.cash_balance NUMERIC(15,4), paper_transactions.total NUMERIC(15,4),
// shares NUMERIC(38,9), avg_cost/price NUMERIC(38,18) (supabase-memecoin-migration.sql). We round to the column
// precision ourselves so the compare-and-swap on cash_balance compares exactly what the DB stores.
const r4 = (x) => Math.round(x * 1e4) / 1e4;
const floor9 = (x) => Math.floor(x * 1e9) / 1e9;
const DUST = 1e-9;

// Serialise trades per user inside this process. Position rows are read-modify-write; the cash CAS below also protects
// against other writers (the stock paper-trading routes, a second instance) but only for the cash column.
// RESIDUAL RACE: with >1 backend instance two concurrent trades by one user on different instances can interleave their
// position read/write (one trade's cash change is applied but its position update is overwritten). Closing that needs a
// single SQL function (RPC) doing cash+position+transaction atomically; Railway currently runs one instance.
const userLocks = new Map();
function withUserLock(userId, fn) {
  const prev = userLocks.get(userId) || Promise.resolve();
  const run = prev.then(fn, fn);
  const tail = run.catch(() => {});
  userLocks.set(userId, tail);
  tail.then(() => { if (userLocks.get(userId) === tail) userLocks.delete(userId); });
  return run;
}

// Replay protection for double-submits carrying the same clientOrderId (kept 2 minutes, in-memory)
const recentOrders = new Map(); // `${userId}:${cid}` -> { p, exp }
function rememberOrder(key, p) {
  const now = Date.now();
  if (recentOrders.size > 1000) for (const [k, v] of recentOrders) if (v.exp < now) recentOrders.delete(k);
  recentOrders.set(key, { p, exp: now + 120_000 });
  p.catch(() => recentOrders.delete(key)); // failures may be retried
}

class TradeReject extends Error {
  constructor(status, body) { super(body.message); this.status = status; this.body = body; }
}

async function casCash(sb, userId, expected, next) {
  const { data: rows, error } = await sb.from('paper_portfolios')
    .update({ cash_balance: next, updated_at: new Date().toISOString() })
    .eq('user_id', userId).eq('cash_balance', expected).select('user_id');
  if (error) throw error;
  return (rows?.length ?? 0) > 0;
}

async function applyTrade(sb, userId, address, side, quote) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const portfolio = await ensurePortfolio(userId);
    const cash = Number(portfolio.cash_balance);
    const { data: pos, error: posReadErr } = await sb.from('paper_positions')
      .select('shares, avg_cost').eq('user_id', userId).eq('ticker', address).maybeSingle();
    if (posReadErr) throw posReadErr;
    const held = pos ? Number(pos.shares) : 0;
    const avgCost = pos ? Number(pos.avg_cost) : 0;

    let tokens;
    let total;
    let newCash;
    let newShares;
    let newAvg = avgCost;

    if (side === 'buy') {
      tokens = floor9(quote.tokens);
      total = r4(quote.usd);
      if (!(tokens > 0) || !(total > 0)) throw new TradeReject(400, { error: true, message: 'Order too small' });
      if (cash < total) {
        throw new TradeReject(400, { error: true, message: 'Insufficient cash balance', required: total, available: cash });
      }
      newCash = r4(cash - total);
      newShares = held + tokens;
      newAvg = (avgCost * held + quote.fillPrice * tokens) / newShares;
    } else {
      if (held <= DUST) throw new TradeReject(400, { error: true, message: 'No position to sell', held: 0 });
      tokens = floor9(quote.tokens);
      if (tokens >= held - DUST) { tokens = held; total = r4(tokens * quote.fillPrice); } // cap ("sell all")
      else total = r4(quote.usd);
      if (!(tokens > 0) || !(total > 0)) throw new TradeReject(400, { error: true, message: 'Order too small' });
      newCash = r4(cash + total);
      newShares = tokens === held ? 0 : held - tokens;
    }

    if (!(await casCash(sb, userId, cash, newCash))) continue; // cash changed under us: re-read and recompute

    // Cash is committed; if the position write fails put the cash back so no money is lost or created.
    try {
      if (newShares <= DUST) {
        const { error } = await sb.from('paper_positions').delete().eq('user_id', userId).eq('ticker', address);
        if (error) throw error;
      } else {
        const { error } = await sb.from('paper_positions').upsert({
          user_id: userId, ticker: address, shares: newShares, avg_cost: newAvg, updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,ticker' });
        if (error) throw error;
      }
    } catch (err) {
      try { await casCash(sb, userId, newCash, cash); } catch (e2) { console.error('[memecoins] cash rollback failed', userId, e2.message); }
      throw err;
    }

    const { error: txErr } = await sb.from('paper_transactions')
      .insert({ user_id: userId, type: side, ticker: address, shares: tokens, price: quote.fillPrice, total });
    if (txErr) console.error('[memecoins] transaction log failed (trade applied)', userId, address, txErr.message);

    return { tokens, total, newCash, newShares, newAvg, avgCost };
  }
  throw new TradeReject(409, { error: true, message: 'Balance changed while trading, please retry' });
}

router.post('/trade', h(async (req, res) => {
  const o = parseOrder(req.body);
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: true, message: 'Authentication required.' });
  const { address, side } = o;

  const key = o.clientOrderId ? `${userId}:${o.clientOrderId}` : null;
  const dup = key && recentOrders.get(key);
  if (dup && dup.exp > Date.now()) {
    try { return res.json(await dup.p); } catch (err) {
      if (err instanceof TradeReject) return res.status(err.status).json(err.body);
      throw err;
    }
  }

  const exec = (async () => {
    const sb = getSupabase();
    const quote = await data.getQuote(o);
    if (quote.exceedsSlippage) {
      throw new TradeReject(400, {
        error: true,
        message: `Price impact ${quote.priceImpactPct.toFixed(2)}% exceeds slippage tolerance`,
        quote,
      });
    }
    const r = await withUserLock(userId, () => applyTrade(sb, userId, address, side, quote));
    const pnl = side === 'sell' ? (quote.fillPrice - r.avgCost) * r.tokens : null;
    let eloChange = null;
    if (pnl != null) {
      eloChange = recordTrade({ userId, kind: 'meme', symbol: quote.symbol, pnlUsd: pnl, pnlPct: r.avgCost > 0 ? ((quote.fillPrice - r.avgCost) / r.avgCost) * 100 : null });
    }
    if (pnl != null && pnl > 0) {
      recordWin({
        userId, kind: 'meme', symbol: quote.symbol, address, entry: r.avgCost, exit: quote.fillPrice, qty: r.tokens,
        pnlUsd: pnl, pnlPct: r.avgCost > 0 ? ((quote.fillPrice - r.avgCost) / r.avgCost) * 100 : null, solPrice: quote.solPrice,
      });
    }
    return {
      success: true,
      paper: true,
      side,
      address,
      symbol: quote.symbol,
      fillPrice: quote.fillPrice,
      marketPrice: quote.marketPrice,
      priceImpactPct: quote.priceImpactPct,
      tokens: r.tokens,
      usd: r.total,
      amountSol: r.total / quote.solPrice,
      solPrice: quote.solPrice,
      realizedPnl: pnl,
      elo: eloChange,
      cashBalance: r.newCash,
      position: r.newShares > DUST ? {
        address,
        symbol: quote.symbol,
        tokens: r.newShares,
        avgCost: r.newAvg,
        currentPrice: quote.marketPrice,
        value: r.newShares * quote.marketPrice,
        pnl: (quote.marketPrice - r.newAvg) * r.newShares,
        pnlPct: r.newAvg > 0 ? ((quote.marketPrice - r.newAvg) / r.newAvg) * 100 : null,
      } : null,
    };
  })();
  if (key) rememberOrder(key, exec);

  try {
    res.json(await exec);
  } catch (err) {
    if (err instanceof TradeReject) return res.status(err.status).json(err.body);
    throw err;
  }
}));

// ── positions & history (server-side source of truth for the terminal) ──────
router.get('/positions', h(async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: true, message: 'Authentication required.' });
  const portfolio = await ensurePortfolio(userId);
  const out = await positionsSvc.listPositions(getSupabase(), userId, (a) => data.getToken(a));
  res.json({ cashBalance: Number(portfolio.cash_balance), ...out, asOf: Date.now() });
}));

router.get('/history', h(async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: true, message: 'Authentication required.' });
  res.json(await positionsSvc.listHistory(getSupabase(), userId, req.query, (a) => data.getToken(a)));
}));

// ── Unusual-activity signal (NOT a price prediction) ────────────────────────
const signalCache = new Map(); // address -> { sig, exp }
const SIGNAL_TTL = 45_000;
const SIGNAL_STALE_MAX = 10 * 60_000;
const LIST_OHLCV_TOP = 10;        // only the top N list rows get an OHLCV-based score
const GECKO_BUDGET_PER_MIN = 20;  // leave headroom under GeckoTerminal's ~30 req/min
const geckoCalls = [];

function takeGeckoBudget(n) {
  const cutoff = Date.now() - 60_000;
  while (geckoCalls.length && geckoCalls[0] < cutoff) geckoCalls.shift();
  if (geckoCalls.length + n > GECKO_BUDGET_PER_MIN) return false;
  for (let i = 0; i < n; i++) geckoCalls.push(Date.now());
  return true;
}

function cacheSignal(address, sig) {
  if (signalCache.size > 500) {
    const now = Date.now();
    for (const [k, v] of signalCache) if (now - v.at > SIGNAL_STALE_MAX) signalCache.delete(k);
    if (signalCache.size > 500) signalCache.delete(signalCache.keys().next().value);
  }
  signalCache.set(address, { sig, exp: Date.now() + SIGNAL_TTL, at: Date.now() });
}

function shape(token, sig) {
  return {
    address: token.address, symbol: data.cleanSymbol(token.symbol, token.address),
    score: sig.score, level: sig.level, confidence: sig.confidence, mode: sig.mode,
    source: sig.source || 'activity-v0', model: sig.model || MODEL_VERSION, radar: sig.radar,
    components: sig.components, riskFlags: sig.riskFlags, asOf: sig.asOf,
    modelVersion: sig.modelVersion, notes: sig.notes,
  };
}

function finish(token, sig, mode) {
  sig.mode = mode;
  cacheSignal(token.address, sig);
  persistSignal(token.address, token.symbol, sig);
  return sig;
}

// Full score for one token: detail + 5m (+1m when budget allows) OHLCV.
async function fullSignal(token) {
  const now = Date.now();
  const candles5m = await data.getOhlcv(token.address, '5m').catch(() => null);
  const candles1m = takeGeckoBudget(1) ? await data.getOhlcv(token.address, '1m').catch(() => null) : null;
  const sig = computeSignal({
    token, candles5m, candles1m, now, prevLiquidityUsd: previousLiquidity(token.address, now),
  });
  return finish(token, sig, candles5m || candles1m ? 'full' : 'list-only');
}

router.get('/signals', h(async (req, res) => {
  const list = req.query.list === 'new' ? 'new' : req.query.list === 'trending' ? 'trending' : null;
  if (!list) throw new data.MemecoinDataError("list must be 'trending' or 'new'", 400);
  const tokens = (list === 'new' ? await data.getNew() : await data.getTrending()).slice(0, 30);
  const now = Date.now();
  const out = new Array(tokens.length);
  const todo = [];
  const radarMap = radarLookup(tokens.map((t) => t.address));

  tokens.forEach((t, i) => {
    const rs = radarMap.get(t.address);
    if (rs) {
      // radar-tracked: no OHLCV spend; activity-v0 on list data only contributes its risk flags
      out[i] = shape(t, radarShape(t, rs, computeSignal({ token: t, now })));
      return;
    }
    const hit = signalCache.get(t.address);
    if (hit && hit.exp > now) { out[i] = shape(t, hit.sig); return; }
    if (i < LIST_OHLCV_TOP) { todo.push(i); return; }
    // beyond top N: stale full score if we have one, else list-data-only
    if (hit && now - hit.at < SIGNAL_STALE_MAX && hit.sig.mode === 'full') {
      out[i] = shape(t, { ...hit.sig, notes: [...(hit.sig.notes || []), 'cached score'] });
    } else {
      out[i] = shape(t, finish(t, computeSignal({ token: t, now }), 'list-only'));
    }
  });

  // top-N: one 5m OHLCV each, bounded concurrency and call budget
  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const i = todo[next++];
      const t = tokens[i];
      let sig;
      if (takeGeckoBudget(1)) {
        const candles5m = await data.getOhlcv(t.address, '5m').catch(() => null);
        sig = computeSignal({ token: t, candles5m, now, prevLiquidityUsd: previousLiquidity(t.address, now) });
        sig = finish(t, sig, candles5m ? 'full' : 'list-only');
      } else {
        const hit = signalCache.get(t.address);
        sig = hit && now - hit.at < SIGNAL_STALE_MAX
          ? { ...hit.sig, notes: [...(hit.sig.notes || []), 'cached score'] }
          : finish(t, computeSignal({ token: t, now }), 'list-only');
      }
      out[i] = shape(t, sig);
    }
  };
  await Promise.all([worker(), worker(), worker()]);

  res.json({ list, asOf: now, modelVersion: MODEL_VERSION, signals: out });
}));

router.get('/:address/signal', h(async (req, res) => {
  const address = needAddress(req);
  const hit = signalCache.get(address);
  const token = await data.getToken(address);
  const rs = radarLookup([address]).get(address);
  if (rs) return res.json(shape(token, radarShape(token, rs, computeSignal({ token, now: Date.now() }))));
  if (hit && hit.exp > Date.now() && hit.sig.mode === 'full') return res.json(shape(token, hit.sig));
  res.json(shape(token, await fullSignal(token)));
}));

// Param routes last so they don't shadow the fixed paths above
router.get('/:address/ohlcv', h(async (req, res) => {
  res.json(await data.getOhlcv(needAddress(req), req.query.tf || '5m'));
}));
router.get('/:address/trades', h(async (req, res) => res.json(await data.getTrades(needAddress(req)))));
router.get('/:address', h(async (req, res) => res.json(await data.getToken(needAddress(req)))));

module.exports = router;
