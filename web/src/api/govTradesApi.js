import { baseApi } from './baseApi'

export const govTradesApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getGovTrades: builder.query({
      query: (params = {}) => {
        const searchParams = new URLSearchParams()
        if (params.chamber) searchParams.set('chamber', params.chamber)
        if (params.party) searchParams.set('party', params.party)
        if (params.ticker) searchParams.set('ticker', params.ticker)
        if (params.days) searchParams.set('days', params.days)
        if (params.limit) searchParams.set('limit', params.limit)
        if (params.page) searchParams.set('page', params.page)
        const qs = searchParams.toString()
        return `/gov-trades${qs ? `?${qs}` : ''}`
      },
      providesTags: ['GovTrades'],
      keepUnusedDataFor: 900,
    }),
    getGovTradesByOfficial: builder.query({
      query: (name) => `/gov-trades/official/${encodeURIComponent(name)}`,
      providesTags: (result, error, name) => [{ type: 'GovTrades', id: name }],
      keepUnusedDataFor: 900,
    }),
    getGovTradesSummary: builder.query({
      query: () => '/gov-trades/summary',
      providesTags: ['GovTrades'],
      keepUnusedDataFor: 900,
    }),
  }),
  overrideExisting: false,
})

export const {
  useGetGovTradesQuery,
  useGetGovTradesByOfficialQuery,
  useGetGovTradesSummaryQuery,
} = govTradesApi
