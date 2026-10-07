// End-to-end tests for POST /api/memecoins/trade, /positions and /history against an in-memory Supabase fake.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const data = require('../src/services/memecoinData');
const router = require('../src/routes/memecoins');
const { createFakeSupabase } = require('./memecoin-fakeSupabase');

const MINT_A = 'A'.repeat(44);
const MINT_B = 'B'.repeat(44);
const MINT_C = 'C'.repeat(44);
const SOL_PRICE = 100;

// Quote stub that follows the getQuote contract (same math as services/memecoinData.getQuote).
let quoteImpl;
function makeQuote({ price, impact = 0.01, liquidity = 1e6 }) {
  return ({ address, side, amountSol, amountTokens, slippageBps }) => {
    const slip = slippageBps ?? 100;
    const usd = side === 'sell' && amountTokens != null ? amountTokens * price : amountSol * SOL_PRICE;
    const fillPrice = side === 'buy' ? price * (1 + impact) : price * (1 - impact);
    const tokens = side === 'buy' ? usd / fillPrice : (amountTokens ?? usd / price);
    const proceeds = side === 'buy' ? usd : tokens * fillPrice;
    return Promise.resolve({
      side, address, symbol: 'TST', solPrice: SOL_PRICE, marketPrice: price, fillPrice, tokens,
      usd: proceeds, amountSol: proceeds / SOL_PRICE, priceImpactPct: impact * 100, slippageBps: slip,
      minReceived: 0, exceedsSlippage: impact * 10_000 > slip, liquidity_usd: liquidity, source: 'estimate',
    });
  };
}

let sb; let server; let base;
const origQuote = data.getQuote;
const origToken = data.getToken;

test.before(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { const u = req.headers['x-user']; if (u) req.user = { id: u }; next(); });
  app.use('/api/memecoins', router);
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}/api/memecoins`;
  data.getQuote = (o) => quoteImpl(o);
});
test.after(() => { data.getQuote = origQuote; data.getToken = origToken; server.close(); });
test.beforeEach(() => {
  sb = createFakeSupabase();
  router.__setSupabase(sb);
  quoteImpl = makeQuote({ price: 0.001 });
  data.getToken = origToken;
});

async function api(method, path, body, user = 'u1') {
  const r = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(user ? { 'x-user': user } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
}
const trade = (b, user) => api('POST', '/trade', b, user);
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${a} !~ ${b}`);

test('buy debits cash, creates the position and logs the transaction (USD prices)', async () => {
  // 0.5 SOL = $50 at 1% impact: fill 0.00101, 49504.950495... tokens
  const r = await trade({ address: MINT_A, side: 'buy', amountSol: 0.5, slippageBps: 500 });
  assert.equal(r.status, 200);
  assert.equal(r.body.success, true);
  assert.equal(r.body.cashBalance, 450);
  assert.equal(sb.cash('u1'), 450);
  const pos = sb.position('u1', MINT_A);
  near(pos.shares, 50 / 0.00101, 1e-8);
  near(pos.avg_cost, 0.00101);
  assert.equal(sb.tables.paper_transactions.length, 1);
  const tx = sb.tables.paper_transactions[0];
  assert.deepEqual([tx.type, tx.ticker, tx.total], ['buy', MINT_A, 50]);
  near(tx.price, 0.00101);
  assert.equal(r.body.position.tokens, pos.shares);
});

test('second buy averages the cost basis', async () => {
  await trade({ address: MINT_A, side: 'buy', amountSol: 0.5, slippageBps: 500 });
  quoteImpl = makeQuote({ price: 0.002 });
  const r = await trade({ address: MINT_A, side: 'buy', amountSol: 0.5, slippageBps: 500 });
  assert.equal(r.status, 200);
  const pos = sb.position('u1', MINT_A);
  const t1 = 50 / 0.00101; const t2 = 50 / 0.00202;
  near(pos.shares, t1 + t2, 1e-8);
  near(pos.avg_cost, (0.00101 * t1 + 0.00202 * t2) / (t1 + t2), 1e-8);
  assert.equal(sb.cash('u1'), 400);
});

