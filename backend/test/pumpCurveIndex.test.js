'use strict';
// The market-wide pump.fun curve index. The rules worth holding onto:
//   - the subscription filter is the BondingCurve discriminator, not a guessed account length
//   - a 166-byte mainnet curve decodes exactly, and `complete` means never price it again
//   - curve -> mint is derived offline when we know the mint, and resolved by ONE batched call
//     when we do not — and a reply whose mint does not re-derive the curve is thrown away
//   - nothing is resolved on first sight, resolution is capped per process, and a curve that
//     cannot be resolved is parked rather than asked about forever
//   - 300 writes to one mint between flushes cost one row and one frame, with the extremes kept
//   - every intake and flush ceiling actually bounds, and the counters say when they engage
//   - only tokens a client can see become frames; everything else is stored and nothing more
//   - stop() leaves no socket and no timer; with no key (or the flag off) it is inert
//   - no frame, log line or stat can carry the credential
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');

const sqlite = require('./_sqlite');
sqlite.installBetterSqlite3Adapter();
process.env.DB_PATH = ':memory:';
// The row cap is read from the environment at require time. Lowered here so the prune test can
// actually reach it; the default (200_000) is asserted separately from the module's constants.
const CAP = 5_000;
process.env.PUMP_CURVE_MAX_ROWS = String(CAP);

const { PublicKey } = require('@solana/web3.js');
const idx = require('../src/services/pumpCurveIndex');
const { createIndex, curveProgress, curveMcap, CURVE_DISCRIMINATOR, INITIAL_REAL_TOKENS } = idx;
const { decodeCurve, curveAddress } = require('../src/services/solanaPriceFeed');
const { getDb } = require('../src/db/schema');
const store = require('../src/services/tokenIndex');

const PUMP = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const SOL_USD = 200;

const MINT_A = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const MINT_B = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const MINT_C = 'So11111111111111111111111111111111111111112';
const CURVE_A = curveAddress(MINT_A);
const CURVE_B = curveAddress(MINT_B);
const CURVE_C = curveAddress(MINT_C);

// A fabricated curve pubkey nothing can ever resolve, which is the unresolvable case.
const ORPHAN = 'ToKeNoRPHAN11111111111111111111111111111111';

/**
 * A curve account the way mainnet stores one: 166 bytes, 8-byte discriminator, five u64 LE, the
 * `complete` bool, then the creator pubkey and trailing fields we do not read. Built at the real
 * length on purpose — the 49 bytes the field layout implies is the mistake that returns zero
 * events and looks like a quiet market.
 */
function curveBuf({
  vTok = 1_000_000_000_000_000n, vSol = 30_000_000_000n,
  rTok = BigInt(INITIAL_REAL_TOKENS), rSol = 0n,
  supply = 1_000_000_000_000_000n, complete = false, creator = MINT_B,
} = {}) {
  const b = Buffer.alloc(166);
  CURVE_DISCRIMINATOR.copy(b, 0);
  b.writeBigUInt64LE(vTok, 8);
  b.writeBigUInt64LE(vSol, 16);
  b.writeBigUInt64LE(rTok, 24);
  b.writeBigUInt64LE(rSol, 32);
  b.writeBigUInt64LE(supply, 40);
  b.writeUInt8(complete ? 1 : 0, 48);
  new PublicKey(creator).toBuffer().copy(b, 49);
  return b;
}
const curveB64 = (over) => curveBuf(over).toString('base64');

function notification(sub, pubkey, over, slot = 1) {
  return {
    jsonrpc: '2.0',
    method: 'programNotification',
    params: {
      subscription: sub,
      result: { context: { slot }, value: { pubkey, account: { data: [curveB64(over), 'base64'], owner: PUMP } } },
    },
  };
}

const settle = async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r)); };

/**
 * Deliver many notifications without tripping the per-second intake ceiling, which is a
 * different test. 1000 per simulated second, well under MAX_UPDATES_PER_SEC.
 */
function deliverMany(s, h, items) {
  for (const [i, msg] of items.entries()) {
    if (i > 0 && i % 1_000 === 0) h.advance(1_000);
    s.deliver(msg);
  }
}

/** Run n resolve intervals, letting each request actually settle between them. */
async function resolveRounds(h, n, ms = 750) {
  for (let i = 0; i < n; i++) { h.tick(ms); await settle(); }
}

// A controllable clock, same shape as the one in solanaPriceFeed.test.
function clockHarness(start = 1_000_000) {
  let clock = start;
  let seq = 0;
  const timers = new Map();
  return {
    now: () => clock,
    setTimer: (fn, ms) => { const id = ++seq; timers.set(id, { fn, at: clock + ms }); return { id, unref() {} }; },
    clearTimer: (t) => { if (t) timers.delete(t.id); },
    pending: () => timers.size,
    advance(ms) { clock += ms; },
    tick(ms) {
      const target = clock + ms;
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
    fire(ev, ...a) { for (const cb of s.handlers[ev] || []) cb(...a); },
    open() { s.readyState = 1; s.fire('open'); },
    deliver(msg) { s.fire('message', Buffer.from(JSON.stringify(msg))); },
    requests(method) { return s.sent.filter((m) => m.method === method); },
  };
  return s;
}

/**
 * A fake store: the same five calls the index makes, with nothing persisted, so the intake and
 * back-pressure tests never touch SQLite. The real table gets its own test below.
 */
function fakeStore(seed = []) {
  const rows = new Map();
  return {
    seed,
    rows,
    writes: [],
    fail: null, // set to an Error to simulate a full volume
    curveMints: () => seed,
    recordCurves(list) {
      if (this.fail) throw this.fail;
      this.writes.push(list);
      for (const r of list) rows.set(r.address, r);
      return list.length;
    },
    countCurves: () => rows.size,
    curveFootprint: () => ({ rows: rows.size, maxRows: 200_000, bytes: rows.size * 690, maxBytes: 138_000_000 }),
  };
}

function harness(over = {}) {
  const h = clockHarness();
  const sockets = [];
  const prices = [];
  const logs = [];
  const store = over.store || fakeStore(over.seed || []);
  const rpcCalls = [];
  const displayed = over.displayed === undefined ? null : new Set(over.displayed);

  const index = createIndex({ ENABLE_PUMP_CURVE_INDEX: 'true', HELIUS_API_KEY: 'secret-key-value', ...over.env }, {
    now: h.now,
    setTimer: h.setTimer,
    clearTimer: h.clearTimer,
    store,
    onPrice: (p) => prices.push(p),
    isDisplayed: (a) => (displayed ? displayed.has(a) : true),
    createSocket: (url) => { const s = fakeSocket(url); sockets.push(s); return s; },
    log: { log: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push(a.join(' ')) },
    data: {
      isValidAddress: (a) => typeof a === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a),
      getSolPrice: async () => SOL_USD,
      ...over.data,
    },
    fetchImpl: over.fetchImpl || (async (url, init) => {
      const body = JSON.parse(init.body);
      rpcCalls.push(body);
      // Answer getTokenAccountsByOwner the way mainnet does: the curve owns exactly one token
      // account, under Token-2022, and it carries the mint and its decimals.
      const reply = body.map((r) => {
        const curve = r.params[0];
        const token22 = r.params[1].programId.startsWith('Tokenz');
        const mint = { [CURVE_A]: MINT_A, [CURVE_B]: MINT_B, [CURVE_C]: MINT_C }[curve];
        // Mainnet answers under Token-2022; the legacy program is a miss for a modern mint.
        if (!mint || !token22) return { jsonrpc: '2.0', id: r.id, result: { value: [] } };
        return {
          jsonrpc: '2.0',
          id: r.id,
          result: { value: [{ account: { data: { parsed: { info: { mint, tokenAmount: { decimals: over.decimals ?? 6 } } } } } }] },
        };
      });
      return { ok: true, json: async () => reply };
    }),
    ...over.opts,
  });
  return { h, index, sockets, prices, logs, store, rpcCalls, displayed };
}

