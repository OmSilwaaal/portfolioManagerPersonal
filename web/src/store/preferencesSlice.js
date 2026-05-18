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
  displayName: null,
  email: null,
  investorType: null,
  traderRole: null,
  riskTolerance: null,
  updateFrequency: null,
  watchedCategories: [],
  priorityAlerts: [],
  watchlist: [],
  onboardingComplete: false,
  isPro: false,
}

const preferencesSlice = createSlice({
  name: 'preferences',
  initialState,
  reducers: {
    setPreferences(state, action) {
      const p = action.payload
      if (p.sessionId) state.sessionId = p.sessionId
      if (p.displayName !== undefined) state.displayName = p.displayName
      if (p.email !== undefined) state.email = p.email
      if (p.investorType !== undefined) state.investorType = p.investorType
      if (p.traderRole !== undefined) state.traderRole = p.traderRole
      if (p.riskTolerance !== undefined) state.riskTolerance = p.riskTolerance
      if (p.updateFrequency !== undefined) state.updateFrequency = p.updateFrequency
      if (p.watchedCategories !== undefined) state.watchedCategories = p.watchedCategories
      if (p.priorityAlerts !== undefined) state.priorityAlerts = p.priorityAlerts
      if (p.watchlist !== undefined) state.watchlist = p.watchlist
      if (p.onboardingComplete !== undefined) state.onboardingComplete = p.onboardingComplete
      if (p.isPro !== undefined) state.isPro = p.isPro
    },
    setIsPro(state, action) {
      state.isPro = action.payload
    },
    updateWatchlist(state, action) {
      state.watchlist = action.payload
    },
    setOnboardingComplete(state, action) {
      state.onboardingComplete = action.payload
    },
    resetPreferences(state) {
      state.investorType = null
      state.traderRole = null
      state.riskTolerance = null
      state.updateFrequency = null
      state.watchedCategories = []
      state.priorityAlerts = []
      state.watchlist = []
      state.onboardingComplete = false
      state.isPro = false
    },
  },
})

export const { setPreferences, updateWatchlist, setOnboardingComplete, resetPreferences, setIsPro } =
  preferencesSlice.actions

export default preferencesSlice.reducer
