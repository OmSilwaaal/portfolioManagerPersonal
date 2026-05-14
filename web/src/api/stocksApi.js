import { baseApi } from './baseApi'

export const stocksApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getStock: builder.query({
      query: (ticker) => `/stocks/${ticker}`,
      providesTags: (result, error, ticker) => [{ type: 'Stocks', id: ticker }],
      keepUnusedDataFor: 30,
    }),
  }),
  overrideExisting: false,
})

export const { useGetStockQuery } = stocksApi
