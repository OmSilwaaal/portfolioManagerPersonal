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
const LIVE_MODULE = pathToFileURL(path.join(__dirname, '../../web/src/api/liveCandle.mjs')).href;
let M;
let L;
test.before(async () => { M = await import(MODULE); L = await import(LIVE_MODULE); });

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

// ── the forming candle, built from the live price stream (web/src/api/liveCandle.mjs) ──────
//
// The rules worth holding onto:
//   - only the bucket still forming is live; a closed bucket is the aggregator's and is never
//     rewritten or synthesised
//   - the live close/high/low win while the bucket is open, because they are ahead by definition
//   - the aggregator's open and volume are folded in, stickily, so nothing flickers
//   - volume only ever grows inside a bucket
//   - an unchanged tick still merges to the very same array reference, which is what keeps the
//     chart on its incremental render path
const ADDR = 'So11111111111111111111111111111111111111112';
// A bucket boundary for every timeframe at once (1_699_999_200 % 3600 === 0), so a fixture's
// arithmetic is readable rather than lucky.
const BASE = 1_699_999_200;

/** A store with a clock we control. t is in seconds. */
function live(startSec = BASE) {
  let nowSec = startSec;
  const store = L.createFormingCandles({ now: () => nowSec * 1000 });
  return {
    store,
    at: (sec) => { nowSec = sec; },
    tick(over = {}) {
      return store.onPrice(ADDR, over.tf || '1m', { ts: nowSec * 1000, ...over });
    },
  };
}

test('the forming bucket opens at the first live price and tracks the latest', () => {
  const h = live(BASE + 30); // 30s into the 1m bucket at 1_700_000_000
  assert.strictEqual(h.tick({ price: 10 }), true);
  let c = h.store.blend(ADDR, '1m', null);
  assert.strictEqual(c.time, BASE, 'snapped to the bucket, not the tick');
  assert.deepStrictEqual([c.open, c.high, c.low, c.close], [10, 10, 10, 10]);

  h.at(BASE + 40);
  h.tick({ price: 12, high: 15, low: 9 });
  h.at(BASE + 50);
  h.tick({ price: 11 });
  c = h.store.blend(ADDR, '1m', null);
  assert.strictEqual(c.open, 10, 'the open does not move');
  assert.strictEqual(c.high, 15, 'the extremes include the ones between frames');
  assert.strictEqual(c.low, 9);
  assert.strictEqual(c.close, 11, 'the close is the newest price');
});

test('volume accumulates across the bucket from the ticks\' own sizes', () => {
  const h = live();
  h.tick({ price: 1, volumeUsd: 250 });
  h.tick({ price: 1.1, volumeUsd: 100 });
  h.tick({ price: 1.1, volumeUsd: 0 });
  h.tick({ price: 1.1, volumeUsd: -5 }); // nonsense is ignored rather than subtracted
  assert.strictEqual(h.store.blend(ADDR, '1m', null).volume, 350);
});

test('crossing into a new bucket opens a new candle and leaves the old one alone', () => {
  const h = live(BASE + 30);
  h.tick({ price: 10, volumeUsd: 500 });
  const closed = h.store.blend(ADDR, '1m', null);

  h.at(BASE + 61); // one second into the next bucket
  h.tick({ price: 20 });
  const open = h.store.blend(ADDR, '1m', null);
  assert.strictEqual(open.time, closed.time + 60);
  assert.deepStrictEqual([open.open, open.close], [20, 20], 'opened at the current price');
  assert.strictEqual(open.volume, 0, 'and with its own volume');

  // The bucket that just closed is the aggregator's now: its candle comes back untouched.
  const auth = { time: closed.time, open: 1, high: 2, low: 0.5, close: 1.5, volume: 9 };
  assert.strictEqual(h.store.blend(ADDR, '1m', auth), auth);
});

test('a tick for a bucket older than the one we are on is ignored', () => {
  const h = live(BASE + 70);
  h.tick({ price: 20 });
  assert.strictEqual(h.store.onPrice(ADDR, '1m', { price: 5, ts: (BASE + 10) * 1000 }), false);
  assert.strictEqual(h.store.blend(ADDR, '1m', null).close, 20);
});

