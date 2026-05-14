import { baseApi } from './baseApi'

export const cryptoApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getCrypto: builder.query({
      query: (symbol) => `/crypto/${symbol}`,
      providesTags: (result, error, symbol) => [{ type: 'Crypto', id: symbol }],
      keepUnusedDataFor: 30,
    }),
  }),
  overrideExisting: false,
})

export const { useGetCryptoQuery } = cryptoApi
