// The newest candle, built from the live price stream instead of waited for.
//
// Why: closed buckets come from GeckoTerminal and are authoritative, but the bucket still
// forming is the slowest thing on the chart — a 10/20s TTL, a 10s stream tick and
// GeckoTerminal's own indexing lag, all stacked. Every one of those only delays the bucket
// that is still moving. A sub-second price tick is enough to build that bucket ourselves.
//
// Precedence, and it is the whole design:
//   - a bucket whose window has passed is authoritative upstream data and live data never
//     touches it again — history is never synthesised and never rewritten
//   - the bucket still forming takes close/high/low from the live stream, which is ahead by
//     construction, and open/volume from whichever source is further along
// Both of those only ever move forward, so the chart cannot rewind or flicker between the
// two sources.
//
// Pure and dependency-free (hence .mjs) so the backend test runner can import it directly.

import { bucketStart, TF_SECONDS } from './candleMerge.mjs'

const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
const pos = (v) => (isNum(v) && v > 0 ? v : null)

// Addresses the terminal has shown in one session, times the timeframes it has shown them in.
const MAX_KEYS = 40

/**
 * opts.now — clock, for tests.
 *
 * onPrice(address, tf, tick) folds a live price into the forming bucket and returns true when
 * it is worth re-merging. Then live() reads our candle out for the price path, and blend() puts
 * an authoritative candle in on its way to the series; both take whatever the series already
 * holds for the bucket, so upstream's open and volume are never lost.
 */
export function createFormingCandles(opts = {}) {
  const now = opts.now || (() => Date.now())
  const max = opts.max ?? MAX_KEYS
  const forming = new Map()
  const keyOf = (address, tf) => `${address}|${tf}`

  /** The bucket the local clock is in. Null for an unknown timeframe. */
  const currentBucket = (tf) => bucketStart(Math.floor(now() / 1000), tf)

  /**
   * tick: { price, high, low, volumeUsd, ts } — high/low are the extremes seen since the last
   * tick (the feed coalesces several writes into one), volumeUsd that window's traded size, and
   * ts the server's clock, which is the one upstream's buckets are cut on.
   */
  function onPrice(address, tf, tick = {}) {
    const price = pos(Number(tick.price))
    if (!address || price === null) return false
    const at = isNum(Number(tick.ts)) ? Number(tick.ts) : now()
    const time = bucketStart(Math.floor(at / 1000), tf)
    if (time === null) return false

    const k = keyOf(address, tf)
    let f = forming.get(k)
    if (!f || f.time !== time) {
      if (f && time < f.time) return false // a tick older than the bucket we are already on
      // Crossing into a new bucket closes the old one — by never looking at it again — and
      // opens the new one at the current price rather than waiting to be told it exists.
      f = { time, open: price, high: price, low: price, close: price, authOpen: null, base: 0, accum: 0 }
      if (forming.size >= max) {
        // Insertion order is oldest-first, so the oldest key is the right one to forget.
        forming.delete(forming.keys().next().value)
      }
      forming.set(k, f)
    }
    f.high = Math.max(f.high, pos(Number(tick.high)) ?? price)
    f.low = Math.min(f.low, pos(Number(tick.low)) ?? price)
    f.close = price
    const vol = Number(tick.volumeUsd)
    if (isNum(vol) && vol > 0) f.accum += vol
    return true
  }

  /** The forming candle, with an authoritative view of the same bucket folded in. */
  function snapshot(f, auth) {
    if (auth) {
      // Upstream saw the start of the bucket and we may not have, so its open wins. Within one
      // bucket upstream's open does not change, so this settles once and cannot flicker.
      if (isNum(Number(auth.open))) f.authOpen = Number(auth.open)
      if (pos(Number(auth.high)) !== null) f.high = Math.max(f.high, Number(auth.high))
      if (pos(Number(auth.low)) !== null) f.low = Math.min(f.low, Number(auth.low))
      // Volume comes from the curve's reserve deltas, which measured within a percent of
      // GeckoTerminal's own trade feed over the same window but can undercount when several
      // swaps land in one slot and collapse into a single notification. Raise the floor to
      // upstream's figure when it is the bigger of the two and keep adding our own on top, so
      // the bar grows live and can never drop back.
      const av = Number(auth.volume)
      if (isNum(av) && av > f.base + f.accum) f.base = av - f.accum
    }
    return {
      time: f.time,
      open: f.authOpen ?? f.open,
      high: f.high,
      low: f.low,
      close: f.close,
      volume: f.base + f.accum,
    }
  }

  /**
   * Our own candle for the bucket being formed right now, or null when there is not one.
   * `auth` is whatever the series already holds for that bucket, so upstream's open and volume
   * are not lost; a candle for any other bucket is ignored rather than returned, or a series
   * upstream has not rolled over yet would keep handing back its last closed bucket and ours
   * would never be appended.
   */
  function live(address, tf, auth) {
    const f = forming.get(keyOf(address, tf))
    if (!f || f.time !== currentBucket(tf)) return null
    const sameBucket = auth && bucketStart(Number(auth.time), tf) === f.time
    return snapshot(f, sameBucket ? auth : null)
  }

  /**
   * An authoritative candle, on its way into the series. Returned untouched unless it is the
   * bucket we are forming live, which the live close/high/low own while it is open. A bucket
   * whose window has passed is upstream's outright and is never rewritten from live data.
   */
  function blend(address, tf, auth) {
    const f = forming.get(keyOf(address, tf))
    if (!f || f.time !== currentBucket(tf)) return auth ?? null
    if (auth && bucketStart(Number(auth.time), tf) !== f.time) return auth
    return snapshot(f, auth)
  }

  /** Called when the terminal stops showing a token: its buckets are no longer anyone's business. */
  function forget(address) {
    for (const tf of Object.keys(TF_SECONDS)) forming.delete(keyOf(address, tf))
  }

  return { onPrice, live, blend, forget, size: () => forming.size }
}
