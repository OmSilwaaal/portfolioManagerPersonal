import { useEffect, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useAuth } from '../contexts/AuthContext'
import { setWatchlistStocks, addCrypto } from '../store/watchlistSlice'

const KEY = (userId, type) => `miq_wl_${type}_${userId}`

export default function WatchlistPersistence() {
  const { user } = useAuth()
  const dispatch = useDispatch()
  const stocks = useSelector((state) => state.watchlist.stocks)
  const crypto = useSelector((state) => state.watchlist.crypto)
  const initialized = useRef(false)

  // Load saved watchlist when user logs in
  useEffect(() => {
    if (!user?.id) { initialized.current = false; return }
    if (initialized.current) return
    initialized.current = true
    try {
      const savedStocks = JSON.parse(localStorage.getItem(KEY(user.id, 'stocks')) || '[]')
      const savedCrypto = JSON.parse(localStorage.getItem(KEY(user.id, 'crypto')) || '[]')
      if (Array.isArray(savedStocks) && savedStocks.length > 0) {
        dispatch(setWatchlistStocks(savedStocks))
      }
      if (Array.isArray(savedCrypto)) {
        savedCrypto.forEach((s) => dispatch(addCrypto(s)))
      }
    } catch {}
  }, [user?.id, dispatch])

  // Persist stocks whenever they change (skip the initial load frame)
  useEffect(() => {
    if (!user?.id || !initialized.current) return
    localStorage.setItem(KEY(user.id, 'stocks'), JSON.stringify(stocks))
  }, [user?.id, stocks])

  // Persist crypto whenever it changes
  useEffect(() => {
    if (!user?.id || !initialized.current) return
    localStorage.setItem(KEY(user.id, 'crypto'), JSON.stringify(crypto))
  }, [user?.id, crypto])

  return null
}
