// Prices read straight off the pump.fun bonding curve. The rules worth holding onto:
//   - the account layout decodes exactly, and anything short of a whole curve decodes to null
//   - a curve flagged `complete` has migrated to Raydium: it is stale and must never be priced
//   - the price arithmetic uses the mint's real decimals, with 6 only as a fallback
//   - a token mid-raid is coalesced to ~4 emits/second, always the newest price
//   - subscriptions follow the hub's watched set exactly: one socket, subscribe and unsubscribe
//   - a dropped socket reconnects and re-asks for everything, because the server kept no state
//   - with no key (or the flag off) the service is inert and nothing else changes
//   - no frame, log line or payload can carry the credential
const test = require('node:test');
const assert = require('node:assert');
const {
  createFeed, createCoalescer, curveAddress, decodeCurve, priceSolFromCurve,
  isEnabled, FALLBACK_DECIMALS,
} = require('../src/services/solanaPriceFeed');

const MINT_A = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const MINT_B = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
// Recomputed from seed + mint + program id, so a change in any of the three fails here.
const CURVE_A = 'GwZBHKZ9r8eDypoMex2REbujYyGddxuf63nDPxASx4q2';
const CURVE_B = '8Rr2Qo9ch94zRZxojHfg7Xeq8DfAp9mfNaLZnQScnpbA';

const SOL_USD = 200;

/** A curve account as the chain stores it: 8-byte discriminator, five u64 LE, one bool. */
function curveBuf({ vTok = 1_000_000_000_000_000n, vSol = 30_000_000_000n, rTok = 0n, rSol = 0n, supply = 1_000_000_000_000_000n, complete = false } = {}) {
  const b = Buffer.alloc(49);
  b.writeBigUInt64LE(vTok, 8);
  b.writeBigUInt64LE(vSol, 16);
  b.writeBigUInt64LE(rTok, 24);
  b.writeBigUInt64LE(rSol, 32);
  b.writeBigUInt64LE(supply, 40);
  b.writeUInt8(complete ? 1 : 0, 48);
  return b;
}
const curveB64 = (over) => curveBuf(over).toString('base64');

const settle = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r)); };

// ── the pure parts ──────────────────────────────────────────────────────────
test('the curve address is the mint PDA, with no lookup', () => {
  assert.strictEqual(curveAddress(MINT_A), CURVE_A);
  assert.strictEqual(curveAddress(MINT_B), CURVE_B);
  assert.strictEqual(curveAddress('nonsense'), null);
  assert.strictEqual(curveAddress(null), null);
});

test('the account layout decodes field by field', () => {
  const c = decodeCurve(curveBuf({ vTok: 11n, vSol: 22n, rTok: 33n, rSol: 44n, supply: 55n }));
  assert.strictEqual(c.virtualTokenReserves, 11n);
  assert.strictEqual(c.virtualSolReserves, 22n);
  assert.strictEqual(c.realTokenReserves, 33n);
  assert.strictEqual(c.realSolReserves, 44n);
  assert.strictEqual(c.tokenTotalSupply, 55n);
  assert.strictEqual(c.complete, false);
  // Real accounts are longer than the fields we read; trailing bytes are not our business.
  const padded = Buffer.concat([curveBuf({ vSol: 7n }), Buffer.alloc(100, 0xff)]);
  assert.strictEqual(decodeCurve(padded).virtualSolReserves, 7n);
});

test('a truncated or absent account decodes to null rather than a wrong price', () => {
  assert.strictEqual(decodeCurve(curveBuf().subarray(0, 48)), null, 'one byte short of the bool');
  assert.strictEqual(decodeCurve(Buffer.alloc(0)), null);
  assert.strictEqual(decodeCurve(null), null);
  assert.strictEqual(decodeCurve('not a buffer'), null);
});

test('a completed curve has migrated and is never priced', () => {
  const c = decodeCurve(curveBuf({ complete: true }));
  assert.strictEqual(c.complete, true);
  assert.strictEqual(priceSolFromCurve(c), null);
});

