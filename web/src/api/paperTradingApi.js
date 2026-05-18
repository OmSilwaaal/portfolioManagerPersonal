import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import { supabase } from '../utils/supabase/client'

// VITE_API_URL already includes /api (e.g. https://backend.railway.app/api)
// Strip trailing /api if present so we can append the correct path ourselves
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
  tagTypes: ['Portfolio', 'Transactions'],
  endpoints: (builder) => ({
    getPortfolio: builder.query({
      query: () => '/portfolio',
      providesTags: ['Portfolio'],
    }),
    getTradableStocks: builder.query({
      query: () => '/stocks',
    }),
    buyStock: builder.mutation({
      query: (body) => ({ url: '/buy', method: 'POST', body }),
      invalidatesTags: ['Portfolio', 'Transactions'],
    }),
    sellStock: builder.mutation({
      query: (body) => ({ url: '/sell', method: 'POST', body }),
      invalidatesTags: ['Portfolio', 'Transactions'],
    }),
    getTransactions: builder.query({
      query: (limit = 30) => `/transactions?limit=${limit}`,
      providesTags: ['Transactions'],
    }),
    purchaseCash: builder.mutation({
      query: (body) => ({ url: '/purchase-cash', method: 'POST', body }),
    }),
  }),
})

export const {
  useGetPortfolioQuery,
  useGetTradableStocksQuery,
  useBuyStockMutation,
  useSellStockMutation,
  useGetTransactionsQuery,
  usePurchaseCashMutation,
} = paperTradingApi
