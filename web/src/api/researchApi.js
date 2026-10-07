import { baseApi } from './baseApi'

// Research evaluation endpoints (backend mounts the router at /api/research/eval).
export const researchApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getResearchStatus: builder.query({
      query: () => '/research/eval/status',
    }),
    getResearchCombined: builder.query({
      query: () => '/research/eval/combined',
    }),
    getResearchReport: builder.query({
      query: () => '/research/eval/report/latest',
      // 404 = no report generated yet; treat as an empty state, not an error
      transformErrorResponse: (res) => res,
    }),
    getWinnerFirst: builder.query({
      query: () => '/research/eval/winner-first',
      transformErrorResponse: (res) => res,   // 404 = no report yet
    }),
    getWalletDiscovery: builder.query({
      query: () => '/research/eval/wallet-discovery',
    }),
    runWinnerFirst: builder.mutation({
      query: (adminSecret) => ({
        url: '/research/eval/winner-first/run',
        method: 'POST',
        headers: adminSecret ? { 'x-admin-secret': adminSecret } : undefined,
      }),
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
  useGetResearchCombinedQuery,
  useGetResearchReportQuery,
  useRunResearchEvalMutation,
  useGetWinnerFirstQuery,
  useRunWinnerFirstMutation,
  useGetWalletDiscoveryQuery,
} = researchApi
