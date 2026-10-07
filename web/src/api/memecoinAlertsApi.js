import { baseApi } from './baseApi'

export const memecoinAlertsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getMemecoinAlertPrefs: builder.query({
      query: () => '/memecoin-alerts/prefs',
      providesTags: ['MemecoinAlerts'],
    }),
    updateMemecoinAlertPrefs: builder.mutation({
      query: (body) => ({ url: '/memecoin-alerts/prefs', method: 'PUT', body }),
      invalidatesTags: ['MemecoinAlerts'],
    }),
    getMemecoinAlertEvents: builder.query({
      query: (limit = 50) => `/memecoin-alerts/events?limit=${limit}`,
      providesTags: ['MemecoinAlerts'],
    }),
    markMemecoinAlertsRead: builder.mutation({
      query: (before) => ({ url: '/memecoin-alerts/read', method: 'POST', body: { before } }),
      invalidatesTags: ['MemecoinAlerts'],
    }),
  }),
})

export const {
  useGetMemecoinAlertPrefsQuery,
  useUpdateMemecoinAlertPrefsMutation,
  useGetMemecoinAlertEventsQuery,
  useMarkMemecoinAlertsReadMutation,
} = memecoinAlertsApi
