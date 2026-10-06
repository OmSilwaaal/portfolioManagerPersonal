import { baseApi } from './baseApi'

// Research evaluation endpoints (backend mounts the router at /api/research/eval).
export const researchApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getResearchStatus: builder.query({
      query: () => '/research/eval/status',
    }),
    getResearchReport: builder.query({
      query: () => '/research/eval/report/latest',
      // 404 = no report generated yet; treat as an empty state, not an error
      transformErrorResponse: (res) => res,
    }),
    runResearchEval: builder.mutation({
      query: (adminSecret) => ({
        url: '/research/eval/run',
        method: 'POST',
        headers: adminSecret ? { 'x-admin-secret': adminSecret } : undefined,
      }),
    }),
  }),
})

export const {
  useGetResearchStatusQuery,
  useGetResearchReportQuery,
  useRunResearchEvalMutation,
} = researchApi
