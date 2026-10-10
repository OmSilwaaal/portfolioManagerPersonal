// The promise this file defends: a user request never waits on an upstream, and never gets a value
// so old that it is a lie. Measured against GeckoTerminal's keyless tier, the trending list's p95
// was 13.4s and half of all chart loads failed outright, purely because whoever arrived first after
// a TTL expiry paid the whole round trip.
//
// Nothing here touches the network (axios.get is stubbed) or the shared dev database.
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'travauxus-stale-'));
process.env.DB_PATH = path.join(ROOT, 'index.sqlite');

const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const data = require('../src/services/memecoinData');
const budget = require('../src/services/geckoBudget');
const { createWarmer, PRE_EXPIRY_MS, IDLE_AFTER_MS } = require('../src/services/memecoinWarmer');

test.after(() => fs.rmSync(ROOT, { recursive: true, force: true }));

const ADDR = 'So11111111111111111111111111111111111111115';
const POOL = 'PoolBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

const dexPair = (addr, price = '0.5') => ({
  chainId: 'solana',
  pairAddress: POOL,
  dexId: 'raydium',
  baseToken: { address: addr, symbol: 'STAL', name: 'Stale Token' },
  quoteToken: { address: data.SOL_MINT, symbol: 'SOL' },
  priceUsd: price,
  liquidity: { usd: 5_000 },
  marketCap: 50_000,
  volume: { m5: 100, h1: 900, h24: 5_000 },
  txns: { m5: { buys: 4, sells: 2 }, h1: { buys: 40, sells: 20 } },
});

const ohlcvBody = (close) => ({
  data: { attributes: { ohlcv_list: [[1_700_000_000, 1, 2, 0.5, close, 10]] } },
});

const dead = () => Object.assign(new Error('boom'), { response: { status: 502 } });
const origGet = axios.get;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Install a url-fragment router. Returns the array of urls requested. */
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

const ohlcvCalls = (calls) => calls.filter((u) => u.includes('/ohlcv/')).length;

/** Bring the pool mapping and one good OHLCV series into the cache. */
async function seedChart(close = 1.5) {
  const bars = await data.getOhlcv(ADDR, '5m');
  assert.equal(bars.at(-1).close, close);
  return bars;
}

// ── 1. an expired entry is served at once, and refreshed behind the answer ──
test('an expired entry is served immediately while the refresh runs behind it', async () => {
  let close = 1.5;
  let release;
  let held = false;
  const calls = stub([
    ['/tokens/v1/solana/', [dexPair(ADDR)]],
    ['/info', { data: { attributes: {} } }],
    ['/ohlcv/', async () => {
      if (!held) return ohlcvBody(close);
      await new Promise((r) => { release = r; });   // the upstream hangs, as a rate-limited one does
      return ohlcvBody(close);
    }],
  ]);
  await seedChart(1.5);
  const seeded = ohlcvCalls(calls);

  data._expireCache((k) => k.startsWith('ohlcv:'));   // the 20s TTL lapses; the value is seconds old
  held = true;
  close = 9.9;

  const t0 = process.hrtime.bigint();
  const served = await data.getOhlcv(ADDR, '5m');
  const waited = Number(process.hrtime.bigint() - t0) / 1e6;

  assert.equal(served.at(-1).close, 1.5, 'the value we already had, not the one still in flight');
  assert.ok(waited < 50, `answered in ${waited.toFixed(1)}ms without waiting on the upstream`);
  assert.equal(ohlcvCalls(calls), seeded + 1, 'and a refresh was started');

  release();                                          // the upstream finally answers
  await sleep(20);
  assert.equal((await data.getOhlcv(ADDR, '5m')).at(-1).close, 9.9, 'the refreshed value took over');
  assert.equal(ohlcvCalls(calls), seeded + 1, 'which cost exactly one call, not one per reader');
});

test('ten readers arriving on an expired entry start one refresh between them', async () => {
  let release;
  const calls = stub([
    ['/tokens/v1/solana/', [dexPair(ADDR)]],
    ['/info', { data: { attributes: {} } }],
    ['/ohlcv/', async () => {
      if (!release) { await new Promise((r) => { release = r; }); }
      return ohlcvBody(2.5);
    }],
  ]);
  // Cold: the very first caller has nothing to be served, so it does wait — unchanged on purpose.
  const cold = data.getOhlcv(ADDR, '5m');
  await sleep(10);
  release();
  await cold;
  const seeded = ohlcvCalls(calls);

  data._expireCache((k) => k.startsWith('ohlcv:'));
  const all = await Promise.all(Array.from({ length: 10 }, () => data.getOhlcv(ADDR, '5m')));
  assert.ok(all.every((b) => b.at(-1).close === 2.5));
  assert.equal(ohlcvCalls(calls), seeded + 1, 'single-flight still holds across ten readers');
});

