import { useMemo } from 'react'
import AsciiCanvas from '../../ascii/AsciiCanvas'
import { tierIconPainter } from './tierIcons'

/**
 * One tier's ASCII icon. Static (fps 0): a 21x11 grid holds a silhouette, not a scene, so
 * there is nothing for motion to show, and eight animated grids is what made this page
 * expensive in the first place.
 */
export default function TierIcon({ id, color, size = 64, label }) {
  const fontPx = 5
  const cols = Math.max(6, Math.round(size / (fontPx * 0.6)))
  const rows = Math.max(5, Math.round(size / Math.round(fontPx * 1.18)))
  const painter = useMemo(() => tierIconPainter(id, color), [id, color])
  return <AsciiCanvas painter={painter} cols={cols} rows={rows} fontPx={fontPx} gamma={0.5} label={label} />
}
