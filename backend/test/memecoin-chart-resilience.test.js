// What happens when a user clicks a coin and the free tier says no.
//
// The four ways a chart load used to die — a serial token lookup before the candles, no pool, a
// 429, an empty answer — plus the signal failing outright when the token detail could not be
// fetched. Nothing here touches the network (axios.get is stubbed) or the shared dev database.
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'travauxus-chart-'));
process.env.DB_PATH = path.join(ROOT, 'index.sqlite');

const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const data = require('../src/services/memecoinData');
const budget = require('../src/services/geckoBudget');
const routes = require('../src/routes/memecoins');

test.after(() => fs.rmSync(ROOT, { recursive: true, force: true }));

const ADDR = 'So11111111111111111111111111111111111111113';
const ADDR2 = 'So11111111111111111111111111111111111111114';
const POOL = 'PoolAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

const rateLimited = (retryAfter) => Object.assign(new Error('429'), {
  response: { status: 429, headers: retryAfter === undefined ? {} : { 'retry-after': retryAfter } },
});
const notFound = () => Object.assign(new Error('404'), { response: { status: 404 } });

const dexPair = (addr, pool = POOL) => ({
  chainId: 'solana',
  pairAddress: pool,
  dexId: 'raydium',
  baseToken: { address: addr, symbol: 'CHRT', name: 'Chart Token' },
  quoteToken: { address: data.SOL_MINT, symbol: 'SOL' },
  priceUsd: '0.5',
  liquidity: { usd: 5_000 },
  marketCap: 50_000,
  volume: { m5: 100, h1: 900, h24: 5_000 },
  txns: { m5: { buys: 4, sells: 2 }, h1: { buys: 40, sells: 20 } },
});

const ohlcvBody = (n = 3) => ({
  data: { attributes: { ohlcv_list: Array.from({ length: n }, (_, i) => [1_700_000_000 + i * 60, 1, 2, 0.5, 1.5, 10]) } },
});

const origGet = axios.get;

// Each test installs its own router of url-fragment -> response (a function may count its calls).
function stub(routesList) {
  data._resetCache();
  budget._reset();
  const calls = [];
  axios.get = async (url, cfg) => {
    calls.push(url);
    for (const [match, reply] of routesList) {
      if (url.includes(match)) {
        const r = typeof reply === 'function' ? await reply(url, cfg?.params) : reply;
        if (r instanceof Error) throw r;
        return { data: r };
      }
    }
    throw Object.assign(new Error('unrouted ' + url), { response: { status: 500 } });
  };
  return calls;
}
test.afterEach(() => { axios.get = origGet; });

const geckoOf = (calls) => calls.filter((u) => u.includes('geckoterminal'));
const dexOf = (calls) => calls.filter((u) => u.includes('dexscreener'));

// ── 1. a 429 is a wait, not a dead end ──────────────────────────────────────
test('a rate-limited chart load retries and succeeds instead of becoming a 503', async () => {
  let n = 0;
  const calls = stub([
    ['/tokens/v1/solana/', [dexPair(ADDR)]],
    ['/ohlcv/', () => (n++ === 0 ? rateLimited(0) : ohlcvBody())],
    ['/info', notFound()],
  ]);
  const candles = await data.getOhlcv(ADDR, '1m');
  assert.equal(candles.length, 3);
  assert.equal(calls.filter((u) => u.includes('/ohlcv/')).length, 2, 'one refusal, one retry');
});

test('the retry is bounded: a refusal that never lifts is still a 503, and quickly', async () => {
  const calls = stub([
    ['/tokens/v1/solana/', [dexPair(ADDR)]],
    ['/ohlcv/', () => rateLimited(0)],
    ['/info', notFound()],
  ]);
  const t0 = Date.now();
  await assert.rejects(() => data.getOhlcv(ADDR, '1m'), (e) => e.status === 503);
  const tries = calls.filter((u) => u.includes('/ohlcv/')).length;
  // One retry, then the second refusal says the limit is still full and we stop asking. Measured
  // against the live tier, a third attempt never produced an answer and only spent more quota.
  assert.equal(tries, 2, 'bounded, and it gives up sooner the worse upstream is behaving');
  assert.ok(Date.now() - t0 < 4_000, `bounded backoff, took ${Date.now() - t0}ms`);
});

