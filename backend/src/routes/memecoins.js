const express = require('express');
const router = express.Router();
const data = require('../services/memecoinData');

const { computeSignal, MODEL_VERSION } = require('../services/signalScore');

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

router.post('/quote', h(async (req, res) => {
  const { address, side, amountSol, amountTokens, slippageBps } = req.body || {};
  if (!data.isValidAddress(address)) throw new data.MemecoinDataError('Invalid Solana address', 400);
  res.json(await data.getQuote({ address, side, amountSol, amountTokens, slippageBps }));
}));

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

router.post('/trade', h(async (req, res) => {
  const { address, side, amountSol, amountTokens, slippageBps } = req.body || {};
  if (!data.isValidAddress(address)) throw new data.MemecoinDataError('Invalid Solana address', 400);
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: true, message: 'Authentication required.' });

  const sb = getSupabase();
  const quote = await data.getQuote({ address, side, amountSol, amountTokens, slippageBps });
  if (quote.exceedsSlippage) {
    return res.status(400).json({
      error: true,
      message: `Price impact ${quote.priceImpactPct.toFixed(2)}% exceeds slippage tolerance`,
      quote,
    });
  }

  const portfolio = await ensurePortfolio(userId);
  const cash = Number(portfolio.cash_balance);
  const { data: pos, error: posReadErr } = await sb.from('paper_positions')
    .select('shares, avg_cost').eq('user_id', userId).eq('ticker', address).maybeSingle();
  if (posReadErr) throw posReadErr;
  const held = pos ? Number(pos.shares) : 0;
  const avgCost = pos ? Number(pos.avg_cost) : 0;

  let tokens = quote.tokens;
  let total = quote.usd;
  let newCash;
  let newShares;
  let newAvg = avgCost;

  if (side === 'buy') {
    if (cash < total) {
      return res.status(400).json({ error: true, message: 'Insufficient cash balance', required: total, available: cash });
    }
    newCash = cash - total;
    newShares = held + tokens;
    newAvg = (avgCost * held + quote.fillPrice * tokens) / newShares;
  } else {
    if (held <= 0) return res.status(400).json({ error: true, message: 'No position to sell', held: 0 });
    if (tokens > held) { // cap to what is held (e.g. "sell all")
      tokens = held;
      total = tokens * quote.fillPrice;
    }
    newCash = cash + total;
    newShares = held - tokens;
  }

  const { error: cashErr } = await sb.from('paper_portfolios')
    .update({ cash_balance: newCash, updated_at: new Date().toISOString() }).eq('user_id', userId);
  if (cashErr) throw cashErr;

  if (newShares <= 1e-9) {
    const { error } = await sb.from('paper_positions').delete().eq('user_id', userId).eq('ticker', address);
    if (error) throw error;
  } else {
    const { error } = await sb.from('paper_positions').upsert({
      user_id: userId, ticker: address, shares: newShares, avg_cost: newAvg, updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,ticker' });
    if (error) throw error;
  }

  const { error: txErr } = await sb.from('paper_transactions')
    .insert({ user_id: userId, type: side, ticker: address, shares: tokens, price: quote.fillPrice, total });
  if (txErr) throw txErr;

  const pnl = side === 'sell' ? (quote.fillPrice - avgCost) * tokens : null;
  res.json({
    success: true,
    paper: true,
    side,
    address,
    symbol: quote.symbol,
    fillPrice: quote.fillPrice,
    marketPrice: quote.marketPrice,
    priceImpactPct: quote.priceImpactPct,
    tokens,
    usd: total,
    amountSol: total / quote.solPrice,
    solPrice: quote.solPrice,
    realizedPnl: pnl,
    cashBalance: newCash,
    position: newShares > 1e-9 ? {
      address,
      symbol: quote.symbol,
      tokens: newShares,
      avgCost: newAvg,
      currentPrice: quote.marketPrice,
      value: newShares * quote.marketPrice,
      pnl: (quote.marketPrice - newAvg) * newShares,
      pnlPct: newAvg > 0 ? ((quote.marketPrice - newAvg) / newAvg) * 100 : null,
    } : null,
  });
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
    address: token.address, symbol: token.symbol,
    score: sig.score, level: sig.level, confidence: sig.confidence, mode: sig.mode,
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

  tokens.forEach((t, i) => {
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
