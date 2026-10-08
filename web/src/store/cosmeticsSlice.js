import { createSlice } from '@reduxjs/toolkit'

const LS_KEY = 'tvx_cosmetics'
const DEFAULTS = { effect: 'glow', banner: 'sunrise', nameColor: null }

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) || 'null')
    if (raw && typeof raw === 'object') return { ...DEFAULTS, ...raw }
  } catch { /* storage unavailable or corrupt */ }
  return { ...DEFAULTS }
}

function save(state) {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ effect: state.effect, banner: state.banner, nameColor: state.nameColor })) } catch { /* ignore */ }
}

const cosmeticsSlice = createSlice({
  name: 'cosmetics',
  initialState: typeof window !== 'undefined' ? load() : { ...DEFAULTS },
  reducers: {
    setEffect(state, action) { state.effect = action.payload; save(state) },
    setBanner(state, action) { state.banner = action.payload; save(state) },
    setNameColor(state, action) { state.nameColor = action.payload; save(state) },
    // values saved on the account (user metadata) win over this browser's copy
    hydrateCosmetics(state, action) {
      const c = action.payload || {}
      if (typeof c.effect === 'string') state.effect = c.effect
      if (typeof c.banner === 'string') state.banner = c.banner
      if (typeof c.nameColor === 'string' || c.nameColor === null) state.nameColor = c.nameColor ?? null
      save(state)
    },
  },
})

export const { setEffect, setBanner, setNameColor, hydrateCosmetics } = cosmeticsSlice.actions
export default cosmeticsSlice.reducer
