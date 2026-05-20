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

  // readyToSave starts false; set to true via setTimeout after the load
  // dispatch has taken effect and caused a re-render. This prevents the
  // save effects from overwriting localStorage with the empty initial Redux
  // state before the loaded data has propagated.
  const readyToSave = useRef(false)
  const prevUserId = useRef(null)

  useEffect(() => {
    if (!user?.id) {
      readyToSave.current = false
      prevUserId.current = null
      return
    }
    if (user.id === prevUserId.current) return
    prevUserId.current = user.id
    readyToSave.current = false

    try {
      const savedStocks = JSON.parse(localStorage.getItem(KEY(user.id, 'stocks')) || '[]')
      const savedCrypto = JSON.parse(localStorage.getItem(KEY(user.id, 'crypto')) || '[]')
      if (Array.isArray(savedStocks) && savedStocks.length > 0) dispatch(setWatchlistStocks(savedStocks))
      if (Array.isArray(savedCrypto) && savedCrypto.length > 0) savedCrypto.forEach((s) => dispatch(addCrypto(s)))
    } catch {}

    // Defer enabling saves until after the dispatch above has re-rendered
    const t = setTimeout(() => { readyToSave.current = true }, 50)
    return () => clearTimeout(t)
  }, [user?.id, dispatch])

  useEffect(() => {
    if (!user?.id || !readyToSave.current) return
    localStorage.setItem(KEY(user.id, 'stocks'), JSON.stringify(stocks))
  }, [user?.id, stocks])

  useEffect(() => {
    if (!user?.id || !readyToSave.current) return
    localStorage.setItem(KEY(user.id, 'crypto'), JSON.stringify(crypto))
  }, [user?.id, crypto])

  return null
}
