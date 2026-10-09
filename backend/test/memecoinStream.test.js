// The SSE hub. The rules worth holding onto:
//   - the response is a real event-stream, with headers flushed before anything is sent
//   - one IP cannot open unbounded connections (the endpoint is exempt from the request limiter)
//   - a heartbeat keeps the connection out of a proxy's idle timeout
//   - a closed connection is forgotten completely: no listeners, no timers, no retained payloads
//   - a client is only sent the token it asked for
//   - N subscribers to one token cost ONE upstream read
const test = require('node:test');
const assert = require('node:assert');
const { createHub, MAX_PER_IP } = require('../src/services/memecoinStream');

const ADDR_A = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const ADDR_B = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

const token = (address, over = {}) => ({
  address, symbol: 'X', price: 1, liquidity_usd: 100_000,
  volume_5m: 10_000, volume_1h: 12_000, buys_5m: 60, sells_5m: 20, ...over,
});

function fakeRes() {
  const r = {
    chunks: [], head: null, ended: false, writableLength: 0, listeners: {},
    writeHead(code, headers) { r.head = { code, headers }; return r; },
    flushHeaders() { r.flushed = true; },
    write(c) { if (r.ended) throw new Error('write after end'); r.chunks.push(c); return true; },
    end() { r.ended = true; },
    on(ev, cb) { (r.listeners[ev] ||= []).push(cb); return r; },
    status(code) { r.code = code; return r; },
    json(body) { r.body = body; return r; },
  };
  r.text = () => r.chunks.join('');
  r.events = () => r.chunks.join('').split('\n\n').filter(Boolean)
    .filter((f) => f.startsWith('event: '))
    .map((f) => {
      const [head, ...rest] = f.split('\n');
      return { event: head.slice(7), data: JSON.parse(rest.join('\n').replace(/^data: /, '')) };
    });
  return r;
}

function fakeReq(query = {}, ip = '1.2.3.4') {
  const closers = [];
  return {
    ip, query, socket: { remoteAddress: ip, setNoDelay() {} },
    on(ev, cb) { if (ev === 'close') closers.push(cb); },
    close() { for (const cb of closers) cb(); },
  };
}

const settle = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r)); };

function deps(over = {}) {
  const calls = { getToken: 0, getOhlcv: 0, getTrades: 0, lists: 0, delivered: [] };
  return {
    calls,
    opts: {
      data: {
        isValidAddress: (a) => typeof a === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a),
        getToken: async (a) => { calls.getToken += 1; return token(a); },
        getOhlcv: async () => { calls.getOhlcv += 1; return [{ time: 300, open: 1, high: 2, low: 1, close: 2, volume: 5 }]; },
        getTrades: async () => { calls.getTrades += 1; return [{ time: 1, side: 'buy', price: 1 }]; },
        getTrending: async () => { calls.lists += 1; return []; },
        getNew: async () => [],
        ...over.data,
      },
      signalFor: async () => null,
      deliver: (a) => calls.delivered.push(...a),
      launchesEnabled: () => false,
      ...over.opts,
    },
  };
}

test('the response is an event stream with headers flushed before the first frame', async () => {
  const hub = createHub(deps().opts);
  const res = fakeRes();
  hub.handler(fakeReq({ address: ADDR_A }), res);
  await settle();

  assert.strictEqual(res.head.code, 200);
  assert.match(res.head.headers['Content-Type'], /^text\/event-stream/);
  assert.match(res.head.headers['Cache-Control'], /no-cache/);
  assert.strictEqual(res.head.headers.Connection, 'keep-alive');
  assert.strictEqual(res.head.headers['X-Accel-Buffering'], 'no');
  assert.strictEqual(res.flushed, true);
  assert.match(res.text(), /^retry: \d+\n\n/);

  const hello = res.events().find((e) => e.event === 'hello');
  assert.deepStrictEqual(hello.data.addresses, [ADDR_A]);
  assert.strictEqual(hello.data.tf, '5m');
  assert.ok(hello.data.heartbeatMs >= 20_000 && hello.data.heartbeatMs <= 25_000);
  assert.strictEqual(hello.data.launches, false);
  hub.stop();
});

test('nothing in any frame could carry a credential', async () => {
  const hub = createHub(deps().opts);
  const res = fakeRes();
  hub.handler(fakeReq({ address: ADDR_A }), res);
  await settle();
  assert.doesNotMatch(res.text(), /api-key|apiKey|HELIUS|secret|Bearer/i);
  hub.stop();
});