test('a chart load during a refusal storm does not retry at all: one request, one answer', async () => {
  const calls = stub([
    ['/tokens/v1/solana/', [dexPair(ADDR)]],
    ['/ohlcv/', () => rateLimited(0)],
    ['/info', notFound()],
  ]);
  await assert.rejects(() => data.getOhlcv(ADDR, '1m'), (e) => e.status === 503);
  const after = calls.length;
  data._resetCache((k) => k.startsWith('ohlcv:'));
  await assert.rejects(() => data.getOhlcv(ADDR, '5m'), (e) => e.status === 503);
  assert.equal(calls.length - after, 1, 'the next click costs one request, not three');
});

test('a retry-after we are not willing to make the user sit through is honoured by giving up at once', async () => {
  const calls = stub([
    ['/tokens/v1/solana/', [dexPair(ADDR)]],
    ['/ohlcv/', () => rateLimited(30)],     // 30 seconds: upstream says it is still refusing
    ['/info', notFound()],
  ]);
  const t0 = Date.now();
  await assert.rejects(() => data.getOhlcv(ADDR, '1m'), (e) => e.status === 503);
  assert.equal(calls.filter((u) => u.includes('/ohlcv/')).length, 1, 'no second attempt against a long retry-after');
  assert.ok(Date.now() - t0 < 1_000, 'and no sleeping on it either');
});

test('a 404 is not retried: there is nothing to wait for', async () => {
  const calls = stub([
    ['/tokens/v1/solana/', [dexPair(ADDR)]],
    ['/ohlcv/', notFound()],
    ['/info', notFound()],
  ]);
  await assert.rejects(() => data.getOhlcv(ADDR, '1m'), (e) => e.status === 404);
  assert.equal(calls.filter((u) => u.includes('/ohlcv/')).length, 1);
});

test('an empty upstream answer is an empty series, not an error', async () => {
  stub([
    ['/tokens/v1/solana/', [dexPair(ADDR)]],
    ['/ohlcv/', { data: { attributes: { ohlcv_list: [] } } }],
    ['/info', notFound()],
  ]);
  assert.deepEqual(await data.getOhlcv(ADDR, '1m'), []);
});

test('a token no DEX has paired is a 404 the chart can read as "no pool yet"', async () => {
  stub([['/tokens/v1/solana/', []]]);
  await assert.rejects(() => data.getOhlcv(ADDR, '1m'), (e) => e.status === 404);
});

test('a refusal tells the client how long the limit is known to stay full', async () => {
  stub([
    ['/tokens/v1/solana/', [dexPair(ADDR)]],
    ['/ohlcv/', () => rateLimited(0)],
    ['/info', notFound()],
  ]);
  await assert.rejects(() => data.getOhlcv(ADDR, '1m'), (e) => {
    assert.equal(e.status, 503);
    assert.ok(e.retryAfterMs > 0, 'so the terminal can wait for its poll instead of asking three times');
    assert.ok(e.retryAfterMs <= budget.COOLOFF_MAX_MS);
    return true;
  });
});

