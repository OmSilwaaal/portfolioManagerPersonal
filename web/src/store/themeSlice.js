import { createSlice } from '@reduxjs/toolkit'

const LS_KEY = 'tvx_theme'

// mode: 'light' | 'dark' | 'system'. `isDark` is the resolved value the rest of the app reads.
function systemPrefersDark() {
  try { return window.matchMedia('(prefers-color-scheme: dark)').matches } catch { return true }
}

function readMode() {
  try {
    const v = localStorage.getItem(LS_KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch { /* storage unavailable */ }
  return 'dark'
}

function resolve(mode) {
  return mode === 'system' ? systemPrefersDark() : mode === 'dark'
}

function persist(mode) {
  try { localStorage.setItem(LS_KEY, mode) } catch { /* ignore */ }
}

const initialMode = typeof window !== 'undefined' ? readMode() : 'dark'

const themeSlice = createSlice({
  name: 'theme',
  initialState: {
    mode: initialMode,
    isDark: typeof window !== 'undefined' ? resolve(initialMode) : true,
  },
  reducers: {
    setThemeMode(state, action) {
      state.mode = action.payload
      state.isDark = resolve(action.payload)
      persist(action.payload)
    },
    // keeps `isDark` in step with the OS when the mode is 'system'
    syncSystemTheme(state) {
      if (state.mode === 'system') state.isDark = systemPrefersDark()
    },
    toggleTheme(state) {
      state.mode = state.isDark ? 'light' : 'dark'
      state.isDark = !state.isDark
      persist(state.mode)
    },
    setDark(state, action) {
      state.mode = action.payload ? 'dark' : 'light'
      state.isDark = action.payload
      persist(state.mode)
    },
  },
})

export const { setThemeMode, syncSystemTheme, toggleTheme, setDark } = themeSlice.actions
export default themeSlice.reducer
