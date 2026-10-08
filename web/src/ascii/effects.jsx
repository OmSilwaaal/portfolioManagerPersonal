import { useEffect, useRef } from 'react'
import { cellMetrics, GRID_FONT } from './raster'
import { sampleGradient } from './palettes'

// Pro member effects. Every effect draws characters into a small grid that sits behind the profile chip.
export const EFFECTS = [
  { id: 'none',    label: 'None',    note: 'No effect' },
  { id: 'glow',    label: 'Halo',    note: 'A pulsing golden ring of characters' },
  { id: 'fire',    label: 'Fire',    note: 'Flames rising from the bottom edge' },
  { id: 'matrix',  label: 'Matrix',  note: 'Falling green code' },
  { id: 'sparkle', label: 'Sparkle', note: 'Twinkling stars around you' },
  { id: 'aurora',  label: 'Aurora',  note: 'Drifting ribbons of colour' },
  { id: 'waves',   label: 'Waves',   note: 'Rolling ASCII water' },
]

const rnd = Math.random
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v)
const HEAT_CHARS = ' .:^*sS#$@'
const GLOW_CHARS = ' .:+*'
const MATRIX_CHARS = '01<>/\\|=+*#$%&'
const SPARK = ['.', '+', '*', '+', '.']

// Each effect: init(cols, rows) -> state, draw(ctx, state, env). env = { cols, rows, t, dt, put, rect }
const FX = {
  fire: {
    init: (c, r) => ({ heat: new Float32Array(c * r) }),
    draw(ctx, s, { cols, rows, dt, put }) {
      const h = s.heat
      for (let c = 0; c < cols; c++) h[(rows - 1) * cols + c] = rnd() < 0.82 ? 0.55 + rnd() * 0.45 : 0.15
      const steps = Math.max(1, Math.round(dt / 42))
      for (let k = 0; k < steps; k++) {
        for (let r = 0; r < rows - 1; r++) {
          for (let c = 0; c < cols; c++) {
            const below = (rr, cc) => h[Math.min(rows - 1, rr) * cols + Math.max(0, Math.min(cols - 1, cc))]
            const v = (below(r + 1, c - 1) + below(r + 1, c) + below(r + 1, c + 1) + below(r + 2, c)) / 4
            h[r * cols + c] = Math.max(0, v - (0.045 + 0.05 * (1 - r / rows)))
          }
        }
      }
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const v = h[r * cols + c]
          if (v < 0.07) continue
          const [R, G, B] = sampleGradient('fire', clamp(v * 1.15))
          put(c, r, HEAT_CHARS[clamp(Math.floor(v * 10), 0, 9)], `rgba(${R},${G},${B},${clamp(v * 1.5)})`)
        }
      }
    },
  },
  glow: {
    init: () => ({}),
    draw(ctx, s, { cols, rows, t, put, rect }) {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const dx = Math.max(rect.x0 - c, 0, c - rect.x1), dy = Math.max(rect.y0 - r, 0, r - rect.y1)
          const d = Math.hypot(dx, dy * 1.7)
          if (d <= 0.2) continue
          const wave = 0.55 + 0.45 * Math.sin(t * 2.2 - d * 0.85)
          const v = clamp((1 - d / 6) * wave * 1.1)
          if (v < 0.08) continue
          const [R, G, B] = sampleGradient('amber', clamp(0.15 + v * 0.85))
          put(c, r, GLOW_CHARS[clamp(Math.floor(v * 5), 0, 4)], `rgba(${R},${G},${B},${clamp(v * 1.1)})`)
        }
      }
    },
  },
  matrix: {
    init: (c, r) => ({ drops: Array.from({ length: c }, () => ({ y: rnd() * r, v: 0.18 + rnd() * 0.5, len: 4 + Math.floor(rnd() * 8) })), grid: [] }),
    draw(ctx, s, { cols, rows, dt, put }) {
      s.drops.forEach((d, c) => {
        d.y += d.v * (dt / 42)
        if (d.y - d.len > rows) { d.y = -rnd() * 6; d.v = 0.18 + rnd() * 0.5; d.len = 4 + Math.floor(rnd() * 8) }
        for (let k = 0; k < d.len; k++) {
          const r = Math.floor(d.y) - k
          if (r < 0 || r >= rows) continue
          const f = 1 - k / d.len
          const ch = MATRIX_CHARS[(c * 7 + r * 13 + Math.floor(d.y * 2)) % MATRIX_CHARS.length]
          put(c, r, ch, k === 0 ? 'rgba(210,255,225,0.95)' : `rgba(40,${Math.round(150 + 90 * f)},90,${0.15 + 0.7 * f})`)
        }
      })
    },
  },
  sparkle: {
    init: (c, r) => ({ stars: Array.from({ length: Math.round(c * r * 0.05) }, () => ({ x: Math.floor(rnd() * c), y: Math.floor(rnd() * r), age: rnd() * 5, sp: 0.8 + rnd() * 1.6, hue: rnd() })) }),
    draw(ctx, s, { cols, rows, dt, put }) {
      s.stars.forEach((st) => {
        st.age += (dt / 1000) * st.sp
        if (st.age >= 5) { st.age = 0; st.x = Math.floor(rnd() * cols); st.y = Math.floor(rnd() * rows); st.hue = rnd() }
        const [R, G, B] = sampleGradient('violet', st.hue)
        const a = 1 - Math.abs(st.age - 2.5) / 2.5
        put(st.x, st.y, SPARK[Math.floor(st.age)], `rgba(${R},${G},${B},${clamp(a * 1.1)})`)
      })
    },
  },
  aurora: {
    init: () => ({}),
    draw(ctx, s, { cols, rows, t, put }) {
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          const w = Math.sin(c * 0.22 + t * 0.9) + Math.sin(c * 0.09 - t * 0.6 + r * 0.5) * 0.7 + Math.cos(r * 0.8 + t * 0.7)
          const v = clamp((w + 1.2) / 3.2)
          if (v < 0.35) continue
          const [R, G, B] = sampleGradient('mint', clamp((Math.sin(c * 0.1 + t * 0.4) + 1) / 2))
          const [R2, G2, B2] = sampleGradient('violet', clamp((Math.sin(c * 0.1 + t * 0.4 + 2) + 1) / 2))
          const mix = clamp((r / rows) * 1.2)
          put(c, r, GLOW_CHARS[clamp(Math.floor(v * 8), 1, 7)], `rgba(${Math.round(R + (R2 - R) * mix)},${Math.round(G + (G2 - G) * mix)},${Math.round(B + (B2 - B) * mix)},${clamp(v * 0.9)})`)
        }
      }
    },
  },
  waves: {
    init: () => ({}),
    draw(ctx, s, { cols, rows, t, put }) {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const w = Math.sin(c * 0.42 - t * 2.6 + r * 0.9) + Math.sin(c * 0.17 + t * 1.3 - r * 0.4) * 0.6
          if (w < 0.45) continue
          const [R, G, B] = sampleGradient('ice', clamp((r / rows) * 0.8 + 0.1))
          put(c, r, w > 1.2 ? '~' : w > 0.8 ? '-' : '.', `rgba(${R},${G},${B},${clamp(0.25 + (r / rows) * 0.6)})`)
        }
      }
    },
  },
}

