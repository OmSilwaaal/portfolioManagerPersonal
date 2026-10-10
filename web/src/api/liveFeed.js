/* ─── One server-sent-events connection per tab, written straight into the RTK Query cache ──
 *
 * Why not just poll faster: /api allows 60 requests per minute per IP and one open terminal
 * already spends ~26 of them. Shortening the intervals trips the limiter, and noteRateLimit
 * then pauses EVERY poller for 15-120s — the naive "make it faster" change makes the product
 * markedly slower. One held-open connection replaces all of them: request count goes down
 * while freshness goes up.
 *
 * Nothing in the terminal has to know this exists. Events are folded into the caches the
 * components already read (token detail, candles, trades, signal, the lists), so they
 * re-render exactly as they do from a poll. The only other visible effect is usePoll, which
 * stretches its interval while the stream is healthy — see LIVE_FACTOR in memecoinApi.
 *
 * It is an accelerator, never a dependency. If EventSource is missing, the endpoint is
 * blocked, or the server is down, every poller keeps running at today's interval and the
 * terminal behaves exactly as it did before. */
import { API_BASE } from './baseApi'
import { memecoinApi, normToken, normTokens, normTrades, liveMarketCap } from './memecoinApi'
import { mergeCandle, isLiveOnlyTf } from './candleMerge.mjs'
import { createFormingCandles } from './liveCandle.mjs'

const SUPPORTED = typeof window !== 'undefined' && typeof window.EventSource === 'function'

const BACKOFF_MIN = 1_000
const BACKOFF_MAX = 60_000
// Consecutive failed attempts before we stop trying for now. A tab that comes back into the
// foreground is given another chance, so a transient outage does not disable the stream for
// the rest of the session — but a blocked endpoint is not hammered either.
const MAX_ATTEMPTS = 6
// A connection counts as live while traffic (data or heartbeat) is current. The server sends
// a heartbeat every ~20s, so silence past this means the stream is not actually working,
// whatever the readyState claims, and polling must go back to full rate.
const STALE_MS = 55_000
const REOPEN_DEBOUNCE_MS = 300
const KEEP_EVENTS = 30

/* The server accepts four addresses per stream and silently drops the rest (parseAddresses in
 * memecoinStream takes the first four it can parse and returns). The count is not the problem —
 * the terminal only ever looks at one token at a time — the ORDER was: a cache entry outlives
 * its subscription by RTK Query's keepUnusedDataFor (60s), so browsing five coins inside a minute
 * left five addresses registered here, and sending them oldest-first handed the server four coins
 * the user had already left and dropped the one they were looking at. No price ticks, no candle
 * pushes: a chart that never propagates until a minute of idling frees a slot.
 *
 * So the active token leads. Capping here as well as there keeps the URL honest about what the
 * connection actually carries. */
const STREAM_MAX_ADDRESSES = 4

const state = {
  es: null,
  refs: new Map(),      // token address -> number of cache entries interested
  order: [],            // addresses, most recently requested FIRST — what the server is sent
  listRefs: 0,
  tfs: [],              // most recently requested timeframe last
  dispatch: null,
  attempts: 0,
  gaveUp: false,
  lastTraffic: 0,
  openedFor: '',        // the query string the current connection was opened with
  reopenTimer: null,
  retryTimer: null,
  staleTimer: null,
  launches: [],
  volatility: [],
  ticks: new Map(),     // address -> { at, seq, recent[] }: the evidence behind the liveness pill
  listeners: new Set(),
  tickListeners: new Set(),
}

const notify = () => { for (const l of state.listeners) l() }

/* ─── per-token tick recency ────────────────────────────────────────────────
 * "Is anything happening" is a question about one token, and the only honest answer is when its
 * last price tick arrived. isLive() below answers a different question — whether the connection
 * is up — and the two differ in exactly the case that matters: a healthy stream watching a coin
 * nobody is trading. One says live, the other says nothing has moved for 40s, and the user needs
 * to be told the second one.
 *
 * Deliberately NOT routed through notify(): that set is read by every usePoll() in the terminal,
 * and waking all of them four times a second to redraw a timer would cost more than the feature. */
const TICK_WINDOW_MS = 10_000
const TICK_KEEP = 64 // enough to measure a rate over the window; a hot token writes ~40 in it

