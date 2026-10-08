import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import { supabase } from '../utils/supabase/client'

// VITE_API_URL may be set with or without a trailing "/api" — normalize so we never hit /api/api/...
export const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL.replace(/\/+$/, '').replace(/\/api$/, '')}/api`
  : '/api'

export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({
    baseUrl: API_BASE,
    prepareHeaders: async (headers) => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.access_token) {
        headers.set('Authorization', `Bearer ${session.access_token}`)
      }
      return headers
    },
  }),
  tagTypes: ['Stocks', 'Crypto', 'Feed', 'Alerts', 'GovTrades', 'Commodities', 'Preferences', 'Clans', 'ClanPosts', 'Elo', 'Profile', 'Sms', 'Friends', 'Referral', 'Recovery', 'Memecoins', 'MemecoinAlerts', 'Messages', 'Winners'],
  endpoints: () => ({}),
})