test('one IP cannot hold more than MAX_PER_IP connections, and others are unaffected', async () => {
  const hub = createHub(deps().opts);
  const open = [];
  for (let i = 0; i < MAX_PER_IP; i++) {
    const res = fakeRes();
    hub.handler(fakeReq({ address: ADDR_A }, '9.9.9.9'), res);
    open.push(res);
  }
  await settle();
  assert.strictEqual(hub.stats().clients, MAX_PER_IP);

  const refused = fakeRes();
  hub.handler(fakeReq({ address: ADDR_A }, '9.9.9.9'), refused);
  assert.strictEqual(refused.code, 429);
  assert.strictEqual(refused.body.error, true);
  assert.strictEqual(refused.head, null, 'refused before any stream headers');

  const other = fakeRes();
  hub.handler(fakeReq({ address: ADDR_A }, '8.8.8.8'), other);
  await settle();
  assert.strictEqual(other.head.code, 200);
  hub.stop();
});

test('a freed connection frees its IP slot', async () => {
  const hub = createHub(deps().opts);
  const reqs = [];
  for (let i = 0; i < MAX_PER_IP; i++) {
    const r = fakeReq({ address: ADDR_A }, '9.9.9.9');
    reqs.push(r);
    hub.handler(r, fakeRes());
  }
  await settle();
  reqs[0].close();
  const res = fakeRes();
  hub.handler(fakeReq({ address: ADDR_A }, '9.9.9.9'), res);
  await settle();
  assert.strictEqual(res.head.code, 200);
  hub.stop();
});

test('closing a connection forgets it completely — no clients, no timers, no retained state', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const hub = createHub(deps().opts);
  const req = fakeReq({ address: ADDR_A });
  const res = fakeRes();
  hub.handler(req, res);
  await settle();
  assert.strictEqual(hub.stats().clients, 1);
  assert.strictEqual(hub.stats().running, true);
  assert.ok(hub.stats().samples > 0, 'an observation was recorded');

  req.close();
  assert.strictEqual(hub.stats().clients, 0);
  assert.strictEqual(hub.stats().running, false, 'the last client out stops every timer');
  assert.deepStrictEqual(hub.stats().watched, []);
  assert.strictEqual(hub.stats().samples, 0, 'price history is not kept for nobody');
  assert.strictEqual(res.ended, true);

  // Ticking past every interval must not write to the dead socket (res.write throws after end).
  const before = res.chunks.length;
  t.mock.timers.tick(120_000);
  await settle();
  assert.strictEqual(res.chunks.length, before);
  hub.stop();
});

test('a double close is harmless', async () => {
  const hub = createHub(deps().opts);
  const req = fakeReq({ address: ADDR_A });
  hub.handler(req, fakeRes());
  await settle();
  req.close();
  req.close();
  assert.strictEqual(hub.stats().clients, 0);
  hub.stop();
});

test('a heartbeat comment is sent so a proxy cannot idle the connection out', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const hub = createHub(deps().opts);
  const res = fakeRes();
  hub.handler(fakeReq({ address: ADDR_A }), res);
  await settle();
  assert.doesNotMatch(res.text(), /: ping/);
  t.mock.timers.tick(25_000);
  assert.match(res.text(), /: ping\n\n/);
  // A comment is not an event, so it cannot be mistaken for data.
  assert.ok(!res.events().some((e) => e.event.includes('ping')));
  hub.stop();
});

test('a client is only sent the token it subscribed to', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const hub = createHub(deps().opts);
  const a = fakeRes();
  const b = fakeRes();
  hub.handler(fakeReq({ address: ADDR_A }, '1.1.1.1'), a);
  hub.handler(fakeReq({ address: ADDR_B }, '2.2.2.2'), b);
  await settle();
  t.mock.timers.tick(6_000);
  await settle();

  const addrs = (res) => res.events().filter((e) => e.event === 'token').map((e) => e.data.address);
  assert.deepStrictEqual([...new Set(addrs(a))], [ADDR_A]);
  assert.deepStrictEqual([...new Set(addrs(b))], [ADDR_B]);
  hub.stop();
});