test('a cold key is still single-flighted: ten concurrent callers, one upstream call', async () => {
  let release;
  const calls = stub([
    ['/tokens/v1/solana/', [dexPair(ADDR)]],
    ['/info', { data: { attributes: {} } }],
    ['/ohlcv/', async () => { if (!release) await new Promise((r) => { release = r; }); return ohlcvBody(3.5); }],
  ]);
  await data.getToken(ADDR);                      // so the pool is known and all ten race on OHLCV
  const racers = Array.from({ length: 10 }, () => data.getOhlcv(ADDR, '5m'));
  await sleep(10);
  release();
  const all = await Promise.all(racers);
  assert.ok(all.every((b) => b.at(-1).close === 3.5));
  assert.equal(ohlcvCalls(calls), 1);
});

// ── 2. a failed refresh keeps the good value, and backs off ─────────────────
test('a failed refresh keeps the last good value instead of evicting it', async () => {
  let failing = false;
  const calls = stub([
    ['/tokens/v1/solana/', [dexPair(ADDR)]],
    ['/info', { data: { attributes: {} } }],
    ['/ohlcv/', () => (failing ? dead() : ohlcvBody(1.5))],
  ]);
  await seedChart(1.5);

  failing = true;
  data._expireCache((k) => k.startsWith('ohlcv:'));
  assert.equal((await data.getOhlcv(ADDR, '5m')).at(-1).close, 1.5, 'served despite the failure');
  await sleep(20);
  const afterFirstFailure = ohlcvCalls(calls);

  // Still served, and the dead upstream is not asked again by every arrival: that is the backoff.
  for (let i = 0; i < 5; i++) {
    assert.equal((await data.getOhlcv(ADDR, '5m')).at(-1).close, 1.5);
    await sleep(5);
  }
  assert.equal(ohlcvCalls(calls), afterFirstFailure, 'five more reads, no extra upstream calls');

  failing = false;
  data._expireCache((k) => k.startsWith('ohlcv:'));
  data._ageCache((k) => k.startsWith('ohlcv:'), 0);   // clears the backoff, nothing else
  assert.equal((await data.getOhlcv(ADDR, '5m')).at(-1).close, 1.5, 'stale while it recovers');
  await sleep(20);
  assert.equal((await data.getOhlcv(ADDR, '5m')).at(-1).close, 1.5, 'and then the refreshed value');
});

// ── 3. the hard ceiling actually fires ──────────────────────────────────────
test('past its staleness ceiling the cache refuses rather than serving ancient bars', async () => {
  const calls = stub([
    ['/tokens/v1/solana/', [dexPair(ADDR)]],
    ['/info', { data: { attributes: {} } }],
    ['/ohlcv/', () => ohlcvBody(1.5)],
  ]);
  await seedChart(1.5);
  axios.get = async (url) => {
    calls.push(url);
    if (url.includes('/ohlcv/')) throw dead();
    return { data: [dexPair(ADDR)] };
  };

  // Just inside the ceiling: still answered from cache, because that is the whole point.
  data._ageCache((k) => k.startsWith('ohlcv:'), data.MAX_AGE.ohlcv - 2_000);
  assert.equal((await data.getOhlcv(ADDR, '5m')).at(-1).close, 1.5);
  await sleep(20);

  // Past it: the value is no longer an answer, and with the upstream still down there is no answer.
  data._ageCache((k) => k.startsWith('ohlcv:'), 5_000);
  await assert.rejects(data.getOhlcv(ADDR, '5m'), /Upstream request failed/);
  // And it keeps refusing — the ceiling is not a one-off.
  await assert.rejects(data.getOhlcv(ADDR, '5m'), /Upstream request failed/);
});

test('the ceilings are ordered the way the data is: a name may age, a price may not', () => {
  const m = data.MAX_AGE;
  assert.ok(m.token <= m.list, 'a price goes stale faster than a list of which pools exist');
  assert.ok(m.ohlcv1m < m.ohlcv, 'one-minute bars tolerate less lag than hourly ones');
  assert.ok(m.trades <= 60_000, 'a trade tape older than a minute reads as a dead market');
  assert.ok(m.info >= 60 * 60_000, 'decimals never change and the holder count is decoration');
});