/** Open the socket and acknowledge the subscription, so notifications are accepted. */
async function connected(over = {}) {
  const t = harness(over);
  t.index.start();
  await settle();
  const s = t.sockets[0];
  s.open();
  await settle();
  const req = s.requests('programSubscribe')[0];
  s.deliver({ jsonrpc: '2.0', id: req.id, result: 77 });
  return { ...t, s, sub: 77, req };
}

// ── the filter ──────────────────────────────────────────────────────────────
test('the filter is the BondingCurve discriminator, not a guessed account length', async () => {
  // Anchor's rule, and the value observed on every 166-byte pump.fun curve on mainnet.
  assert.strictEqual(CURVE_DISCRIMINATOR.toString('hex'), '17b7f83760d8ac60');
  assert.deepStrictEqual(
    CURVE_DISCRIMINATOR,
    crypto.createHash('sha256').update('account:BondingCurve').digest().subarray(0, 8),
  );

  const { s } = await connected();
  const req = s.requests('programSubscribe')[0];
  assert.strictEqual(req.params[0], PUMP, 'one subscription, for the whole program');
  assert.strictEqual(req.params[1].commitment, 'processed');
  const f = req.params[1].filters;
  assert.strictEqual(f.length, 1);
  // A dataSize filter is what we are deliberately NOT using: the wrong length returns zero
  // events, which reads as a quiet market rather than as an error.
  assert.strictEqual(f[0].dataSize, undefined);
  assert.strictEqual(f[0].memcmp.offset, 0);
  assert.strictEqual(f[0].memcmp.encoding, 'base64');
  assert.strictEqual(Buffer.from(f[0].memcmp.bytes, 'base64').toString('hex'), '17b7f83760d8ac60');
});

test('one subscription for the whole process, re-asked for on every reconnect', async () => {
  const { index, sockets, s, h } = await connected();
  for (let i = 0; i < 50; i++) s.deliver(notification(77, CURVE_A, { vSol: BigInt(30 + i) * 1_000_000_000n }));
  assert.strictEqual(s.requests('programSubscribe').length, 1, 'one subscription, not one per token');
  assert.strictEqual(sockets.length, 1);

  s.readyState = 3;
  s.fire('close');
  assert.strictEqual(index.stats().connected, false);
  assert.strictEqual(index.stats().subscribed, false, 'the server kept nothing for us');
  assert.strictEqual(sockets.length, 1, 'and we do not reconnect instantly');

  h.tick(1_000); // BACKOFF_MIN; the jitter only ever shortens it
  await settle();
  assert.strictEqual(sockets.length, 2);
  sockets[1].open();
  await settle();
  assert.strictEqual(sockets[1].requests('programSubscribe').length, 1, 're-subscribed');
  index.stop();
  h.tick(120_000);
});

// ── the decode ──────────────────────────────────────────────────────────────
test('a 166-byte mainnet curve decodes exactly, past the fields the layout implies', () => {
  const b = curveBuf({ vTok: 347_452_779_347_046n, vSol: 92_645_683_454n, rTok: 67_552_779_347_046n, rSol: 62_645_683_454n });
  assert.strictEqual(b.length, 166, 'the account is 166 bytes, not the 49 the fields add up to');
  const c = decodeCurve(b);
  assert.strictEqual(c.virtualTokenReserves, 347_452_779_347_046n);
  assert.strictEqual(c.virtualSolReserves, 92_645_683_454n);
  assert.strictEqual(c.realTokenReserves, 67_552_779_347_046n);
  assert.strictEqual(c.tokenTotalSupply, 1_000_000_000_000_000n);
  assert.strictEqual(c.complete, false);
  // The pubkey at offset 49 is the creator, which is exactly why the mint is not recoverable
  // from the account: it does not re-derive the curve.
  const at49 = new PublicKey(b.subarray(49, 81)).toBase58();
  assert.strictEqual(at49, MINT_B);
  assert.notStrictEqual(curveAddress(at49), CURVE_A);
});

