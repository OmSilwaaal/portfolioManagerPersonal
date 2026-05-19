import { baseApi } from './baseApi'

export const feedApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getFeed: builder.query({
      query: () => '/feed',
      providesTags: ['Feed'],
      keepUnusedDataFor: 300,
    }),
    getFeedBrief: builder.query({
      query: () => '/feed/brief',
      keepUnusedDataFor: 21600,
    }),
    getCalendar: builder.query({
      query: () => '/calendar',
      keepUnusedDataFor: 3600,
    }),
  }),
  overrideExisting: false,
})

export const { useGetFeedQuery, useGetCalendarQuery, useGetFeedBriefQuery } = feedApi
