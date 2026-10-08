import { useEffect, useRef, useState } from 'react'
import { canExportMp4, recordKillcamMp4, killcamFileName } from '../ascii/exportKillcam'

/**
 * Exports a killcam as an MP4.
 *
 * Only ever rendered for a trade the signed-in user owns — a killcam is a
 * trophy for your own trade, not something to lift off someone else's row.
 * Callers gate on that; this component refuses to render without it so the rule
 * cannot be lost at a call site.
 */
export default function ExportKillcamButton({ mine, anim, seed, ticker, pnl, handle, className = '', style }) {
  const [state, setState] = useState('idle')   // idle | working | error
  const [pct, setPct] = useState(0)
  const [note, setNote] = useState('')
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])

  if (!mine) return null

  const supported = canExportMp4()

  const run = async () => {
    if (state === 'working') return
    setState('working'); setPct(0); setNote('')
    try {
      const blob = await recordKillcamMp4({
        anim, seed, ticker, pnl, handle,
        onProgress: (p) => { if (alive.current) setPct(p) },
      })
      if (!alive.current) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = killcamFileName(ticker)
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
      setState('idle')
      setNote(`Saved · ${(blob.size / 1048576).toFixed(1)} MB`)
    } catch (err) {
      if (!alive.current) return
      setState('error')
      setNote(err?.message ?? 'Could not record the killcam')
    }
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, ...style }}>
      <button
        type="button"
        onClick={run}
        disabled={!supported || state === 'working'}
        title={supported
          ? 'Record this killcam as an MP4 you can post'
          : 'This browser cannot record MP4 — try Safari, or Chrome on a recent desktop'}
        className={className || 't-btn px-3 py-1.5'}
        style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}
      >
        {state === 'working' ? `Recording ${Math.round(pct * 100)}%` : 'Export MP4'}
      </button>
      {note && (
        <span
          role="status"
          style={{ fontSize: 11, color: state === 'error' ? 'var(--negative)' : 'var(--on-ink-text-3)' }}
        >
          {note}
        </span>
      )}
    </span>
  )
}
