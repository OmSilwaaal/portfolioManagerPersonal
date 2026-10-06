import { useCallback, useEffect, useState } from 'react'
import { useGetRecoveryStatusQuery, useCreateRecoveryMutation } from '../../api/socialApi'

// Holds a recovery phrase in memory only while it is on screen. The server never returns it again, so once
// `clear()` runs (or the tab closes) it is gone for good — `pending` is true while that would cost the user.
export function useRecovery() {
  const { data: status, isLoading } = useGetRecoveryStatusQuery()
  const [create, { isLoading: creating, reset }] = useCreateRecoveryMutation()
  const [words, setWords] = useState(null)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const generate = useCallback(async ({ replace = false } = {}) => {
    setError('')
    try {
      const res = await create({ replace }).unwrap()
      setWords(res.words)
      setSaved(false)
      reset() // RTK keeps mutation results in the Redux store — drop the phrase from there so it only lives in this component
      return true
    } catch (err) {
      setError(err?.data?.message ?? 'Could not create a recovery phrase. Try again.')
      return false
    }
  }, [create, reset])

  const clear = useCallback(() => { setWords(null); setSaved(false) }, [])

  // Closing the tab with an unsaved phrase on screen: make the browser ask first
  const pending = Boolean(words) && !saved
  useEffect(() => {
    if (!pending) return
    const warn = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [pending])

  return {
    available: status?.available ?? true,
    hasPhrase: Boolean(status?.hasPhrase),
    loading: isLoading,
    creating,
    words,
    saved,
    setSaved,
    pending,
    error,
    generate,
    clear,
  }
}
