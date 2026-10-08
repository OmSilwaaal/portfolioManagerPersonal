import { useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { setEffect, setBanner } from '../store/cosmeticsSlice'
import { supabase } from '../utils/supabase/client'

// Equipped effect + calling card. Saved in this browser immediately and on the account (best effort),
// so they follow you between devices.
export default function useCosmetics() {
  const dispatch = useDispatch()
  const { effect, banner } = useSelector((s) => s.cosmetics)

  const persist = useCallback((next) => {
    supabase.auth.updateUser({ data: { cosmetics: next } }).catch(() => { /* offline or signed out: local copy still applies */ })
  }, [])

  const equipEffect = useCallback((id) => {
    dispatch(setEffect(id))
    persist({ effect: id, banner })
  }, [dispatch, persist, banner])

  const equipBanner = useCallback((id) => {
    dispatch(setBanner(id))
    persist({ effect, banner: id })
  }, [dispatch, persist, effect])

  return { effect, banner, equipEffect, equipBanner }
}