test('progress and market cap come off the same read, and refuse to guess', () => {
  // A fresh curve still holds all 793.1M real tokens.
  assert.strictEqual(curveProgress(decodeCurve(curveBuf())), 0);
  const half = decodeCurve(curveBuf({ rTok: BigInt(INITIAL_REAL_TOKENS / 2) }));
  assert.ok(Math.abs(curveProgress(half) - 0.5) < 1e-9);
  // The hottest curve measured on mainnet: 67.55e12 left of 793.1e12 is ~91.5% of the way there.
  const hot = decodeCurve(curveBuf({ rTok: 67_552_779_347_046n }));
  assert.ok(curveProgress(hot) > 0.91 && curveProgress(hot) < 0.92, String(curveProgress(hot)));
  // A curve built to other parameters gives a nonsense ratio, reported as unknown rather than
  // clamped into looking plausible.
  assert.strictEqual(curveProgress(decodeCurve(curveBuf({ rTok: BigInt(INITIAL_REAL_TOKENS) * 3n }))), null);
  assert.strictEqual(curveProgress(null), null);

  // 1e15 raw supply at 6dp is 1e9 tokens; at 3e-8 SOL and $200 that is $6,000.
  const c = decodeCurve(curveBuf());
  assert.ok(Math.abs(curveMcap(c, 3e-8 * SOL_USD, 6) - 6_000) < 1e-6);
  assert.ok(Math.abs(curveMcap(c, 3e-8 * SOL_USD, 9) - 6) < 1e-9, 'the mint\'s own decimals, not an assumed six');
  assert.strictEqual(curveMcap(c, 0, 6), null);
  assert.strictEqual(curveMcap(c, NaN, 6), null);
  assert.strictEqual(curveMcap(null, 1, 6), null);
});

test('a notification becomes a stored row and a USD price', async () => {
  const { index, s, store, prices, h } = await connected({ seed: [{ address: MINT_A, curve: CURVE_A, decimals: 6 }] });
  s.deliver(notification(77, CURVE_A, {}, 4242));
  h.tick(1_000);  // the emit clock
  h.tick(10_000); // the persist clock, deliberately ten times slower
  assert.strictEqual(prices.length, 1);
  assert.strictEqual(prices[0].address, MINT_A, 'keyed by mint, never by curve');
  assert.strictEqual(prices[0].priceSol, 3e-8);
  assert.strictEqual(prices[0].price, 3e-8 * SOL_USD);
  assert.ok(Math.abs(prices[0].mcap - 6_000) < 1e-6);
  assert.strictEqual(prices[0].slot, 4242);
  assert.strictEqual(prices[0].source, 'pumpfun-curve');

  const row = store.rows.get(MINT_A);
  assert.strictEqual(row.curve, CURVE_A);
  assert.strictEqual(row.priceSol, 3e-8);
  assert.strictEqual(row.vSol, 30);
  assert.strictEqual(row.complete, false);
  index.stop();
});

// ── completed curves ────────────────────────────────────────────────────────
test('a completed curve is never priced, never resolved, and recorded exactly once', async () => {
  const { index, s, store, prices, rpcCalls, h } = await connected({ seed: [{ address: MINT_A, curve: CURVE_A, decimals: 6 }] });

  s.deliver(notification(77, CURVE_A, { complete: true }));
  h.tick(11_000);
  assert.strictEqual(prices.length, 0, 'a frozen curve is not a price');
  assert.strictEqual(index.stats().completed, 1);
  const row = store.rows.get(MINT_A);
  assert.strictEqual(row.complete, true, 'but the migration itself is worth recording');
  assert.strictEqual(row.priceSol, null, 'with no price attached to it');

  // Further writes to the same frozen account cost nothing at all.
  const writes = store.writes.length;
  for (let i = 0; i < 20; i++) s.deliver(notification(77, CURVE_A, { complete: true }));
  h.tick(30_000);
  assert.strictEqual(store.writes.length, writes, 'the same fact is not written twice');
  assert.strictEqual(prices.length, 0);

  // And an UNKNOWN completed curve is never worth a request: there is nothing to price.
  for (let i = 0; i < 10; i++) s.deliver(notification(77, ORPHAN, { complete: true }));
  h.tick(10_000);
  await settle();
  assert.strictEqual(rpcCalls.length, 0, 'no resolution spent on a migrated token');
  assert.strictEqual(index.stats().queued, 0);
  index.stop();
});

test('a curve already recorded as migrated is parked at boot, not re-priced', async () => {
  const { index, s, prices, h } = await connected({ seed: [{ address: MINT_A, curve: CURVE_A, decimals: 6, complete: 1 }] });
  assert.strictEqual(index.stats().known, 1, 'the pair is still worth knowing, for lookups');
  assert.strictEqual(index.stats().parked, 1);
  // Even a notification that claims otherwise: `complete` in the store is one-way.
  s.deliver(notification(77, CURVE_A, { complete: true }));
  h.tick(1_000);
  assert.strictEqual(prices.length, 0);
  index.stop();
});

// ── curve -> mint ───────────────────────────────────────────────────────────
test('a known mint resolves offline, with no request at all', async () => {
  const { index, s, prices, rpcCalls, h } = await connected();
  // Nothing known: the first sighting is not enough to spend a request on, let alone price.
  s.deliver(notification(77, CURVE_A, {}));
  h.tick(1_000);
  assert.strictEqual(prices.length, 0);

  // Learn the mint from somewhere else (a launch, a search, the hub) — pure PDA arithmetic.
  assert.strictEqual(index.noteMint(MINT_A, 6), true);
  assert.strictEqual(index.noteMint('nonsense'), false);
  assert.strictEqual(index.noteMint(null), false);

  s.deliver(notification(77, CURVE_A, {}));
  h.tick(1_000);
  await settle();
  assert.strictEqual(prices.length, 1, 'priced immediately, once the mint is known');
  assert.strictEqual(rpcCalls.length, 0, 'and the network was never asked');
  index.stop();
});

test('the reverse index is seeded from the store, so a restart resolves nothing', async () => {
  const seed = [
    { address: MINT_A, curve: CURVE_A, decimals: 6 },
    { address: MINT_B, curve: CURVE_B, decimals: 9 },
  ];
  const { index, s, prices, rpcCalls, h } = await connected({ seed });
  assert.strictEqual(index.stats().known, 2);
  s.deliver(notification(77, CURVE_A, {}));
  s.deliver(notification(77, CURVE_B, {}));
  h.tick(1_000);
  await settle();
  assert.strictEqual(prices.length, 2);
  assert.strictEqual(rpcCalls.length, 0);
  // The stored decimals are used, not an assumed six.
  const b = prices.find((p) => p.address === MINT_B);
  assert.strictEqual(b.priceSol, 3e-5, 'a 9dp mint is priced a thousandfold higher');
  index.stop();
});

