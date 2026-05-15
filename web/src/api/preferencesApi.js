import { baseApi } from './baseApi'

export const preferencesApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getPreferences: builder.query({
      query: (sessionId) => `/preferences/${sessionId}`,
      providesTags: ['Preferences'],
      keepUnusedDataFor: 300,
    }),
    savePreferences: builder.mutation({
      query: (prefs) => ({
        url: '/preferences',
        method: 'POST',
        body: prefs,
      }),
      invalidatesTags: ['Preferences'],
    }),
    updatePreferences: builder.mutation({
      query: ({ sessionId, ...prefs }) => ({
        url: `/preferences/${sessionId}`,
        method: 'PUT',
        body: prefs,
      }),
      invalidatesTags: ['Preferences'],
    }),
  }),
  overrideExisting: false,
})

export const {
  useGetPreferencesQuery,
  useSavePreferencesMutation,
  useUpdatePreferencesMutation,
} = preferencesApi
