import { baseApi } from './baseApi'

const api = baseApi.enhanceEndpoints({ addTagTypes: ['Callouts'] })

export const socialApi = api.injectEndpoints({
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
      invalidatesTags: ['Friends', 'Messages', 'Elo'],
    }),
    acceptFriend: builder.mutation({
      query: (userId) => ({ url: `/friends/${userId}/accept`, method: 'POST' }),
      invalidatesTags: ['Friends', 'Messages', 'Elo'],
    }),
    removeFriend: builder.mutation({
      query: (userId) => ({ url: `/friends/${userId}`, method: 'DELETE' }),
      invalidatesTags: ['Friends', 'Messages', 'Elo'],
    }),
    // The trading half of a friend's profile. Friends-only server side, so a 403 here is the answer, not a bug.
    getFriendProfile: builder.query({
      query: (userId) => `/friends/${userId}/profile`,
      providesTags: (r, e, userId) => [{ type: 'Profile', id: `trades-${userId}` }],
    }),
    getCallouts: builder.query({
      query: () => '/friends/callouts',
      providesTags: ['Callouts'],
    }),
    // The push half: the server holds this request until there is something newer than `after`, so a friend's callout
    // arrives in about a second for one request rather than one per poll tick. `epoch` is how the client re-arms it.
    // Deliberately tagless, so refreshing the feed does not cancel the wait that is already parked.
    watchCallouts: builder.query({
      query: ({ after }) => `/friends/callouts?after=${after}&wait=1`,
      keepUnusedDataFor: 0,
    }),
    postCallout: builder.mutation({
      query: ({ address, symbol, body }) => ({ url: '/friends/callouts', method: 'POST', body: { address, symbol, body } }),
      // Local echo, so posting feels instant. A failed post takes the echo straight back out: half the complaint about
      // jank is something that looks sent and was not.
      async onQueryStarted({ address, symbol, body, author }, { dispatch, queryFulfilled }) {
        const patch = dispatch(baseApi.util.updateQueryData('getCallouts', undefined, (draft) => {
          if (!Array.isArray(draft?.callouts)) return
          draft.callouts.unshift({
            id: `pending-${Date.now()}`, pending: true, user: author ?? null,
            address, symbol, stance: 'open', body, entry: null, at: new Date().toISOString(),
          })
        }))
        try { await queryFulfilled } catch { patch.undo() }
      },
      invalidatesTags: ['Callouts'],
    }),
    deleteCallout: builder.mutation({
      query: (id) => ({ url: `/friends/callouts/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Callouts'],
    }),
    getConversations: builder.query({
      query: () => '/messages/conversations',
      providesTags: ['Messages'],
    }),
    getUnreadMessages: builder.query({
      query: () => '/messages/unread',
      providesTags: ['Messages'],
    }),
    getThread: builder.query({
      query: (userId) => `/messages/with/${userId}`,
      providesTags: ['Messages'],
    }),
    sendMessage: builder.mutation({
      query: ({ userId, body, ticker }) => ({ url: `/messages/to/${userId}`, method: 'POST', body: { body, ticker } }),
      // Same bargain as a callout: the bubble appears on the keystroke, and a refused send removes it again instead of
      // leaving the sender believing it went.
      async onQueryStarted({ userId, body, ticker, meId }, { dispatch, queryFulfilled }) {
        const patch = dispatch(baseApi.util.updateQueryData('getThread', userId, (draft) => {
          if (!Array.isArray(draft?.messages)) return
          draft.messages.push({
            id: `pending-${Date.now()}`, pending: true, from: meId ?? null, to: userId,
            body: body ?? '', attachment: ticker ?? null, at: new Date().toISOString(), read: false,
          })
        }))
        try { await queryFulfilled } catch { patch.undo() }
      },
      invalidatesTags: ['Messages'],
    }),
    markThreadRead: builder.mutation({
      query: (userId) => ({ url: `/messages/read/${userId}`, method: 'POST' }),
      invalidatesTags: ['Messages'],
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
  useGetFriendProfileQuery,
  useGetCalloutsQuery,
  useWatchCalloutsQuery,
  usePostCalloutMutation,
  useDeleteCalloutMutation,
  useGetConversationsQuery,
  useGetUnreadMessagesQuery,
  useGetThreadQuery,
  useSendMessageMutation,
  useMarkThreadReadMutation,
  useRedeemReferralMutation,
  useGetRecoveryStatusQuery,
  useCreateRecoveryMutation,
} = socialApi