function noteTick(address, at) {
  const t = state.ticks.get(address) || { at: 0, seq: 0, recent: [] }
  t.at = at
  t.seq += 1
  t.recent.push(at)
  if (t.recent.length > TICK_KEEP) t.recent.splice(0, t.recent.length - TICK_KEEP)
  state.ticks.set(address, t)
  for (const l of state.tickListeners) l()
}

export function subscribeTicks(l) { state.tickListeners.add(l); return () => state.tickListeners.delete(l) }

/** Ticks seen for a token so far. A number, so it is a usable useSyncExternalStore snapshot. */
export function tickSeq(address) { return state.ticks.get(address)?.seq ?? 0 }

/** When the last price tick for a token arrived, or 0 if none ever has. */
export function lastTickAt(address) { return state.ticks.get(address)?.at ?? 0 }

/** Observed ticks per second over the last few seconds, or null without enough to measure. */
export function tickRate(address) {
  const recent = state.ticks.get(address)?.recent
  if (!recent?.length) return null
  const since = Date.now() - TICK_WINDOW_MS
  let n = 0
  for (let i = recent.length - 1; i >= 0 && recent[i] >= since; i -= 1) n += 1
  return n < 2 ? null : n / (TICK_WINDOW_MS / 1000)
}

// The newest bucket of the chart, built from the price stream rather than waited for. See
// liveCandle.mjs for the precedence rule between this and the aggregator's own candles.
const candles = createFormingCandles()

/* ─── liveness, as an external store ────────────────────────────────────────
 * These are function DECLARATIONS on purpose. memecoinApi imports this module and this
 * module imports memecoinApi, and memecoinApi calls liveUpdates while it is still being
 * evaluated — a `const` arrow would be in its temporal dead zone whichever module the
 * bundler happens to evaluate first. Hoisted declarations are already initialised. */
export function isLive() {
  return Boolean(state.es) && state.es.readyState === 1 && Date.now() - state.lastTraffic < STALE_MS
}
export function subscribeLive(l) { state.listeners.add(l); return () => state.listeners.delete(l) }
export function liveLaunches() { return state.launches }
export function liveVolatility() { return state.volatility }

/**
 * A freshly fetched series, with the bucket we are building live put back on the end. Called
 * from getMemecoinOhlcv's queryFn: upstream answers with whatever it had indexed, and without
 * this the chart would rewind to it on every poll. Closed buckets are returned untouched.
 */
export function applyLiveCandles({ address, tf } = {}, series) {
  if (!Array.isArray(series) || !address || !tf) return series
  const last = series[series.length - 1] ?? null
  const c = candles.live(address, tf, last)
  return c ? mergeCandle(series, c, tf) : series
}

function markTraffic() {
  const wasLive = isLive()
  state.lastTraffic = Date.now()
  clearTimeout(state.staleTimer)
  // Announce the transition back to "not live" the moment it happens rather than waiting for
  // some unrelated render, or pollers would stay stretched against a dead stream.
  state.staleTimer = setTimeout(notify, STALE_MS + 100)
  if (!wasLive) notify()
}

/* ─── cache writes ────────────────────────────────────────────────────────── */

const patch = (endpoint, arg, recipe) => {
  if (!state.dispatch) return
  try {
    state.dispatch(memecoinApi.util.updateQueryData(endpoint, arg, recipe))
  } catch { /* an endpoint with no cache entry is a no-op, not a problem */ }
}

// How long a launch keeps its place in the "new pairs" list on our word alone, before the
// upstream list is expected to have indexed the pool and becomes the only source.
const LAUNCH_GRACE_MS = 3 * 60_000

const launchRow = (l) => normToken({ ...l, pair: { created_at: l.ts } })

function withRecentLaunches(tokens) {
  const now = Date.now()
  const have = new Set(tokens.map((t) => t?.address))
  const extra = state.launches
    .filter((l) => now - l.ts < LAUNCH_GRACE_MS && !have.has(l.address))
    .map(launchRow)
  return extra.length ? [...extra, ...tokens] : tokens
}

