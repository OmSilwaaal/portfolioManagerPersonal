import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'

/* Router updates run as React transitions, so the page being left stays painted while the next
   chunk arrives instead of blanking to a spinner. The trade is that a cold navigation can look
   like the click did nothing, which this bar answers. Prefetched routes commit within a frame or
   two, so the delay below keeps the bar off screen for them. */
const SHOW_AFTER_MS = 120
const GIVE_UP_MS = 10000

export default function RouteProgress() {
  const { pathname } = useLocation()
  const [target, setTarget] = useState(null)

  // A committed navigation (or a redirect) means the pending one is done.
  useEffect(() => setTarget(null), [pathname])

  useEffect(() => {
    const onClick = (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const anchor = e.target instanceof Element ? e.target.closest('a[href^="/"]') : null
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return
      const next = new URL(anchor.href, window.location.origin).pathname
      if (next !== pathname) setTarget(next)
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [pathname])

  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (!target) {
      setVisible(false)
      return undefined
    }
    const show = setTimeout(() => setVisible(true), SHOW_AFTER_MS)
    // A click that ends up not navigating must not leave the bar on screen.
    const bail = setTimeout(() => setTarget(null), GIVE_UP_MS)
    return () => { clearTimeout(show); clearTimeout(bail) }
  }, [target])

  if (!visible) return null
  return (
    <div
      role="progressbar"
      aria-label="Loading page"
      className="fixed top-0 left-0 right-0 z-[60] animate-pulse"
      style={{ height: 2, background: 'var(--ochre-300)' }}
    />
  )
}
