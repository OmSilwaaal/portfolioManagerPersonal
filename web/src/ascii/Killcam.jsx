import { useMemo } from 'react'
import AsciiCanvas from './AsciiCanvas'
import { KILLCAMS, KILLCAM_LABELS, KILLCAM_EDGE, killcamFor } from './killcams'

// A looping ASCII killcam. `seed` picks a scene when `anim` isn't one of the known names.
export default function Killcam({ anim, seed, cols = 100, rows = 26, fps = 12, label, style }) {
  const key = killcamFor(anim ?? seed)
  const painter = useMemo(() => KILLCAMS[key], [key])
  return (
    <div style={{ position: 'relative', background: '#07070a', border: '1px solid var(--on-ink-border)', overflow: 'hidden', ...style }}>
      <AsciiCanvas painter={painter} cols={cols} rows={rows} fit fps={fps} mode="tone" bg="#07070a" gamma={0.7} edge={KILLCAM_EDGE[key] ?? 3} label={label || `Killcam: ${KILLCAM_LABELS[key]}`} />
      <span style={{ position: 'absolute', left: 8, bottom: 6, fontFamily: 'var(--font-sans)', fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.78)', textShadow: '0 1px 2px #000', pointerEvents: 'none' }}>
        {KILLCAM_LABELS[key]}
      </span>
      <span style={{ position: 'absolute', right: 8, top: 6, display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-sans)', fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', color: '#ff5a6a', textShadow: '0 1px 2px #000', pointerEvents: 'none' }}>
        <i style={{ width: 6, height: 6, borderRadius: '50%', background: '#ff3b4d', display: 'inline-block' }} /> REC
      </span>
    </div>
  )
}
