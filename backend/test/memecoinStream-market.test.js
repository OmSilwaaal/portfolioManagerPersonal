'use strict';
// What the SSE hub had to learn so a market-wide price feed is useful rather than just loud:
//   - a price reaches the rows of a list it appears in, not only the focused chart
//   - isDisplayed() is how the market-wide index knows which handful of thousands to emit
//   - a token that drops out of both lists stops being pushed
//   - a client that is not showing a chart can say so, and stops costing GeckoTerminal calls
//   - the four-address cap is reported rather than applied silently
const test = require('node:test');
const assert = require('node:assert');
const { createHub, MAX_ADDRESSES_PER_CLIENT } = require('../src/services/memecoinStream');

const A = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const B = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const C = 'So11111111111111111111111111111111111111112';
const D = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
const E = 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN';

const settle = () => new Promise((r) => setImmediate(r));

/** A response that records the SSE frames written to it. */
function fakeRes() {
  const chunks = [];
  return {
    chunks,
    writableLength: 0,
    headers: null,
    writeHead(code, h) { this.headers = h; return this; },
    flushHeaders() {},
    write(c) { chunks.push(c); return true; },
    end() { this.ended = true; },
    on() {},
    status() { return this; },
    json(o) { this.body = o; return this; },
    /** Parsed frames of one event type. */
    events(name) {
      return chunks
        .filter((c) => c.startsWith(`event: ${name}\n`))
        .map((c) => JSON.parse(c.slice(c.indexOf('data: ') + 6).trim()));
    },
  };
}

function fakeReq(query = {}) {
  return { ip: `1.2.3.${Math.random()}`, query, socket: { setNoDelay() {} }, on() {} };
}

/** A hub with stubbed upstreams: the lists return what the test says and nothing else runs. */
function hubWith(over = {}) {
  const calls = { ohlcv: [], token: [], trades: [] };
  // Read lazily, so a test can move the lists on and tick again.
  const hub = createHub({
    onWatched: () => {},
    signalFor: async () => null,
    deliver: () => {},
    launchesEnabled: () => false,
    data: {
      isValidAddress: (a) => typeof a === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a),
      getToken: async (a) => { calls.token.push(a); return null; },
      getTrades: async (a) => { calls.trades.push(a); return null; },
      getOhlcv: async (a, tf) => { calls.ohlcv.push(`${a}:${tf}`); return [{ time: 1, c: 1 }]; },
      getTrending: async () => over.trending ?? [],
      getNew: async () => over.fresh ?? [],
    },
  });
  return { hub, calls, over };
}

test('a price reaches the rows of a list it appears in, not only the focused chart', async () => {
  // The whole point of a market-wide feed: a live chart above a table of dead numbers is the
  // same data twice.
  const { hub } = hubWith({ trending: [{ address: B, price: 1, liquidity_usd: 1, volume_5m: 1 }] });

  const watcher = fakeRes();   // has A open, and the lists on
  hub.handler(fakeReq({ address: A }), watcher);
  const lister = fakeRes();    // lists only
  hub.handler(fakeReq({ address: '' }), lister);
  const listOff = fakeRes();   // neither
  hub.handler(fakeReq({ lists: '0' }), listOff);
  await settle();
  await settle();

  hub.pushPrice({ address: A, price: 2, priceSol: 1e-8 });
  hub.pushPrice({ address: B, price: 3, priceSol: 2e-8, mcap: 5_000 });
  hub.pushPrice({ address: C, price: 4, priceSol: 3e-8 });

  assert.deepStrictEqual(watcher.events('price').map((p) => p.address), [A, B], 'the open token and the list row');
  assert.deepStrictEqual(lister.events('price').map((p) => p.address), [B], 'the list row only');
  assert.deepStrictEqual(listOff.events('price').map((p) => p.address), [], 'nothing asked for, nothing sent');

  // Market cap travels with the price, or a row updates one and contradicts the other.
  assert.strictEqual(lister.events('price')[0].mcap, 5_000);
  assert.strictEqual(watcher.events('price')[0].mcap, undefined, 'and is absent when not computed');
  hub.stop();
});

