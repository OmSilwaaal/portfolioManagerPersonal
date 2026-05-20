import { createSlice } from '@reduxjs/toolkit'

const feedSlice = createSlice({
  name: 'feed',
  initialState: {
    activeFilter: 'all',
    subFilter: null,
    expanded: true,
  },
  reducers: {
    setFeedFilter(state, action) {
      state.activeFilter = action.payload
      state.subFilter = null
    },
    setFeedSubFilter(state, action) {
      state.subFilter = action.payload
    },
    toggleFeedExpanded(state) {
      state.expanded = !state.expanded
    },
    setFeedExpanded(state, action) {
      state.expanded = action.payload
    },
  },
})

export const { setFeedFilter, setFeedSubFilter, toggleFeedExpanded, setFeedExpanded } = feedSlice.actions
export default feedSlice.reducer