test('partial sell credits cash, reduces the position, keeps avg cost, reports realized PnL', async () => {
  await trade({ address: MINT_A, side: 'buy', amountSol: 0.5, slippageBps: 500 });
  const held = sb.position('u1', MINT_A).shares;
  quoteImpl = makeQuote({ price: 0.002 });
  const r = await trade({ address: MINT_A, side: 'sell', amountTokens: held / 2, slippageBps: 500 });
  assert.equal(r.status, 200);
  const fill = 0.002 * 0.99;
  near(r.body.realizedPnl, (fill - 0.00101) * (held / 2), 1e-6);
  near(sb.cash('u1'), 450 + (held / 2) * fill, 1e-6);
  const pos = sb.position('u1', MINT_A);
  near(pos.shares, held / 2, 1e-8);
  near(pos.avg_cost, 0.00101);
  assert.equal(sb.tables.paper_transactions.length, 2);
});

test('selling more than held is capped to the position and closes it', async () => {
  await trade({ address: MINT_A, side: 'buy', amountSol: 0.5, slippageBps: 500 });
  const held = sb.position('u1', MINT_A).shares;
  const r = await trade({ address: MINT_A, side: 'sell', amountTokens: held * 3, slippageBps: 1000 });
  assert.equal(r.status, 200);
  assert.equal(r.body.tokens, held);
  near(r.body.usd, held * 0.001 * 0.99, 1e-6);
  assert.equal(sb.position('u1', MINT_A), null, 'position row removed');
  assert.equal(r.body.position, null);
  assert.equal(sb.tables.paper_transactions.at(-1).shares, held);
});

test('sell by SOL value works and sell with no position is rejected', async () => {
  let r = await trade({ address: MINT_A, side: 'sell', amountSol: 0.1 });
  assert.equal(r.status, 400);
  assert.match(r.body.message, /No position/);
  await trade({ address: MINT_A, side: 'buy', amountSol: 1, slippageBps: 500 });
  r = await trade({ address: MINT_A, side: 'sell', amountSol: 0.1, slippageBps: 500 });
  assert.equal(r.status, 200);
  assert.ok(sb.cash('u1') > 400 + 9);
});

test('insufficient cash is rejected and nothing changes', async () => {
  const r = await trade({ address: MINT_A, side: 'buy', amountSol: 6, slippageBps: 500 }); // $600 > $500
  assert.equal(r.status, 400);
  assert.match(r.body.message, /Insufficient cash/);
  assert.equal(sb.cash('u1'), 500);
  assert.equal(sb.tables.paper_positions.length, 0);
  assert.equal(sb.tables.paper_transactions.length, 0);
});

test('price impact above slippage tolerance is rejected and nothing changes', async () => {
  quoteImpl = makeQuote({ price: 0.001, impact: 0.2 });
  const r = await trade({ address: MINT_A, side: 'buy', amountSol: 0.5, slippageBps: 100 });
  assert.equal(r.status, 400);
  assert.match(r.body.message, /exceeds slippage/);
  assert.equal(sb.cash('u1'), undefined, 'no portfolio even created before the quote check passes');
  assert.equal(sb.tables.paper_transactions.length, 0);
});

test('invalid address / side / amounts are 400', async () => {
  const bad = [
    { address: 'short', side: 'buy', amountSol: 1 },
    { address: 'l'.repeat(44), side: 'buy', amountSol: 1 }, // 'l' is not base58
    { address: MINT_A, side: 'hold', amountSol: 1 },
    { address: MINT_A, amountSol: 1 },
    { address: MINT_A, side: 'buy' },
    { address: MINT_A, side: 'buy', amountSol: 0 },
    { address: MINT_A, side: 'buy', amountSol: -1 },
    { address: MINT_A, side: 'buy', amountSol: 'abc' },
    { address: MINT_A, side: 'buy', amountSol: '0x10' },
    { address: MINT_A, side: 'buy', amountSol: true },
    { address: MINT_A, side: 'buy', amountSol: [1] },
    { address: MINT_A, side: 'buy', amountSol: null },
    { address: MINT_A, side: 'buy', amountSol: 1001 },
    { address: MINT_A, side: 'buy', amountSol: 1, slippageBps: 'x' },
    { address: MINT_A, side: 'sell', amountTokens: -5 },
    { address: MINT_A, side: 'sell', amountTokens: 'Infinity' },
    { address: MINT_A, side: 'sell', amountTokens: 1e25 },
    { address: MINT_A, side: 'sell', amountTokens: true },
  ];
  for (const b of bad) {
    const r = await trade(b);
    assert.equal(r.status, 400, JSON.stringify(b));
    assert.equal(r.body.error, true);
  }
  assert.equal((await api('POST', '/trade', undefined)).status, 400);
  assert.equal(sb.tables.paper_transactions.length, 0);
  // /quote shares the validation
  assert.equal((await api('POST', '/quote', { address: MINT_A, side: 'buy', amountSol: -1 })).status, 400);
});