test('the aggregator\'s open and extremes are folded into the live bucket, and stay', () => {
  const h = live(BASE + 30);
  h.tick({ price: 10 });
  const auth = { time: BASE, open: 7, high: 11, low: 6, close: 9, volume: 400 };
  let c = h.store.blend(ADDR, '1m', auth);
  assert.strictEqual(c.open, 7, 'upstream saw the start of the bucket; we did not');
  assert.strictEqual(c.high, 11);
  assert.strictEqual(c.low, 6);
  assert.strictEqual(c.close, 10, 'but the close is ours, because it is newer');
  assert.strictEqual(c.volume, 400, 'and volume cannot be below what upstream reports');

  // Upstream's view is not carried over to the next tick in any way that could move it back.
  h.at(BASE + 40);
  h.tick({ price: 12, volumeUsd: 50 });
  c = h.store.blend(ADDR, '1m', null);
  assert.strictEqual(c.open, 7, 'sticky: the body does not flicker between the two sources');
  assert.strictEqual(c.close, 12);
  assert.strictEqual(c.volume, 450, 'our own size is added on top of upstream\'s figure');
});

test('volume inside a bucket only ever grows, whichever source speaks', () => {
  const h = live(BASE + 30);
  const auth = (volume) => ({ time: BASE, open: 10, high: 10, low: 10, close: 10, volume });
  const vol = (v) => h.store.blend(ADDR, '1m', auth(v)).volume;
  h.tick({ price: 10, volumeUsd: 100 });
  assert.strictEqual(vol(0), 100, 'ours, while upstream has nothing');
  assert.strictEqual(vol(900), 900, 'raised to upstream when upstream is further along');
  assert.strictEqual(vol(0), 900, 'and a smaller figure cannot pull it back');
  h.tick({ price: 11, volumeUsd: 50 });
  assert.strictEqual(vol(100), 950, 'our own size is added on top');
});

test('a forming candle whose bucket has closed hands it back to the aggregator', () => {
  const h = live(BASE + 30);
  h.tick({ price: 10 });
  h.at(BASE + 120); // two buckets on, and no live price since
  const auth = { time: BASE, open: 1, high: 2, low: 1, close: 2, volume: 5 };
  assert.strictEqual(h.store.blend(ADDR, '1m', auth), auth, 'authoritative, untouched');
  assert.strictEqual(h.store.blend(ADDR, '1m', null), null, 'and nothing of our own to say');
});

test('an unknown timeframe or a worthless price is not a candle', () => {
  const h = live();
  assert.strictEqual(h.tick({ price: 10, tf: '7m' }), false);
  assert.strictEqual(h.tick({ price: 0 }), false);
  assert.strictEqual(h.tick({ price: -1 }), false);
  assert.strictEqual(h.tick({ price: NaN }), false);
  assert.strictEqual(h.store.onPrice(null, '1m', { price: 1 }), false);
  assert.strictEqual(h.store.blend(ADDR, '1m', null), null);
});

test('each timeframe forms its own bucket from the same ticks', () => {
  const h = live(BASE + 1_000)
  for (const tf of ['1m', '5m', '15m', '1h']) h.tick({ price: 10, tf, volumeUsd: 10 });
  assert.strictEqual(h.store.blend(ADDR, '1m', null).time, BASE + 960);
  assert.strictEqual(h.store.blend(ADDR, '5m', null).time, BASE + 900);
  assert.strictEqual(h.store.blend(ADDR, '15m', null).time, BASE + 900);
  assert.strictEqual(h.store.blend(ADDR, '1h', null).time, BASE);
  assert.strictEqual(h.store.size(), 4);
  h.store.forget(ADDR);
  assert.strictEqual(h.store.size(), 0, 'and all four are dropped with the token');
});

test('a live candle merges incrementally: in place, or exactly one appended', () => {
  const h = live(BASE + 30);
  // Upstream history, with the forming bucket not yet indexed.
  const history = [
    { time: BASE - 120, open: 1, high: 1, low: 1, close: 1, volume: 1 },
    { time: BASE - 60, open: 1, high: 1, low: 1, close: 1, volume: 1 },
  ];
  h.tick({ price: 10, volumeUsd: 5 });
  const appended = M.mergeCandle(history, h.store.blend(ADDR, '1m', null), '1m');
  assert.strictEqual(appended.length, 3, 'exactly one bucket appended');
  assert.strictEqual(appended[0], history[0], 'earlier buckets keep their identity');
  assert.strictEqual(appended[1], history[1]);

  // An unchanged tick must merge to the very same array, or the chart leaves its fast path.
  h.at(BASE + 40);
  h.tick({ price: 10 });
  const again = M.mergeCandle(appended, h.store.blend(ADDR, '1m', null), '1m');
  assert.strictEqual(again, appended, 'a no-op merge returns the same reference');

  h.tick({ price: 11 });
  const moved = M.mergeCandle(appended, h.store.blend(ADDR, '1m', null), '1m');
  assert.notStrictEqual(moved, appended);
  assert.strictEqual(moved.length, 3, 'still only the newest bucket changed');
  assert.strictEqual(moved[0], appended[0]);
  assert.strictEqual(moved[1], appended[1]);
  assert.strictEqual(moved[2].close, 11);
});

