// Read side of memecoin paper trading: open positions (priced live) and trade history.
// Storage convention (see routes/memecoins.js POST /trade): paper_positions / paper_transactions rows whose `ticker`
// is a Solana mint address; shares are token counts, avg_cost / price are USD per token, total is USD.
const data = require('./memecoinData');

const MAX_POSITIONS = 50;
const PRICE_CONCURRENCY = 4;
const HISTORY_MAX_LIMIT = 100;
const HISTORY_DEFAULT_LIMIT = 25;
const MAX_SYMBOL_LOOKUPS = 20;
// Stock tickers are validated to <=15 chars; a mint is 32-44 base58 chars. LIKE with 32 single-char wildcards matches
// any ticker of at least 32 characters, so stock rows are excluded in SQL and isValidAddress() is the exact check.
const MINT_LIKE = `${'_'.repeat(32)}%`;

const toNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

// Run fn over items with bounded concurrency; never rejects (per-item failures resolve to null).
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length).fill(null);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try { out[i] = await fn(items[i], i); } catch (_) { out[i] = null; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function listPositions(sb, userId, getToken = data.getToken) {
  const { data: rows, error } = await sb.from('paper_positions')
    .select('ticker, shares, avg_cost, updated_at').eq('user_id', userId).gt('shares', 0);
  if (error) throw error;
  const mintRows = (rows || []).filter((r) => data.isValidAddress(r.ticker)).slice(0, MAX_POSITIONS);

  const tokens = await mapLimit(mintRows, PRICE_CONCURRENCY, (r) => getToken(r.ticker));
  let costUsd = 0; let valueUsd = 0; let pricedCost = 0; let unpriced = 0;
  const positions = mintRows.map((r, i) => {
    const tok = tokens[i];
    const qty = toNum(r.shares) ?? 0;
    const avgCost = toNum(r.avg_cost) ?? 0;
    const cost = qty * avgCost;
    const price = tok && toNum(tok.price) > 0 ? Number(tok.price) : null;
    const value = price != null ? qty * price : null;
    const pnl = value != null ? value - cost : null;
    costUsd += cost;
    if (value != null) { valueUsd += value; pricedCost += cost; } else unpriced++;
    return {
      address: r.ticker,
      symbol: tok?.symbol || data.shortMint(r.ticker),
      name: tok?.name || null,
      image: tok?.image || null,
      tokens: qty,
      avgCost,
      costUsd: cost,
      currentPrice: price,
      value,
      pnl,
      pnlPct: pnl != null && cost > 0 ? (pnl / cost) * 100 : null,
      priceError: price == null,
      updatedAt: r.updated_at || null,
    };
  });
  const pnl = valueUsd - pricedCost;
  return {
    positions,
    totals: {
      costUsd, valueUsd, pnl, pnlPct: pricedCost > 0 ? (pnl / pricedCost) * 100 : null, unpriced,
    },
  };
}

function parsePaging(query = {}) {
  let limit = parseInt(query.limit, 10);
  let offset = parseInt(query.offset, 10);
  if (!Number.isFinite(limit) || limit < 1) limit = HISTORY_DEFAULT_LIMIT;
  if (!Number.isFinite(offset) || offset < 0) offset = 0;
  return { limit: Math.min(limit, HISTORY_MAX_LIMIT), offset: Math.min(offset, 100000) };
}

async function listHistory(sb, userId, query, getToken = data.getToken) {
  const { limit, offset } = parsePaging(query);
  const { data: rows, error, count } = await sb.from('paper_transactions')
    .select('id, type, ticker, shares, price, total, created_at', { count: 'exact' })
    .eq('user_id', userId)
    .in('type', ['buy', 'sell'])
    .like('ticker', MINT_LIKE)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  const mintRows = (rows || []).filter((r) => data.isValidAddress(r.ticker));

  // symbols are best-effort (cached upstream); failures fall back to a shortened mint
  const distinct = [...new Set(mintRows.map((r) => r.ticker))].slice(0, MAX_SYMBOL_LOOKUPS);
  const toks = await mapLimit(distinct, PRICE_CONCURRENCY, (a) => getToken(a));
  const meta = new Map(distinct.map((a, i) => [a, toks[i]]));

  const items = mintRows.map((r) => ({
    id: r.id,
    type: r.type,
    address: r.ticker,
    symbol: meta.get(r.ticker)?.symbol || data.shortMint(r.ticker),
    tokens: toNum(r.shares),
    price: toNum(r.price),
    totalUsd: toNum(r.total),
    createdAt: r.created_at,
  }));
  const total = Number.isFinite(count) ? count : offset + items.length;
  return { items, total, limit, offset, hasMore: offset + (rows || []).length < total };
}

module.exports = { listPositions, listHistory, parsePaging, MINT_LIKE, MAX_POSITIONS };
