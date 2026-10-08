import { baseApi } from './baseApi'

export const clansApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getClans: builder.query({
      query: ({ sort = 'pnl', q = '' } = {}) => `/clans?sort=${sort}${q ? `&q=${encodeURIComponent(q)}` : ''}`,
      providesTags: ['Clans'],
    }),
    getMyClan: builder.query({ query: () => '/clans/me', providesTags: ['Clans'] }),
    getClan: builder.query({
      query: (id) => `/clans/${id}`,
      providesTags: (r, e, id) => [{ type: 'Clans', id }, 'Clans'],
    }),
    createClan: builder.mutation({
      query: (body) => ({ url: '/clans', method: 'POST', body }),
      invalidatesTags: ['Clans', 'Elo', 'Friends', 'Messages'],
    }),
    joinClan: builder.mutation({
      query: (id) => ({ url: `/clans/${id}/join`, method: 'POST' }),
      invalidatesTags: ['Clans', 'Elo', 'Friends', 'Messages'],
    }),
    leaveClan: builder.mutation({
      query: () => ({ url: '/clans/leave', method: 'POST' }),
      invalidatesTags: ['Clans', 'Elo', 'Friends', 'Messages'],
    }),
    disbandClan: builder.mutation({
      query: (id) => ({ url: `/clans/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Clans', 'Elo', 'Friends', 'Messages'],
    }),
    kickFromClan: builder.mutation({
      query: ({ id, userId }) => ({ url: `/clans/${id}/kick/${userId}`, method: 'POST' }),
      invalidatesTags: ['Clans', 'Elo'],
    }),
    getClanPosts: builder.query({
      query: (id) => `/clans/${id}/posts`,
      providesTags: (r, e, id) => [{ type: 'ClanPosts', id }],
    }),
    postToClan: builder.mutation({
      query: ({ id, ...body }) => ({ url: `/clans/${id}/posts`, method: 'POST', body }),
      invalidatesTags: (r, e, { id }) => [{ type: 'ClanPosts', id }],
    }),
    deleteClanPost: builder.mutation({
      query: ({ id, postId }) => ({ url: `/clans/${id}/posts/${postId}`, method: 'DELETE' }),
      invalidatesTags: (r, e, { id }) => [{ type: 'ClanPosts', id }],
    }),
  }),
  overrideExisting: false,
})

export const {
  useGetClansQuery, useGetMyClanQuery, useGetClanQuery, useCreateClanMutation, useJoinClanMutation, useLeaveClanMutation,
  useDisbandClanMutation, useKickFromClanMutation, useGetClanPostsQuery, usePostToClanMutation, useDeleteClanPostMutation,
} = clansApi
