import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import { supabase } from '../utils/supabase/client'

const _viteApiUrl = import.meta.env.VITE_API_URL ?? ''
const API_BASE = _viteApiUrl
  ? _viteApiUrl.replace(/\/api\/?$/, '')
  : 'http://localhost:3001'

export const paperTradingApi = createApi({
  reducerPath: 'paperTradingApi',
  baseQuery: async (args, api, extraOptions) => {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    return fetchBaseQuery({
      baseUrl: `${API_BASE}/api/paper-trading`,
      prepareHeaders: (headers) => {
        if (token) headers.set('Authorization', `Bearer ${token}`)
        return headers
      },
    })(args, api, extraOptions)
  },
  tagTypes: ['Portfolio', 'Transactions', 'Leaderboard'],
  endpoints: (builder) => ({
    getPortfolio: builder.query({
      query: () => '/portfolio',
      providesTags: ['Portfolio'],
    }),
    buyStock: builder.mutation({
      query: (body) => ({ url: '/buy', method: 'POST', body }),
      invalidatesTags: ['Portfolio', 'Transactions', 'Leaderboard'],
    }),
    sellStock: builder.mutation({
      query: (body) => ({ url: '/sell', method: 'POST', body }),
      invalidatesTags: ['Portfolio', 'Transactions', 'Leaderboard'],
    }),
    updatePosition: builder.mutation({
      query: ({ ticker, ...body }) => ({ url: `/positions/${ticker}`, method: 'PATCH', body }),
      invalidatesTags: ['Portfolio'],
    }),
    getTransactions: builder.query({
      query: (limit = 30) => `/transactions?limit=${limit}`,
      providesTags: ['Transactions'],
    }),
    getLeaderboard: builder.query({
      query: () => '/leaderboard',
      providesTags: ['Leaderboard'],
    }),
    purchaseCash: builder.mutation({
      query: (body) => ({ url: '/purchase-cash', method: 'POST', body }),
      invalidatesTags: ['Portfolio', 'Leaderboard'],
    }),
  }),
})

export const {
  useGetPortfolioQuery,
  useBuyStockMutation,
  useSellStockMutation,
  useUpdatePositionMutation,
  useGetTransactionsQuery,
  useGetLeaderboardQuery,
  usePurchaseCashMutation,
} = paperTradingApi