test('an unknown curve is resolved by one batched call, and the mint must re-derive it', async () => {
  const { index, s, prices, rpcCalls, h } = await connected();
  // Twice, because one write in a window is a dead token.
  s.deliver(notification(77, CURVE_A, {}));
  s.deliver(notification(77, CURVE_A, {}));
  assert.strictEqual(index.stats().queued, 1);

  h.tick(750); // the resolve interval
  await settle();
  assert.strictEqual(rpcCalls.length, 1, 'one http request');
  const body = rpcCalls[0];
  assert.ok(Array.isArray(body), 'batched JSON-RPC, not a request per curve');
  assert.strictEqual(body.length, 1, 'one sub-request per curve: the limiter counts sub-requests');
  assert.ok(body[0].params[1].programId.startsWith('Tokenz'), 'Token-2022 first, as pump.fun mints today');
  assert.strictEqual(body[0].method, 'getTokenAccountsByOwner');
  assert.strictEqual(body[0].params[0], CURVE_A, 'asked about the curve PDA');
  assert.strictEqual(index.stats().resolved, 1);
  assert.strictEqual(index.stats().known, 1);

  s.deliver(notification(77, CURVE_A, {}));
  h.tick(1_000);
  assert.strictEqual(prices.length, 1);
  assert.strictEqual(prices[0].address, MINT_A);
  index.stop();
});

test('a reply naming a mint that does not re-derive the curve is thrown away', async () => {
  // The failure this guards against is silent and much worse than no price: a reordered or
  // wrong reply would index one token's price under another's address.
  const { index, s, prices, h } = await connected({
    fetchImpl: async (url, init) => {
      const body = JSON.parse(init.body);
      return {
        ok: true,
        json: async () => body.map((r) => ({
          jsonrpc: '2.0',
          id: r.id,
          // MINT_C is a real pubkey, but its curve is CURVE_C, not the one we asked about.
          result: { value: [{ account: { data: { parsed: { info: { mint: MINT_C, tokenAmount: { decimals: 6 } } } } } }] },
        })),
      };
    },
  });
  s.deliver(notification(77, CURVE_A, {}));
  s.deliver(notification(77, CURVE_A, {}));
  h.tick(750);
  await settle();
  assert.strictEqual(index.stats().resolved, 0);
  assert.strictEqual(index.stats().known, 0);
  assert.strictEqual(index.stats().resolveFails, 1);
  s.deliver(notification(77, CURVE_A, {}));
  h.tick(1_000);
  assert.strictEqual(prices.length, 0, 'better no price than one under the wrong mint');
  index.stop();
});

test('launches are absorbed for free, pre-empting a request each', async () => {
  // heliusLaunches hands us mints by name, and curve = PDA(mint), so these never need asking about.
  const launches = require('../src/services/heliusLaunches');
  const realRecent = launches.recentLaunches;
  launches.recentLaunches = () => [{ address: MINT_A, ts: 5 }, { address: MINT_B, ts: 6 }];
  try {
    const { index, s, prices, rpcCalls, h } = await connected();
    assert.strictEqual(index.stats().known, 2, 'absorbed at start');
    s.deliver(notification(77, CURVE_A, {}));
    h.tick(1_000);
    await settle();
    assert.strictEqual(prices.length, 1);
    assert.strictEqual(rpcCalls.length, 0);
    index.stop();
  } finally {
    launches.recentLaunches = realRecent;
  }
});

// ── what stops a request storm ──────────────────────────────────────────────
test('nothing is resolved on first sight', async () => {
  const { index, s, rpcCalls, h } = await connected();
  // 500 distinct curves, each seen exactly once: in a measured 30s mainnet window 55 of 129
  // curves were like this, and every one would have cost a request.
  for (let i = 0; i < 500; i++) s.deliver(notification(77, `curve${String(i).padStart(38, 'x')}`, {}));
  h.tick(10_000);
  await settle();
  assert.strictEqual(rpcCalls.length, 0, 'not one request for 500 one-off curves');
  assert.strictEqual(index.stats().queued, 0);
  assert.ok(index.stats().sightings > 0, 'they are remembered, in case they trade again');
  index.stop();
});

test('resolution is capped per process, not per curve', async () => {
  const { index, s, rpcCalls, h } = await connected();
  // A mania: 400 curves all trading repeatedly, all unknown.
  const msgs = [];
  for (let round = 0; round < 3; round++) {
    for (let i = 0; i < 400; i++) msgs.push(notification(77, `curve${String(i).padStart(38, 'y')}`, {}));
  }
  deliverMany(s, h, msgs);
  assert.strictEqual(index.stats().queued, 400);

  await resolveRounds(h, 1);
  assert.strictEqual(rpcCalls.length, 1, 'one request per interval, whatever the queue depth');
  // Measured against Helius: 10 sub-requests per call runs indefinitely, 20 returns 429 on the
  // second call, 40 is refused outright. The limiter counts sub-requests, not HTTP requests.
  assert.strictEqual(rpcCalls[0].length, idx.RESOLVE_BATCH);
  assert.strictEqual(idx.RESOLVE_BATCH, 10);

  await resolveRounds(h, 4);
  assert.strictEqual(rpcCalls.length, 5, 'and strictly one per interval after that');
  // 10 curves per 750ms is the ceiling: ~13 resolutions/second, 1.33 requests/second.
  assert.strictEqual(rpcCalls.reduce((n, b) => n + b.length, 0), 50);
  index.stop();
});

test('an unresolvable curve is retried twice and then parked', async () => {
  const { index, s, rpcCalls, h } = await connected();
  const see = () => { s.deliver(notification(77, ORPHAN, {})); s.deliver(notification(77, ORPHAN, {})); };
  // Each attempt costs two rounds: Token-2022, then one look under the legacy program. Only
  // after both miss is the attempt charged and the curve re-offered.
  for (let i = 0; i < 3; i++) { see(); await resolveRounds(h, 2); }
  assert.strictEqual(index.stats().resolveFails, 3);
  assert.strictEqual(index.stats().parked, 1);
  assert.strictEqual(rpcCalls.length, 6, 'two sub-request rounds per attempt');

  // However much it trades from here, it is not asked about again.
  const before = rpcCalls.length;
  for (let i = 0; i < 20; i++) see();
  await resolveRounds(h, 10);
  assert.strictEqual(rpcCalls.length, before, 'parked means parked');
  assert.strictEqual(index.stats().queued, 0);
  index.stop();
});

