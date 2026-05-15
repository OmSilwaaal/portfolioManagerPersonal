import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({ baseUrl: import.meta.env.VITE_API_URL ?? '/api' }),
  tagTypes: ['Stocks', 'Crypto', 'Feed', 'Alerts', 'GovTrades', 'Commodities', 'Preferences'],
  endpoints: () => ({}),
})
