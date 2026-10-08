import { configureStore } from '@reduxjs/toolkit'
import { baseApi } from '../api/baseApi'
import { paperTradingApi } from '../api/paperTradingApi'
import themeReducer from './themeSlice'
import watchlistReducer from './watchlistSlice'
import preferencesReducer from './preferencesSlice'
import feedReducer from './feedSlice'
import cosmeticsReducer from './cosmeticsSlice'

// Register API endpoint modules
import '../api/govTradesApi'
import '../api/commoditiesApi'
import '../api/preferencesApi'
import '../api/eloApi'
import '../api/clansApi'
import '../api/explainerApi'

export const store = configureStore({
  reducer: {
    [baseApi.reducerPath]: baseApi.reducer,
    [paperTradingApi.reducerPath]: paperTradingApi.reducer,
    theme: themeReducer,
    watchlist: watchlistReducer,
    preferences: preferencesReducer,
    feed: feedReducer,
    cosmetics: cosmeticsReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware()
      .concat(baseApi.middleware)
      .concat(paperTradingApi.middleware),
})
