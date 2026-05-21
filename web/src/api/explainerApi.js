import { baseApi } from './baseApi'

export const explainerApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getExplanation: builder.query({
      query: (ticker) => `/explain/${ticker}`,
      keepUnusedDataFor: 3600,
    }),
  }),
  overrideExisting: false,
})

export const { useGetExplanationQuery } = explainerApi
