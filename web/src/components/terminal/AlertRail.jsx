import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { ArrowDownRight, ArrowUpRight, Zap } from 'lucide-react'
import AlertBackdrop from './AlertBackdrop'
import {
  useGetMemecoinAlertPrefsQuery,
  useGetMemecoinAlertEventsQuery,
} from '../../api/memecoinAlertsApi'

/**
 * Live alerts, in the dead space to the right of the search bar.
 *
 * Request budget: none of its own. Both queries are subscribed with
 * pollingInterval 0 and the same arguments MemecoinAlerts uses (`50` for the
 * events), so they are the same RTK Query cache entries — MemecoinAlerts owns
 * the poll and the refetch-on-volatility, and this rail reads whatever that
 * produces. It never writes: marking read stays with the bell.
 *
 * One alert is on screen at a time. When more arrive they queue and are shown in
 * the order they happened, so a burst is three things you can read rather than
 * one thing you can't.
 */

const EVENT_LIMIT = 50   // must match MemecoinAlerts, or this becomes a second cache entry and a second request
const ANIM_MS = 420      // keep in step with the t-alert-* keyframes in terminal.css
const HOLD_MS = 2600     // dwell before the next queued alert pushes this one down

const reducedMotion = () => (typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) || false

function subscribeReduced(cb) {
  const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
  mq?.addEventListener?.('change', cb)
  return () => mq?.removeEventListener?.('change', cb)
}

function KindIcon({ kind, direction }) {
  if (kind === 'signal') return <Zap className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--ochre-300)' }} />
  return direction === 'down'
    ? <ArrowDownRight className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--negative)' }} />
    : <ArrowUpRight className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--positive)' }} />
}

const ago = (ts) => {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.round(s / 60)}m`
  return `${Math.round(s / 3600)}h`
}

function AlertLine({ e, onSelect }) {
  const sym = e.symbol || ''
  // The server writes its messages as "WIFHAT up 34% in 5m"; repeating the ticker in front of
  // that reads as a stutter, so the chip is only drawn when the sentence does not already open
  // with it.
  const leads = sym && String(e.message || '').toUpperCase().startsWith(sym.toUpperCase())
  return (
    <button
      type="button"
      onClick={() => e.address && onSelect?.(e.address)}
      className="t-alert-line"
      title={`${e.message} — ${ago(e.createdAt)} ago. Click to open ${sym || 'the token'}.`}
    >
      <KindIcon kind={e.kind} direction={e.direction} />
      {!leads && <span className="t-alert-sym">{sym || 'ALERT'}</span>}
      <span className="t-alert-msg">{e.message}</span>
      <span className="t-alert-age">{ago(e.createdAt)}</span>
    </button>
  )
}

export default function AlertRail({ onSelectToken, className = '' }) {
  const reduced = useSyncExternalStore(subscribeReduced, reducedMotion, () => false)

  const { data: prefsData } = useGetMemecoinAlertPrefsQuery()
  const enabled = Boolean(prefsData?.prefs?.enabled)
  const { data } = useGetMemecoinAlertEventsQuery(EVENT_LIMIT, { skip: !enabled, pollingInterval: 0 })
  const events = useMemo(() => (Array.isArray(data?.events) ? data.events : []), [data])

  // cur is on screen; prev is the one being pushed out from under it.
  const [view, setView] = useState({ cur: null, prev: null, seq: 0 })
  const [pending, setPending] = useState([])
  const seen = useRef(null)

  /* Ingest. The first batch is a backlog, not news: it lands without animating,
     otherwise opening the terminal replays everything that happened overnight. */
  useEffect(() => {
    if (!enabled) { seen.current = null; setPending([]); setView({ cur: null, prev: null, seq: 0 }); return }
    if (!events.length) return
    if (seen.current === null) {
      seen.current = new Set(events.map((e) => e.id))
      setView({ cur: events[0], prev: null, seq: 1 })
      return
    }
    const fresh = events.filter((e) => !seen.current.has(e.id))
    if (!fresh.length) return
    for (const e of fresh) seen.current.add(e.id)
    // events arrive newest-first; present them in the order they actually happened
    setPending((q) => [...q, ...fresh.slice().reverse()])
  }, [events, enabled])

  /* Advance the queue. Under reduced motion there is no dwell and no transition:
     the newest alert is simply what is shown. */
  useEffect(() => {
    if (!pending.length) return undefined
    if (reduced) {
      setView({ cur: pending[pending.length - 1], prev: null, seq: 0 })
      setPending([])
      return undefined
    }
    const next = pending[0]
    const t = setTimeout(() => {
      setView((v) => ({ cur: next, prev: v.cur, seq: v.seq + 1 }))
      setPending((q) => (q[0] === next ? q.slice(1) : q))
    }, view.cur ? HOLD_MS : 0)
    return () => clearTimeout(t)
  }, [pending, view.cur, view.seq, reduced])

  /* Retire the outgoing alert once its slide has finished. Keyed on seq, so a
     faster-than-expected next alert cancels this one instead of stacking. */
  useEffect(() => {
    if (!view.prev) return undefined
    const t = setTimeout(() => setView((v) => ({ ...v, prev: null })), ANIM_MS)
    return () => clearTimeout(t)
  }, [view.prev, view.seq])

  // Nothing to say: no box, no animation, no canvas. The dead space is better than a lit empty frame.
  if (!enabled || !view.cur) return null

  const more = pending.length
  return (
    <div className={`t-alert-rail ${className}`} role="status" aria-live="polite" aria-atomic="false">
      <AlertBackdrop />
      <span className="t-alert-tag">Live</span>
      <div className="t-alert-stage" data-animating={view.prev ? 'true' : undefined}>
        {view.prev && (
          <div key={`out-${view.seq}`} className="t-alert-slot t-alert-out" aria-hidden="true">
            <AlertLine e={view.prev} onSelect={onSelectToken} />
          </div>
        )}
        <div key={`in-${view.seq}`} className={`t-alert-slot ${view.prev ? 't-alert-in' : ''}`}>
          <AlertLine e={view.cur} onSelect={onSelectToken} />
        </div>
      </div>
      {more > 0 && <span className="t-alert-more" title={`${more} more alert${more > 1 ? 's' : ''} queued`}>+{more}</span>}
    </div>
  )
}