test('the price is virtual SOL over virtual tokens, in the mint\'s own decimals', () => {
  // 30 SOL against 1e9 tokens at 6dp -> 3e-8 SOL each.
  assert.strictEqual(priceSolFromCurve(decodeCurve(curveBuf()), 6), 3e-8);
  // The same raw reserves at 9dp are a thousand times fewer tokens, so a thousand times dearer.
  assert.strictEqual(priceSolFromCurve(decodeCurve(curveBuf()), 9), 3e-5);
  assert.strictEqual(FALLBACK_DECIMALS, 6);
  assert.strictEqual(priceSolFromCurve(decodeCurve(curveBuf())), 3e-8, 'defaults to 6');
  // Nonsense decimals fall back rather than producing a price off by orders of magnitude.
  for (const dp of [undefined, null, -1, 19, 6.5, '6', NaN]) {
    assert.strictEqual(priceSolFromCurve(decodeCurve(curveBuf()), dp), 3e-8, `decimals ${String(dp)}`);
  }
});

test('an empty or unpriceable curve yields null, not Infinity or NaN', () => {
  assert.strictEqual(priceSolFromCurve(decodeCurve(curveBuf({ vTok: 0n })), 6), null);
  assert.strictEqual(priceSolFromCurve(decodeCurve(curveBuf({ vSol: 0n })), 6), null);
  assert.strictEqual(priceSolFromCurve(null, 6), null);
});

// ── coalescing ──────────────────────────────────────────────────────────────
function clockHarness(start = 1_000) {
  let clock = start;
  let seq = 0;
  const timers = new Map();
  return {
    now: () => clock,
    setTimer: (fn, ms) => { const id = ++seq; timers.set(id, { fn, at: clock + ms }); return { id, unref() {} }; },
    clearTimer: (t) => { if (t) timers.delete(t.id); },
    pending: () => timers.size,
    tick(ms) {
      const target = clock + ms;
      // Run in due order, so a timer that re-arms itself behaves as it does in production.
      for (;;) {
        const next = [...timers.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        timers.delete(next[0]);
        clock = Math.max(clock, next[1].at);
        next[1].fn();
      }
      clock = target;
    },
  };
}

test('a busy token is coalesced to the newest price, four times a second', () => {
  const h = clockHarness();
  const out = [];
  const c = createCoalescer({ minIntervalMs: 250, now: h.now, setTimer: h.setTimer, clearTimer: h.clearTimer, emit: (v) => out.push(v) });

  c.push('a', 1);
  assert.deepStrictEqual(out, [1], 'the first price goes out at once');
  c.push('a', 2);
  c.push('a', 3);
  c.push('a', 4);
  assert.deepStrictEqual(out, [1], 'the rest wait');
  h.tick(250);
  assert.deepStrictEqual(out, [1, 4], 'and only the newest of them is sent');

  // A second token is rate-limited on its own clock.
  c.push('b', 10);
  assert.deepStrictEqual(out, [1, 4, 10]);

  // Quiet for longer than the window: the next price is immediate again.
  h.tick(1_000);
  c.push('a', 5);
  assert.deepStrictEqual(out, [1, 4, 10, 5]);
  c.stop();
  assert.strictEqual(h.pending(), 0, 'no timer survives stop');
  assert.strictEqual(c.size(), 0);
});

test('forgetting a token drops its queued price and its timer', () => {
  const h = clockHarness();
  const out = [];
  const c = createCoalescer({ minIntervalMs: 250, now: h.now, setTimer: h.setTimer, clearTimer: h.clearTimer, emit: (v) => out.push(v) });
  c.push('a', 1);
  c.push('a', 2);
  c.forget('a');
  h.tick(1_000);
  assert.deepStrictEqual(out, [1], 'the pending emit never arrives');
  assert.strictEqual(h.pending(), 0);
});

// ── the feed ────────────────────────────────────────────────────────────────
function fakeSocket(url) {
  const s = {
    url,
    readyState: 0,
    sent: [],
    closed: false,
    terminated: false,
    pings: 0,
    handlers: {},
    on(ev, cb) { (s.handlers[ev] ||= []).push(cb); return s; },
    send(raw) { s.sent.push(JSON.parse(raw)); },
    close() { s.closed = true; s.readyState = 3; },
    terminate() { s.terminated = true; s.readyState = 3; },
    ping() { s.pings += 1; },
    fire(ev, ...args) { for (const cb of s.handlers[ev] || []) cb(...args); },
    open() { s.readyState = 1; s.fire('open'); },
    deliver(msg) { s.fire('message', Buffer.from(JSON.stringify(msg))); },
    requests(method) { return s.sent.filter((m) => m.method === method); },
  };
  return s;
}

function harness(over = {}) {
  const h = clockHarness();
  const sockets = [];
  const prices = [];
  const logs = [];
  const accounts = over.accounts || { [CURVE_A]: curveB64(), [CURVE_B]: curveB64({ vSol: 60_000_000_000n }) };
  const decimals = over.decimals ?? 6;
  const calls = { rpc: 0 };

  const feed = createFeed({ HELIUS_API_KEY: 'secret-key-value', ...over.env }, {
    now: h.now,
    setTimer: h.setTimer,
    clearTimer: h.clearTimer,
    onPrice: (p) => prices.push(p),
    createSocket: (url) => { const s = fakeSocket(url); sockets.push(s); return s; },
    log: { log: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push(a.join(' ')) },
    data: {
      isValidAddress: (a) => typeof a === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a),
      getSolPrice: async () => SOL_USD,
      ...over.data,
    },
    fetchImpl: async (url, init) => {
      calls.rpc += 1;
      const body = JSON.parse(init.body);
      const [addrs] = body.params;
      return {
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          result: {
            value: addrs.map((a) => {
              if (accounts[a]) return { data: [accounts[a], 'base64'] };
              if (a === MINT_A || a === MINT_B) return { data: { parsed: { info: { decimals } } } };
              return null;
            }),
          },
        }),
      };
    },
  });
  return { h, feed, sockets, prices, logs, calls };
}