// ── 4. the trade path is exempt ─────────────────────────────────────────────
test('a quote does not answer from an expired price, even though a chart would', async () => {
  let price = '0.5';
  const calls = stub([
    ['/tokens/v1/solana/', () => [dexPair(ADDR, price)]],
    ['/info', { data: { attributes: { decimals: 6 } } }],
  ]);
  await data.getToken(ADDR);
  const dexCalls = () => calls.filter((u) => u.includes('/tokens/v1/solana/')).length;
  const seeded = dexCalls();

  data._expireCache((k) => k.startsWith('token:'));
  price = '0.9';
  assert.equal((await data.getToken(ADDR)).price, 0.5, 'display is happy with a stale price');
  await sleep(20);

  data._expireCache((k) => k.startsWith('token:'));
  price = '1.3';
  const before = dexCalls();
  assert.equal((await data.getToken(ADDR, { fresh: true })).price, 1.3, 'a trade waits for the real one');
  assert.ok(dexCalls() > before, 'and it made the round trip');
  assert.ok(seeded > 0);
});

// ── 5. the age is available to whoever wants it ─────────────────────────────
test('a served value carries how old it is, without reaching the wire', async () => {
  stub([
    ['/tokens/v1/solana/', [dexPair(ADDR)]],
    ['/info', { data: { attributes: {} } }],
    ['/ohlcv/', () => ohlcvBody(1.5)],
  ]);
  const fresh = await seedChart(1.5);
  assert.ok(data.ageOf(fresh) !== null && data.ageOf(fresh) < 1_000, 'a just-fetched value is young');

  data._ageCache((k) => k.startsWith('ohlcv:'), 30_000);
  const stale = await data.getOhlcv(ADDR, '5m');
  const age = data.ageOf(stale);
  assert.ok(age >= 30_000, `age reported as ${age}ms`);
  assert.equal(data.cacheAge('ohlcv:' + data._knownPool(ADDR) + ':5m') >= 30_000, true);
  // The age is bookkeeping, not payload: it must not show up in a response or an SSE frame.
  assert.deepEqual(Object.keys(JSON.parse(JSON.stringify(stale[0]))).sort(),
    ['close', 'high', 'low', 'open', 'time', 'volume']);
  assert.equal(data.ageOf(42), null, 'a primitive simply has no age');
  assert.equal(data.ageOf(null), null);
});

// ── 6. the warmer ───────────────────────────────────────────────────────────
// A stand-in for memecoinData: it records what was asked for and reports every key as expired.
function fakeData(over = {}) {
  const asked = [];
  return {
    asked,
    freshFor: over.freshFor || (() => -1),
    ohlcvKey: over.ohlcvKey || ((a, tf) => `ohlcv:pool_${a}:${tf}`),
    getTrending: async () => { asked.push('trending'); },
    getNew: async () => { asked.push('new'); },
    getToken: async (a) => { asked.push(`token:${a}`); },
    getOhlcv: async (a, tf) => { asked.push(`ohlcv:${a}:${tf}`); },
  };
}

test('the warmer does nothing at all when the budget refuses', async () => {
  const d = fakeData();
  let asks = 0;
  const w = createWarmer({
    data: d,
    hub: () => ({ clients: 1, watched: ['A'] }),
    budget: { tryTake: () => { asks += 1; return false; } },
  });
  assert.equal(await w._tick(), 0);
  assert.equal(d.asked.length, 0, 'not one upstream call without a grant');
  assert.equal(asks, 1, 'it asked the opportunistic lane and took no for an answer');
  assert.equal(w.stats().refused, 1);
});

test('the warmer refreshes one key per tick, in the opportunistic lane', async () => {
  // Grants are scarcer than keys, so the order in targets() is the allocation. With every key
  // reported as expired, the list the whole terminal lands on is what gets the grants.
  const d = fakeData();
  const w = createWarmer({ data: d, hub: () => ({ clients: 1, watched: ['A'] }), budget: { tryTake: () => true } });
  for (let i = 0; i < 4; i++) assert.equal(await w._tick(), 1);
  assert.deepEqual(d.asked, ['trending', 'trending', 'trending', 'trending']);
  assert.equal(w.stats().refreshed, 4);
});

