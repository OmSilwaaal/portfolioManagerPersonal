import { createSlice } from '@reduxjs/toolkit'

const DEFAULT_STOCKS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA']
const DEFAULT_CRYPTO = ['BTC', 'ETH', 'SOL', 'DOGE']

const watchlistSlice = createSlice({
  name: 'watchlist',
  initialState: {
    stocks: DEFAULT_STOCKS,
    crypto: DEFAULT_CRYPTO,
    selectedTicker: null,
  },
  reducers: {
    addStock(state, action) {
      const ticker = action.payload.toUpperCase()
      if (!state.stocks.includes(ticker)) {
        state.stocks.push(ticker)
      }
    },
    removeStock(state, action) {
      state.stocks = state.stocks.filter((t) => t !== action.payload.toUpperCase())
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

export const { addStock, removeStock, addCrypto, removeCrypto, setSelectedTicker } =
  watchlistSlice.actions
export default watchlistSlice.reducer