/**
 * Draws the chosen effect behind its parent. Place inside a positioned container; `bleed` is how far
 * (px) the effect extends past the container on each side.
 */
export function AsciiAura({ effect, bleed = { top: 22, side: 10, bottom: 8 }, fontPx = 8, opacity = 1, style }) {
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)

  useEffect(() => {
    const fx = FX[effect]
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!fx || !wrap || !canvas) return undefined
    const ctx = canvas.getContext('2d')
    const m = cellMetrics(fontPx)
    let raf = 0
    let destroyed = false
    let visible = true
    let state
    let cols = 0, rows = 0, rect

    const setup = () => {
      const W = wrap.clientWidth, H = wrap.clientHeight
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      cols = Math.max(4, Math.floor(W / m.w)); rows = Math.max(3, Math.floor(H / m.h))
      rect = { x0: Math.floor(bleed.side / m.w), x1: cols - 1 - Math.floor(bleed.side / m.w), y0: Math.floor(bleed.top / m.h), y1: rows - 1 - Math.floor(bleed.bottom / m.h) }
      state = fx.init(cols, rows)
    }
    setup()

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const put = (c, r, ch, color) => {
      ctx.fillStyle = color
      ctx.fillText(ch, c * m.w, r * m.h + m.h * 0.82)
    }
    let last = performance.now()
    const t0 = last
    const frame = (now) => {
      if (destroyed) return
      raf = requestAnimationFrame(frame)
      if (!visible || document.hidden) { last = now; return }
      const dt = Math.min(now - last, 80)
      if (dt < 38 && !reduced) return // ~24fps is plenty for ASCII
      last = now
      ctx.clearRect(0, 0, wrap.clientWidth, wrap.clientHeight)
      ctx.font = `700 ${fontPx}px ${GRID_FONT}`
      ctx.textBaseline = 'alphabetic'
      fx.draw(ctx, state, { cols, rows, t: reduced ? 0 : (now - t0) / 1000, dt, put, rect })
      if (reduced) cancelAnimationFrame(raf)
    }
    raf = requestAnimationFrame(frame)

    const ro = new ResizeObserver(setup)
    ro.observe(wrap)
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting })
    io.observe(wrap)
    return () => { destroyed = true; cancelAnimationFrame(raf); ro.disconnect(); io.disconnect() }
  }, [effect, fontPx, bleed.top, bleed.side, bleed.bottom])

  if (!FX[effect]) return null
  return (
    <div
      ref={wrapRef}
      aria-hidden="true"
      style={{ position: 'absolute', top: -bleed.top, left: -bleed.side, right: -bleed.side, bottom: -bleed.bottom, pointerEvents: 'none', opacity, ...style }}
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  )
}

