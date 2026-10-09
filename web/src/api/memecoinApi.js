import { useSyncExternalStore } from 'react'
import { baseApi } from './baseApi'
import { paperTradingApi } from './paperTradingApi'
import { liveUpdates, isLive, subscribeLive } from './liveFeed'
import {
  mockTrending, mockNew, mockSearch, mockTokenDetail, mockOhlcv, mockTrades, mockQuote,
} from './memecoinMock'

const USE_MOCK_ON_FAIL = import.meta.env.DEV

// Tag a payload so the UI can show a "mock data" badge (read via isMockData()).
function tagMock(data) {
  if (data && typeof data === 'object') {
    try { Object.defineProperty(data, '__mock', { value: true, enumerable: false }) } catch { /* frozen */ }
  }
  return data
}
export const isMockData = (data) => !!(data && data.__mock)

// Unwrap common envelope shapes: [..] | { tokens: [..] } | { data: [..] }
const unwrap = (d, key) => (Array.isArray(d) ? d : d?.[key] ?? d?.data ?? d)

/* ─── Backend shape -> UI shape ──────────────────────────────────────────────
 * The backend returns snake_case market data (mcap, liquidity_usd, change_24h, pair.created_at ...). The terminal
 * (and the dev mocks) use camelCase. Normalisers are idempotent: fields already in UI shape win. */
const pick = (...v) => v.find((x) => x !== undefined && x !== null) ?? null

export function normToken(t) {
  if (!t || typeof t !== 'object') return t
  const created = t.pair?.created_at
  return {
    ...t,
    marketCap: pick(t.marketCap, t.mcap, t.fdv),
    liquidity: pick(t.liquidity, t.liquidity_usd),
    volume24h: pick(t.volume24h, t.volume_24h),
    change5m: pick(t.change5m, t.change_5m),
    change1h: pick(t.change1h, t.change_1h),
    change24h: pick(t.change24h, t.change_24h),
    ageMinutes: pick(t.ageMinutes, created ? Math.max(0, (Date.now() - Number(created)) / 60000) : null),
    bondingProgress: pick(t.bondingProgress),
  }
}
export const normTokens = (list) => (Array.isArray(list) ? list.map(normToken) : list)

function normTrade(t, i) {
  if (!t || typeof t !== 'object') return t
  return {
    ...t,
    id: pick(t.id, t.tx, t.signature, `t${i}`),
    timestamp: pick(t.timestamp, t.time != null ? Number(t.time) * 1000 : null),
    amountUsd: pick(t.amountUsd, t.amount_usd),
    amountToken: pick(t.amountToken, t.token_amount),
    maker: pick(t.maker, t.wallet),
  }
}
export const normTrades = (list) => (Array.isArray(list) ? list.map(normTrade) : list)

/* ─── Rate-limit awareness (global /api limiter: 60 req/min per IP) ──────────
 * A 429 from any terminal request opens a backoff window (doubling on repeats, 15s..120s, honouring Retry-After).
 * While it is open every poller is paused (usePoll -> 0) and the UI can show a "slow down" banner. */
const MIN_BACKOFF = 15_000
const MAX_BACKOFF = 120_000
const rl = { until: 0, hits: 0, timer: null, listeners: new Set() }
const rlNotify = () => rl.listeners.forEach((l) => l())
const rlSubscribe = (l) => { rl.listeners.add(l); return () => rl.listeners.delete(l) }
const rlSnapshot = () => Date.now() < rl.until

export function noteRateLimit(res) {
  if (res?.error?.status !== 429) {
    if (res && !res.error && !rlSnapshot()) rl.hits = 0 // healthy again once the window has passed
    return
  }
  rl.hits = Math.min(rl.hits + 1, 4)
  let ra = 0
  try { ra = parseFloat(res.meta?.response?.headers?.get('retry-after')) * 1000 } catch { /* no headers */ }
  const wait = Math.min(MAX_BACKOFF, Math.max(MIN_BACKOFF * 2 ** (rl.hits - 1), Number.isFinite(ra) ? ra : 0))
  rl.until = Math.max(rl.until, Date.now() + wait)
  clearTimeout(rl.timer)
  rl.timer = setTimeout(rlNotify, rl.until - Date.now() + 50)
  rlNotify()
}
export const rateLimitedUntil = () => rl.until
export function useRateLimited() {
  return useSyncExternalStore(rlSubscribe, rlSnapshot, () => false)
}

const visSubscribe = (l) => {
  document.addEventListener('visibilitychange', l)
  return () => document.removeEventListener('visibilitychange', l)
}
/* While the SSE stream is healthy, polling stops being the source of freshness and becomes a
 * safety net: it only has to catch what the stream missed. Stretching every interval by this
 * factor is what turns push into a saving rather than one extra request on top — ~26 req/min
 * becomes ~10, well clear of the 60/min limiter, while updates arrive in 5-10s instead of
 * 10-120s. The moment the stream goes stale (see liveFeed's STALE_MS) every interval snaps
 * back to the value the terminal asked for, so a dead stream costs nothing but its own
 * reconnect attempts. */
const LIVE_FACTOR = 3

/** Poll interval that is 0 (paused) while the tab is hidden or the API is rate limiting us. */
export function usePoll(ms) {
  const visible = useSyncExternalStore(visSubscribe, () => !document.hidden, () => true)
  const limited = useRateLimited()
  const live = useSyncExternalStore(subscribeLive, isLive, () => false)
  if (!visible || limited) return 0
  return live ? ms * LIVE_FACTOR : ms
}