test('a key that was just refreshed stops being due, so equals take turns without a cursor', async () => {
  // freshFor() answers honestly: whatever was asked for last is fresh, everything else is expired.
  const warmed = new Set();
  const d = fakeData({ freshFor: (key) => (warmed.has(key) ? 30_000 : -1) });
  const real = { ...d };
  const w = createWarmer({
    data: {
      ...d,
      getTrending: async () => { warmed.add('trending'); return real.getTrending(); },
      getNew: async () => { warmed.add('new'); return real.getNew(); },
      getToken: async (a) => { warmed.add(`token:${a}`); return real.getToken(a); },
      getOhlcv: async (a, tf) => { warmed.add(`ohlcv:pool_${a}:${tf}`); return real.getOhlcv(a, tf); },
    },
    hub: () => ({ clients: 1, watched: ['A'] }),
    budget: { tryTake: () => true },
  });
  for (let i = 0; i < 4; i++) assert.equal(await w._tick(), 1);
  assert.deepEqual(d.asked, ['trending', 'new', 'token:A', 'ohlcv:A:5m']);
});

test('the warmer leaves a fresh key alone: it only works inside the pre-expiry window', async () => {
  const d = fakeData({ freshFor: () => 60_000 });   // everything comfortably fresh
  const w = createWarmer({ data: d, hub: () => ({ clients: 1, watched: ['A'] }), budget: { tryTake: () => true } });
  assert.equal(await w._tick(), 0);
  assert.equal(d.asked.length, 0);

  const edge = createWarmer({
    data: fakeData({ freshFor: () => PRE_EXPIRY_MS }),
    hub: () => ({ clients: 1, watched: [] }),
    budget: { tryTake: () => true },
  });
  assert.equal(await edge._tick(), 1, 'a key about to expire is work the next request would do');
});

test('the warmer will not resolve a pool it does not know just to warm a chart', async () => {
  const d = fakeData({ ohlcvKey: () => null });     // no remembered pool for this address
  const w = createWarmer({ data: d, hub: () => ({ clients: 1, watched: ['A'] }), budget: { tryTake: () => true } });
  const jobs = w._targets(['A']).map((j) => j.key);
  assert.deepEqual(jobs, ['trending', 'new', 'token:A'], 'no speculative OHLCV job at all');
  for (let i = 0; i < 3; i++) await w._tick();
  assert.ok(!d.asked.some((k) => k.startsWith('ohlcv:')));
});

test('an idle server is silent: the warmer stops itself and a request wakes it', async () => {
  let clock = 1_000_000;
  const d = fakeData();
  const w = createWarmer({
    data: d,
    now: () => clock,
    hub: () => ({ clients: 0, watched: [] }),
    budget: { tryTake: () => true },
  });
  w.start();
  assert.equal(w.stats().running, true);

  clock += IDLE_AFTER_MS + 1;                       // nobody watching, nobody asking
  assert.equal(await w._tick(), 0);
  assert.equal(w.stats().running, false, 'the timer is cleared, not left ticking over nothing');
  assert.equal(d.asked.length, 0);

  w.noteDemand();                                   // a request arrives
  assert.equal(w.stats().running, true);
  assert.equal(await w._tick(), 1, 'and it goes back to work');
  w.stop();
});

test('the warmer keeps going while a stream is held open, even with no HTTP requests', async () => {
  let clock = 2_000_000;
  const d = fakeData();
  const w = createWarmer({
    data: d,
    now: () => clock,
    hub: () => ({ clients: 2, watched: ['A'] }),
    budget: { tryTake: () => true },
  });
  w.start();
  clock += IDLE_AFTER_MS * 10;
  assert.equal(await w._tick(), 1);
  assert.equal(w.stats().running, true);
  w.stop();
});

test('the warmer honours the real budget: a 429 cool-off stands it down', async () => {
  budget._reset();
  const d = fakeData();
  const w = createWarmer({ data: d, hub: () => ({ clients: 1, watched: [] }), budget });
  assert.equal(await w._tick(), 1, 'a quiet budget allows one refresh');

  budget.note429(0);                                // upstream refused somebody
  assert.equal(await w._tick(), 0, 'and the whole lane stands down');
  assert.equal(d.asked.length, 1);

  budget._reset();
  const release = budget.beginUserCall();           // somebody is waiting on a chart
  assert.equal(await w._tick(), 0, 'the warmer yields to them');
  release();
  budget._reset();
  assert.equal(await w._tick(), 1);
});