test('the resolve queue is bounded, and a dropped candidate is simply re-offered', async () => {
  const { index, s, h } = await connected();
  const msgs = [];
  for (let round = 0; round < 2; round++) {
    for (let i = 0; i < 2_500; i++) msgs.push(notification(77, `curve${String(i).padStart(38, 'z')}`, {}));
  }
  deliverMany(s, h, msgs);
  assert.strictEqual(index.stats().queued, idx.RESOLVE_QUEUE_MAX, 'capped, not unbounded');
  index.stop();
  h.tick(10_000);
});

test('a transport failure does not count against the curve, and does not spin', async () => {
  let calls = 0;
  const { index, s, logs, h } = await connected({
    fetchImpl: async () => { calls += 1; throw new Error('connect ECONNRESET'); },
  });
  s.deliver(notification(77, CURVE_A, {}));
  s.deliver(notification(77, CURVE_A, {}));
  await resolveRounds(h, 1);
  assert.strictEqual(calls, 1);
  assert.strictEqual(index.stats().resolveFails, 0, 'the network failed, not the curve');
  assert.strictEqual(index.stats().queued, 1, 'still a candidate');
  assert.strictEqual(index.stats().resolvePaused, true);

  // Asking again at the same rate is pointless, so the resolver itself backs off.
  await resolveRounds(h, 1);
  assert.strictEqual(calls, 1, 'not retried at the old rate');
  await resolveRounds(h, 2);
  assert.strictEqual(calls, 2, 'retried once the backoff has passed');
  assert.ok(logs.some((l) => /ECONNRESET/.test(l) && /backing off/.test(l)));
  index.stop();
  h.tick(120_000);
});

test('a 429 backs the whole resolver off instead of hammering the limiter', async () => {
  // Measured: a batch of 20 sub-requests returns 429 on the second call. Re-offering at the same
  // rate against a limiter that is already refusing is the same storm by another route.
  let calls = 0;
  const { index, s, logs, h } = await connected({
    fetchImpl: async () => { calls += 1; return { ok: false, status: 429, json: async () => ({}) }; },
  });
  for (let i = 0; i < 5; i++) s.deliver(notification(77, `curve${String(i).padStart(38, 'q')}`, {}));
  for (let i = 0; i < 5; i++) s.deliver(notification(77, `curve${String(i).padStart(38, 'q')}`, {}));
  assert.strictEqual(index.stats().queued, 5);

  await resolveRounds(h, 1);
  assert.strictEqual(calls, 1);
  assert.strictEqual(index.stats().resolveThrottled, 1);
  assert.strictEqual(index.stats().resolveFails, 0, 'a limiter saying no is not the curve\'s fault');

  // The backoff doubles, capped, so a sustained 429 costs a handful of calls a minute rather
  // than 1.33 a second.
  await resolveRounds(h, 80);
  assert.ok(calls < 12, `${calls} calls across 60s of 429s`);
  assert.ok(logs.some((l) => /backing off/.test(l)));
  assert.strictEqual(index.stats().queued, 5, 'and nothing was lost');
  index.stop();
  h.tick(120_000);
});

// ── coalescing and back-pressure ────────────────────────────────────────────
test('a mint written three hundred times between flushes costs one row and one frame', async () => {
  const { index, s, store, prices, h } = await connected({ seed: [{ address: MINT_A, curve: CURVE_A, decimals: 6 }] });
  for (let i = 1; i <= 300; i++) {
    // A spike in the middle, so the extremes can be checked.
    const vSol = i === 150 ? 90_000_000_000n : BigInt(30_000_000_000 + i);
    s.deliver(notification(77, CURVE_A, { vSol }, i));
  }
  assert.strictEqual(prices.length, 0, 'nothing is emitted inside the window');
  assert.strictEqual(index.stats().dirty, 1);

  h.tick(1_000);
  assert.strictEqual(prices.length, 1, 'one frame for three hundred writes');
  assert.strictEqual(store.writes.length, 0, 'and no disk write yet: persisting is ten times slower');
  h.tick(10_000);
  assert.strictEqual(store.writes.length, 1);
  assert.strictEqual(store.writes[0].length, 1, 'and one row');
  // The newest price, not the biggest, because a superseded price was already wrong.
  assert.strictEqual(prices[0].priceSol, (30_000_000_000 + 300) / 1e9 / 1e9);
  // But the window's high survives: a spike between two frames must not be flattened away.
  assert.ok(prices[0].high > prices[0].price * 2, 'the spike is kept');
  assert.strictEqual(store.writes[0][0].hits, 300, 'and the hit count says how busy it was');

  // An unchanged price is not re-emitted every second just because it is still dirty.
  const emitted = prices.length;
  h.tick(5_000);
  assert.strictEqual(prices.length, emitted, 'a price that has not moved is not news');
  index.stop();
});

test('intake is bounded per second, and says when it drops', async () => {
  const { index, s, h } = await connected({ seed: [{ address: MINT_A, curve: CURVE_A, decimals: 6 }] });
  for (let i = 0; i < idx.MAX_UPDATES_PER_SEC + 500; i++) s.deliver(notification(77, CURVE_A, {}));
  assert.strictEqual(index.stats().updates, idx.MAX_UPDATES_PER_SEC);
  assert.strictEqual(index.stats().droppedRate, 500);

  // The next second starts clean.
  h.advance(1_000);
  s.deliver(notification(77, CURVE_A, {}));
  assert.strictEqual(index.stats().updates, idx.MAX_UPDATES_PER_SEC + 1);
  index.stop();
  h.tick(10_000);
});

test('a persist is capped so a backlog drains at a known rate rather than in one transaction', async () => {
  // Every curve known up front, so the only limit under test is the flush cap.
  const seed = [];
  const mints = [];
  for (let i = 0; i < 2_000; i++) {
    const m = new PublicKey(crypto.createHash('sha256').update(`m${i}`).digest()).toBase58();
    mints.push(m);
    seed.push({ address: m, curve: curveAddress(m), decimals: 6 });
  }
  const { index, s, store, h } = await connected({ seed, opts: { minHitsToResolve: 1 } });
  assert.strictEqual(index.stats().known, 2_000);

  // 2000 mints dirty, against a 1500-row cap.
  deliverMany(s, h, mints.map((m, i) => notification(77, curveAddress(m), { vSol: BigInt(30_000_000_000 + i) }, i)));
  assert.strictEqual(index.stats().dirty, 2_000);

  h.tick(10_000);
  assert.strictEqual(store.writes[0].length, idx.MAX_PERSIST_ROWS, 'capped per persist');
  assert.strictEqual(index.stats().dirty, 500, 'the rest wait rather than being dropped');
  h.tick(10_000);
  assert.strictEqual(index.stats().dirty, 0, 'and drain on the next one');
  assert.strictEqual(store.rows.size, 2_000);
  index.stop();
  h.tick(30_000);
});