test('unauthenticated trade is 401', async () => {
  const r = await trade({ address: MINT_A, side: 'buy', amountSol: 0.1 }, null);
  assert.equal(r.status, 401);
});

test('concurrent buys never spend more than the balance and never lose a position update', async () => {
  // 6 x $120 against $500: exactly 4 can fill
  const results = await Promise.all(Array.from({ length: 6 }, () =>
    trade({ address: MINT_A, side: 'buy', amountSol: 1.2, slippageBps: 500 })));
  const ok = results.filter((r) => r.status === 200);
  const rejected = results.filter((r) => r.status === 400);
  assert.equal(ok.length, 4);
  assert.equal(rejected.length, 2);
  assert.equal(sb.cash('u1'), 20);
  const pos = sb.position('u1', MINT_A);
  near(pos.shares, 4 * (120 / 0.00101), 1e-7);
  assert.equal(sb.tables.paper_transactions.length, 4);
  const sumTxTokens = sb.tables.paper_transactions.reduce((a, t) => a + t.shares, 0);
  near(pos.shares, sumTxTokens, 1e-9);
});

test('concurrent sells cannot sell the same tokens twice', async () => {
  await trade({ address: MINT_A, side: 'buy', amountSol: 1, slippageBps: 500 });
  const held = sb.position('u1', MINT_A).shares;
  const results = await Promise.all(Array.from({ length: 4 }, () =>
    trade({ address: MINT_A, side: 'sell', amountTokens: held, slippageBps: 500 })));
  assert.equal(results.filter((r) => r.status === 200).length, 1);
  assert.equal(results.filter((r) => r.status === 400).length, 3);
  near(sb.cash('u1'), 400 + held * 0.001 * 0.99, 1e-6);
});

test('duplicate submit with the same clientOrderId executes once and replays the result', async () => {
  const body = { address: MINT_A, side: 'buy', amountSol: 1, slippageBps: 500, clientOrderId: 'order-1' };
  const [a, b] = await Promise.all([trade(body), trade(body)]);
  const c = await trade(body);
  assert.equal(a.status, 200);
  assert.deepEqual(b.body, a.body);
  assert.deepEqual(c.body, a.body);
  assert.equal(sb.cash('u1'), 400);
  assert.equal(sb.tables.paper_transactions.length, 1);
  // a different id is a new order
  const d = await trade({ ...body, clientOrderId: 'order-2' });
  assert.equal(d.status, 200);
  assert.equal(sb.cash('u1'), 300);
});

test('different users do not block or affect each other', async () => {
  await Promise.all([
    trade({ address: MINT_A, side: 'buy', amountSol: 1, slippageBps: 500 }, 'u1'),
    trade({ address: MINT_A, side: 'buy', amountSol: 2, slippageBps: 500 }, 'u2'),
  ]);
  assert.equal(sb.cash('u1'), 400);
  assert.equal(sb.cash('u2'), 300);
});

test('cash changed by another writer mid-trade: compare-and-swap retries instead of overwriting', async () => {
  await trade({ address: MINT_A, side: 'buy', amountSol: 0.1, slippageBps: 500 }); // creates portfolio, cash 490
  let injected = false;
  sb.hooks.beforeWrite = (table, op) => {
    if (!injected && table === 'paper_portfolios' && op === 'update') {
      injected = true;
      sb.tables.paper_portfolios[0].cash_balance += 100; // e.g. a stock sell credited cash concurrently
    }
  };
  const r = await trade({ address: MINT_A, side: 'buy', amountSol: 1, slippageBps: 500 });
  assert.equal(r.status, 200);
  assert.equal(sb.cash('u1'), 490 + 100 - 100, 'the concurrent +100 credit is preserved');
});

test('position write failure rolls the cash back and surfaces a 500', async () => {
  await trade({ address: MINT_B, side: 'buy', amountSol: 0.1, slippageBps: 500 }); // portfolio exists, cash 490
  sb.hooks.failWrite = (table, op) => (table === 'paper_positions' && op === 'upsert' ? { message: 'db down' } : null);
  const origErr = console.error; console.error = () => {};
  const r = await trade({ address: MINT_A, side: 'buy', amountSol: 1, slippageBps: 500 });
  console.error = origErr;
  assert.equal(r.status, 500);
  assert.equal(sb.cash('u1'), 490);
  assert.equal(sb.position('u1', MINT_A), null);
});

