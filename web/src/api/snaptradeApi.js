import { baseApi } from './baseApi'

export const snaptradeApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getSnaptradeStatus: builder.query({
      query: () => '/snaptrade/status',
      providesTags: ['Snaptrade'],
      keepUnusedDataFor: 60,
    }),
    getSnaptradeAccounts: builder.query({
      query: () => '/snaptrade/accounts',
      providesTags: ['Snaptrade'],
      keepUnusedDataFor: 120,
    }),
    getSnaptradeHoldings: builder.query({
      query: () => '/snaptrade/holdings',
      providesTags: ['Snaptrade'],
      keepUnusedDataFor: 120,
    }),
    registerSnaptrade: builder.mutation({
      query: () => ({ url: '/snaptrade/register', method: 'POST' }),
    }),
    disconnectSnaptrade: builder.mutation({
      query: () => ({ url: '/snaptrade/disconnect', method: 'DELETE' }),
      invalidatesTags: ['Snaptrade'],
    }),
  }),
  overrideExisting: false,
})

export const {
  useGetSnaptradeStatusQuery,
  useGetSnaptradeAccountsQuery,
  useGetSnaptradeHoldingsQuery,
  useRegisterSnaptradeMutation,
  useDisconnectSnaptradeMutation,
} = snaptradeApi