/** queryFn builder: real endpoint first; in dev a failure falls back to the mock; prod surfaces the error. */
function withMock(request, mock, key, norm) {
  return async (arg, _api, _extra, baseQuery) => {
    const res = await baseQuery(request(arg))
    noteRateLimit(res)
    if (!res.error) {
      const d = key ? unwrap(res.data, key) : res.data
      return { data: norm ? norm(d) : d }
    }
    if (USE_MOCK_ON_FAIL && res.error.status !== 429) return { data: tagMock(mock(arg)) }
    return { error: res.error }
  }
}
/** queryFn builder with no mock fallback (still tracks 429s). */
function plain(request, transform) {
  return async (arg, _api, _extra, baseQuery) => {
    const res = await baseQuery(request(arg))
    noteRateLimit(res)
    if (res.error) return { error: res.error }
    return { data: transform ? transform(res.data) : res.data }
  }
}

// 'MemePositions' is not in baseApi's tagTypes (owned elsewhere); add it here.
const api = baseApi.enhanceEndpoints({ addTagTypes: ['MemePositions'] })

export const memecoinApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getTrendingMemecoins: builder.query({
      queryFn: withMock(() => '/memecoins/trending', mockTrending, 'tokens', normTokens),
      providesTags: ['Memecoins'],
      onCacheEntryAdded: liveUpdates(() => ({ lists: true })),
    }),
    getNewMemecoins: builder.query({
      queryFn: withMock(() => '/memecoins/new', mockNew, 'tokens', normTokens),
      providesTags: ['Memecoins'],
      onCacheEntryAdded: liveUpdates(() => ({ lists: true })),
    }),
    searchMemecoins: builder.query({
      queryFn: withMock((q) => `/memecoins/search?q=${encodeURIComponent(q)}`, mockSearch, 'tokens', normTokens),
    }),
    getMemecoin: builder.query({
      queryFn: withMock((address) => `/memecoins/${address}`, mockTokenDetail, undefined, normToken),
      // The cache entry's lifetime is the subscription: the stream is told which token the
      // terminal is showing without the terminal having to say so.
      onCacheEntryAdded: liveUpdates((address) => ({ address })),
    }),
    getMemecoinOhlcv: builder.query({
      queryFn: withMock(
        ({ address, tf }) => `/memecoins/${address}/ohlcv?tf=${tf}`,
        ({ address, tf }) => mockOhlcv(address, tf),
        'candles',
      ),
      onCacheEntryAdded: liveUpdates(({ address, tf }) => ({ address, tf })),
    }),
    getMemecoinTrades: builder.query({
      queryFn: withMock((address) => `/memecoins/${address}/trades`, mockTrades, 'trades', normTrades),
      onCacheEntryAdded: liveUpdates((address) => ({ address })),
    }),
    // Unusual-activity score (market-data only; not a prediction). No mock fallback: UI degrades gracefully.
    getMemecoinSignals: builder.query({
      queryFn: plain((list) => `/memecoins/signals?list=${list}`, (r) => r?.signals || []),
    }),
    getMemecoinSignal: builder.query({
      queryFn: plain((address) => `/memecoins/${address}/signal`),
      onCacheEntryAdded: liveUpdates((address) => ({ address })),
    }),
    // Radar discovery feed (PumpPortal launches + model score + security flags). Answers {enabled:false, reason} when off.
    getRadarSignals: builder.query({
      queryFn: plain(({ sort = 'new', limit = 40 } = {}) => `/radar/signals?sort=${sort}&limit=${limit}`),
    }),
    // Server-side paper positions (USD, priced live) and trade history for memecoin mints.
    getMemePositions: builder.query({
      queryFn: plain(() => '/memecoins/positions'),
      providesTags: ['MemePositions'],
    }),
    getMemeHistory: builder.query({
      queryFn: plain(({ limit = 25, offset = 0 } = {}) => `/memecoins/history?limit=${limit}&offset=${offset}`),
      providesTags: ['MemePositions'],
    }),
    quoteMemecoin: builder.mutation({
      queryFn: withMock((body) => ({ url: '/memecoins/quote', method: 'POST', body }), mockQuote),
    }),
    // No mock fallback: a failed trade must never look like a fill.
    tradeMemecoin: builder.mutation({
      queryFn: plain((body) => ({ url: '/memecoins/trade', method: 'POST', body })),
      invalidatesTags: ['MemePositions'],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled
          // cash balance in the top bar comes from the paper-trading portfolio query
          dispatch(paperTradingApi.util.invalidateTags(['Portfolio', 'Transactions', 'Leaderboard']))
        } catch { /* error shown by the caller */ }
      },
    }),
  }),
})

export const {
  useGetTrendingMemecoinsQuery,
  useGetNewMemecoinsQuery,
  useSearchMemecoinsQuery,
  useGetMemecoinQuery,
  useGetMemecoinOhlcvQuery,
  useGetMemecoinTradesQuery,
  useGetMemecoinSignalsQuery,
  useGetMemecoinSignalQuery,
  useGetRadarSignalsQuery,
  useGetMemePositionsQuery,
  useGetMemeHistoryQuery,
  useQuoteMemecoinMutation,
  useTradeMemecoinMutation,
} = memecoinApi