test('with no key the feed is inert, and says why', () => {
  const f = createFeed({});
  assert.strictEqual(f.enabled, false);
  assert.match(f.reason, /HELIUS_API_KEY/);
  // Every method is still callable, so nothing upstream has to branch on it.
  f.setWatched([MINT_A]);
  assert.deepStrictEqual(f.stats().watched, []);
  f.stop();
  assert.strictEqual(isEnabled({}), false);
});

test('the flag turns it off even with a key, and is opt-OUT otherwise', () => {
  const off = createFeed({ HELIUS_API_KEY: 'k', ENABLE_HELIUS_PRICE: 'false' });
  assert.strictEqual(off.enabled, false);
  assert.match(off.reason, /ENABLE_HELIUS_PRICE/);
  assert.strictEqual(isEnabled({ HELIUS_API_KEY: 'k', ENABLE_HELIUS_PRICE: 'false' }), false);
  // Anything else, including unset, is on.
  assert.strictEqual(isEnabled({ HELIUS_API_KEY: 'k' }), true);
  assert.strictEqual(isEnabled({ HELIUS_API_KEY: 'k', ENABLE_HELIUS_PRICE: 'true' }), true);
  assert.strictEqual(createFeed({ HELIUS_API_KEY: 'k' }).enabled, true);
});

test('one socket for the process, subscribing to the hub\'s watched set', async () => {
  const { feed, sockets, h } = harness();
  feed.setWatched([MINT_A]);
  await settle();
  assert.strictEqual(sockets.length, 1, 'one socket, not one per token');
  sockets[0].open();
  await settle();

  const subs = sockets[0].requests('accountSubscribe');
  assert.strictEqual(subs.length, 1);
  assert.deepStrictEqual(subs[0].params[0], CURVE_A, 'subscribes to the curve, not the mint');
  assert.strictEqual(subs[0].params[1].commitment, 'processed');

  // A second token joins on the same socket; the first is not re-asked for.
  feed.setWatched([MINT_A, MINT_B]);
  await settle();
  assert.strictEqual(sockets.length, 1);
  const after = sockets[0].requests('accountSubscribe');
  assert.deepStrictEqual(after.map((m) => m.params[0]), [CURVE_A, CURVE_B]);
  feed.stop();
  h.tick(10_000);
});

test('a token that stops being watched is unsubscribed, and an empty set closes the socket', async () => {
  const { feed, sockets, h } = harness();
  feed.setWatched([MINT_A, MINT_B]);
  await settle();
  const s = sockets[0];
  s.open();
  await settle();
  for (const [i, req] of s.requests('accountSubscribe').entries()) {
    s.deliver({ jsonrpc: '2.0', id: req.id, result: 100 + i });
  }
  assert.strictEqual(feed.stats().subscribed, 2);

  feed.setWatched([MINT_B]);
  await settle();
  assert.deepStrictEqual(s.requests('accountUnsubscribe').map((m) => m.params[0]), [100]);
  assert.deepStrictEqual(feed.stats().watched, [MINT_B]);

  feed.setWatched([]);
  await settle();
  assert.strictEqual(s.closed, true, 'nothing watched: hold no socket');
  assert.deepStrictEqual(feed.stats().watched, []);
  h.tick(120_000);
  assert.strictEqual(sockets.length, 1, 'and no reconnect for an empty set');
  assert.strictEqual(h.pending(), 0, 'no timer left behind');
  feed.stop();
});