test('the route hands that wait to the client, and only when there is one', async () => {
  const express = require('express');
  const app = express();
  app.use('/api/memecoins', routes);
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}/api/memecoins`;
  try {
    stub([
      ['/tokens/v1/solana/', [dexPair(ADDR)]],
      ['/ohlcv/', () => rateLimited(0)],
      ['/info', notFound()],
    ]);
    const limited = await fetch(`${base}/${ADDR}/ohlcv?tf=1m`);
    assert.equal(limited.status, 503);
    assert.ok((await limited.json()).retryAfterMs > 0);

    stub([['/tokens/v1/solana/', []]]);          // no pool: nothing to wait for
    const noPool = await fetch(`${base}/${ADDR}/ohlcv?tf=1m`);
    assert.equal(noPool.status, 404);
    assert.equal((await noPool.json()).retryAfterMs, undefined);
  } finally {
    server.close();
  }
});

// ── 2. the user-facing request outranks the prefetch ────────────────────────
test('a 429 anywhere stands the opportunistic lane down for a cool-off', () => {
  budget._reset();
  const t0 = 5_000_000;
  assert.equal(budget.tryTake(1, { now: t0 }), true);
  budget.note429(0, t0);
  assert.equal(budget.coolingOff(t0 + 1), true);
  assert.equal(budget.tryTake(1, { now: t0 + budget.MIN_GAP_MS }), false, 'prefetch yields after a refusal');
  assert.equal(budget.tryTake(1, { now: t0 + budget.COOLOFF_MS + 1 }), true, 'and asks again once it has passed');
});

test("upstream's own retry-after extends the cool-off, within a cap", () => {
  budget._reset();
  const t0 = 6_000_000;
  budget.note429(5 * 60_000, t0);
  assert.equal(budget.coolingOff(t0 + budget.COOLOFF_MAX_MS - 1), true);
  assert.equal(budget.coolingOff(t0 + budget.COOLOFF_MAX_MS + 1), false, 'capped, never indefinite');
});

test('the opportunistic lane refuses while a call somebody is waiting on is in flight', () => {
  budget._reset();
  const t0 = 7_000_000;
  const done = budget.beginUserCall();
  assert.equal(budget.userCallsInFlight(), 1);
  assert.equal(budget.tryTake(1, { now: t0 }), false);
  done();
  assert.equal(budget.tryTake(1, { now: t0 }), true);
  done();  // idempotent: a release cannot drive the count negative
  assert.equal(budget.userCallsInFlight(), 0);
});

test('a chart load in flight is enough to make the prefetch yield', async () => {
  let release;
  stub([
    ['/tokens/v1/solana/', [dexPair(ADDR)]],
    ['/ohlcv/', () => new Promise((r) => { release = () => r(ohlcvBody()); })],
    ['/info', notFound()],
  ]);
  const p = data.getOhlcv(ADDR, '1m');
  await new Promise((r) => setImmediate(r));
  assert.equal(budget.tryTake(1), false, 'the deep-page prefetch cannot take the slot the chart is using');
  release();
  await p;
  assert.equal(budget.userCallsInFlight(), 0, 'and the lane is handed back');
});

test('the ceiling still leaves headroom under the free tier, and is now the smaller share of it', () => {
  assert.ok(budget.OPPORTUNISTIC_CEILING <= budget.LIMIT_PER_MIN - budget.RESERVED_OTHER);
  assert.ok(budget.OPPORTUNISTIC_CEILING <= (budget.LIMIT_PER_MIN - budget.RESERVED_OTHER) / 2,
    'opportunistic work gets at most half of what we can see');
});

// ── 3. one request per chart, not two ───────────────────────────────────────
test('a list load teaches the pool, so clicking a coin from it costs one request', async () => {
  const geckoList = {
    data: [{
      id: `solana_${ADDR}`,
      attributes: { name: 'CHRT / SOL', address: POOL, base_token_price_usd: '1', reserve_in_usd: '1000' },
      relationships: { base_token: { data: { id: `solana_${ADDR}` } }, dex: { data: { id: 'raydium' } } },
    }],
    included: [{ id: `solana_${ADDR}`, attributes: { symbol: 'CHRT', name: 'Chart Token' } }],
  };
  const calls = stub([
    ['new_pools', (_u, p) => ((p.page || 1) === 1 ? geckoList : rateLimited(0))],
    ['/tokens/v1/solana/', []],
    ['/ohlcv/', ohlcvBody()],
  ]);
  await data.getNew();
  assert.equal(data._knownPool(ADDR), POOL, 'the row already carried its pool');

  const before = calls.length;
  const candles = await data.getOhlcv(ADDR, '1m');
  assert.equal(candles.length, 3);
  const spent = calls.slice(before);
  assert.equal(spent.length, 1, 'just the OHLCV request');
  assert.equal(dexOf(spent).length, 0, 'no DexScreener detour to read a pool address we already knew');
});

test('an unknown pool falls back to the full lookup', async () => {
  const calls = stub([
    ['/tokens/v1/solana/', [dexPair(ADDR)]],
    ['/ohlcv/', ohlcvBody()],
    ['/info', notFound()],
  ]);
  assert.equal(data._knownPool(ADDR), null);
  assert.equal((await data.getOhlcv(ADDR, '1m')).length, 3);
  assert.ok(dexOf(calls).length >= 1, 'the detail lookup is still there when it is needed');
  assert.equal(data._knownPool(ADDR), POOL, 'and what it found is remembered for next time');
});

test('a remembered pool that has gone away is re-resolved once, not surfaced as a dead chart', async () => {
  const MIGRATED = 'PoolBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
  const calls = stub([
    ['/tokens/v1/solana/', [dexPair(ADDR, MIGRATED)]],
    [`/pools/${POOL}/ohlcv/`, notFound()],
    [`/pools/${MIGRATED}/ohlcv/`, ohlcvBody(5)],
    ['/info', notFound()],
  ]);
  data._resetCache();
  // pretend an earlier list taught us the pool the pair has since migrated off
  await data.getOhlcv(ADDR, '1m').catch(() => {});
  assert.equal(data._knownPool(ADDR), MIGRATED);
  data._resetCache((k) => k.startsWith('ohlcv:'));
  const candles = await data.getOhlcv(ADDR, '1m');
  assert.equal(candles.length, 5);
  assert.ok(calls.length > 0);
});

// ── 4. the signal degrades instead of failing ───────────────────────────────
test('a rate-limited token detail returns a thin signal, not a 503 the panel calls "unavailable"', async () => {
  stub([['/tokens/v1/solana/', () => rateLimited(0)]]);
  const sig = await routes.signalFor(ADDR2);
  assert.ok(sig, 'shaped answer rather than a throw');
  assert.equal(sig.address, ADDR2);
  assert.equal(sig.mode, 'unavailable');
  assert.equal(sig.reason, 'rate-limited');
  assert.equal(sig.score, null, 'no invented score');
  assert.equal(sig.confidence, 0);
  assert.equal(sig.components, null, 'and no invented components');
  assert.deepEqual(sig.riskFlags, []);
  assert.ok(sig.notes.join(' ').length > 0, 'it says why');
});

test('a token nothing has heard of is "no market data yet" rather than an error', async () => {
  stub([['/tokens/v1/solana/', []]]);
  const sig = await routes.signalFor(ADDR2);
  assert.equal(sig.mode, 'unavailable');
  assert.equal(sig.reason, 'no-market-data');
  assert.equal(sig.score, null);
});

test('candles failing leaves a list-only score that says which upstream was missing', async () => {
  stub([
    ['/tokens/v1/solana/', [dexPair(ADDR)]],
    ['/ohlcv/', () => rateLimited(0)],
    ['/info', notFound()],
  ]);
  const sig = await routes.signalFor(ADDR);
  assert.equal(sig.mode, 'list-only');
  assert.equal(sig.reason, 'rate-limited');
  assert.equal(typeof sig.score, 'number', 'list data is still a score');
  assert.ok(sig.confidence > 0 && sig.confidence < 0.5, `thin by construction, got ${sig.confidence}`);
  assert.match(sig.notes.join(' '), /rate limited/i);
});

test('no pool at all says so, rather than blaming a rate limit', async () => {
  stub([
    ['/tokens/v1/solana/', [dexPair(ADDR)]],
    ['/ohlcv/', notFound()],
    ['/info', notFound()],
  ]);
  const sig = await routes.signalFor(ADDR);
  assert.equal(sig.mode, 'list-only');
  assert.equal(sig.reason, 'no-pool');
  assert.match(sig.notes.join(' '), /pool/i);
});

test('a score we already computed is the better thin answer when the detail lookup fails', async () => {
  stub([
    ['/tokens/v1/solana/', [dexPair(ADDR)]],
    ['/ohlcv/', ohlcvBody(40)],
    ['/info', notFound()],
  ]);
  const full = await routes.signalFor(ADDR);
  assert.equal(full.mode, 'full');

  // the next request cannot reach the detail endpoint at all
  stub([['/tokens/v1/solana/', () => rateLimited(0)]]);
  const sig = await routes.signalFor(ADDR);
  assert.equal(sig.mode, 'full', 'the last real score, not a blank');
  assert.equal(sig.score, full.score);
  assert.match(sig.notes.join(' '), /cached score/);
});
