// A CoinGecko key is the only thing that lifts GeckoTerminal's keyless ceiling, which measured
// 6-8 calls a minute from one IP against a published 30. The rules worth holding onto:
//   - with no key, nothing whatsoever changes: same host, no header
//   - with a key, the same path is requested under CoinGecko's /onchain prefix, with the header
//   - the demo and pro plans differ in host AND header name, and mixing them 401s
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const DATA = path.join(__dirname, '..', 'src', 'services', 'memecoinData.js');
const AXIOS = require.resolve('axios');

/** Load a fresh memecoinData under the given env, capturing what axios is asked for. */
function loadWith(env) {
  const seen = [];
  for (const k of ['COINGECKO_API_KEY', 'COINGECKO_PLAN']) delete process.env[k];
  Object.assign(process.env, env);
  delete require.cache[DATA];
  delete require.cache[AXIOS];
  require.cache[AXIOS] = {
    id: AXIOS, filename: AXIOS, loaded: true,
    exports: { get: async (url, cfg) => { seen.push({ url, headers: cfg.headers }); return { data: { data: [] } } } },
  };
  const mod = require(DATA);
  return { mod, seen };
}

test.after(() => {
  for (const k of ['COINGECKO_API_KEY', 'COINGECKO_PLAN']) delete process.env[k];
  delete require.cache[DATA];
  delete require.cache[AXIOS];
});

test('with no key the GeckoTerminal host is used and no key header is sent', async () => {
  const { mod, seen } = loadWith({});
  assert.strictEqual(mod.hasGeckoKey(), false);
  await mod.getTrending().catch(() => {});
  const hit = seen.find((s) => s.url.includes('trending_pools'));
  assert.ok(hit, 'the trending request was made');
  assert.ok(hit.url.startsWith('https://api.geckoterminal.com/api/v2/'), hit.url);
  assert.strictEqual(hit.headers['x-cg-demo-api-key'], undefined);
  assert.strictEqual(hit.headers['x-cg-pro-api-key'], undefined);
});

test('a demo key moves the same path onto CoinGecko and sends the demo header', async () => {
  const { mod, seen } = loadWith({ COINGECKO_API_KEY: 'CG-test-key' });
  assert.strictEqual(mod.hasGeckoKey(), true);
  await mod.getTrending().catch(() => {});
  const hit = seen.find((s) => s.url.includes('trending_pools'));
  assert.ok(hit.url.startsWith('https://api.coingecko.com/api/v3/onchain/'), hit.url);
  assert.ok(hit.url.endsWith('/networks/solana/trending_pools'), 'the path after the prefix is unchanged');
  assert.strictEqual(hit.headers['x-cg-demo-api-key'], 'CG-test-key');
  assert.strictEqual(hit.headers['x-cg-pro-api-key'], undefined);
});

test('the pro plan uses the pro host and the pro header, never the demo one', async () => {
  const { mod, seen } = loadWith({ COINGECKO_API_KEY: 'CG-pro-key', COINGECKO_PLAN: 'pro' });
  await mod.getTrending().catch(() => {});
  const hit = seen.find((s) => s.url.includes('trending_pools'));
  assert.ok(hit.url.startsWith('https://pro-api.coingecko.com/api/v3/onchain/'), hit.url);
  assert.strictEqual(hit.headers['x-cg-pro-api-key'], 'CG-pro-key');
  assert.strictEqual(hit.headers['x-cg-demo-api-key'], undefined);
});

test('non-GeckoTerminal upstreams are never given the key', async () => {
  const { mod, seen } = loadWith({ COINGECKO_API_KEY: 'CG-test-key' });
  await mod.getToken('7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU').catch(() => {});
  for (const s of seen.filter((x) => x.url.includes('dexscreener'))) {
    assert.strictEqual(s.headers['x-cg-demo-api-key'], undefined, 'DexScreener must not receive a CoinGecko key');
  }
});
