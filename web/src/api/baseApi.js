import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import { supabase } from '../utils/supabase/client'

export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({
    baseUrl: import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api',
    prepareHeaders: async (headers) => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.access_token) {
        headers.set('Authorization', `Bearer ${session.access_token}`)
      }
      return headers
    },
  }),
  tagTypes: ['Stocks', 'Crypto', 'Feed', 'Alerts', 'GovTrades', 'Commodities', 'Preferences', 'Groups', 'Profile'],
  endpoints: () => ({}),
})
