import { baseApi } from './baseApi'

export const notificationsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getPriceAlerts: builder.query({
      query: (tickers) => `/notifications/price-alerts?tickers=${tickers}`,
    }),
  }),
  overrideExisting: false,
})

export const { useGetPriceAlertsQuery } = notificationsApi