test('transaction-log failure does not fail an applied trade', async () => {
  sb.hooks.failWrite = (table) => (table === 'paper_transactions' ? { message: 'log down' } : null);
  const origErr = console.error; console.error = () => {};
  const r = await trade({ address: MINT_A, side: 'buy', amountSol: 1, slippageBps: 500 });
  console.error = origErr;
  assert.equal(r.status, 200);
  assert.equal(sb.cash('u1'), 400);
});

test('tiny prices (0.00000042) keep full precision in avg_cost and token counts', async () => {
  quoteImpl = makeQuote({ price: 0.00000042, impact: 0 });
  const r = await trade({ address: MINT_A, side: 'buy', amountSol: 1, slippageBps: 500 }); // $100 -> 238095238.095... tokens
  assert.equal(r.status, 200);
  const pos = sb.position('u1', MINT_A);
  assert.equal(pos.avg_cost, 0.00000042);
  near(pos.shares, 100 / 0.00000042, 1e-12);
  assert.equal(sb.tables.paper_transactions[0].price, 0.00000042);
  // sell everything back at the same price: cash returns to the cent
  const s = await trade({ address: MINT_A, side: 'sell', amountTokens: pos.shares, slippageBps: 500 });
  assert.equal(s.status, 200);
  assert.ok(Math.abs(sb.cash('u1') - 500) < 1e-3, `cash ${sb.cash('u1')}`);
  assert.equal(sb.position('u1', MINT_A), null);
});

test('huge token counts survive buy -> partial sell -> sell all', async () => {
  quoteImpl = makeQuote({ price: 1e-12, impact: 0 });
  const r = await trade({ address: MINT_A, side: 'buy', amountSol: 1, slippageBps: 500 }); // $100 / 1e-12 = 1e14 tokens
  assert.equal(r.status, 200);
  const held = sb.position('u1', MINT_A).shares;
  near(held, 1e14, 1e-9);
  const half = await trade({ address: MINT_A, side: 'sell', amountTokens: held / 4, slippageBps: 500 });
  assert.equal(half.status, 200);
  near(sb.position('u1', MINT_A).shares, held * 0.75, 1e-9);
  const all = await trade({ address: MINT_A, side: 'sell', amountTokens: 5e20, slippageBps: 500 });
  assert.equal(all.status, 200);
  assert.equal(sb.position('u1', MINT_A), null);
  assert.ok(Math.abs(sb.cash('u1') - 500) < 1e-3);
});

test('dust-sized orders are rejected instead of writing zero-value rows', async () => {
  quoteImpl = makeQuote({ price: 0.001, impact: 0 });
  const r = await trade({ address: MINT_A, side: 'buy', amountSol: 1e-9, slippageBps: 500 }); // $1e-7
  assert.equal(r.status, 400);
  assert.match(r.body.message, /too small/);
  assert.equal(sb.tables.paper_transactions.length, 0);
  assert.equal(sb.tables.paper_positions.length, 0);
});

test('real getQuote through the route: slippage, sell cap, and no price -> 502', async () => {
  const axios = require('axios');
  const origGet = axios.get;
  const MINT = 'D'.repeat(44);
  axios.get = async (url) => {
    if (url.includes('/tokens/v1/solana/')) {
      return { data: [{ baseToken: { address: MINT, symbol: 'REAL', name: 'Real' }, priceUsd: '0.5', liquidity: { usd: 1000 }, pairAddress: 'p' }] };
    }
    if (url.includes('jup.ag/price')) return { data: { So11111111111111111111111111111111111111112: { usdPrice: 100 } } };
    throw Object.assign(new Error('nope'), { response: { status: 500 } }); // jupiter quote + gecko info fail -> estimate
  };
  data.getQuote = origQuote;
  try {
    // $50 buy into $500 of one-side liquidity -> 10% estimated impact
    const bad = await trade({ address: MINT, side: 'buy', amountSol: 0.5, slippageBps: 100 });
    assert.equal(bad.status, 400);
    assert.match(bad.body.message, /exceeds slippage/);
    assert.ok(bad.body.quote.priceImpactPct > 9);
    const ok = await trade({ address: MINT, side: 'buy', amountSol: 0.5, slippageBps: 2000 });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.symbol, 'REAL');
    assert.equal(sb.tables.paper_positions[0].ticker, MINT);
  } finally {
    axios.get = origGet;
    data.getQuote = (o) => quoteImpl(o);
  }
});