test('many subscribers to one token cost one upstream read per tick', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const d = deps();
  const hub = createHub(d.opts);
  for (const ip of ['1.1.1.1', '2.2.2.2', '3.3.3.3', '4.4.4.4', '5.5.5.5']) {
    hub.handler(fakeReq({ address: ADDR_A }, ip), fakeRes());
  }
  await settle();
  const seeded = d.calls.getToken; // one seed read per connection, each served by the TTL cache in production
  t.mock.timers.tick(6_000);
  await settle();
  assert.strictEqual(d.calls.getToken, seeded + 1, 'five subscribers, one read');
  hub.stop();
});

test('an unchanged payload is not re-sent', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const hub = createHub(deps().opts);
  const res = fakeRes();
  hub.handler(fakeReq({ address: ADDR_A }), res);
  await settle();
  const once = res.events().filter((e) => e.event === 'token').length;
  t.mock.timers.tick(30_000);
  await settle();
  assert.strictEqual(res.events().filter((e) => e.event === 'token').length, once);
  hub.stop();
});

test('addresses are validated, de-duped and capped', async () => {
  const hub = createHub(deps().opts);
  const res = fakeRes();
  hub.handler(fakeReq({ address: `${ADDR_A},not-an-address,${ADDR_A},${ADDR_B}` }), res);
  await settle();
  assert.deepStrictEqual(res.events().find((e) => e.event === 'hello').data.addresses, [ADDR_A, ADDR_B]);
  hub.stop();
});

test('an unknown timeframe falls back to 5m rather than being passed upstream', async () => {
  const hub = createHub(deps().opts);
  const res = fakeRes();
  hub.handler(fakeReq({ address: ADDR_A, tf: '3s' }), res);
  await settle();
  assert.strictEqual(res.events().find((e) => e.event === 'hello').data.tf, '5m');
  hub.stop();
});

test('a candle event carries only the newest bucket, with its timeframe', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const hub = createHub(deps().opts);
  const res = fakeRes();
  hub.handler(fakeReq({ address: ADDR_A, tf: '1m' }), res);
  await settle();
  t.mock.timers.tick(11_000);
  await settle();
  const c = res.events().find((e) => e.event === 'candle');
  assert.ok(c);
  assert.strictEqual(c.data.tf, '1m');
  assert.strictEqual(c.data.address, ADDR_A);
  assert.strictEqual(c.data.candle.time, 300);
  hub.stop();
});

test('a sharp move between two observations is broadcast and reaches the alert feed', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  let price = 1;
  let clock = 1_700_000_000_000;
  const d = deps({
    data: { getToken: async (a) => token(a, { price }) },
    opts: { now: () => clock },
  });
  const hub = createHub(d.opts);
  const res = fakeRes();
  hub.handler(fakeReq({ address: ADDR_A }), res);
  await settle();

  price = 2;          // doubled...
  clock += 60_000;    // ...a minute after the first observation
  t.mock.timers.tick(5_000);
  await settle();

  const vol = res.events().find((e) => e.event === 'volatility');
  assert.ok(vol, 'expected a volatility event');
  assert.strictEqual(vol.data.kind, 'volatility');
  assert.strictEqual(vol.data.address, ADDR_A);
  assert.strictEqual(vol.data.direction, 'up');
  assert.strictEqual(vol.data.changePct, 100);
  assert.strictEqual(d.calls.delivered.length, 1, 'the in-app bell feed is told too');
  assert.strictEqual(d.calls.delivered[0].kind, 'volatility');

  // Cooldown: the same token cannot announce itself again on the next tick.
  price = 4;
  clock += 60_000;
  t.mock.timers.tick(5_000);
  await settle();
  assert.strictEqual(res.events().filter((e) => e.event === 'volatility').length, 1);
  hub.stop();
});

test('a launch only reaches clients that asked for list events', async () => {
  const hub = createHub(deps().opts);
  const withLists = fakeRes();
  const without = fakeRes();
  hub.handler(fakeReq({ address: ADDR_A }, '1.1.1.1'), withLists);
  hub.handler(fakeReq({ address: ADDR_A, lists: '0' }, '2.2.2.2'), without);
  await settle();
  hub.pushLaunch({ address: ADDR_B, symbol: 'NEW', name: 'New', ts: 1 });
  assert.ok(withLists.events().some((e) => e.event === 'launch' && e.data.address === ADDR_B));
  assert.ok(!without.events().some((e) => e.event === 'launch'));
  hub.pushLaunch({ symbol: 'NO ADDRESS' });
  assert.strictEqual(withLists.events().filter((e) => e.event === 'launch').length, 1);
  hub.stop();
});

