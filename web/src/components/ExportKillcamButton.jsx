import { useEffect, useRef, useState } from 'react'
import { canExportMp4, recordKillcamMp4, killcamFileName } from '../ascii/exportKillcam'
import { KILLCAM_LABELS, killcamFor } from '../ascii/killcams'

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
  // Which scene goes in the clip. Defaults to the one this trade already shows,
  // so the picker starts on what the card looks like and is purely opt-in.
  const [scene, setScene] = useState(() => killcamFor(anim ?? seed))
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])

  if (!mine) return null

  const supported = canExportMp4()

  const run = async () => {
    if (state === 'working') return
    setState('working'); setPct(0); setNote('')
    try {
      const blob = await recordKillcamMp4({
        anim: scene, seed, ticker, pnl, handle,
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
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', ...style }}>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
          Scene for the exported clip
        </span>
        <select
          value={scene}
          onChange={(e) => setScene(e.target.value)}
          disabled={state === 'working'}
          title="Choose which scene appears in the clip"
          className="t-btn px-2 py-1.5"
          style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', maxWidth: 160 }}
        >
          {Object.entries(KILLCAM_LABELS).map(([id, label]) => (
            <option key={id} value={id}>{label}</option>
          ))}
        </select>
      </label>
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