test('isDisplayed is what keeps a market-wide feed cheap', async () => {
  const { hub } = hubWith({ trending: [{ address: B, price: 1 }], fresh: [{ address: C, price: 1 }] });
  assert.strictEqual(hub.isDisplayed(A), false, 'nobody connected, nothing displayed');

  hub.handler(fakeReq({ address: A }), fakeRes());
  await settle();
  await settle();

  assert.strictEqual(hub.isDisplayed(A), true, 'an open token');
  assert.strictEqual(hub.isDisplayed(B), true, 'a trending row');
  assert.strictEqual(hub.isDisplayed(C), true, 'a new-pairs row');
  assert.strictEqual(hub.isDisplayed(D), false, 'and the thousands of tokens nobody is looking at');
  hub.stop();
  assert.strictEqual(hub.isDisplayed(A), false, 'stop clears it, so nothing is pushed to nobody');
});

test('a token that drops out of both lists stops being pushed', async () => {
  const { hub, over } = hubWith({ trending: [{ address: B, price: 1 }] });
  const lister = fakeRes();
  hub.handler(fakeReq({ address: '' }), lister);
  await settle();
  await settle();
  assert.strictEqual(hub.isDisplayed(B), true);

  // The list moves on. The displayed set is replaced wholesale rather than added to, so B is not
  // live forever just because it once trended.
  over.trending = [{ address: D, price: 1 }];
  await hub.__tickLists();
  assert.strictEqual(hub.isDisplayed(B), false);
  assert.strictEqual(hub.isDisplayed(D), true);
  hub.stop();
});

test('a client with no chart on screen costs no candle calls', async () => {
  // tickCandles is the most expensive thing the hub does — one getOhlcv per address per
  // timeframe — against a keyless GeckoTerminal tier measured at 6-8 calls/min.
  const { hub, calls } = hubWith();
  hub.handler(fakeReq({ address: A, candles: '0' }), fakeRes());
  await settle();
  await settle();
  await hub.__tickCandles();
  assert.deepStrictEqual(calls.ohlcv, [], 'no series fetched for a list-only tab');

  // And a client that does want one still gets it.
  const charting = fakeRes();
  hub.handler(fakeReq({ address: A, tf: '1m' }), charting);
  await settle();
  await settle();
  calls.ohlcv.length = 0;
  await hub.__tickCandles();
  assert.deepStrictEqual(calls.ohlcv, [`${A}:1m`], 'one series, for the one tab showing a chart');
  assert.strictEqual(charting.events('candle').length, 1);
  assert.strictEqual(hub.stats().charting, 1, 'and the hub says how many tabs are charting');
  hub.stop();
});

test('hello reports the address cap rather than applying it silently', async () => {
  const { hub } = hubWith();
  const res = fakeRes();
  // Five addresses against a cap of four: the fifth used to vanish without a word, and because
  // the client sent oldest-first it was the coin actually on screen that went.
  hub.handler(fakeReq({ address: `${A},${B},${C},${D},${E}` }), res);
  await settle();

  const hello = res.events('hello')[0];
  assert.strictEqual(hello.addresses.length, MAX_ADDRESSES_PER_CLIENT);
  assert.deepStrictEqual(hello.addresses, [A, B, C, D], 'the first four, in the order asked');
  assert.strictEqual(hello.maxAddresses, MAX_ADDRESSES_PER_CLIENT);
  assert.strictEqual(hello.truncated, true);
  assert.strictEqual(hello.dropped, 1);
  assert.strictEqual(hello.candles, true);
  hub.stop();

  // Inside the cap, nothing is reported as dropped.
  const { hub: hub2 } = hubWith();
  const res2 = fakeRes();
  hub2.handler(fakeReq({ address: `${A},${B}`, candles: '0' }), res2);
  await settle();
  const h2 = res2.events('hello')[0];
  assert.strictEqual(h2.truncated, false);
  assert.strictEqual(h2.dropped, 0);
  assert.strictEqual(h2.candles, false);
  // Duplicates and rubbish are not "dropped" — they were never addresses.
  const res3 = fakeRes();
  hub2.handler(fakeReq({ address: `${A},${A},nonsense,${B}` }), res3);
  await settle();
  assert.strictEqual(res3.events('hello')[0].truncated, false);
  hub2.stop();
});

test('the credential is nowhere in a hello frame', async () => {
  const { hub } = hubWith();
  const res = fakeRes();
  hub.handler(fakeReq({ address: A }), res);
  await settle();
  // `launches` is deliberately a boolean: nothing about the upstream key crosses this line.
  assert.strictEqual(typeof res.events('hello')[0].launches, 'boolean');
  assert.doesNotMatch(res.chunks.join(''), /api-key|HELIUS/i);
  hub.stop();
});
