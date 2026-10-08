import { baseApi } from './baseApi'

export const eloApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getEloTiers: builder.query({ query: () => '/elo/tiers' }),
    getMyElo: builder.query({ query: () => '/elo/me', providesTags: ['Elo'] }),
    getLeaderboard: builder.query({
      query: ({ sort = 'elo', range = 'all', limit = 50 } = {}) => `/elo/leaderboard?sort=${sort}&range=${range}&limit=${limit}`,
      providesTags: ['Elo'],
    }),
  }),
  overrideExisting: false,
})

export const { useGetEloTiersQuery, useGetMyEloQuery, useGetLeaderboardQuery } = eloApi