const HANDLERS = {
  token(t) {
    if (!t?.address) return
    patch('getMemecoin', t.address, () => normToken(t))
  },

  // A price read off the chain, arriving between detail ticks. Merged into the record already
  // in the cache rather than replacing it: everything else in a token row still comes from the
  // aggregator, and only the price is fresher than it.
  price(tick = {}) {
    const { address, price } = tick
    if (!address || typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return
    noteTick(address, Date.now())
    patch('getMemecoin', address, (draft) => {
      if (!draft || typeof draft !== 'object') return
      draft.price = price
      // Market cap moves with the price and nothing else, so it has no reason to lag behind it.
      // Only when a snapshot has pinned the supply: a coin the aggregator has never priced has
      // no cap to compute, and guessing one would be worse than the "--" the header already shows.
      const cap = liveMarketCap(address, price)
      if (cap !== null) {
        draft.marketCap = cap
        draft.marketCapLive = true
      }
    })
    // The same tick drives the bucket still forming on the chart, for every timeframe this tab
    // is showing. Closed buckets are left to the aggregator.
    for (const tf of state.tfs) {
      if (!candles.onPrice(address, tf, tick)) continue
      patch('getMemecoinOhlcv', { address, tf }, (draft) => {
        const last = Array.isArray(draft) ? draft[draft.length - 1] : null
        const c = candles.live(address, tf, last ?? null)
        return c ? mergeCandle(draft, c, tf) : draft
      })
    }
  },

  candle({ address, tf, candle } = {}) {
    if (!address || !tf || !candle) return
    // mergeCandle does the bucket arithmetic: the in-progress candle is replaced in place and
    // only a new bucket is appended, so the series can never duplicate or go out of order.
    // blend keeps the aggregator's version of a bucket we are building live from pulling the
    // close back to whatever it had indexed; a closed bucket passes straight through.
    patch('getMemecoinOhlcv', { address, tf }, (draft) => mergeCandle(draft, candles.blend(address, tf, candle), tf))
  },

  trades({ address, trades } = {}) {
    if (!address || !Array.isArray(trades)) return
    patch('getMemecoinTrades', address, () => normTrades(trades))
  },

  signal(sig) {
    if (!sig?.address) return
    patch('getMemecoinSignal', sig.address, () => sig)
  },

  list({ list, tokens } = {}) {
    if (!Array.isArray(tokens)) return
    const endpoint = list === 'trending' ? 'getTrendingMemecoins' : list === 'new' ? 'getNewMemecoins' : null
    if (!endpoint) return
    // The upstream "new pools" list lags a launch by up to a minute, so a replacement would
    // make a coin we have just shown vanish and come back. Carry the recent ones over.
    patch(endpoint, undefined, () => (list === 'new'
      ? withRecentLaunches(normTokens(tokens))
      : normTokens(tokens)))
  },

  launch(l) {
    if (!l?.address) return
    state.launches = [l, ...state.launches.filter((x) => x.address !== l.address)].slice(0, KEEP_EVENTS)
    // A launch has no market data yet; normToken fills the UI shape with nulls, which the
    // list row already renders as "--". Showing it a few seconds before the pool is indexed
    // is the whole point.
    patch('getNewMemecoins', undefined, (draft) => {
      if (!Array.isArray(draft)) return [launchRow(l)]
      if (draft.some((t) => t?.address === l.address)) return draft
      return [launchRow(l), ...draft]
    })
    notify()
  },

  volatility(a) {
    if (!a?.address) return
    state.volatility = [a, ...state.volatility].slice(0, KEEP_EVENTS)
    notify()
  },
}

/* ─── connection ──────────────────────────────────────────────────────────── */
function queryString() {
  const p = new URLSearchParams()
  for (const a of state.order.slice(0, STREAM_MAX_ADDRESSES)) p.append('address', a)
  // Only a timeframe the server can serve candles for. A sub-minute chart is built entirely from
  // price ticks, which are addressed per token and not per timeframe, so naming 1s here would
  // change the query string — tearing down and reopening the very stream that feeds it — to ask
  // for a series the server would answer by falling back to 5m and fetching it from the
  // aggregator. Switching to 1s now leaves the connection alone.
  const tf = state.tfs.filter((x) => !isLiveOnlyTf(x)).pop()
  if (tf) p.set('tf', tf)
  if (!state.listRefs) p.set('lists', '0')
  return p.toString()
}

function close() {
  clearTimeout(state.retryTimer)
  clearTimeout(state.staleTimer)
  state.retryTimer = null
  if (state.es) {
    state.es.close()
    state.es = null
    state.openedFor = ''
    notify()
  }
}

function wanted() {
  return SUPPORTED && !state.gaveUp && (state.refs.size > 0 || state.listRefs > 0)
    && typeof document !== 'undefined' && !document.hidden
}

function open() {
  if (!wanted()) return
  const qs = queryString()
  if (state.es && state.openedFor === qs) return
  close()
  let es
  try {
    es = new EventSource(`${API_BASE}/memecoins/stream?${qs}`)
  } catch {
    state.gaveUp = true // the browser refuses the URL outright; polling carries on
    return
  }
  state.es = es
  state.openedFor = qs

  es.onopen = () => { state.attempts = 0; markTraffic() }
  es.onmessage = markTraffic // a heartbeat comment never lands here, but an unnamed event would
  for (const [name, handler] of Object.entries(HANDLERS)) {
    es.addEventListener(name, (ev) => {
      markTraffic()
      let payload
      try { payload = JSON.parse(ev.data) } catch { return }
      try { handler(payload) } catch { /* one malformed event must not kill the stream */ }
    })
  }
  es.addEventListener('hello', markTraffic)
  es.onerror = () => {
    // EventSource reconnects on its own with no backoff at all, so take the connection away
    // from it and schedule the retry ourselves.
    close()
    if (!wanted()) return
    state.attempts += 1
    if (state.attempts >= MAX_ATTEMPTS) { state.gaveUp = true; notify(); return }
    const capped = Math.min(BACKOFF_MAX, BACKOFF_MIN * 2 ** (state.attempts - 1))
    const jittered = capped * (0.5 + Math.random() * 0.5) // spread reconnects so a restart is not stampeded
    state.retryTimer = setTimeout(open, jittered)
  }
}

/** Coalesce the burst of attach/detach calls a single token selection produces into one reopen. */
function scheduleOpen() {
  clearTimeout(state.reopenTimer)
  state.reopenTimer = setTimeout(() => {
    state.reopenTimer = null
    if (wanted()) open(); else close()
  }, REOPEN_DEBOUNCE_MS)
}

if (SUPPORTED && typeof document !== 'undefined') {
  // Matching usePoll: a backgrounded tab costs nothing, and coming back is a second chance
  // after we have given up.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { close(); return }
    state.attempts = 0
    state.gaveUp = false
    scheduleOpen()
  })
}

