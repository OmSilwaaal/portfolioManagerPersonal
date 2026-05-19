import { baseApi } from './baseApi'

export const groupsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getGroups: builder.query({
      query: () => '/groups',
      providesTags: ['Groups'],
    }),
    getGroup: builder.query({
      query: (id) => `/groups/${id}`,
      providesTags: (result, error, id) => [{ type: 'Groups', id }],
    }),
    createGroup: builder.mutation({
      query: (body) => ({ url: '/groups', method: 'POST', body }),
      invalidatesTags: ['Groups'],
    }),
    updateGroup: builder.mutation({
      query: ({ id, ...body }) => ({ url: `/groups/${id}`, method: 'PATCH', body }),
      invalidatesTags: (result, error, { id }) => [{ type: 'Groups', id }, 'Groups'],
    }),
    joinGroup: builder.mutation({
      query: (body) => ({ url: '/groups/join', method: 'POST', body }),
      invalidatesTags: ['Groups'],
    }),
    createPost: builder.mutation({
      query: ({ groupId, ...body }) => ({ url: `/groups/${groupId}/posts`, method: 'POST', body }),
      invalidatesTags: (result, error, { groupId }) => [{ type: 'Groups', id: groupId }],
    }),
    deletePost: builder.mutation({
      query: ({ groupId, postId }) => ({ url: `/groups/${groupId}/posts/${postId}`, method: 'DELETE' }),
      invalidatesTags: (result, error, { groupId }) => [{ type: 'Groups', id: groupId }],
    }),
    updateMember: builder.mutation({
      query: ({ groupId, userId, role, rank, can_post }) => ({
        url: `/groups/${groupId}/members/${userId}`,
        method: 'PATCH',
        body: { role, rank, can_post },
      }),
      invalidatesTags: (result, error, { groupId }) => [{ type: 'Groups', id: groupId }],
    }),
    removeMember: builder.mutation({
      query: ({ groupId, userId }) => ({ url: `/groups/${groupId}/members/${userId}`, method: 'DELETE' }),
      invalidatesTags: (result, error, { groupId }) => [{ type: 'Groups', id: groupId }],
    }),
    deleteGroup: builder.mutation({
      query: (groupId) => ({ url: `/groups/${groupId}`, method: 'DELETE' }),
      invalidatesTags: ['Groups'],
    }),
  }),
  overrideExisting: false,
})

export const {
  useGetGroupsQuery,
  useGetGroupQuery,
  useCreateGroupMutation,
  useUpdateGroupMutation,
  useJoinGroupMutation,
  useCreatePostMutation,
  useDeletePostMutation,
  useUpdateMemberMutation,
  useRemoveMemberMutation,
  useDeleteGroupMutation,
} = groupsApi
