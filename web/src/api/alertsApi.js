import { baseApi } from './baseApi'

export const alertsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getAlerts: builder.query({
      query: () => '/alerts',
      providesTags: ['Alerts'],
      keepUnusedDataFor: 60,
    }),
    createAlert: builder.mutation({
      query: (body) => ({
        url: '/alerts',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Alerts'],
    }),
    deleteAlert: builder.mutation({
      query: (id) => ({
        url: `/alerts/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Alerts'],
    }),
  }),
  overrideExisting: false,
})

export const { useGetAlertsQuery, useCreateAlertMutation, useDeleteAlertMutation } = alertsApi
