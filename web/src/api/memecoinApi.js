import { baseApi } from './baseApi'
import {
  mockTrending, mockNew, mockSearch, mockTokenDetail, mockOhlcv, mockTrades, mockQuote, mockTrade,
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

/**
 * queryFn builder: hit the real endpoint; if it fails and we are in dev, use the
 * mock. In production a failure surfaces as a normal RTK Query error.
 */
function withMock(request, mock, key) {
  return async (arg, _api, _extra, baseQuery) => {
    const res = await baseQuery(request(arg))
    if (!res.error) return { data: key ? unwrap(res.data, key) : res.data }
    if (USE_MOCK_ON_FAIL) return { data: tagMock(mock(arg)) }
    return { error: res.error }
  }
}

export const memecoinApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getTrendingMemecoins: builder.query({
      queryFn: withMock(() => '/memecoins/trending', mockTrending, 'tokens'),
      providesTags: ['Memecoins'],
    }),
    getNewMemecoins: builder.query({
      queryFn: withMock(() => '/memecoins/new', mockNew, 'tokens'),
      providesTags: ['Memecoins'],
    }),
    searchMemecoins: builder.query({
      queryFn: withMock((q) => `/memecoins/search?q=${encodeURIComponent(q)}`, mockSearch, 'tokens'),
    }),
    getMemecoin: builder.query({
      queryFn: withMock((address) => `/memecoins/${address}`, mockTokenDetail),
    }),
    getMemecoinOhlcv: builder.query({
      queryFn: withMock(
        ({ address, tf }) => `/memecoins/${address}/ohlcv?tf=${tf}`,
        ({ address, tf }) => mockOhlcv(address, tf),
        'candles',
      ),
    }),
    getMemecoinTrades: builder.query({
      queryFn: withMock((address) => `/memecoins/${address}/trades`, mockTrades, 'trades'),
    }),
    // Unusual-activity score (market-data only; not a prediction). No mock fallback: UI degrades gracefully.
    getMemecoinSignals: builder.query({
      query: (list) => `/memecoins/signals?list=${list}`,
      transformResponse: (r) => r?.signals || [],
    }),
    getMemecoinSignal: builder.query({
      query: (address) => `/memecoins/${address}/signal`,
    }),
    quoteMemecoin: builder.mutation({
      queryFn: withMock((body) => ({ url: '/memecoins/quote', method: 'POST', body }), mockQuote),
    }),
    tradeMemecoin: builder.mutation({
      queryFn: withMock((body) => ({ url: '/memecoins/trade', method: 'POST', body }), mockTrade),
      invalidatesTags: ['Memecoins'],
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
  useQuoteMemecoinMutation,
  useTradeMemecoinMutation,
} = memecoinApi