/**
 * Register interest in live data. Called from the endpoints' onCacheEntryAdded, so the
 * reference count is the number of live cache entries — one connection per tab, shared,
 * never one per component. Returns the matching detach.
 */
export function attachLive({ address, tf, lists, dispatch } = {}) {
  if (!SUPPORTED) return () => {}
  if (dispatch) state.dispatch = dispatch
  if (address) {
    state.refs.set(address, (state.refs.get(address) || 0) + 1)
    // Re-asked for, so it is the live one again even if it was registered long ago.
    state.order = [address, ...state.order.filter((a) => a !== address)]
  }
  if (lists) state.listRefs += 1
  if (tf) state.tfs = [...state.tfs.filter((x) => x !== tf), tf]
  scheduleOpen()

  let released = false
  return () => {
    if (released) return
    released = true
    if (address) {
      const n = (state.refs.get(address) || 1) - 1
      if (n > 0) state.refs.set(address, n)
      else {
        state.refs.delete(address)
        state.order = state.order.filter((a) => a !== address)
        state.ticks.delete(address)
        candles.forget(address)
      }
    }
    if (lists) state.listRefs = Math.max(0, state.listRefs - 1)
    if (tf) state.tfs = state.tfs.filter((x) => x !== tf)
    scheduleOpen()
  }
}

/**
 * onCacheEntryAdded for an endpoint the stream feeds. The lifecycle gives us the cache
 * entry's whole lifetime for free: added -> attach, removed -> detach.
 */
export function liveUpdates(pick) {
  return async (arg, { dispatch, cacheEntryRemoved }) => {
    const detach = attachLive({ ...pick(arg), dispatch })
    try { await cacheEntryRemoved } finally { detach() }
  }
}

/** Debug view of the connection, for the console. */
export function __liveState() {
  return {
    supported: SUPPORTED,
    addresses: [...state.refs.keys()],
    sent: state.order.slice(0, STREAM_MAX_ADDRESSES),
    tfs: [...state.tfs],
    query: queryString(),
    listRefs: state.listRefs,
    tf: state.tfs[state.tfs.length - 1] || null,
    attempts: state.attempts,
    gaveUp: state.gaveUp,
    live: isLive(),
  }
}
