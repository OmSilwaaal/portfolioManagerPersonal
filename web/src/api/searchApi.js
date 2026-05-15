import { baseApi } from './baseApi'

const searchApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    searchSymbols: builder.query({
      query: ({ q, type = 'all' }) =>
        `/search?q=${encodeURIComponent(q)}&type=${encodeURIComponent(type)}`,
    }),
  }),
  overrideExisting: false,
})

export const { useSearchSymbolsQuery } = searchApi
export default searchApi
