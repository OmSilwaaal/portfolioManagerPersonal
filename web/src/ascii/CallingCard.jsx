import { useMemo } from 'react'
import AsciiCanvas from './AsciiCanvas'
import { SCENES } from './scenes'
import { SCENES2, makeSummit } from './scenes2'

export const ALL_SCENES = { ...SCENES, ...SCENES2 }

// A calling card: one of the ASCII scenes on a dark ground, fitted to its container's width.
// `progress` (0..1) only matters for the Ascent card, where it is how far up the mountain you are.
export default function CallingCard({ scene = 'sunrise', cols = 140, rows = 22, fps = 0, label, progress, style }) {
  const painter = useMemo(
    () => (scene === 'summit' ? makeSummit(progress ?? 0.35) : ALL_SCENES[scene] || ALL_SCENES.sunrise),
    [scene, progress]
  )
  return (
    <div style={{ background: '#07070a', border: '1px solid var(--on-ink-border)', overflow: 'hidden', ...style }}>
      <AsciiCanvas painter={painter} cols={cols} rows={rows} fit fps={fps} mode="tone" bg="#07070a" gamma={0.7} edge={3} label={label || `Calling card: ${scene}`} />
    </div>
  )
}
