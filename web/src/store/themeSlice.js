import { createSlice } from '@reduxjs/toolkit'

const themeSlice = createSlice({
  name: 'theme',
  initialState: {
    isDark: true,
  },
  reducers: {
    toggleTheme(state) {
      state.isDark = !state.isDark
    },
    setDark(state, action) {
      state.isDark = action.payload
    },
  },
})

export const { toggleTheme, setDark } = themeSlice.actions
export default themeSlice.reducer
