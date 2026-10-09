import { useEffect, useMemo, useRef, useState } from 'react'
import AsciiCanvas from '../../ascii/AsciiCanvas'

/**
 * The Travauxus mark turning slowly behind the terminal panels, as ASCII.
 *
 * Texture, not decoration: it is drawn in --terminal-texture on
 * --terminal-canvas, which sit 1.13:1 apart, so it reads as grain in the
 * surface. If you notice it as a logo straight away it is too strong.
 *
 * The grid is deliberately coarse with a large glyph — few big characters
 * rather than many small ones — because the ramp's light glyphs (. : - =) are
 * small marks inside a large cell, which is what "spread out" looks like here.
 * ascii/SpinLogo.jsx is the same mark drawn dense and in colour, for the places
 * where it is the subject rather than the background.
 */

const CELL_PX = 30          // glyph size; the cell is this wide, the ink much smaller
const FPS = 8               // ambient, so a third of the panel refresh rate is plenty
const MAX_CELLS = 3000      // ceiling on per-frame work however large the display
const RESIZE_QUIET_MS = 120 // reallocating the canvas mid-resize is a known jank source

const OUTER = [[0, -1], [1, 0], [0, 1], [-1, 0]]
const INNER = OUTER.map(([x, y]) => [x * 0.5, y * 0.5])
const DEPTH = 0.22

const FALLBACK = { texture: '#1d1b12', canvas: '#0d0c08' }

/**
 * Mark geometry, monochrome. SpinLogo reads its depth from a blue gradient,
 * which a single-colour backdrop cannot do, so depth here comes from line
 * weight instead: nearer edges are drawn thicker, cover more of their cell, and
 * land on a denser glyph. The spin still reads, in one colour.
 */
function makePainter(colour) {
  return function paintMark(ctx, { U, V, t }) {
    const cx = U / 2
    // The tilt and the perspective both push the near, lower half outwards, so
    // the ink does not sit symmetrically about the geometric centre; nudging up
    // by 2.5% of the height evens out the clearance top and bottom.
    const cy = V / 2 - V * 0.025
    // The painter's units are cell widths, so a span of R reads as R cells across
    // but only R/aspect cells down — meaning R has to be measured against
    // whichever of U and V is scarcer, or the mark runs off the top and bottom.
    // 0.40 fills the floor rather than sitting in the middle of it, while
    // leaving clearance at the widest point of the turn: the tilt swings the
    // vertical extent to about 1.25x the nominal radius, so sizing right up to
    // the edge would clip twice a revolution.
    const R = Math.min(U, V) * 0.4
    const a = t * 0.42 // ~15s a revolution
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    const CT = Math.cos(0.3)
    const ST = Math.sin(0.3)

    const project = ([x, y], z) => {
      // turn about the vertical axis, then a fixed tilt so the slab has a visible
      // top face and does not read as a flat plate pivoting in place
      const X = x * ca + z * sa
      const zr = -x * sa + z * ca
      const Y = y * CT - zr * ST
      const Z = y * ST + zr * CT
      const k = 1 / (1 - Z * 0.35) // mild perspective, so the turn has a near and a far side
      return [cx + X * R * k, cy + Y * R * k, Z]
    }

    ctx.strokeStyle = colour
    const loop = (pts, z, base) => {
      const p = pts.map((v) => project(v, z))
      for (let i = 0; i < p.length; i++) {
        const [x0, y0, z0] = p[i]
        const [x1, y1, z1] = p[(i + 1) % p.length]
        // depth -> weight: the near edge is up to 2.2x the far edge
        ctx.lineWidth = base * (0.6 + 0.8 * (0.5 + (z0 + z1) / 2))
        ctx.beginPath()
        ctx.moveTo(x0, y0)
        ctx.lineTo(x1, y1)
        ctx.stroke()
      }
    }

    const front = ca >= 0
    loop(OUTER, front ? -DEPTH : DEPTH, 0.5)
    loop(INNER, front ? -DEPTH : DEPTH, 0.42)
    for (const v of OUTER) { // struts joining the two faces, so it reads as a slab
      const [x0, y0, z0] = project(v, -DEPTH)
      const [x1, y1, z1] = project(v, DEPTH)
      ctx.lineWidth = 0.4 * (0.6 + 0.8 * (0.5 + (z0 + z1) / 2))
      ctx.beginPath()
      ctx.moveTo(x0, y0)
      ctx.lineTo(x1, y1)
      ctx.stroke()
    }
    loop(OUTER, front ? DEPTH : -DEPTH, 0.75)
    loop(INNER, front ? DEPTH : -DEPTH, 0.6)
  }
}

/** The two tokens, re-read whenever the theme flips. */
function useThemeColours(ref) {
  const [colours, setColours] = useState(FALLBACK)
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const read = () => {
      const cs = getComputedStyle(el)
      const texture = cs.getPropertyValue('--terminal-texture').trim()
      const canvas = cs.getPropertyValue('--terminal-canvas').trim()
      setColours((prev) => {
        const next = { texture: texture || FALLBACK.texture, canvas: canvas || FALLBACK.canvas }
        return next.texture === prev.texture && next.canvas === prev.canvas ? prev : next
      })
    }
    read()
    // The app toggles `dark` on <html>, so the class attribute is the signal.
    const mo = new MutationObserver(read)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => mo.disconnect()
  }, [ref])
  return colours
}

/** Grid that covers the host box at CELL_PX, capped so a huge display cannot run away. */
function useGrid(ref) {
  const [grid, setGrid] = useState({ cols: 0, rows: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    let quiet = 0
    const measure = () => {
      const { width, height } = el.getBoundingClientRect()
      if (width < 2 || height < 2) return // first layout pass can report ~0; wait for a real one
      const cw = CELL_PX * 0.6           // monospace advance is about 0.6em
      const ch = CELL_PX * 1.18
      let cols = Math.max(12, Math.ceil(width / cw))
      let rows = Math.max(6, Math.ceil(height / ch))
      if (cols * rows > MAX_CELLS) {
        const k = Math.sqrt(MAX_CELLS / (cols * rows))
        cols = Math.max(12, Math.floor(cols * k))
        rows = Math.max(6, Math.floor(rows * k))
      }
      setGrid((prev) => (prev.cols === cols && prev.rows === rows ? prev : { cols, rows }))
    }
    measure()
    const ro = new ResizeObserver(() => {
      clearTimeout(quiet)
      quiet = setTimeout(measure, RESIZE_QUIET_MS)
    })
    ro.observe(el)
    return () => { clearTimeout(quiet); ro.disconnect() }
  }, [ref])
  return grid
}

export default function LogoBackdrop({ className, style }) {
  const hostRef = useRef(null)
  const { texture, canvas } = useThemeColours(hostRef)
  const { cols, rows } = useGrid(hostRef)
  const painter = useMemo(() => makePainter(texture), [texture])

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      className={className}
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none', // it sits under draggable panels and must never take a pointer event
        background: canvas,
        ...style,
      }}
    >
      {cols > 0 && rows > 0 && (
        <AsciiCanvas
          painter={painter}
          cols={cols}
          rows={rows}
          fontPx={CELL_PX}
          fps={FPS}
          gamma={0.75}
          style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
        />
      )}
    </div>
  )
}