test('past the dirty ceiling a new mint is dropped rather than queued', async () => {
  const seed = [];
  const curves = [];
  for (let i = 0; i < idx.MAX_DIRTY + 100; i++) {
    const m = new PublicKey(crypto.createHash('sha256').update(`d${i}`).digest()).toBase58();
    const c = curveAddress(m);
    curves.push(c);
    seed.push({ address: m, curve: c, decimals: 6 });
  }
  const { index, s, h } = await connected({ seed });
  deliverMany(s, h, curves.map((c) => notification(77, c, {})));
  assert.strictEqual(index.stats().dirty, idx.MAX_DIRTY);
  assert.strictEqual(index.stats().droppedDirty, 100);
  index.stop();
  h.tick(10_000);
});

test('only what a client can see becomes a frame; the rest is stored and nothing more', async () => {
  const seed = [
    { address: MINT_A, curve: CURVE_A, decimals: 6 },
    { address: MINT_B, curve: CURVE_B, decimals: 6 },
  ];
  const { index, s, store, prices, h } = await connected({ seed, displayed: [MINT_B] });
  s.deliver(notification(77, CURVE_A, {}));
  s.deliver(notification(77, CURVE_B, {}));
  h.tick(11_000);
  assert.strictEqual(store.rows.size, 2, 'both stored, because a lookup may want either');
  assert.deepStrictEqual(prices.map((p) => p.address), [MINT_B], 'one frame, for the one on screen');
  index.stop();
});

test('without a SOL price a row still holds its SOL price, but no frame claims a USD one', async () => {
  const { index, s, store, prices, h } = await connected({
    seed: [{ address: MINT_A, curve: CURVE_A, decimals: 6 }],
    data: { getSolPrice: async () => { throw new Error('upstream down'); } },
  });
  s.deliver(notification(77, CURVE_A, {}));
  h.tick(11_000);
  assert.strictEqual(prices.length, 0, 'a price in the wrong unit is worse than none');
  const row = store.rows.get(MINT_A);
  assert.strictEqual(row.priceSol, 3e-8);
  assert.strictEqual(row.priceUsd, null);
  assert.strictEqual(row.mcap, null);
  index.stop();
});

// ── the disk ceiling ────────────────────────────────────────────────────────
test('an unresolvable curve settles at one request per cooldown, not one per trade', async () => {
  const { index, s, rpcCalls, h } = await connected();
  const see = () => { s.deliver(notification(77, ORPHAN, {})); s.deliver(notification(77, ORPHAN, {})); };
  for (let i = 0; i < 3; i++) { see(); await resolveRounds(h, 2); }
  assert.strictEqual(rpcCalls.length, 6, 'two retries, then parked');

  // Past the cooldown it is retried ONCE and parked again. The attempt count has to survive the
  // cooldown for that to hold: losing it turns "park" back into "retry forever".
  h.advance(31 * 60_000);
  see();
  await resolveRounds(h, 3);
  assert.strictEqual(rpcCalls.length, 8, 'one attempt per cooldown, not one per trade');
  for (let i = 0; i < 50; i++) see();
  await resolveRounds(h, 10);
  assert.strictEqual(rpcCalls.length, 8, 'and parked again immediately');
  index.stop();
  h.tick(120_000);
});

test('a full volume pauses writes for a minute instead of retrying into the outage', async () => {
  const { index, s, store, prices, logs, h } = await connected({ seed: [{ address: MINT_A, curve: CURVE_A, decimals: 6 }] });
  store.fail = Object.assign(new Error('database or disk is full'), { diskFull: true });

  s.deliver(notification(77, CURVE_A, {}));
  h.tick(11_000);
  assert.strictEqual(index.stats().writeFails, 1);
  assert.strictEqual(index.stats().writesPaused, true);
  assert.ok(logs.some((l) => /pausing writes/.test(l)));
  // The row stays dirty, bounded by MAX_DIRTY, so the newest price wins when writing resumes.
  assert.strictEqual(index.stats().dirty, 1);

  // Not retried on the next persist, or the five after it.
  for (let i = 0; i < 5; i++) { s.deliver(notification(77, CURVE_A, {})); h.tick(10_000); }
  assert.strictEqual(index.stats().writeFails, 1, 'one failure, not one per persist');

  // And the part that never needed the disk carried on throughout.
  assert.ok(prices.length > 0, 'frames keep flowing while the volume is full');

  // Once the volume has room again, writing resumes by itself.
  store.fail = null;
  h.tick(60_000);
  assert.strictEqual(index.stats().writesPaused, false);
  assert.ok(store.rows.has(MINT_A));
  index.stop();
  h.tick(120_000);
});

test('the disk budget is a number the service reports, not a hope', async () => {
  const { index, h } = await connected();
  const { disk } = index.stats();
  assert.strictEqual(disk.maxRows, 200_000, 'the shipped default, independent of this test\'s override');
  // 690 bytes a row measured in steady state, freelist included: ~140 MB, and it cannot exceed
  // it. Sized for the 5 GB volume rather than squeezed, but still capped.
  assert.ok(disk.maxBytes <= 150 * 1024 * 1024, `${disk.maxBytes} bytes at the cap`);
  assert.ok(disk.rows <= disk.maxRows);
  index.stop();
  h.tick(120_000);

  // The real store agrees, and the cap is clamped rather than taken on trust.
  const f = store.curveFootprint();
  assert.strictEqual(f.maxRows, store.MAX_CURVE_ROWS);
  assert.strictEqual(f.maxRows, CAP, 'PUMP_CURVE_MAX_ROWS is honoured');
  assert.strictEqual(f.maxBytes, store.MAX_CURVE_ROWS * store.CURVE_BYTES_PER_ROW);
  assert.ok(store.MAX_CURVE_ROWS <= 1_000_000, 'the ceiling has a ceiling');
  assert.strictEqual(store.CURVE_BYTES_PER_ROW, 690, 'measured in steady state, not estimated');
  assert.strictEqual(store.LOW_WATER_CURVES, Math.floor(store.MAX_CURVE_ROWS * 0.9));
});

