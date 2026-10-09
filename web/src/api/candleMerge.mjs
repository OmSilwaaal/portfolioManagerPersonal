// Bucket arithmetic for the live candle stream. Pure, dependency-free and shared with
// the backend's unit tests (hence .mjs: the test runner imports it directly).
//
// A duplicated or out-of-order bucket corrupts the chart permanently — lightweight-charts
// expects strictly ascending, unique times — so every incoming candle is snapped to its
// bucket boundary first and then either replaces an existing bucket or extends the series.
// Nothing is ever inserted in the middle.

export const TF_SECONDS = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600 }

export const MAX_CANDLES = 600 // a long session must not grow the array without bound

const isNum = (v) => typeof v === 'number' && Number.isFinite(v)

/** Start-of-bucket in seconds for a timestamp in seconds. Null for an unknown timeframe. */
export function bucketStart(timeSec, tf) {
  const step = TF_SECONDS[tf]
  if (!step || !isNum(timeSec)) return null
  // Math.floor, not trunc: pre-epoch times would round the wrong way, and a negative
  // bucket is still better than one that collides with its neighbour.
  return Math.floor(timeSec / step) * step
}

/** The bucket a candle belongs to, snapped and validated; null when it is unusable. */
export function alignCandle(candle, tf) {
  if (!candle || typeof candle !== 'object') return null
  const time = bucketStart(Number(candle.time), tf)
  if (time === null) return null
  const open = Number(candle.open)
  const high = Number(candle.high)
  const low = Number(candle.low)
  const close = Number(candle.close)
  if (![open, high, low, close].every(isNum)) return null
  const volume = isNum(Number(candle.volume)) ? Number(candle.volume) : 0
  // Upstream occasionally reports a high below the body on a bucket that is still open.
  return { time, open, high: Math.max(high, open, close), low: Math.min(low, open, close), close, volume }
}

/**
 * Merge one candle into an ascending candle list.
 *  - same bucket as the newest  -> replaces it in place (the in-progress candle)
 *  - newer bucket               -> appended (gaps are left as gaps, never filled)
 *  - an older bucket that exists -> replaced in place
 *  - an older bucket that does not exist -> dropped
 * Returns the original array reference when nothing changed.
 */
export function mergeCandle(list, candle, tf) {
  const base = Array.isArray(list) ? list : []
  const c = alignCandle(candle, tf)
  if (!c) return list

  if (base.length === 0) return [c]

  const last = base[base.length - 1]
  if (!isNum(last?.time)) return list

  if (c.time === last.time) {
    if (last.open === c.open && last.high === c.high && last.low === c.low
      && last.close === c.close && last.volume === c.volume) return list
    const next = base.slice()
    next[next.length - 1] = c
    return next
  }

  if (c.time > last.time) {
    const next = base.slice()
    next.push(c)
    return next.length > MAX_CANDLES ? next.slice(next.length - MAX_CANDLES) : next
  }

  // Late arrival. Only a bucket we already hold can be corrected; anything else would
  // have to be spliced into the middle, and a stray old bucket is not worth that risk.
  const i = base.findIndex((x) => x && x.time === c.time)
  if (i < 0) return list
  const next = base.slice()
  next[i] = c
  return next
}

/** mergeCandle over a batch, oldest first. */
export function mergeCandles(list, candles, tf) {
  if (!Array.isArray(candles) || candles.length === 0) return list
  const sorted = candles
    .map((c) => alignCandle(c, tf))
    .filter(Boolean)
    .sort((a, b) => a.time - b.time)
  let out = list
  for (const c of sorted) out = mergeCandle(out, c, tf)
  return out
}
