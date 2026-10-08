import { useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { setEffect, setBanner, setNameColor } from '../store/cosmeticsSlice'
import { supabase } from '../utils/supabase/client'
import { useSaveCosmeticsMutation } from '../api/profilesApi'

// Equipped effect, calling card and name colour. Saved in this browser immediately and on the account (best effort),
// so they follow you between devices. Calling cards and effects are Pro: the server refuses them for free accounts,
// and `isPro` here keeps the UI from even trying. A solid name colour is open to everyone.
export default function useCosmetics() {
  const dispatch = useDispatch()
  const { effect, banner, nameColor } = useSelector((s) => s.cosmetics)
  const isPro = useSelector((s) => s.preferences.isPro)
  const [saveCosmetics] = useSaveCosmeticsMutation()

  const persist = useCallback((next) => {
    supabase.auth.updateUser({ data: { cosmetics: next } }).catch(() => { /* offline or signed out: local copy still applies */ })
    // public copy, so other people see your card and effect on your profile and the leaderboard
    return saveCosmetics(next)
  }, [saveCosmetics])

  const equipEffect = useCallback((id) => {
    if (!isPro && id !== 'none') return
    dispatch(setEffect(id))
    persist({ effect: id, banner, nameColor })
  }, [dispatch, persist, banner, nameColor, isPro])

  const equipBanner = useCallback((id) => {
    if (!isPro) return
    dispatch(setBanner(id))
    persist({ effect, banner: id, nameColor })
  }, [dispatch, persist, effect, nameColor, isPro])

  const equipNameColor = useCallback((color) => {
    dispatch(setNameColor(color))
    persist({ effect: isPro ? effect : 'none', banner: isPro ? banner : null, nameColor: color })
  }, [dispatch, persist, effect, banner, isPro])

  return { effect, banner, nameColor, isPro, equipEffect, equipBanner, equipNameColor }
}