test('an upstream failure does not take the stream down', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const hub = createHub(deps({ data: { getToken: async () => { throw new Error('upstream down'); } } }).opts);
  const res = fakeRes();
  hub.handler(fakeReq({ address: ADDR_A }), res);
  await settle();
  t.mock.timers.tick(30_000);
  await settle();
  assert.strictEqual(hub.stats().clients, 1, 'still connected');
  assert.ok(res.events().some((e) => e.event === 'hello'));
  hub.stop();
});

test('an on-chain price only reaches the clients watching that token, and only when it moves', async () => {
  const hub = createHub(deps().opts);
  const watcher = fakeRes();
  const other = fakeRes();
  hub.handler(fakeReq({ address: ADDR_A }, '1.1.1.1'), watcher);
  hub.handler(fakeReq({ address: ADDR_B }, '2.2.2.2'), other);
  await settle();

  hub.pushPrice({ address: ADDR_A, price: 0.5, high: 0.6, low: 0.4, volumeUsd: 120, source: 'pumpfun-curve', ts: 7 });
  const [p] = watcher.events().filter((e) => e.event === 'price');
  assert.deepStrictEqual(p.data, {
    address: ADDR_A, price: 0.5, high: 0.6, low: 0.4, volumeUsd: 120, source: 'pumpfun-curve', ts: 7,
  });
  assert.strictEqual(other.events().filter((e) => e.event === 'price').length, 0, 'not a token it asked for');

  // Nothing moved: not news.
  hub.pushPrice({ address: ADDR_A, price: 0.5, high: 0.6, low: 0.4, volumeUsd: 120, source: 'pumpfun-curve', ts: 8 });
  assert.strictEqual(watcher.events().filter((e) => e.event === 'price').length, 1);
  // A swap that leaves the price alone still moves the volume, and that is news.
  hub.pushPrice({ address: ADDR_A, price: 0.5, high: 0.6, low: 0.4, volumeUsd: 130, source: 'pumpfun-curve', ts: 9 });
  assert.strictEqual(watcher.events().filter((e) => e.event === 'price').length, 2);

  // Extremes and volume default to something usable rather than being absent.
  hub.pushPrice({ address: ADDR_A, price: 0.7 });
  const last = watcher.events().filter((e) => e.event === 'price').pop();
  assert.strictEqual(last.data.high, 0.7);
  assert.strictEqual(last.data.low, 0.7);
  assert.strictEqual(last.data.volumeUsd, 0);
  assert.strictEqual(last.data.source, 'onchain');

  for (const bad of [null, {}, { address: ADDR_A }, { address: ADDR_A, price: 0 }, { address: ADDR_A, price: NaN }]) {
    hub.pushPrice(bad);
  }
  assert.strictEqual(watcher.events().filter((e) => e.event === 'price').length, 3, 'rubbish is dropped');
  hub.stop();
});

test('the on-chain feed is told exactly what the hub is watching, as it changes', async () => {
  const seen = [];
  const hub = createHub(deps({ opts: { onWatched: (l) => seen.push(l) } }).opts);
  const a = fakeRes();
  hub.handler(fakeReq({ address: ADDR_A }, '1.1.1.1'), a);
  await settle();
  assert.deepStrictEqual(seen, [[ADDR_A]]);

  // A second client on the same token changes nothing upstream.
  const dup = fakeRes();
  const dupReq = fakeReq({ address: ADDR_A }, '2.2.2.2');
  hub.handler(dupReq, dup);
  await settle();
  assert.strictEqual(seen.length, 1, 'the set did not change');

  const bReq = fakeReq({ address: ADDR_B }, '3.3.3.3');
  hub.handler(bReq, fakeRes());
  await settle();
  assert.deepStrictEqual(seen[seen.length - 1].slice().sort(), [ADDR_A, ADDR_B].sort());

  bReq.close();
  await settle();
  assert.deepStrictEqual(seen[seen.length - 1], [ADDR_A], 'and it shrinks again');

  dupReq.close();
  await settle();
  assert.deepStrictEqual(seen[seen.length - 1], [ADDR_A], 'one of two subscribers leaving is not a change');
  hub.stop();
  assert.deepStrictEqual(seen[seen.length - 1], [], 'a stopped hub watches nothing');
});
