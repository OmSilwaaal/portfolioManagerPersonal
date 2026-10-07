import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Bell, BellOff, BellRing, X, Check, Settings2, ArrowUpRight, ArrowDownRight, Zap } from 'lucide-react'
import {
  useGetMemecoinAlertPrefsQuery,
  useUpdateMemecoinAlertPrefsMutation,
  useGetMemecoinAlertEventsQuery,
  useMarkMemecoinAlertsReadMutation,
} from '../../api/memecoinAlertsApi'
import { useNotificationPermission, notify } from './useDesktopNotifications'

const POLL_MS = 60_000
// Remembering this per browser keeps the "turn alerts on" nudge from reappearing
// forever for someone who has already said no.
const DISMISS_KEY = 'travauxus.memeAlerts.nudgeDismissed'

const readDismissed = () => {
  try { return localStorage.getItem(DISMISS_KEY) === '1' } catch { return false }
}

const fmtAgo = (ts) => {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  return `${Math.round(s / 3600)}h ago`
}

function KindIcon({ kind, direction }) {
  if (kind === 'signal') return <Zap className="h-3.5 w-3.5 shrink-0 text-[#d6b87a]" />
  return direction === 'down'
    ? <ArrowDownRight className="h-3.5 w-3.5 shrink-0 text-[#d35c4a]" />
    : <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-[#7ea968]" />
}

/**
 * Bell + alert feed for the terminal top bar.
 *
 * The server decides what counts as an alert (one source of truth with the SMS
 * path); this polls the resulting feed, raises a desktop notification for rows it
 * has not shown before, and prompts for permission when alerts are on but the
 * browser has not granted it.
 */
export default function MemecoinAlerts({ onSelectToken }) {
  const { data: prefsData } = useGetMemecoinAlertPrefsQuery()
  const [savePrefs, { isLoading: saving }] = useUpdateMemecoinAlertPrefsMutation()
  const [markRead] = useMarkMemecoinAlertsReadMutation()
  const { supported, permission, granted, request } = useNotificationPermission()

  const prefs = prefsData?.prefs
  const enabled = Boolean(prefs?.enabled)

  const { data: eventsData } = useGetMemecoinAlertEventsQuery(50, {
    pollingInterval: enabled ? POLL_MS : 0,
    skip: !enabled,
  })
  const events = useMemo(() => eventsData?.events ?? [], [eventsData])
  const unread = eventsData?.unread ?? 0

  const [open, setOpen] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [dismissed, setDismissed] = useState(readDismissed)

  // Desktop notifications for rows we have not already surfaced. Seeded on the
  // first load so enabling alerts doesn't dump the whole backlog on screen.
  const shown = useRef(null)
  useEffect(() => {
    if (!enabled || !events.length) return
    if (shown.current === null) {
      shown.current = new Set(events.map((e) => e.id))
      return
    }
    const fresh = events.filter((e) => !shown.current.has(e.id) && !e.read)
    for (const e of fresh.slice(0, 3).reverse()) {
      shown.current.add(e.id)
      notify({
        title: e.kind === 'signal' ? `Signal: ${e.symbol}` : `${e.symbol} ${e.direction === 'down' ? 'down' : 'up'} ${Math.abs(e.changePct ?? 0).toFixed(0)}%`,
        body: e.message,
        tag: `${e.address}:${e.kind}`,
        onClick: () => onSelectToken?.(e.address),
      })
    }
    for (const e of fresh) shown.current.add(e.id)
  }, [events, enabled, onSelectToken])

  const turnOn = async () => {
    if (supported && permission === 'default') await request()
    await savePrefs({ enabled: true }).unwrap().catch(() => {})
    setDismissed(false)
  }

  const dismissNudge = () => {
    setDismissed(true)
    try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* storage blocked */ }
  }

  const openPanel = () => {
    setOpen((v) => !v)
    if (!open && unread) markRead(Date.now()).catch(() => {})
  }

  // ── the nudge: alerts off, or on but the browser is still blocking them ──
  const needsPermission = enabled && supported && permission !== 'granted'
  const showNudge = !dismissed && (!enabled || needsPermission)

  return (
    <div className="relative flex items-center gap-2">
      {showNudge && (
        <div className="hidden items-center gap-2 rounded-full border border-[#9eae84]/30 bg-[#9eae84]/10 py-1 pl-3 pr-1 text-[11px] text-[#c8d3b6] lg:flex">
          <BellRing className="h-3.5 w-3.5 shrink-0" />
          <span className="whitespace-nowrap">
            {enabled ? 'Allow notifications for price moves & signals' : 'Get alerted on big moves & strong signals'}
          </span>
          <button
            onClick={enabled ? request : turnOn}
            disabled={saving}
            className="rounded-full bg-[#9eae84] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#0b0b0b] transition hover:brightness-110 disabled:opacity-50"
          >
            {enabled ? 'Allow' : 'Turn on'}
          </button>
          <button onClick={dismissNudge} aria-label="Dismiss" className="rounded-full p-1 text-[#a39d8d] transition hover:text-white">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      <button
        onClick={openPanel}
        title={enabled ? 'Memecoin alerts' : 'Memecoin alerts are off'}
        aria-label="Memecoin alerts"
        className="relative rounded-full bg-white/5 p-2 text-[#a39d8d] backdrop-blur-md transition hover:bg-white/10 hover:text-white"
      >
        {enabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-[#d35c4a] px-1 text-[9px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setShowSettings(false) }} />
          <div className="absolute right-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-white/10 bg-[#121212]/95 shadow-[0_30px_70px_-30px_rgba(0,0,0,0.9)] backdrop-blur-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#c9c3b3]">Alerts</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setShowSettings((v) => !v)}
                  aria-label="Alert settings"
                  className={`rounded-full p-1.5 transition ${showSettings ? 'bg-white/10 text-white' : 'text-[#a39d8d] hover:text-white'}`}
                >
                  <Settings2 className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => setOpen(false)} aria-label="Close" className="rounded-full p-1.5 text-[#a39d8d] transition hover:text-white">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {showSettings ? (
              <AlertSettings prefs={prefs} sms={prefsData?.sms} onSave={savePrefs} saving={saving}
                             permission={permission} supported={supported} onRequest={request} />
            ) : !enabled ? (
              <div className="px-4 py-6 text-center">
                <BellRing className="mx-auto mb-2 h-6 w-6 text-[#9eae84]" />
                <p className="text-xs text-[#a39d8d]">
                  Alerts are off. Turn them on to be told when a memecoin makes a big move or a strong signal fires.
                </p>
                <button
                  onClick={turnOn}
                  disabled={saving}
                  className="mt-3 rounded-full bg-[#9eae84] px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#0b0b0b] transition hover:brightness-110 disabled:opacity-50"
                >
                  Turn on alerts
                </button>
              </div>
            ) : (
              <>
                {supported && permission !== 'granted' && (
                  <button
                    onClick={request}
                    className="flex w-full items-center gap-2 border-b border-white/10 bg-[#d6b87a]/10 px-3 py-2 text-left text-[11px] text-[#d6b87a] transition hover:bg-[#d6b87a]/15"
                  >
                    <BellRing className="h-3.5 w-3.5 shrink-0" />
                    {permission === 'denied'
                      ? 'Notifications are blocked in your browser settings — alerts still appear here.'
                      : 'Allow desktop notifications to be told while this tab is in the background.'}
                  </button>
                )}
                <ul className="max-h-80 divide-y divide-white/5 overflow-y-auto">
                  {events.length === 0 && (
                    <li className="px-4 py-6 text-center text-xs text-[#555143]">
                      Nothing yet. You'll be told when a token crosses your thresholds.
                    </li>
                  )}
                  {events.map((e) => (
                    <li key={e.id}>
                      <button
                        onClick={() => { onSelectToken?.(e.address); setOpen(false) }}
                        className={`flex w-full items-start gap-2 px-3 py-2.5 text-left transition hover:bg-white/5 ${e.read ? 'opacity-60' : ''}`}
                      >
                        <span className="mt-0.5"><KindIcon kind={e.kind} direction={e.direction} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs text-[#f0ebe0]">{e.message}</span>
                          <span className="mt-0.5 block text-[10px] text-[#555143]">
                            {e.kind === 'signal' ? 'Signal' : 'Price move'} · {fmtAgo(e.createdAt)}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

const FIELDS = [
  { key: 'movePct5m', label: '5m move', suffix: '%', min: 1, max: 1000, hint: 'Alert when a token moves this much in 5 minutes, up or down' },
  { key: 'movePct1h', label: '1h move', suffix: '%', min: 1, max: 5000, hint: 'Same, over an hour' },
  { key: 'minScore', label: 'Min signal', suffix: '/100', min: 1, max: 100, hint: 'Activity score that counts as a strong signal' },
  { key: 'minLiquidity', label: 'Min liquidity', suffix: '$', min: 0, max: 100000000, hint: 'Ignore tokens thinner than this' },
  { key: 'cooldownMin', label: 'Cooldown', suffix: 'min', min: 1, max: 1440, hint: 'Minimum gap between repeat alerts for the same token' },
]

function AlertSettings({ prefs, sms, onSave, saving, permission, supported, onRequest }) {
  const [draft, setDraft] = useState(() => ({ ...prefs }))
  const [error, setError] = useState(null)
  useEffect(() => { setDraft({ ...prefs }) }, [prefs])

  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }))

  const save = async () => {
    setError(null)
    const body = { enabled: draft.enabled, sms: draft.sms }
    for (const f of FIELDS) {
      const n = Number(draft[f.key])
      if (!Number.isFinite(n) || n < f.min || n > f.max) {
        setError(`${f.label} must be between ${f.min} and ${f.max}`)
        return
      }
      body[f.key] = n
    }
    const res = await onSave(body)
    if (res?.error) setError(res.error?.data?.error || 'Could not save')
  }

  return (
    <div className="space-y-3 px-3 py-3">
      <label className="flex items-center justify-between gap-3">
        <span className="text-xs text-[#f0ebe0]">Alerts on</span>
        <input
          type="checkbox"
          checked={Boolean(draft.enabled)}
          onChange={(e) => set('enabled', e.target.checked)}
          className="h-4 w-4 rounded border-white/20 bg-transparent text-[#9eae84] focus:ring-0 focus:ring-offset-0"
        />
      </label>

      <label className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-xs text-[#f0ebe0]">Also text me</span>
          <span className="block text-[10px] text-[#555143]">
            {!sms?.available ? 'SMS is not configured on this server'
              : !sms?.verified ? 'Verify a phone number in Settings first'
              : 'Uses your verified number'}
          </span>
        </span>
        <input
          type="checkbox"
          disabled={!sms?.available || !sms?.verified}
          checked={Boolean(draft.sms)}
          onChange={(e) => set('sms', e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-white/20 bg-transparent text-[#9eae84] disabled:opacity-40 focus:ring-0 focus:ring-offset-0"
        />
      </label>

      {supported && permission !== 'granted' && (
        <button onClick={onRequest} className="w-full rounded-lg border border-[#d6b87a]/30 bg-[#d6b87a]/10 px-2 py-1.5 text-[11px] text-[#d6b87a] transition hover:bg-[#d6b87a]/15">
          {permission === 'denied' ? 'Notifications blocked in browser settings' : 'Allow desktop notifications'}
        </button>
      )}

      <div className="space-y-2 border-t border-white/10 pt-3">
        {FIELDS.map((f) => (
          <label key={f.key} className="flex items-center justify-between gap-3" title={f.hint}>
            <span className="min-w-0 truncate text-[11px] text-[#a39d8d]">{f.label}</span>
            <span className="flex shrink-0 items-center gap-1">
              <input
                type="number"
                min={f.min}
                max={f.max}
                value={draft[f.key] ?? ''}
                onChange={(e) => set(f.key, e.target.value)}
                className="w-24 rounded border border-white/10 bg-black/40 px-2 py-1 text-right font-mono text-[11px] text-[#f0ebe0] focus:border-[#9eae84] focus:outline-none focus:ring-0"
              />
              <span className="w-8 text-[10px] text-[#555143]">{f.suffix}</span>
            </span>
          </label>
        ))}
      </div>

      {error && <p className="text-[11px] text-[#d35c4a]">{error}</p>}

      <button
        onClick={save}
        disabled={saving}
        className="flex w-full items-center justify-center gap-1.5 rounded-full bg-[#9eae84] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#0b0b0b] transition hover:brightness-110 disabled:opacity-50"
      >
        <Check className="h-3.5 w-3.5" /> {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}