test('the store does not grow without bound as tokens come and go', () => {
  let nowSec = BASE;
  const store = L.createFormingCandles({ now: () => nowSec * 1000, max: 4 });
  for (let i = 0; i < 20; i++) store.onPrice(`addr${i}`, '1m', { price: 1, ts: nowSec * 1000 });
  assert.ok(store.size() <= 4, `size ${store.size()}`);
});

test('at a rollover our new bucket is appended, not replaced by the last closed one', () => {
  // The case that matters: upstream has not rolled over yet, so the newest candle in the series
  // is the bucket that just closed. Handing that back would mean our bucket never appears.
  const h = live(BASE + 30);
  h.tick({ price: 10, volumeUsd: 100 });
  const closed = { time: BASE, open: 9, high: 11, low: 9, close: 10, volume: 300 };
  const series = [closed];

  h.at(BASE + 61);
  h.tick({ price: 20, volumeUsd: 7 });
  const c = h.store.live(ADDR, '1m', series[series.length - 1]);
  assert.strictEqual(c.time, BASE + 60, 'our bucket, not the closed one');
  assert.strictEqual(c.open, 20);
  assert.strictEqual(c.volume, 7, 'and not the closed bucket\'s volume either');
  const next = M.mergeCandle(series, c, '1m');
  assert.deepStrictEqual(next.map((x) => x.time), [BASE, BASE + 60]);
  assert.strictEqual(next[0], closed, 'the closed bucket is untouched, object and all');
});

test('live folds in the series\' own version of the bucket it is forming', () => {
  const h = live(BASE + 30);
  h.tick({ price: 10, volumeUsd: 20 });
  // What the chart was loaded with: upstream's view of this very bucket, further along on both
  // open and volume.
  const auth = { time: BASE, open: 8, high: 9, low: 7, close: 9, volume: 500 };
  const c = h.store.live(ADDR, '1m', auth);
  assert.strictEqual(c.open, 8, 'upstream saw the start of the bucket');
  assert.strictEqual(c.close, 10, 'we have the newest price');
  assert.strictEqual(c.volume, 500, 'and the volume bar does not drop to ours');
  h.tick({ price: 11, volumeUsd: 30 });
  assert.strictEqual(h.store.live(ADDR, '1m', auth).volume, 530, 'then grows from there');
});

test('live has nothing to say once its bucket has closed', () => {
  const h = live(BASE + 30);
  h.tick({ price: 10 });
  h.at(BASE + 120);
  assert.strictEqual(h.store.live(ADDR, '1m', null), null);
  assert.strictEqual(h.store.live(ADDR, '7m', null), null, 'or for a timeframe we do not know');
});

// A coin whose pool no aggregator has indexed yet starts with no series at all: the chart is
// built from live ticks and nothing else. (This is applyLiveCandles in web/src/api/liveFeed,
// which is those same two lines around a series that happens to be empty.)
test('a token with no history anywhere grows a chart from live ticks alone', () => {
  const h = live(BASE + 10);
  let series = [];
  const apply = () => {
    const c = h.store.live(ADDR, '1m', series[series.length - 1] ?? null);
    series = c ? M.mergeCandle(series, c, '1m') : series;
  };

  apply();
  assert.deepStrictEqual(series, [], 'nothing live yet: still empty, not a fabricated candle');

  h.tick({ price: 10, volumeUsd: 40 });
  apply();
  assert.strictEqual(series.length, 1, 'seeded from empty by the first tick');
  assert.strictEqual(series[0].time, BASE);
  assert.strictEqual(series[0].volume, 40);

  const unchanged = series;
  apply();
  assert.strictEqual(series, unchanged, 'a re-merge with nothing new keeps the array reference');

  const first = series[0];
  h.at(BASE + 70);
  h.tick({ price: 12 });
  apply();
  assert.deepStrictEqual(series.map((c) => c.time), [BASE, BASE + 60], 'and grows forward only');
  assert.strictEqual(series[0], first, 'the bucket that closed keeps its identity');
});