test('a notification becomes a USD price for that token', async () => {
  const { feed, sockets, prices, h } = harness();
  feed.setWatched([MINT_A]);
  await settle();
  const s = sockets[0];
  s.open();
  await settle();
  // The prime read already produced the opening price, so selecting a token is not a blank wait.
  assert.strictEqual(prices.length, 1);
  assert.strictEqual(prices[0].address, MINT_A);
  assert.strictEqual(prices[0].price, 3e-8 * SOL_USD);
  assert.strictEqual(prices[0].priceSol, 3e-8);
  assert.strictEqual(prices[0].source, 'pumpfun-curve');

  const req = s.requests('accountSubscribe')[0];
  s.deliver({ jsonrpc: '2.0', id: req.id, result: 7 });
  h.tick(300); // past the coalescing window
  s.deliver({
    jsonrpc: '2.0',
    method: 'accountNotification',
    params: { subscription: 7, result: { context: { slot: 42 }, value: { data: [curveB64({ vSol: 60_000_000_000n }), 'base64'] } } },
  });
  assert.strictEqual(prices.length, 2);
  assert.strictEqual(prices[1].price, 6e-8 * SOL_USD, 'twice the SOL reserves, twice the price');
  assert.strictEqual(prices[1].slot, 42);

  // A notification for a subscription we do not hold is ignored rather than guessed at.
  s.deliver({ jsonrpc: '2.0', method: 'accountNotification', params: { subscription: 999, result: { value: { data: [curveB64(), 'base64'] } } } });
  assert.strictEqual(prices.length, 2);
  feed.stop();
});

test('the mint\'s real decimals are used, not an assumed six', async () => {
  const { feed, prices, sockets, h } = harness({ decimals: 9 });
  feed.setWatched([MINT_A]);
  await settle();
  sockets[0].open();
  await settle();
  assert.strictEqual(prices[0].priceSol, 3e-5, 'a 9dp mint is priced a thousandfold higher');
  feed.stop();
  h.tick(10_000);
});

test('a token that has already migrated is never priced and never subscribed', async () => {
  const { feed, sockets, prices, h } = harness({ accounts: { [CURVE_A]: curveB64({ complete: true }) } });
  feed.setWatched([MINT_A]);
  await settle();
  const s = sockets[0];
  s.open();
  await settle();
  assert.strictEqual(prices.length, 0, 'a frozen curve is not a price');
  assert.strictEqual(feed.stats().migrated, 1);
  assert.strictEqual(s.requests('accountSubscribe').length, 0, 'and not worth a subscription');
  feed.stop();
  h.tick(10_000);
});

test('a token that migrates while we watch it is unsubscribed and handed back', async () => {
  const { feed, sockets, prices, h } = harness();
  feed.setWatched([MINT_A]);
  await settle();
  const s = sockets[0];
  s.open();
  await settle();
  const req = s.requests('accountSubscribe')[0];
  s.deliver({ jsonrpc: '2.0', id: req.id, result: 5 });
  const before = prices.length;

  h.tick(300);
  s.deliver({ jsonrpc: '2.0', method: 'accountNotification', params: { subscription: 5, result: { value: { data: [curveB64({ complete: true }), 'base64'] } } } });
  assert.strictEqual(prices.length, before, 'the frozen reserves are not a price');
  assert.strictEqual(feed.stats().migrated, 1);
  assert.strictEqual(s.requests('accountUnsubscribe').length, 1);

  // Nothing further reaches it, even if a notification somehow still arrives.
  s.deliver({ jsonrpc: '2.0', method: 'accountNotification', params: { subscription: 5, result: { value: { data: [curveB64(), 'base64'] } } } });
  assert.strictEqual(prices.length, before);
  feed.stop();
  h.tick(10_000);
});

test('a mint with no curve account holds no price and no illusions', async () => {
  const { feed, prices, sockets, h } = harness({ accounts: {} });
  feed.setWatched([MINT_A]);
  await settle();
  sockets[0].open();
  await settle();
  assert.strictEqual(prices.length, 0);
  feed.stop();
  h.tick(10_000);
});

