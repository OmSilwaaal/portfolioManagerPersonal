const test = require('node:test');
const assert = require('node:assert/strict');
const { computeSignal, CONFIG } = require('../src/services/signalScore');

const NOW = 1_800_000_000_000; // ms
const T0 = Math.floor(NOW / 1000 / 300) * 300; // aligned 5m bucket start

// 13 five-minute candles ending at the current bucket; last one customisable
function candles({ lastVol, lastMove = 0, baseVol = 1000, wiggle = 0.002 }) {
  const out = [];
  let p = 1;
  for (let i = 12; i >= 0; i--) {
    const open = p;
    const last = i === 0;
    p = last ? p * (1 + lastMove) : p * (1 + (i % 2 ? wiggle : -wiggle));
    out.push({ time: T0 - i * 300, open, high: Math.max(open, p), low: Math.min(open, p), close: p,
      volume: last ? lastVol : baseVol });
  }
  return out;
}

const baseToken = (o = {}) => ({
  price: 1, liquidity_usd: 200_000, volume_5m: 1000, volume_1h: 12_000,
  buys_5m: 10, sells_5m: 10, pair: { created_at: NOW - 24 * 3600_000 }, ...o,
});

test('quiet token scores low', () => {
  const s = computeSignal({ token: baseToken(), candles5m: candles({ lastVol: 1000 }), now: NOW });
  assert.ok(s.score < 25, `score ${s.score}`);
  assert.equal(s.level, 'QUIET');
  assert.equal(s.riskFlags.length, 0);
});

test('volume + price spike scores high', () => {
  const token = baseToken({ volume_5m: 12_000, buys_5m: 40, sells_5m: 5 });
  const s = computeSignal({ token, candles5m: candles({ lastVol: 12_000, lastMove: 0.2 }), now: NOW, prevLiquidityUsd: 100_000 });
  assert.ok(s.score >= 75, `score ${s.score}`);
  assert.equal(s.level, 'HOT');
  assert.ok(s.confidence > 0.8);
});

test('missing data lowers confidence and does not throw', () => {
  const full = computeSignal({ token: baseToken(), candles5m: candles({ lastVol: 1000 }), now: NOW, prevLiquidityUsd: 200_000 });
  const listOnly = computeSignal({ token: baseToken(), now: NOW });
  const empty = computeSignal({ now: NOW });
  const garbage = computeSignal({ token: { price: 'x', volume_5m: NaN }, candles5m: [null, {}], now: NOW });
  assert.ok(listOnly.confidence < full.confidence);
  assert.equal(empty.confidence, 0);
  assert.equal(empty.score, 0);
  assert.equal(garbage.confidence, 0);
  assert.equal(computeSignal().confidence, 0);
});

test('no look-ahead: future candles are ignored', () => {
  const past = candles({ lastVol: 1000 });
  const future = [{ time: T0 + 900, open: 1, high: 9, low: 1, close: 9, volume: 1e9 }];
  const a = computeSignal({ token: baseToken(), candles5m: past, now: NOW });
  const b = computeSignal({ token: baseToken(), candles5m: [...past, ...future], now: NOW });
  assert.deepEqual(a, b);
});

test('low-liquidity and very-new flags fire', () => {
  const token = baseToken({ liquidity_usd: CONFIG.risk.lowLiquidityUsd - 1, pair: { created_at: NOW - 10 * 60_000 } });
  const codes = computeSignal({ token, candles5m: candles({ lastVol: 1000 }), now: NOW }).riskFlags.map((f) => f.code);
  assert.ok(codes.includes('LOW_LIQUIDITY'));
  assert.ok(codes.includes('VERY_NEW'));
});

test('wash-trade hint fires when volume dwarfs liquidity', () => {
  const token = baseToken({ liquidity_usd: 30_000, volume_5m: 200_000, volume_1h: 900_000 });
  const codes = computeSignal({ token, candles5m: candles({ lastVol: 200_000 }), now: NOW }).riskFlags.map((f) => f.code);
  assert.ok(codes.includes('WASH_TRADE_HINT'));
});

test('spike with sell-heavy flow flagged', () => {
  const token = baseToken({ buys_5m: 5, sells_5m: 40 });
  const codes = computeSignal({ token, candles5m: candles({ lastVol: 5000, lastMove: 0.4 }), now: NOW }).riskFlags.map((f) => f.code);
  assert.ok(codes.includes('SPIKE_SELL_HEAVY'));
});

test('identical inputs give identical outputs', () => {
  const mk = () => computeSignal({ token: baseToken({ volume_5m: 5000 }), candles5m: candles({ lastVol: 5000, lastMove: 0.05 }), now: NOW });
  assert.deepEqual(mk(), mk());
  assert.equal(mk().featureVectorHash, mk().featureVectorHash);
});

test('components are 0-100 and score within bounds', () => {
  const s = computeSignal({ token: baseToken({ volume_5m: 1e9 }), candles5m: candles({ lastVol: 1e9, lastMove: 5 }), now: NOW });
  for (const c of Object.values(s.components)) if (c.score !== null) assert.ok(c.score >= 0 && c.score <= 100);
  assert.ok(s.score >= 0 && s.score <= 100);
});
