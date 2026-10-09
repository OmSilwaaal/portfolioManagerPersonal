// The volatility rule: a sharp move between two observations WE took, corroborated by flow.
// The rules worth holding onto:
//   - a price move on its own never fires; a single bad upstream tick must stay quiet
//   - both directions fire, and a rug flag does not suppress it (unlike "good signal")
//   - the window is bounded at both ends: too fast is one tick, too slow is not volatility
//   - an unset config value falls back to the default instead of becoming a zero threshold
const test = require('node:test');
const assert = require('node:assert');
const {
  evaluateVolatility, normaliseVolatilityCfg, VOLATILITY_DEFAULTS,
} = require('../src/services/memecoinAlerts');

const NOW = 1_700_000_000_000;
// 5m volume 10x the 1h-derived baseline (1h/12), so flow is corroborated by default.
const TOKEN = {
  address: 'So111', symbol: 'WIF', price: 2, liquidity_usd: 100_000,
  volume_5m: 10_000, volume_1h: 12_000, buys_5m: 60, sells_5m: 20,
};
const PREV = { price: 1, ts: NOW - 60_000 };

test('a sharp move with corroborating volume fires', () => {
  const a = evaluateVolatility({ prev: PREV, token: TOKEN, now: NOW });
  assert.ok(a);
  assert.strictEqual(a.kind, 'volatility');
  assert.strictEqual(a.direction, 'up');
  assert.strictEqual(a.changePct, 100);
  assert.strictEqual(a.window, '60s');
  assert.strictEqual(a.volumeRatio, 10);
  assert.strictEqual(a.liquidityUsd, 100_000);
  assert.match(a.message, /WIF spiking \+100\.0% in 60s/);
});

test('it fires downward too, and says so', () => {
  const a = evaluateVolatility({ prev: { price: 4, ts: NOW - 60_000 }, token: TOKEN, now: NOW });
  assert.strictEqual(a.direction, 'down');
  assert.strictEqual(a.changePct, -50);
  assert.match(a.message, /dumping -50\.0%/);
});

test('a move under the threshold stays quiet', () => {
  const token = { ...TOKEN, price: 1.1 }; // +10%, under the 12% default
  assert.strictEqual(evaluateVolatility({ prev: PREV, token, now: NOW }), null);
});

test('a price move with no corroborating flow stays quiet', () => {
  // volume_5m is exactly the baseline, and the trade count is not consulted while
  // volume data exists — one bad tick on a dead token must not alert.
  const token = { ...TOKEN, volume_5m: 1000, volume_1h: 12_000 };
  assert.strictEqual(evaluateVolatility({ prev: PREV, token, now: NOW }), null);
});

test('trade count corroborates when volume data is missing', () => {
  const thin = { ...TOKEN, volume_5m: null, volume_1h: null };
  assert.ok(evaluateVolatility({ prev: PREV, token: thin, now: NOW }));
  const quiet = { ...thin, buys_5m: 2, sells_5m: 1 };
  assert.strictEqual(evaluateVolatility({ prev: PREV, token: quiet, now: NOW }), null);
});

test('no usable data at all stays quiet rather than guessing', () => {
  const blind = { ...TOKEN, volume_5m: null, volume_1h: null, buys_5m: null, sells_5m: null };
  assert.strictEqual(evaluateVolatility({ prev: PREV, token: blind, now: NOW }), null);
});

test('the window is bounded at both ends', () => {
  const tooFast = { price: 1, ts: NOW - 5_000 };
  const tooSlow = { price: 1, ts: NOW - 10 * 60_000 };
  assert.strictEqual(evaluateVolatility({ prev: tooFast, token: TOKEN, now: NOW }), null);
  assert.strictEqual(evaluateVolatility({ prev: tooSlow, token: TOKEN, now: NOW }), null);
});

test('the reported window is the real elapsed time, not a nominal one', () => {
  assert.strictEqual(evaluateVolatility({ prev: { price: 1, ts: NOW - 30_000 }, token: TOKEN, now: NOW }).window, '30s');
  assert.strictEqual(evaluateVolatility({ prev: { price: 1, ts: NOW - 120_000 }, token: TOKEN, now: NOW }).window, '2m');
});

test('thin liquidity is ignored, where price is mostly noise', () => {
  const thin = { ...TOKEN, liquidity_usd: 5_000 };
  assert.strictEqual(evaluateVolatility({ prev: PREV, token: thin, now: NOW }), null);
  assert.ok(evaluateVolatility({ prev: PREV, token: thin, now: NOW, cfg: { min_liquidity: 1000 } }));
});

test('a rug flag rides along instead of suppressing the alert', () => {
  const a = evaluateVolatility({
    prev: PREV, token: TOKEN, now: NOW,
    signal: { score: 90, confidence: 0.8, riskFlags: [{ code: 'MINT_AUTHORITY' }] },
  });
  assert.ok(a);
  assert.deepStrictEqual(a.flags, ['MINT_AUTHORITY']);
  assert.strictEqual(a.score, 90);
  assert.strictEqual(a.confidence, 0.8);
});

test('a missing or broken observation is not an alert', () => {
  assert.strictEqual(evaluateVolatility({ token: TOKEN, now: NOW }), null);
  assert.strictEqual(evaluateVolatility({ prev: { price: 0, ts: NOW - 60_000 }, token: TOKEN, now: NOW }), null);
  assert.strictEqual(evaluateVolatility({ prev: { price: 1 }, token: TOKEN, now: NOW }), null);
  assert.strictEqual(evaluateVolatility({ prev: PREV, token: { ...TOKEN, price: null }, now: NOW }), null);
  assert.strictEqual(evaluateVolatility({ prev: PREV, token: null, now: NOW }), null);
  assert.strictEqual(evaluateVolatility({}), null);
});

test('an unset config value falls back to the default, not to zero', () => {
  // Number(null) === 0 would turn every gate off; normalisePrefs guards the same trap.
  const c = normaliseVolatilityCfg({ price_pct: null, min_liquidity: undefined, vol_ratio: '' });
  assert.strictEqual(c.price_pct, VOLATILITY_DEFAULTS.price_pct);
  assert.strictEqual(c.min_liquidity, VOLATILITY_DEFAULTS.min_liquidity);
  assert.strictEqual(c.vol_ratio, VOLATILITY_DEFAULTS.vol_ratio);
  assert.strictEqual(normaliseVolatilityCfg({ price_pct: 'nonsense' }).price_pct, VOLATILITY_DEFAULTS.price_pct);
  assert.strictEqual(normaliseVolatilityCfg({ price_pct: 0 }).price_pct, VOLATILITY_DEFAULTS.price_pct);
  assert.strictEqual(normaliseVolatilityCfg({ price_pct: 40 }).price_pct, 40);
});
