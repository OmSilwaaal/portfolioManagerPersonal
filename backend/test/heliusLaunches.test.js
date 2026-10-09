// New-launch discovery via Helius. The rules worth holding onto:
//   - unconfigured is a { enabled:false, reason } provider, never a crash and never a call
//   - the API key never reaches a log line (it lives in the query string of every URL)
//   - a cold start does not dump the last hour of launches into the UI
//   - the same mint is announced once
//   - nothing is fetched while nobody is listening
const test = require('node:test');
const assert = require('node:assert');
const { createWatcher, isEnabled, launchMint, redact } = require('../src/services/heliusLaunches');

const MINT = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const MINT2 = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const ON = { ENABLE_HELIUS_LAUNCHES: 'true', HELIUS_API_KEY: 'sk-not-a-real-key' };
const NOW = 1_700_000_000_000;
const nowSec = Math.floor(NOW / 1000);

const createTx = (mint, ts, over = {}) => ({
  type: 'CREATE', source: 'PUMP_FUN', timestamp: ts, signature: `sig-${mint}-${ts}`,
  feePayer: 'CreatorWallet11111111111111111111111111111',
  tokenTransfers: [{ mint, tokenAmount: 1 }],
  ...over,
});

/** fetch stand-in: the enhanced-transactions URL returns `txs`, the RPC returns DAS metadata. */
function fakeFetch(txs, meta = {}) {
  const urls = [];
  const impl = async (url, init) => {
    urls.push(url);
    if (init?.method === 'POST') {
      const ids = JSON.parse(init.body).params.ids;
      return {
        ok: true,
        json: async () => ({
          result: ids.map((id) => ({ id, content: { metadata: meta[id] || {}, links: {} } })),
        }),
      };
    }
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => txs };
  };
  impl.urls = urls;
  return impl;
}

const queue = { run: (fn) => fn() };

test('no flag, or no key, means a disabled provider that calls nothing', () => {
  assert.strictEqual(createWatcher({}).enabled, false);
  assert.match(createWatcher({}).reason, /ENABLE_HELIUS_LAUNCHES/);
  assert.match(createWatcher({ HELIUS_API_KEY: 'k' }).reason, /ENABLE_HELIUS_LAUNCHES/);
  assert.match(createWatcher({ ENABLE_HELIUS_LAUNCHES: 'true' }).reason, /HELIUS_API_KEY/);
  assert.strictEqual(createWatcher({ ENABLE_HELIUS_LAUNCHES: 'true' }).pollOnce, undefined);
  assert.strictEqual(isEnabled({}), false);
  assert.strictEqual(isEnabled({ ENABLE_HELIUS_LAUNCHES: 'true' }), false);
  assert.strictEqual(isEnabled(ON), true);
});

test('redact keeps the key out of anything we log', () => {
  assert.strictEqual(redact('GET https://api.helius.xyz/v0/x?api-key=abc123&type=CREATE failed'),
    'GET https://api.helius.xyz/v0/x?api-key=***&type=CREATE failed');
  assert.strictEqual(redact('api-key=abc'), 'api-key=***');
  assert.strictEqual(redact(undefined), '');
});

test('the mint comes from the token transfer, or from the balance changes', () => {
  assert.strictEqual(launchMint(createTx(MINT, nowSec)), MINT);
  assert.strictEqual(launchMint({ tokenTransfers: [], accountData: [{ tokenBalanceChanges: [{ mint: MINT2 }] }] }), MINT2);
  assert.strictEqual(launchMint({ tokenTransfers: [{ mint: 'not-an-address' }] }), null);
  assert.strictEqual(launchMint({}), null);
  assert.strictEqual(launchMint(null), null);
});

test('a launch is emitted with sanitised metadata', async () => {
  const seen = [];
  const w = createWatcher(ON, {
    fetchImpl: fakeFetch([createTx(MINT, nowSec)], { [MINT]: { name: 'Slop  Runners', symbol: 'RUN' } }),
    queue, onLaunch: (l) => seen.push(l), now: () => NOW,
  });
  const out = await w.pollOnce();
  assert.strictEqual(out.length, 1);
  assert.deepStrictEqual(seen, out);
  assert.strictEqual(out[0].address, MINT);
  assert.strictEqual(out[0].symbol, 'RUN');
  assert.strictEqual(out[0].name, 'Slop Runners', 'whitespace collapsed by the shared sanitiser');
  assert.strictEqual(out[0].source, 'pumpfun');
  assert.strictEqual(out[0].ts, nowSec * 1000);
  assert.strictEqual(out[0].creator, 'CreatorWallet11111111111111111111111111111');
});

test('a mint with no metadata still produces a usable launch', async () => {
  const w = createWatcher(ON, {
    fetchImpl: fakeFetch([createTx(MINT, nowSec)]), queue, now: () => NOW,
  });
  const [l] = await w.pollOnce();
  assert.strictEqual(l.address, MINT);
  assert.match(l.symbol, /^7xKX\.\.\./, 'falls back to the short mint');
  assert.strictEqual(l.image, null);
});

test('a cold start ignores the backlog, then reports everything new', async () => {
  const stale = createTx(MINT, nowSec - 3600);
  const fresh = createTx(MINT2, nowSec - 10);
  const w = createWatcher(ON, { fetchImpl: fakeFetch([stale, fresh]), queue, now: () => NOW });
  const first = await w.pollOnce();
  assert.deepStrictEqual(first.map((l) => l.address), [MINT2]);
});

test('the same mint is never announced twice', async () => {
  const w = createWatcher(ON, { fetchImpl: fakeFetch([createTx(MINT, nowSec)]), queue, now: () => NOW });
  assert.strictEqual((await w.pollOnce()).length, 1);
  assert.strictEqual((await w.pollOnce()).length, 0);
});

test('only pump.fun CREATEs count', async () => {
  const w = createWatcher(ON, {
    fetchImpl: fakeFetch([
      createTx(MINT, nowSec, { source: 'JUPITER' }),
      createTx(MINT2, nowSec, { timestamp: 'soon' }),
    ]),
    queue,
    now: () => NOW,
  });
  assert.deepStrictEqual(await w.pollOnce(), []);
});

test('nothing is fetched while nobody is holding the stream open', async () => {
  const f = fakeFetch([createTx(MINT, nowSec)]);
  const w = createWatcher(ON, { fetchImpl: f, queue, now: () => NOW, hasListeners: () => false });
  assert.deepStrictEqual(await w.pollOnce(), []);
  assert.strictEqual(f.urls.length, 0);
});

test('launches are emitted oldest-first and metadata is one batched call', async () => {
  const f = fakeFetch([createTx(MINT, nowSec - 5), createTx(MINT2, nowSec - 50)]);
  const w = createWatcher(ON, { fetchImpl: f, queue, now: () => NOW });
  const out = await w.pollOnce();
  assert.deepStrictEqual(out.map((l) => l.address), [MINT2, MINT]);
  assert.strictEqual(f.urls.length, 2, 'one transactions call + one metadata call');
});

test('a garbage response is not an error', async () => {
  const w = createWatcher(ON, { fetchImpl: fakeFetch({ error: 'nope' }), queue, now: () => NOW });
  assert.deepStrictEqual(await w.pollOnce(), []);
});