// ── /positions ──────────────────────────────────────────────────────────────
test('GET /positions: live value, PnL, avg cost; tolerates per-row price failures; ignores stock rows', async () => {
  sb.seedCash('u1', 123.4567);
  sb.seedPosition('u1', MINT_A, 1000, 0.5);
  sb.seedPosition('u1', MINT_B, 2000, 0.1);
  sb.seedPosition('u1', MINT_C, 0, 1); // zero shares hidden
  sb.seedPosition('u1', 'AAPL', 5, 150); // stock row ignored
  sb.seedPosition('u2', MINT_A, 99, 1); // other user
  data.getToken = async (a) => {
    if (a === MINT_B) throw new data.MemecoinDataError('upstream down', 502);
    return { address: a, symbol: 'AAA', name: 'Alpha', price: 0.75, image: null };
  };
  const r = await api('GET', '/positions');
  assert.equal(r.status, 200);
  assert.equal(r.body.cashBalance, 123.4567);
  assert.equal(r.body.positions.length, 2);
  const a = r.body.positions.find((p) => p.address === MINT_A);
  assert.deepEqual([a.tokens, a.avgCost, a.costUsd, a.currentPrice, a.value, a.pnl, a.pnlPct, a.symbol],
    [1000, 0.5, 500, 0.75, 750, 250, 50, 'AAA']);
  const b = r.body.positions.find((p) => p.address === MINT_B);
  assert.equal(b.priceError, true);
  assert.equal(b.value, null);
  assert.equal(b.pnlPct, null);
  assert.equal(b.symbol, 'BBBB...BBBB');
  assert.deepEqual([r.body.totals.valueUsd, r.body.totals.pnl, r.body.totals.unpriced, r.body.totals.costUsd], [750, 250, 1, 700]);
  assert.equal((await api('GET', '/positions', undefined, null)).status, 401);
});

test('GET /positions for a user with nothing returns an empty list and creates the portfolio', async () => {
  const r = await api('GET', '/positions', undefined, 'fresh');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.positions, []);
  assert.equal(r.body.cashBalance, 500);
});

// ── /history ────────────────────────────────────────────────────────────────
test('GET /history: newest first, paginated, memecoin rows only, per-user', async () => {
  for (let i = 0; i < 7; i++) {
    sb.seedTx({ user_id: 'u1', type: i % 2 ? 'sell' : 'buy', ticker: i % 3 === 0 ? MINT_A : MINT_B, shares: i + 1, price: 0.001 * (i + 1), total: i + 1 });
  }
  sb.seedTx({ user_id: 'u1', type: 'buy', ticker: 'AAPL', shares: 1, price: 100, total: 100 });
  sb.seedTx({ user_id: 'u1', type: 'deposit', ticker: null, shares: null, price: null, total: 10 });
  sb.seedTx({ user_id: 'u2', type: 'buy', ticker: MINT_A, shares: 1, price: 1, total: 1 });
  data.getToken = async (a) => { if (a === MINT_B) throw new Error('x'); return { symbol: 'AAA', price: 1 }; };

  const p1 = await api('GET', '/history?limit=3');
  assert.equal(p1.status, 200);
  assert.equal(p1.body.total, 7);
  assert.equal(p1.body.hasMore, true);
  assert.deepEqual(p1.body.items.map((x) => x.tokens), [7, 6, 5]);
  assert.equal(p1.body.items[0].symbol, 'AAA');
  assert.equal(p1.body.items[0].address, MINT_A);
  assert.equal(p1.body.items[1].symbol, 'BBBB...BBBB');
  const p3 = await api('GET', '/history?limit=3&offset=6');
  assert.deepEqual(p3.body.items.map((x) => x.tokens), [1]);
  assert.equal(p3.body.hasMore, false);
  // junk paging falls back to defaults / caps
  const junk = await api('GET', '/history?limit=-4&offset=abc');
  assert.equal(junk.body.limit, 25);
  assert.equal(junk.body.offset, 0);
  assert.equal((await api('GET', '/history?limit=100000')).body.limit, 100);
  assert.equal((await api('GET', '/history', undefined, null)).status, 401);
});
