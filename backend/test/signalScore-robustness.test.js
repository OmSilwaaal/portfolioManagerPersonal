// Regressions for data-hygiene bugs in the activity-v0 scorer: upstream OHLCV
// mapping does `volume: +v`, so a missing field arrives as NaN.
const test = require('node:test');
const assert = require('node:assert');
const { computeSignal, CONFIG } = require('../src/services/signalScore');

const NOW = 1_700_000_000_000;
const SEC = NOW / 1000;
const candles = (n, f = () => ({})) =>
  Array.from({ length: n }, (_, i) => ({
    time: SEC - (n - i) * 300, open: 1, high: 1, low: 1, close: 1 + i * 0.001, volume: 100, ...f(i),
  }));

test('candles with no volume field score instead of throwing', () => {
  const noVol = candles(12).map(({ volume, ...c }) => c); // eslint-disable-line no-unused-vars
  const sig = computeSignal({ token: { liquidity_usd: 50_000 }, candles5m: noVol, now: NOW });
  assert.ok(Number.isFinite(sig.score));
  assert.ok(typeof sig.level === 'string' && sig.level.length);
  // unknown volume must read as unknown, never as a number we made up
  assert.strictEqual(sig.components.volume_accel.score, null);
});

test('a NaN volume never reaches the baseline, wherever it sorts', () => {
  for (const at of [0, 3, 6, 11, 22]) {
    const sig = computeSignal({
      token: { liquidity_usd: 50_000, volume_5m: 100 },
      candles5m: candles(24, (i) => (i === at ? { volume: NaN } : {})),
      now: NOW,
    });
    assert.ok(Number.isFinite(sig.score), `score not finite with NaN volume at ${at}`);
    assert.ok(sig.features.volume_ratio === null || Number.isFinite(sig.features.volume_ratio));
  }
});

test('a volume-less 5m bucket is unknown, not zero', () => {
  // 1m candles with no volume at all -> aggregated bucket volume stays null
  const oneMin = Array.from({ length: 30 }, (_, i) => ({
    time: SEC - (30 - i) * 60, open: 1, high: 1, low: 1, close: 1 + i * 0.001,
  }));
  const sig = computeSignal({ token: { liquidity_usd: 50_000 }, candles1m: oneMin, now: NOW });
  assert.strictEqual(sig.components.volume_accel.score, null);
  assert.ok(Number.isFinite(sig.score));
});

test('the 1h buy/sell split is trusted less than the 5m split, not more', () => {
  const base = { liquidity_usd: 50_000, volume_5m: 100, volume_1h: 1200 };
  const fresh = computeSignal({ token: { ...base, buys_5m: 38, sells_5m: 2 }, now: NOW });
  const proxy = computeSignal({ token: { ...base, buy_count: 3800, sell_count: 200 }, now: NOW });

  assert.strictEqual(fresh.features.imbalance_window, '5m');
  assert.strictEqual(proxy.features.imbalance_window, '1h');
  // identical ratio, far more trades -- the proxy must still score lower
  assert.strictEqual(fresh.features.imbalance, proxy.features.imbalance);
  assert.ok(
    proxy.components.buy_sell_imbalance.score < fresh.components.buy_sell_imbalance.score,
    `1h proxy ${proxy.components.buy_sell_imbalance.score} should be below 5m ${fresh.components.buy_sell_imbalance.score}`,
  );
  assert.ok(proxy.confidence < fresh.confidence);
  assert.ok(proxy.notes.some((n) => /1h window/.test(n)));
  assert.strictEqual(CONFIG.imbalance1hTrust < 1, true);
});

test('every component is finite-or-null and the level always resolves', () => {
  const nasty = [
    { token: {}, now: NOW },
    { token: { liquidity_usd: 0, volume_5m: NaN, volume_1h: 0 }, now: NOW },
    { token: { buys_5m: NaN, sells_5m: 3 }, candles5m: [], now: NOW },
    { token: { volume_5m: 1e18, volume_1h: 1e-9 }, candles5m: candles(8), now: NOW },
  ];
  for (const input of nasty) {
    const sig = computeSignal(input);
    assert.ok(Number.isFinite(sig.score), `score not finite for ${JSON.stringify(input.token)}`);
    assert.ok(typeof sig.level === 'string' && sig.level.length);
    assert.ok(sig.confidence >= 0 && sig.confidence <= 1);
    for (const [name, c] of Object.entries(sig.components)) {
      assert.ok(c.score === null || Number.isFinite(c.score), `${name} is ${c.score}`);
    }
  }
});
