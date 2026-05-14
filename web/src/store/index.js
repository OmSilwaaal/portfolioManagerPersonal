import { configureStore } from '@reduxjs/toolkit'
import { baseApi } from '../api/baseApi'
import themeReducer from './themeSlice'
import watchlistReducer from './watchlistSlice'

export const store = configureStore({
  reducer: {
    [baseApi.reducerPath]: baseApi.reducer,
    theme: themeReducer,
    watchlist: watchlistReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(baseApi.middleware),
})
