import { createSlice } from '@reduxjs/toolkit'

const watchlistSlice = createSlice({
  name: 'watchlist',
  initialState: {
    stocks: [],
    crypto: [],
    selectedTicker: null,
  },
  reducers: {
    setWatchlistStocks(state, action) {
      state.stocks = action.payload
    },
    addStock(state, action) {
      const ticker = action.payload.toUpperCase()
      if (!state.stocks.includes(ticker)) {
        state.stocks.push(ticker)
      }
    },
    removeStock(state, action) {
      const ticker = action.payload.toUpperCase()
      state.stocks = state.stocks.filter((t) => t !== ticker)
      if (state.selectedTicker === ticker) state.selectedTicker = null
    },
    addCrypto(state, action) {
      const symbol = action.payload.toUpperCase()
      if (!state.crypto.includes(symbol)) {
        state.crypto.push(symbol)
      }
    },
    removeCrypto(state, action) {
      state.crypto = state.crypto.filter((s) => s !== action.payload.toUpperCase())
    },
    setSelectedTicker(state, action) {
      state.selectedTicker = action.payload
    },
  },
})

export const { setWatchlistStocks, addStock, removeStock, addCrypto, removeCrypto, setSelectedTicker } =
  watchlistSlice.actions
export default watchlistSlice.reducer
