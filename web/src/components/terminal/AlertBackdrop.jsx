import { useMemo, useRef } from 'react'
import AsciiCanvas from '../../ascii/AsciiCanvas'
import { useAsciiGrid, useThemeTokens } from './asciiSurface'

/**
 * Moving ASCII grain behind the live alert rail.
 *
 * Same discipline as LogoBackdrop: drawn in --terminal-texture on
 * --terminal-canvas, roughly 1.13:1 apart, so it is grain in the surface rather
 * than a picture. The job is contrast — a flat dark box next to a dark top bar
 * reads as nothing, and an empty box that is obviously a box reads as broken —
 * so the rail gets a surface with some life in it and the alert text sits on top
 * as the only bright thing.
 *
 * The one thing it does that the logo backdrop does not: the ridges are drawn
 * thin across the middle band and thick at the top and bottom edges, so the
 * texture is quietest exactly where the alert's own words are. It frames the
 * text instead of competing with it.
 */

const CELL_PX = 11      // small cells: the box is only ~44px tall, so a coarse grid would be three rows of nothing
const FPS = 8           // ambient; the alert itself is the thing that should catch the eye
const MAX_CELLS = 1400  // a wide display must not turn a 44px strip into real work

const FALLBACK = { '--terminal-texture': '#1d1b12', '--terminal-canvas': '#0d0c08' }

/** Travelling ridges, quiet in the middle. `rows` sets how many, so the grain stays even at any height. */
function makePainter(colour) {
  return function paintWave(ctx, { U, V, rows, t }) {
    ctx.strokeStyle = colour
    const lines = Math.max(4, rows + 2)
    for (let i = 0; i < lines; i++) {
      const base = ((i + 1) / (lines + 1)) * V
      // 0 at the vertical centre, 1 at the edges: the mask that keeps the text band clear
      const edgeness = Math.abs(base / V - 0.5) * 2
      ctx.lineWidth = 0.14 + 0.5 * Math.pow(edgeness, 1.7)
      ctx.beginPath()
      // Two frequencies that do not divide into each other, so the pattern never
      // visibly repeats over the few seconds anyone looks at it.
      for (let x = 0; x <= U; x += 0.5) {
        const y = base
          + 0.42 * Math.sin(x * 0.21 - t * 1.25 + i * 0.9)
          + 0.20 * Math.sin(x * 0.073 + t * 0.6 - i * 0.4)
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
  }
}

export default function AlertBackdrop({ className, style }) {
  const hostRef = useRef(null)
  const tokens = useThemeTokens(hostRef, FALLBACK)
  const texture = tokens['--terminal-texture']
  const canvas = tokens['--terminal-canvas']
  const { cols, rows } = useAsciiGrid(hostRef, { cellPx: CELL_PX, maxCells: MAX_CELLS, minRows: 3 })
  const painter = useMemo(() => makePainter(texture), [texture])

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      className={className}
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', background: canvas, ...style }}
    >
      {cols > 0 && rows > 0 && (
        <AsciiCanvas
          painter={painter}
          cols={cols}
          rows={rows}
          fontPx={CELL_PX}
          fps={FPS}
          gamma={0.8}
          style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
        />
      )}
    </div>
  )
}