// ── lifecycle ───────────────────────────────────────────────────────────────
test('stop leaves nothing behind: no socket, no timers, no queue', async () => {
  const { index, s, h } = await connected({ seed: [{ address: MINT_A, curve: CURVE_A, decimals: 6 }] });
  s.deliver(notification(77, CURVE_A, {}));
  s.deliver(notification(77, ORPHAN, {}));
  s.deliver(notification(77, ORPHAN, {}));
  assert.ok(h.pending() > 0);
  index.stop();
  assert.strictEqual(s.closed, true);
  assert.strictEqual(h.pending(), 0, 'no timer survives stop');
  assert.strictEqual(index.stats().dirty, 0);
  assert.strictEqual(index.stats().queued, 0);
  // And it stays stopped: nothing resurrects the socket.
  index.start();
  h.tick(120_000);
  await settle();
  assert.strictEqual(index.stats().connected, false);
});

test('a silent socket is treated as dead and replaced', async () => {
  const { index, sockets, s, h } = await connected();
  h.tick(30_000);
  assert.strictEqual(s.pings, 1);
  h.tick(120_000); // past STALE_MS with nothing coming back
  assert.ok(s.terminated || s.closed);
  await settle();
  assert.ok(sockets.length >= 2, 'and replaced');
  index.stop();
  h.tick(120_000);
});

test('a rejected subscription is shouted about, because silence looks like a quiet market', async () => {
  const { index, sockets, logs, h } = harness();
  index.start();
  await settle();
  const s = sockets[0];
  s.open();
  await settle();
  const req = s.requests('programSubscribe')[0];
  s.deliver({ jsonrpc: '2.0', id: req.id, error: { code: -32602, message: 'filter not supported' } });
  assert.strictEqual(index.stats().subscribed, false);
  assert.strictEqual(index.stats().updates, 0, 'and no notification is accepted on a dead id');
  assert.ok(logs.some((l) => /filter not supported/.test(l)), 'the rejection is logged loudly');
  index.stop();
  h.tick(120_000);
});

test('a notification for a subscription we do not hold is ignored rather than guessed at', async () => {
  const { index, s, prices, h } = await connected({ seed: [{ address: MINT_A, curve: CURVE_A, decimals: 6 }] });
  s.deliver(notification(999, CURVE_A, {}));
  h.tick(11_000);
  assert.strictEqual(prices.length, 0);
  assert.strictEqual(index.stats().updates, 0);
  index.stop();
});

// ── off by default ──────────────────────────────────────────────────────────
test('without the flag, or without a key, it is inert and says why', () => {
  for (const [env, pattern] of [
    [{}, /ENABLE_PUMP_CURVE_INDEX/],
    [{ HELIUS_API_KEY: 'k' }, /ENABLE_PUMP_CURVE_INDEX/],
    [{ ENABLE_PUMP_CURVE_INDEX: 'true' }, /HELIUS_API_KEY/],
    [{ ENABLE_PUMP_CURVE_INDEX: 'yes', HELIUS_API_KEY: 'k' }, /ENABLE_PUMP_CURVE_INDEX/],
  ]) {
    const i = createIndex(env);
    assert.strictEqual(i.enabled, false, JSON.stringify(env));
    assert.match(i.reason, pattern);
    // Every method stays callable, so nothing upstream has to branch on it.
    i.start();
    i.noteMint(MINT_A);
    i.stop();
    assert.strictEqual(i.stats().enabled, false);
    assert.strictEqual(idx.isEnabled(env), false);
  }
  // Both, exactly, and nothing else.
  assert.strictEqual(idx.isEnabled({ ENABLE_PUMP_CURVE_INDEX: 'true', HELIUS_API_KEY: 'k' }), true);
  assert.strictEqual(createIndex({ ENABLE_PUMP_CURVE_INDEX: 'true', HELIUS_API_KEY: 'k' }).enabled, true);
  // And the module-level helpers are safe to call with it off.
  assert.strictEqual(idx.noteMint(MINT_A), false);
  assert.strictEqual(typeof idx.stats(), 'object');
});

test('the key never reaches a frame, a log line or a stat', async () => {
  const { index, s, prices, logs, h } = await connected({ seed: [{ address: MINT_A, curve: CURVE_A, decimals: 6 }] });
  s.fire('error', new Error(`connect failed for ${s.url}`));
  s.deliver(notification(77, CURVE_A, {}));
  h.tick(11_000);
  assert.ok(logs.length > 0);
  for (const line of logs) {
    assert.doesNotMatch(line, /secret-key-value/, line);
    assert.match(line, /api-key=\*\*\*|^\[pump-index\][^?]*$/, line);
  }
  assert.doesNotMatch(JSON.stringify(prices), /secret-key-value|api-key/);
  assert.doesNotMatch(JSON.stringify(index.stats()), /secret-key-value|api-key/);
  index.stop();
  h.tick(120_000);
});

