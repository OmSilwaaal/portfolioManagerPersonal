import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({ baseUrl: '/api' }),
  tagTypes: ['Stocks', 'Crypto', 'Feed', 'Alerts', 'GovTrades', 'Commodities', 'Preferences'],
  endpoints: () => ({}),
})
