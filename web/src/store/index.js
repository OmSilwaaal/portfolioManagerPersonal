import { configureStore } from '@reduxjs/toolkit'
import { baseApi } from '../api/baseApi'
import themeReducer from './themeSlice'
import watchlistReducer from './watchlistSlice'
import preferencesReducer from './preferencesSlice'

// Register API endpoint modules
import '../api/govTradesApi'
import '../api/commoditiesApi'
import '../api/preferencesApi'

export const store = configureStore({
  reducer: {
    [baseApi.reducerPath]: baseApi.reducer,
    theme: themeReducer,
    watchlist: watchlistReducer,
    preferences: preferencesReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(baseApi.middleware),
})
