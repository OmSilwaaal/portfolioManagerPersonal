import { createSlice } from '@reduxjs/toolkit'

const LS_KEY = 'miq_session_id'

function getOrCreateSessionId() {
  let id = localStorage.getItem(LS_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(LS_KEY, id)
  }
  return id
}

const initialState = {
  sessionId: typeof window !== 'undefined' ? getOrCreateSessionId() : null,
  investorType: null,
  riskTolerance: null,
  updateFrequency: null,
  watchedCategories: [],
  priorityAlerts: [],
  watchlist: [],
  onboardingComplete: false,
}

const preferencesSlice = createSlice({
  name: 'preferences',
  initialState,
  reducers: {
    setPreferences(state, action) {
      const p = action.payload
      if (p.sessionId) state.sessionId = p.sessionId
      if (p.investorType !== undefined) state.investorType = p.investorType
      if (p.riskTolerance !== undefined) state.riskTolerance = p.riskTolerance
      if (p.updateFrequency !== undefined) state.updateFrequency = p.updateFrequency
      if (p.watchedCategories !== undefined) state.watchedCategories = p.watchedCategories
      if (p.priorityAlerts !== undefined) state.priorityAlerts = p.priorityAlerts
      if (p.watchlist !== undefined) state.watchlist = p.watchlist
      if (p.onboardingComplete !== undefined) state.onboardingComplete = p.onboardingComplete
    },
    updateWatchlist(state, action) {
      state.watchlist = action.payload
    },
    setOnboardingComplete(state, action) {
      state.onboardingComplete = action.payload
    },
    resetPreferences(state) {
      state.investorType = null
      state.riskTolerance = null
      state.updateFrequency = null
      state.watchedCategories = []
      state.priorityAlerts = []
      state.watchlist = []
      state.onboardingComplete = false
    },
  },
})

export const { setPreferences, updateWatchlist, setOnboardingComplete, resetPreferences } =
  preferencesSlice.actions

export default preferencesSlice.reducer