test('a dropped socket reconnects with backoff and re-asks for everything', async () => {
  const { feed, sockets, h } = harness();
  feed.setWatched([MINT_A, MINT_B]);
  await settle();
  const first = sockets[0];
  first.open();
  await settle();
  for (const [i, req] of first.requests('accountSubscribe').entries()) {
    first.deliver({ jsonrpc: '2.0', id: req.id, result: 200 + i });
  }
  assert.strictEqual(feed.stats().subscribed, 2);

  first.readyState = 3;
  first.fire('close');
  assert.strictEqual(feed.stats().connected, false);
  assert.strictEqual(feed.stats().subscribed, 0, 'the server kept no subscriptions for us');
  assert.strictEqual(sockets.length, 1, 'and we do not reconnect instantly');

  h.tick(1_000); // BACKOFF_MIN, and the jitter only ever shortens it
  await settle();
  assert.strictEqual(sockets.length, 2);
  sockets[1].open();
  await settle();
  assert.deepStrictEqual(
    sockets[1].requests('accountSubscribe').map((m) => m.params[0]).sort(),
    [CURVE_A, CURVE_B].sort(),
    'everything watched is re-subscribed',
  );
  feed.stop();
  h.tick(120_000);
});

test('a rejected subscription is logged and let go, not retried in a loop', async () => {
  const { feed, sockets, logs, h } = harness();
  feed.setWatched([MINT_A]);
  await settle();
  const s = sockets[0];
  s.open();
  await settle();
  const req = s.requests('accountSubscribe')[0];
  s.deliver({ jsonrpc: '2.0', id: req.id, error: { code: -32601, message: 'method not supported' } });
  assert.strictEqual(feed.stats().subscribed, 0);
  assert.ok(logs.some((l) => /method not supported/.test(l)));
  h.tick(60_000);
  assert.strictEqual(s.requests('accountSubscribe').length, 1);
  feed.stop();
});

test('a silent socket is treated as dead', async () => {
  const { feed, sockets, h } = harness();
  feed.setWatched([MINT_A]);
  await settle();
  const s = sockets[0];
  s.open();
  await settle();
  h.tick(30_000);       // first keepalive while traffic is recent
  assert.strictEqual(s.pings, 1);
  h.tick(120_000);      // past STALE_MS with nothing coming back
  assert.ok(s.terminated || s.closed, 'the half-open socket is torn down');
  await settle();
  assert.ok(sockets.length >= 2, 'and replaced');
  feed.stop();
  h.tick(120_000);
});

test('stop leaves nothing behind: no socket, no timers, no subscriptions', async () => {
  const { feed, sockets, h } = harness();
  feed.setWatched([MINT_A, MINT_B]);
  await settle();
  sockets[0].open();
  await settle();
  feed.stop();
  assert.strictEqual(sockets[0].closed, true);
  assert.strictEqual(h.pending(), 0);
  assert.deepStrictEqual(feed.stats().watched, []);
  // And it stays stopped: a late watched set must not resurrect the socket.
  feed.setWatched([MINT_A]);
  h.tick(120_000);
  await settle();
  assert.strictEqual(sockets.length, 1);
});

test('rubbish in the watched set is ignored, and the count is capped', async () => {
  const { feed, sockets, h } = harness();
  feed.setWatched([null, 'nope', MINT_A, MINT_A, 42]);
  await settle();
  assert.deepStrictEqual(feed.stats().watched, [MINT_A]);
  feed.setWatched(Array.from({ length: 40 }, () => MINT_A));
  assert.deepStrictEqual(feed.stats().watched, [MINT_A]);
  feed.stop();
  h.tick(10_000);
  assert.strictEqual(sockets.length, 1);
});

test('without a SOL price nothing is emitted rather than a price in the wrong unit', async () => {
  const { feed, prices, sockets, h } = harness({ data: { getSolPrice: async () => { throw new Error('upstream down'); } } });
  feed.setWatched([MINT_A]);
  await settle();
  sockets[0].open();
  await settle();
  assert.strictEqual(prices.length, 0);
  feed.stop();
  h.tick(10_000);
});

test('the key never reaches a payload or a log line', async () => {
  const { feed, prices, logs, sockets, h } = harness();
  feed.setWatched([MINT_A]);
  await settle();
  const s = sockets[0];
  s.open();
  await settle();
  s.fire('error', new Error(`connect failed for ${s.url}`));
  assert.ok(logs.length > 0);
  for (const line of logs) {
    assert.doesNotMatch(line, /secret-key-value/, line);
    assert.match(line, /api-key=\*\*\*|^\[solana-price\][^?]*$/);
  }
  assert.doesNotMatch(JSON.stringify(prices), /secret-key-value|api-key/);
  assert.doesNotMatch(JSON.stringify(feed.stats()), /secret-key-value|api-key/);
  feed.stop();
  h.tick(120_000);
});
