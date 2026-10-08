import { sampleGradient } from './palettes'

export const GRID_FONT = "'Courier Prime', 'Courier New', monospace"
export const RAMP = ' .:-=+*#%@'
export const SCENE_RAMP = ' .:;+*oO%@'

const scratch = new Map()
function surface(w, h) {
  const key = `${w}x${h}`
  let s = scratch.get(key)
  if (!s) {
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    s = { canvas, ctx: canvas.getContext('2d', { willReadFrequently: true }) }
    if (scratch.size > 12) scratch.clear()
    scratch.set(key, s)
  }
  return s
}

export function cellMetrics(fontPx) {
  const m = document.createElement('canvas').getContext('2d')
  m.font = `700 ${fontPx}px ${GRID_FONT}`
  const w = m.measureText('M').width || fontPx * 0.6
  const h = Math.round(fontPx * 1.18)
  return { w, h, aspect: h / w }
}

/**
 * Paint something with ordinary canvas calls, then turn it into a grid of characters.
 *  painter(ctx, { U, V, cols, rows, t }) draws in "cell-width" units: U = cols wide, V = rows * aspect tall.
 *  mode 'coverage': density follows how much was painted (logos, icons on transparent)
 *  mode 'tone'    : density follows brightness (scenes painted on a dark ground)
 * Returns { cols, rows, code, r, g, b } with one entry per cell.
 */
export function rasterize(painter, cols, rows, { t = 0, aspect = 1.8, S = 2, mode = 'coverage', gamma = 0.9, edge = 0, S: _S } = {}) {
  const { canvas, ctx } = surface(cols * S, rows * S)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.setTransform(S, 0, 0, S / aspect, 0, 0)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  painter(ctx, { U: cols, V: rows * aspect, cols, rows, t })
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  const n = cols * rows
  const code = new Uint8Array(n)
  const R = new Uint8Array(n), G = new Uint8Array(n), B = new Uint8Array(n)
  const lum = new Float32Array(n), cov = new Float32Array(n)
  const W = canvas.width
  // pass 1: average colour, brightness and coverage per cell
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let a = 0, rr = 0, gg = 0, bb = 0
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const k = ((r * S + sy) * W + (c * S + sx)) * 4
          const al = data[k + 3]
          a += al; rr += data[k] * al; gg += data[k + 1] * al; bb += data[k + 2] * al
        }
      }
      const i = r * cols + c
      cov[i] = a / (S * S * 255)
      if (a === 0) continue
      R[i] = rr / a; G[i] = gg / a; B[i] = bb / a
      lum[i] = (0.2126 * R[i] + 0.7152 * G[i] + 0.0722 * B[i]) / 255
    }
  }
  // pass 2: density. Scenes get an edge boost so silhouettes read as outlines, not empty space.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c
      if (cov[i] === 0) continue
      let dens = cov[i]
      let cr = R[i], cg = G[i], cb = B[i]
      if (mode === 'tone') {
        dens = Math.min(1, lum[i] * 1.2) * cov[i]
        if (edge) {
          const right = c + 1 < cols ? lum[i + 1] : lum[i]
          const down = r + 1 < rows ? lum[i + cols] : lum[i]
          const left = c > 0 ? lum[i - 1] : lum[i]
          const up = r > 0 ? lum[i - cols] : lum[i]
          const e = Math.max(Math.abs(lum[i] - right), Math.abs(lum[i] - down), Math.abs(lum[i] - left), Math.abs(lum[i] - up))
          if (e * edge > dens) {
            dens = Math.min(1, e * edge)
            // take the brighter neighbour's colour so the outline glows with the thing it outlines
            let bi = i, bl = lum[i]
            const cand = [c + 1 < cols ? i + 1 : i, r + 1 < rows ? i + cols : i, c > 0 ? i - 1 : i, r > 0 ? i - cols : i]
            for (const j of cand) if (lum[j] > bl) { bl = lum[j]; bi = j }
            cr = R[bi]; cg = G[bi]; cb = B[bi]
          }
        }
      }
      const idx = Math.max(0, Math.min(9, Math.floor(Math.pow(dens, gamma) * 9.99)))
      code[i] = idx
      if (idx) {
        let k2 = 1
        if (mode === 'tone') {
          const mx = Math.max(cr, cg, cb) || 1
          k2 = (255 * (0.55 + 0.45 * Math.min(1, dens * 1.4))) / mx
        }
        R[i] = Math.min(255, cr * k2); G[i] = Math.min(255, cg * k2); B[i] = Math.min(255, cb * k2)
      }
    }
  }
  return { cols, rows, code, r: R, g: G, b: B }
}

/** Fill a rectangle area with a gradient from the shared palettes. */
export function gradientFill(ctx, palette, x0, y0, x1, y1) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1)
  const stops = 5
  for (let i = 0; i < stops; i++) {
    const t = i / (stops - 1)
    const [r, gg, b] = sampleGradient(palette, t)
    g.addColorStop(t, `rgb(${r},${gg},${b})`)
  }
  return g
}

/** Small deterministic random generator so scenes look the same every time. */
export function rng(seed) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13; s >>>= 0
    s ^= s >>> 17
    s ^= s << 5; s >>>= 0
    return s / 4294967296
  }
}
