import { useCallback, useEffect, useState } from 'react'

/**
 * Browser notification permission, as a hook.
 *
 * Permission can only be requested from a user gesture, and in an unsupported or
 * insecure context `window.Notification` is simply absent — so every call site
 * checks `supported` first and the hook never throws.
 */
export function useNotificationPermission() {
  const supported = typeof window !== 'undefined' && 'Notification' in window
  const [permission, setPermission] = useState(() => (supported ? Notification.permission : 'unsupported'))

  // Another tab (or browser UI) can change this while we're open.
  useEffect(() => {
    if (!supported || !navigator.permissions?.query) return
    let status
    const onChange = () => setPermission(Notification.permission)
    navigator.permissions
      .query({ name: 'notifications' })
      .then((s) => { status = s; s.addEventListener('change', onChange) })
      .catch(() => { /* Safari and friends: fall back to the value we have */ })
    return () => status?.removeEventListener('change', onChange)
  }, [supported])

  const request = useCallback(async () => {
    if (!supported) return 'unsupported'
    try {
      const result = await Notification.requestPermission()
      setPermission(result)
      return result
    } catch {
      return Notification.permission
    }
  }, [supported])

  return { supported, permission, granted: permission === 'granted', request }
}

/** Fire a desktop notification; returns false when it could not be shown. */
export function notify({ title, body, tag, onClick }) {
  if (typeof window === 'undefined' || !('Notification' in window)) return false
  if (Notification.permission !== 'granted') return false
  try {
    // `tag` collapses repeats for the same token+kind instead of stacking them up.
    const n = new Notification(title, { body, tag, icon: '/favicon.svg', silent: false })
    if (onClick) {
      n.onclick = () => { window.focus(); onClick(); n.close() }
    }
    return true
  } catch {
    return false
  }
}
