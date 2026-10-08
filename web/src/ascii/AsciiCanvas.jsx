import { useEffect, useRef } from 'react'
import { rasterize, cellMetrics, GRID_FONT, RAMP, SCENE_RAMP } from './raster'

const RAMP_CODES = Array.from(RAMP, (c) => c.charCodeAt(0))
const SCENE_CODES = Array.from(SCENE_RAMP, (c) => c.charCodeAt(0))

/**
 * Renders a painter as coloured ASCII on a canvas.
 *  - give `cols`/`rows` for the grid; the canvas is `fontPx`-sized, or fitted to its container with `fit`
 *  - `fps` > 0 repaints over time (painter receives `t` in seconds); 0 draws once
 *  - `bg` paints a solid ground (scenes); omit for transparent (logos)
 */
export default function AsciiCanvas({
  painter, cols, rows, fontPx = 8, fit = false, fps = 0, mode = 'coverage', bg = null, gamma = 0.9, edge = 0,
  label, style, className,
}) {
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const state = useRef({ visible: true })

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return undefined
    const ctx = canvas.getContext('2d')
    let raf = 0
    let timer = 0
    let destroyed = false
    let px = fontPx
    let metrics = cellMetrics(px)
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    const size = () => {
      if (fit) {
        const w = wrap.clientWidth || cols * metrics.w
        // font size at which `cols` characters span the container width
        px = Math.max(4, (w / cols) / (cellMetrics(10).w / 10))
        metrics = cellMetrics(px)
      }
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const W = Math.ceil(cols * metrics.w)
      const H = rows * metrics.h
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
      canvas.style.width = `${W}px`
      canvas.style.height = `${H}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const draw = (t) => {
      const img = rasterize(painter, cols, rows, { t, aspect: metrics.aspect, mode, gamma, edge })
      const W = cols * metrics.w
      ctx.clearRect(0, 0, W + 2, rows * metrics.h + 2)
      if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, W + 2, rows * metrics.h + 2) }
      ctx.font = `700 ${px}px ${GRID_FONT}`
      ctx.textBaseline = 'alphabetic'
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c
          const idx = img.code[i]
          if (!idx) continue
          ctx.fillStyle = `rgb(${img.r[i]},${img.g[i]},${img.b[i]})`
          ctx.fillText(String.fromCharCode((mode === 'tone' ? SCENE_CODES : RAMP_CODES)[idx]), c * metrics.w, r * metrics.h + metrics.h * 0.82)
        }
      }
    }

    const start = performance.now()
    const loop = () => {
      if (destroyed) return
      if (state.current.visible && !document.hidden) draw((performance.now() - start) / 1000)
      timer = setTimeout(() => { raf = requestAnimationFrame(loop) }, 1000 / fps)
    }

    const boot = () => {
      size()
      draw(0)
      if (fps > 0 && !reduced) loop()
    }
    // draw once now, and again when the web fonts finish loading so the glyphs measure correctly
    boot()
    document.fonts?.ready?.then(() => { if (!destroyed) boot() })

    const ro = new ResizeObserver(() => { if (fit) { size(); draw(0) } })
    if (fit) ro.observe(wrap)
    const io = new IntersectionObserver(([e]) => { state.current.visible = e.isIntersecting })
    io.observe(wrap)

    return () => {
      destroyed = true
      cancelAnimationFrame(raf)
      clearTimeout(timer)
      ro.disconnect()
      io.disconnect()
    }
  }, [painter, cols, rows, fontPx, fit, fps, mode, bg, gamma, edge])

  return (
    <div ref={wrapRef} className={className} style={{ lineHeight: 0, ...style }}>
      <canvas ref={canvasRef} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} style={{ display: 'block' }} />
    </div>
  )
}