// ── the store, on the real table ────────────────────────────────────────────
test('curve rows round-trip, bound their own growth, and never serve a migrated price', () => {
  const db = getDb();
  db.prepare('DELETE FROM token_curve').run();
  db.prepare('DELETE FROM token_index').run();
  const ts = 1_700_000_000_000;

  assert.strictEqual(store.recordCurves([
    { address: MINT_A, curve: CURVE_A, decimals: 6, priceSol: 3e-8, priceUsd: 6e-6, mcap: 6_000, vSol: 30, vToken: 1e9, progress: 0.1, hits: 7, slot: 10, ts },
    { address: MINT_B, curve: CURVE_B, decimals: 6, priceSol: 1e-8, priceUsd: 2e-6, mcap: 2_000, vSol: 10, vToken: 1e9, progress: 0.9, hits: 2, slot: 11, ts },
    { address: 'rubbish', curve: CURVE_C, priceSol: 1 },
    { address: MINT_C, curve: 'rubbish', priceSol: 1 },
    null,
  ], ts), 2, 'only well-formed rows, and nothing throws on the rest');

  const a = store.curveState(MINT_A);
  assert.strictEqual(a.curve, CURVE_A);
  assert.strictEqual(a.price_usd, 6e-6);
  assert.strictEqual(a.hits, 7);
  assert.strictEqual(a.complete, 0);
  assert.strictEqual(store.curveState('nope'), null);

  // hits accumulate; the newest price replaces the old one.
  store.recordCurves([{ address: MINT_A, curve: CURVE_A, decimals: 6, priceSol: 4e-8, priceUsd: 8e-6, mcap: 8_000, hits: 3, slot: 20, ts: ts + 1_000 }], ts + 1_000);
  const a2 = store.curveState(MINT_A);
  assert.strictEqual(a2.hits, 10);
  assert.strictEqual(a2.price_usd, 8e-6);
  assert.strictEqual(a2.slot, 20);

  // A fresh SOL price with no USD figure must not leave the stale USD price looking current.
  store.recordCurves([{ address: MINT_A, curve: CURVE_A, priceSol: 5e-8, priceUsd: null, mcap: null, ts: ts + 2_000 }], ts + 2_000);
  assert.strictEqual(store.curveState(MINT_A).price_usd, null);
  assert.strictEqual(store.curveState(MINT_A).price_sol, 5e-8);

  // Identity is joined in when we have it, and simply absent when we do not.
  store.recordTokens([{ address: MINT_B, symbol: 'WIF', name: 'dogwifhat' }], 'list', ts);
  store.recordCurves([{ address: MINT_A, curve: CURVE_A, priceSol: 3e-8, priceUsd: 6e-6, mcap: 6_000, ts: ts + 3_000 }], ts + 3_000);
  const live = store.liveCurves({ limit: 10, maxAgeS: 600, nowMs: ts + 4_000 });
  assert.strictEqual(live.length, 2);
  assert.strictEqual(live[0].address, MINT_A, 'most recently traded first');
  assert.strictEqual(live[0].symbol, null, 'a curve proves a coin trades, not what it is called');
  assert.strictEqual(live.find((r) => r.address === MINT_B).symbol, 'WIF');

  // A migration takes the row out of every live list, one-way.
  store.recordCurves([{ address: MINT_B, curve: CURVE_B, complete: true, ts: ts + 5_000 }], ts + 5_000);
  assert.strictEqual(store.curveState(MINT_B).complete, 1);
  store.recordCurves([{ address: MINT_B, curve: CURVE_B, complete: false, priceSol: 9e-8, priceUsd: 1e-5, ts: ts + 6_000 }], ts + 6_000);
  assert.strictEqual(store.curveState(MINT_B).complete, 1, 'a curve never un-migrates');
  assert.deepStrictEqual(
    store.liveCurves({ limit: 10, maxAgeS: 600, nowMs: ts + 7_000 }).map((r) => r.address),
    [MINT_A],
  );

  // Stale rows age out of the list but stay available to a lookup.
  assert.strictEqual(store.liveCurves({ limit: 10, maxAgeS: 1, nowMs: ts + 600_000 }).length, 0);
  assert.ok(store.curveState(MINT_A));

  // Minimum market cap, and the result cap.
  assert.strictEqual(store.liveCurves({ limit: 10, maxAgeS: 600, minMcap: 10_000, nowMs: ts + 7_000 }).length, 0);
  assert.strictEqual(store.liveCurves({ limit: 999, maxAgeS: 600, nowMs: ts + 7_000 }).length, 1);

  // curveMints is what makes a restart free.
  const pairs = store.curveMints(10);
  assert.ok(pairs.some((p) => p.address === MINT_A && p.curve === CURVE_A));
  assert.ok(pairs.some((p) => p.address === MINT_B && p.complete === 1));
});

test('the curve table prunes oldest-first and cannot grow without bound', () => {
  // Against a lowered cap: the behaviour is what matters, and filling 200k rows to prove it
  // would make this test slower than the rest of the suite put together.
  const db = getDb();
  db.prepare('DELETE FROM token_curve').run();
  const ts = 1_700_000_000_000;
  const rows = [];
  for (let i = 0; i < CAP + 500; i++) {
    const m = new PublicKey(crypto.createHash('sha256').update(`p${i}`).digest()).toBase58();
    rows.push({ address: m, curve: curveAddress(m), priceSol: 1e-8, priceUsd: 2e-6, ts: ts + i * 1_000 });
  }
  store.recordCurves(rows, ts);
  const n = store.countCurves();
  assert.ok(n <= CAP, `${n} rows`);
  assert.strictEqual(n, Math.floor(CAP * 0.9), 'pruned in a batch down to the low water mark');
  // The oldest went; the newest stayed.
  assert.strictEqual(store.curveState(rows[0].address), null);
  assert.ok(store.curveState(rows[rows.length - 1].address));

  // The point of capping on the way IN rather than pruning late: SQLite never shrinks a file on
  // DELETE, so pages freed by the prune have to be REUSED by later inserts or the file climbs
  // forever. Churn three more capfuls of mints through the table and the page count has to
  // settle, not track the total number of rows ever written.
  const pagesBefore = db.pragma('page_count', { simple: true });
  const pageSize = db.pragma('page_size', { simple: true });
  let settled = 0;
  for (let round = 0; round < 3; round++) {
    const more = [];
    for (let i = 0; i < CAP; i++) {
      const m = new PublicKey(crypto.createHash('sha256').update(`q${round}-${i}`).digest()).toBase58();
      more.push({ address: m, curve: curveAddress(m), priceSol: 1e-8, priceUsd: 2e-6, ts: ts + 9e8 + round * 1e6 + i });
    }
    store.recordCurves(more, ts);
    assert.ok(store.countCurves() <= CAP, `${store.countCurves()} rows after round ${round}`);
    const pc = db.pragma('page_count', { simple: true });
    if (round === 0) settled = pc;
    else assert.strictEqual(pc, settled, `page count moved on round ${round}: ${settled} -> ${pc}`);
    assert.ok(db.pragma('freelist_count', { simple: true }) > 0, 'freed pages are kept and reused');
  }
  const pagesAfter = db.pragma('page_count', { simple: true });
  // 3 x CAP extra rows went in. Unbounded that would be ~4x the pages. Instead the file reaches
  // its steady state after the FIRST eviction and then does not move at all, which is the claim:
  // freed pages are reused rather than the file climbing.
  assert.ok(pagesAfter < pagesBefore * 2.2, `${pagesBefore} -> ${pagesAfter} pages after 3x churn`);
  assert.strictEqual(pagesAfter, settled, 'and it is the same page count every round: it settles');
  const perRow = (pagesAfter * pageSize) / store.countCurves();
  assert.ok(perRow <= store.CURVE_BYTES_PER_ROW * 1.3, `${perRow.toFixed(0)} bytes/row at the cap`);

  db.prepare('DELETE FROM token_curve').run();
});
