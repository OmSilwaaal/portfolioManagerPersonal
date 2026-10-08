import { baseApi } from './baseApi'

export const profilesApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getMyProfile: builder.query({
      query: () => '/profiles/me',
      providesTags: ['Profile'],
    }),
    getProfile: builder.query({
      query: (userId) => `/profiles/${userId}`,
      providesTags: (result, error, userId) => [{ type: 'Profile', id: userId }],
    }),
    getProfileByUsername: builder.query({
      query: (username) => `/profiles/by-username/${encodeURIComponent(username)}`,
    }),
    saveCosmetics: builder.mutation({
      query: (body) => ({ url: '/profiles/me/cosmetics', method: 'PUT', body }),
    }),
    updateProfile: builder.mutation({
      query: (body) => ({ url: '/profiles/me', method: 'PATCH', body }),
      invalidatesTags: ['Profile'],
    }),
  }),
  overrideExisting: false,
})

export const {
  useGetMyProfileQuery, useGetProfileQuery, useUpdateProfileMutation, useGetProfileByUsernameQuery, useSaveCosmeticsMutation,
} = profilesApi
