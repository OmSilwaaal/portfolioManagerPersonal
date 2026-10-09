// Bucket arithmetic for the live candle stream (web/src/api/candleMerge.mjs).
//
// The module lives on the web side because that is where the merge happens — the stream
// pushes one bucket and the browser folds it into the RTK Query cache — but it is pure and
// dependency-free, so it is tested here where the test runner is. A duplicated or
// out-of-order bucket corrupts the chart permanently, which is why this has its own file.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const MODULE = pathToFileURL(path.join(__dirname, '../../web/src/api/candleMerge.mjs')).href;
let M;
test.before(async () => { M = await import(MODULE); });

const c = (time, close, over = {}) => ({ time, open: close, high: close, low: close, close, volume: 1, ...over });

test('bucketStart snaps to the floor of the timeframe', () => {
  const { bucketStart } = M;
  assert.strictEqual(bucketStart(0, '5m'), 0);
  assert.strictEqual(bucketStart(299, '5m'), 0);
  assert.strictEqual(bucketStart(300, '5m'), 300);
  assert.strictEqual(bucketStart(301, '5m'), 300);
  assert.strictEqual(bucketStart(599, '5m'), 300);
  assert.strictEqual(bucketStart(1_700_000_123, '1m'), 1_700_000_100);
  assert.strictEqual(bucketStart(1_700_000_123, '15m'), 1_700_000_100);
  assert.strictEqual(bucketStart(1_700_000_123, '1h'), 1_699_999_200);
});

test('bucketStart rejects an unknown timeframe or a non-number', () => {
  const { bucketStart } = M;
  assert.strictEqual(bucketStart(300, '7m'), null);
  assert.strictEqual(bucketStart(300, undefined), null);
  assert.strictEqual(bucketStart(NaN, '5m'), null);
  assert.strictEqual(bucketStart('300', '5m'), null);
});

test('bucketStart floors rather than truncates, so no two buckets can collide', () => {
  // Math.trunc(-1/300)*300 === 0, the same bucket as t=0.
  assert.strictEqual(M.bucketStart(-1, '5m'), -300);
  assert.strictEqual(M.bucketStart(-300, '5m'), -300);
});

test('an incoming candle is snapped to its bucket before anything else', () => {
  const merged = M.mergeCandle([], c(1_700_000_123, 5), '5m');
  assert.strictEqual(merged[0].time, 1_700_000_100);
  assert.strictEqual(merged[0].time % 300, 0);
});

test('the same bucket updates in place and never duplicates', () => {
  const list = [c(0, 1), c(300, 2)];
  const next = M.mergeCandle(list, c(301, 9, { high: 11, low: 1, volume: 7 }), '5m');
  assert.strictEqual(next.length, 2);
  assert.deepStrictEqual(next.map((x) => x.time), [0, 300]);
  assert.strictEqual(next[1].close, 9);
  assert.strictEqual(next[1].high, 11);
  assert.strictEqual(next[1].volume, 7);
  assert.notStrictEqual(next, list, 'a change must produce a new array');
});

test('a new bucket appends, keeping the series ascending', () => {
  const list = [c(0, 1), c(300, 2)];
  const next = M.mergeCandle(list, c(600, 3), '5m');
  assert.deepStrictEqual(next.map((x) => x.time), [0, 300, 600]);
});

test('a gap is left as a gap, never backfilled', () => {
  const next = M.mergeCandle([c(0, 1)], c(1800, 2), '5m');
  assert.deepStrictEqual(next.map((x) => x.time), [0, 1800]);
});

test('an unchanged candle returns the very same array, so nothing re-renders', () => {
  const list = [c(0, 1), c(300, 2)];
  assert.strictEqual(M.mergeCandle(list, c(300, 2), '5m'), list);
  assert.strictEqual(M.mergeCandle(list, c(305, 2), '5m'), list, 'same bucket, same values');
});

test('a malformed candle is dropped and the list is untouched', () => {
  const list = [c(0, 1)];
  for (const bad of [null, undefined, {}, { time: 300 }, c(NaN, 1), c(300, NaN), 'nope']) {
    assert.strictEqual(M.mergeCandle(list, bad, '5m'), list);
  }
  assert.strictEqual(M.mergeCandle(list, c(300, 1), 'nope'), list, 'unknown timeframe');
});

test('an older bucket we already hold is corrected in place; one we do not is dropped', () => {
  const list = [c(0, 1), c(300, 2), c(600, 3)];
  const fixed = M.mergeCandle(list, c(310, 99), '5m');
  assert.deepStrictEqual(fixed.map((x) => x.time), [0, 300, 600]);
  assert.strictEqual(fixed[1].close, 99);
  assert.strictEqual(fixed[2].close, 3, 'the newest bucket is untouched');
  assert.strictEqual(M.mergeCandle(list, c(-600, 5), '5m'), list, 'before the window: dropped');
});

test('a high below the body is repaired rather than trusted', () => {
  // Upstream does this on a bucket that is still open; a chart library will reject it.
  const [x] = M.mergeCandle([], { time: 300, open: 2, high: 1, low: 3, close: 4, volume: 0 }, '5m');
  assert.strictEqual(x.high, 4);
  assert.strictEqual(x.low, 2);
});

test('a missing volume becomes zero rather than NaN', () => {
  const [x] = M.mergeCandle([], { time: 300, open: 1, high: 1, low: 1, close: 1 }, '5m');
  assert.strictEqual(x.volume, 0);
});

test('the series is capped, dropping from the front', () => {
  let list = [];
  for (let i = 0; i < M.MAX_CANDLES + 50; i++) list = M.mergeCandle(list, c(i * 300, i + 1), '5m');
  assert.strictEqual(list.length, M.MAX_CANDLES);
  assert.strictEqual(list[list.length - 1].time, (M.MAX_CANDLES + 49) * 300);
  for (let i = 1; i < list.length; i++) assert.ok(list[i].time > list[i - 1].time, 'still strictly ascending');
});

test('mergeCandles sorts a shuffled batch and still never duplicates or reorders', () => {
  const batch = [c(900, 4), c(300, 2), c(905, 5), c(600, 3), c(0, 1)];
  const next = M.mergeCandles([], batch, '5m');
  assert.deepStrictEqual(next.map((x) => x.time), [0, 300, 600, 900]);
  assert.strictEqual(next[3].close, 5, 'the later observation of bucket 900 wins');
  assert.strictEqual(M.mergeCandles([c(0, 1)], [], '5m').length, 1);
});

test('every timeframe has a bucket length and they are all exact multiples of a minute', () => {
  for (const [tf, secs] of Object.entries(M.TF_SECONDS)) {
    assert.strictEqual(secs % 60, 0, tf);
    assert.strictEqual(M.bucketStart(secs * 3 + 1, tf), secs * 3);
  }
});
