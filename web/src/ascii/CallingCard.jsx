import AsciiCanvas from './AsciiCanvas'
import { SCENES } from './scenes'

// A calling card: one of the ASCII scenes on a dark ground, fitted to its container's width.
export default function CallingCard({ scene = 'sunrise', cols = 140, rows = 22, fps = 0, label, style }) {
  const painter = SCENES[scene] || SCENES.sunrise
  return (
    <div style={{ background: '#07070a', border: '1px solid var(--on-ink-border)', overflow: 'hidden', ...style }}>
      <AsciiCanvas painter={painter} cols={cols} rows={rows} fit fps={fps} mode="tone" bg="#07070a" gamma={0.7} edge={3} label={label || `Calling card: ${scene}`} />
    </div>
  )
}
