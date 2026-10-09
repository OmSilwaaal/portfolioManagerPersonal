import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'

/**
 * One-off notice about the social data lost when the database moved onto the
 * Railway volume.
 *
 * Shown once per browser and then never again. The key carries a version so a
 * future, different notice can be shown without clearing this one, and so this
 * one can never be resurrected by changing the copy.
 *
 * Be accurate about the blast radius: friends, clans, direct messages and the
 * win/Elo record were in SQLite and are gone. Accounts, usernames, portfolios,
 * positions and trade history are in Supabase and were never touched. Saying
 * "we lost your data" without that second half reads far worse than what
 * actually happened.
 */
const SEEN_KEY = 'tvx_notice_dataloss_v1'

// localStorage throws in private mode and in some embedded webviews, and a
// throw here would take the whole app down with it. Absence just means "show
// it once this session", which is the right failure.
function seen() {
  try { return window.localStorage.getItem(SEEN_KEY) === '1' } catch { return false }
}
function markSeen() {
  try { window.localStorage.setItem(SEEN_KEY, '1') } catch { /* nothing to do: it shows once more next visit */ }
}

export default function DataLossNotice() {
  const [open, setOpen] = useState(false)
  const panelRef = useRef(null)
  const closeRef = useRef(null)
  const returnTo = useRef(null)

  useEffect(() => {
    if (seen()) return undefined
    // After first paint, so the notice never sits between the user and the app
    // loading. Safari only grew requestIdleCallback recently, and the two APIs
    // take different second arguments, so they cannot share a call site.
    const show = () => setOpen(true)
    if (window.requestIdleCallback) {
      const id = window.requestIdleCallback(show, { timeout: 1200 })
      return () => window.cancelIdleCallback(id)
    }
    const id = window.setTimeout(show, 400)
    return () => window.clearTimeout(id)
  }, [])

  const dismiss = useCallback(() => {
    markSeen()
    setOpen(false)
    returnTo.current?.focus?.()
  }, [])

  useEffect(() => {
    if (!open) return undefined
    returnTo.current = document.activeElement
    closeRef.current?.focus()

    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); dismiss(); return }
      if (e.key !== 'Tab') return
      // Keep Tab inside the dialog: a modal the keyboard can walk out of is a trap
      // of the other kind, where focus goes somewhere the user cannot see.
      const focusable = panelRef.current?.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, dismiss])

  if (!open) return null

  return (
    <div
      role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget) dismiss() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        background: 'rgba(0,0,0,0.62)',
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dataloss-title"
        style={{
          width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto',
          background: 'var(--ink-800)', border: '1px solid var(--on-ink-border)', borderTop: '2px solid var(--ochre-300)',
          padding: 22, color: 'var(--paper)', fontFamily: 'var(--font-data)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
          <AlertTriangle aria-hidden style={{ width: 17, height: 17, color: 'var(--ochre-300)', flexShrink: 0 }} />
          <h2 id="dataloss-title" style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--ochre-300)' }}>
            Some data was lost
          </h2>
        </div>

        <p style={{ margin: '0 0 14px', fontSize: 14, lineHeight: 1.6, color: 'var(--on-ink-text-2)' }}>
          A database fault wiped part of the site. <strong style={{ color: 'var(--paper)', fontWeight: 700 }}>Friends
          lists, clans, direct messages and win history</strong> could not be recovered.
        </p>

        <p style={{ margin: '0 0 14px', fontSize: 14, lineHeight: 1.6, color: 'var(--on-ink-text-2)' }}>
          Your <strong style={{ color: 'var(--paper)', fontWeight: 700 }}>account, username, portfolio, positions and
          trade history are all intact</strong> — they were never affected.
        </p>

        <p style={{ margin: '0 0 20px', fontSize: 13, lineHeight: 1.6, color: 'var(--on-ink-text-3)' }}>
          Add your friends and clans back whenever you like. Everything saves properly now, and the database is backed
          up from here on.
        </p>

        <button
          ref={closeRef}
          type="button"
          onClick={dismiss}
          style={{
            width: '100%', padding: '12px 16px', cursor: 'pointer',
            background: 'var(--paper)', color: 'var(--ink-900)', border: '1px solid var(--paper)',
            fontFamily: 'inherit', fontSize: 13, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
          }}
        >
          Got it
        </button>
      </div>
    </div>
  )
}
