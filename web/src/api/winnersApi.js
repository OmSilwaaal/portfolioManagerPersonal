import { baseApi } from './baseApi'

export const winnersApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getWinners: builder.query({
      query: ({ range = 'all', limit = 30 } = {}) => `/winners?range=${range}&limit=${limit}`,
      providesTags: ['Winners'],
    }),
  }),
  overrideExisting: false,
})

export const { useGetWinnersQuery } = winnersApi