/** A slowly turning ASCII torus. Pure idle decoration. */
export function AsciiDonut({ cols = 46, rows = 22, fontPx = 8, palette = 'violet', style }) {
  const canvasRef = useRef(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const ctx = canvas.getContext('2d')
    const m = cellMetrics(fontPx)
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const W = Math.ceil(cols * m.w), H = rows * m.h
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr)
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const chars = '.,-~:;=!*#$@'
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let A = 1, B = 1, raf = 0, visible = true, last = 0, destroyed = false

    const render = () => {
      const out = new Array(cols * rows).fill(-1)
      const zb = new Float32Array(cols * rows)
      const e = Math.sin(A), g = Math.cos(A), cB = Math.cos(B), sB = Math.sin(B)
      for (let j = 0; j < 6.283; j += 0.07) {
        const d = Math.cos(j), fj = Math.sin(j), h = d + 2
        for (let i = 0; i < 6.283; i += 0.02) {
          const c = Math.sin(i), l = Math.cos(i)
          const D = 1 / (c * h * e + fj * g + 5)
          const t = c * h * g - fj * e
          const x = Math.floor(cols / 2 + cols * 0.375 * D * (l * h * cB - t * sB))
          const y = Math.floor(rows / 2 + rows * 0.68 * D * (l * h * sB + t * cB))
          const N = Math.floor(8 * ((fj * e - c * d * g) * cB - c * d * e - fj * g - l * d * sB))
          if (x >= 0 && x < cols && y >= 0 && y < rows && D > zb[y * cols + x]) {
            zb[y * cols + x] = D
            out[y * cols + x] = N > 0 ? Math.min(11, N) : 0
          }
        }
      }
      ctx.clearRect(0, 0, W + 2, H + 2)
      ctx.font = `700 ${fontPx}px ${GRID_FONT}`
      ctx.textBaseline = 'alphabetic'
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const v = out[r * cols + c]
          if (v < 0) continue
          const [R, G, Bc] = sampleGradient(palette, v / 11)
          ctx.fillStyle = `rgb(${R},${G},${Bc})`
          ctx.fillText(chars[v], c * m.w, r * m.h + m.h * 0.82)
        }
      }
    }

    render()
    const frame = (now) => {
      if (destroyed) return
      raf = requestAnimationFrame(frame)
      if (!visible || document.hidden || now - last < 45) return
      last = now
      A += 0.035; B += 0.018
      render()
    }
    if (!reduced) raf = requestAnimationFrame(frame)
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting })
    io.observe(canvas)
    return () => { destroyed = true; cancelAnimationFrame(raf); io.disconnect() }
  }, [cols, rows, fontPx, palette])
  return <canvas ref={canvasRef} aria-hidden="true" style={{ display: 'block', ...style }} />
}
