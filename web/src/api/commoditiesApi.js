import { baseApi } from './baseApi'

export const commoditiesApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getCommodities: builder.query({
      query: () => '/commodities',
      providesTags: ['Commodities'],
      keepUnusedDataFor: 3600,
    }),
    getCommodity: builder.query({
      query: (symbol) => `/commodities/${symbol}`,
      providesTags: (result, error, symbol) => [{ type: 'Commodities', id: symbol }],
      keepUnusedDataFor: 3600,
    }),
  }),
  overrideExisting: false,
})

export const { useGetCommoditiesQuery, useGetCommodityQuery } = commoditiesApi
