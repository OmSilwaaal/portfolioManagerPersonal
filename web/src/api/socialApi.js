import { baseApi } from './baseApi'

export const socialApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getFriends: builder.query({
      query: () => '/friends',
      providesTags: ['Friends'],
    }),
    searchUsers: builder.query({
      query: (q) => `/friends/search?q=${encodeURIComponent(q)}`,
    }),
    requestFriend: builder.mutation({
      query: (userId) => ({ url: '/friends/request', method: 'POST', body: { userId } }),
      invalidatesTags: ['Friends'],
    }),
    acceptFriend: builder.mutation({
      query: (userId) => ({ url: `/friends/${userId}/accept`, method: 'POST' }),
      invalidatesTags: ['Friends'],
    }),
    removeFriend: builder.mutation({
      query: (userId) => ({ url: `/friends/${userId}`, method: 'DELETE' }),
      invalidatesTags: ['Friends'],
    }),
    getMyReferral: builder.query({
      query: () => '/referrals/me',
      providesTags: ['Referral'],
    }),
    redeemReferral: builder.mutation({
      query: (code) => ({ url: '/referrals/redeem', method: 'POST', body: { code } }),
      invalidatesTags: ['Referral'],
    }),
    getRecoveryStatus: builder.query({
      query: () => '/recovery',
      providesTags: ['Recovery'],
    }),
    createRecovery: builder.mutation({
      query: (body) => ({ url: '/recovery', method: 'POST', body }),
      invalidatesTags: ['Recovery'],
    }),
  }),
  overrideExisting: false,
})

export const {
  useGetFriendsQuery,
  useLazySearchUsersQuery,
  useRequestFriendMutation,
  useAcceptFriendMutation,
  useRemoveFriendMutation,
  useGetMyReferralQuery,
  useRedeemReferralMutation,
  useGetRecoveryStatusQuery,
  useCreateRecoveryMutation,
} = socialApi
