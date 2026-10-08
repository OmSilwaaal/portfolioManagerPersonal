import { STAGES, WRAP_TEXT } from './content'

/* ── constants ───────────────────────────────────────────────────────────── */
// Greys on warm paper, index 0 = ink … 7 = faint
const TONES = ['#101010', '#232321', '#3a3a37', '#54544e', '#75756d', '#9a9a91', '#b8b8af', '#d2d1c9']
// One gradient per page: art is tinted left -> right, then eases to the next page's palette as you scroll
const GRADIENT_STEPS = 14
const GRAD_TONE = 100 // marker: "colour me with the live gradient"
const PALETTES = [
  [[29, 78, 216], [56, 189, 248]],   // cover: blue -> light blue
  [[15, 118, 110], [45, 212, 191]],  // premise: teal
  [[109, 40, 217], [232, 121, 249]], // news & impact: violet -> orchid
  [[180, 83, 9], [245, 158, 11]],    // picks: amber
  [[190, 18, 60], [251, 113, 133]],  // macro & crypto: rose
  [[29, 78, 216], [56, 189, 248]],   // begin: back to blue
]
const mix = (a, b, t) => a + (b - a) * t
const RAMP = ' .:-=+*#%@'
const SCRAMBLE = '01/\\|-+=*#<>[]{}%&@~^'
const SCRAMBLE_CODES = Array.from(SCRAMBLE, (c) => c.charCodeAt(0))
const GRID_FAMILY = '"Courier Prime", "Courier New", monospace'
const ART_FAMILY = '"Fraunces", "Times New Roman", Times, serif'

// Intro timeline (ms)
const T_LOGO_DRAW = [250, 1150]
const T_DIAMOND = [1250, 2350]
const T_LOGO_MOVE = [1500, 2800]
const T_WRAP = [1250, 3100]
const T_UNVEIL = [3100, 4800]
const INTRO_END = 4800

/* ── maths ───────────────────────────────────────────────────────────────── */
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v)
const span = (now, [a, b]) => clamp((now - a) / (b - a))
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const easeOut = (t) => 1 - Math.pow(1 - t, 3)

function hash2(a, b) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
function hash3(x, y, z) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2147483629)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
const fade = (t) => t * t * (3 - 2 * t)
function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z)
  const xf = fade(x - xi), yf = fade(y - yi), zf = fade(z - zi)
  const l = (a, b, t) => a + (b - a) * t
  return l(
    l(l(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), xf), l(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), xf), yf),
    l(l(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), xf), l(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), xf), yf),
    zf,
  )
}

/* ── grid + layouts ──────────────────────────────────────────────────────── */
function measureGrid(W, H) {
  const fontPx = W >= 1100 ? 15 : W >= 700 ? 14 : 13
  const m = document.createElement('canvas').getContext('2d')
  m.font = `400 ${fontPx}px ${GRID_FAMILY}`
  const cellW = m.measureText('M').width
  const cellH = Math.round(fontPx * 1.18)
  const cols = Math.floor(W / cellW)
  const rows = Math.floor(H / cellH)
  return {
    W, H, fontPx, cellW, cellH, cols, rows,
    mx: Math.max(2, Math.ceil(clamp(W * 0.04, 20, 56) / cellW)),
    mt: Math.ceil(68 / cellH),
    mb: Math.ceil(56 / cellH),
    offX: (W - cols * cellW) / 2,
    r: cellH / cellW,
    narrow: cols < 92,
  }
}

function newLayout(n) {
  return {
    code: new Uint16Array(n).fill(32),
    tone: new Uint8Array(n).fill(3),
    bold: new Uint8Array(n),
    cov: null,
    dyn: null,
    artCells: null,
    artCenter: null,
  }
}

function put(L, g, row, col, text, tone, bold = 0) {
  if (row < 0 || row >= g.rows) return
  for (let k = 0; k < text.length; k++) {
    const c = col + k
    if (c < 0 || c >= g.cols) continue
    const i = row * g.cols + c
    L.code[i] = text.charCodeAt(k)
    L.tone[i] = tone
    L.bold[i] = bold
  }
}

function wrapWords(text, width) {
  const out = []
  let line = ''
  for (const w of text.split(' ')) {
    if (!line) line = w
    else if (line.length + 1 + w.length <= width) line += ' ' + w
    else { out.push(line); line = w }
  }
  if (line) out.push(line)
  return out
}

/* ── illustrations: tiny canvas drawings rasterised into the ASCII grid ───── */
const TAU = Math.PI * 2
const ILLUS = {
  // solid sphere with a carved latitude/longitude grid
  globe(ctx, { cx, cy, R }) {
    ctx.fillStyle = 'rgba(0,0,0,0.96)'
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill()
    ctx.globalCompositeOperation = 'destination-out'
    ctx.strokeStyle = '#000'; ctx.lineWidth = R * 0.075
    for (const k of [0.42, 0.78]) { ctx.beginPath(); ctx.ellipse(cx, cy, R * k, R, 0, 0, TAU); ctx.stroke() }
    ctx.beginPath(); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke()
    for (const lat of [-0.52, 0, 0.52]) {
      const w = Math.sqrt(1 - lat * lat) * R
      ctx.beginPath(); ctx.moveTo(cx - w, cy + R * lat); ctx.lineTo(cx + w, cy + R * lat); ctx.stroke()
    }
    ctx.globalCompositeOperation = 'source-over'
  },

  // a feed: priority squares (act / watch / low) beside headline bars and sub-lines
  bars(ctx, { U, V }) {
    const rows = 4
    const rowH = V / (rows + 0.35)
    const sq = rowH * 0.62
    const lens = [1, 0.8, 0.9, 0.62]
    const alphas = [1, 0.7, 0.45, 0.25]
    for (let i = 0; i < rows; i++) {
      const y = rowH * 0.2 + i * rowH
      ctx.fillStyle = `rgba(0,0,0,${alphas[i]})`
      ctx.fillRect(U * 0.04, y, sq, sq)
      const x = U * 0.04 + sq + U * 0.05
      const W = (U * 0.94 - x) * lens[i]
      ctx.fillStyle = '#000'
      ctx.fillRect(x, y, W, sq * 0.4)
      ctx.fillRect(x, y + sq * 0.62, W * 0.62, sq * 0.2)
    }
  },

  // candlestick chart trending up
  chart(ctx, { U, V }) {
    // [open, close, high, low] in 0..1
    const c = [[0.25, 0.4, 0.46, 0.2], [0.4, 0.3, 0.45, 0.24], [0.3, 0.5, 0.56, 0.27], [0.5, 0.44, 0.58, 0.38], [0.44, 0.66, 0.72, 0.4], [0.66, 0.6, 0.74, 0.54], [0.6, 0.9, 0.95, 0.57]]
    const base = V * 0.9, span = V * 0.82
    const Y = (v) => base - v * span
    const bw = U * 0.085, step = (U * 0.88 - bw) / (c.length - 1)
    ctx.fillStyle = '#000'; ctx.strokeStyle = '#000'; ctx.lineWidth = U * 0.032; ctx.lineCap = 'butt'
    c.forEach(([o, cl, h, l], i) => {
      const x = U * 0.06 + i * step + bw / 2
      ctx.beginPath(); ctx.moveTo(x, Y(h)); ctx.lineTo(x, Y(l)); ctx.stroke()
      const top = Y(Math.max(o, cl)), hgt = Math.abs(Y(o) - Y(cl))
      if (cl >= o) {
        ctx.fillRect(x - bw / 2, top, bw, hgt)
      } else {
        ctx.clearRect(x - bw / 2, top, bw, hgt)
        ctx.lineWidth = V * 0.035
        ctx.strokeRect(x - bw / 2 + V * 0.0175, top + V * 0.0175, bw - V * 0.035, Math.max(0.1, hgt - V * 0.035))
        ctx.lineWidth = U * 0.032
      }
    })
    ctx.fillRect(U * 0.03, base + V * 0.03, U * 0.94, V * 0.035)
  },

  // one big bold arrow
  arrow(ctx, { U, V }) {
    const sx = U * 0.14, sy = V * 0.86, tx = U * 0.9, ty = V * 0.1
    const dx = tx - sx, dy = ty - sy, len = Math.hypot(dx, dy)
    const ux = dx / len, uy = dy / len, nx = -uy, ny = ux
    const headLen = Math.min(U, V) * 0.46, headW = Math.min(U, V) * 0.66
    const bx = tx - ux * headLen, by = ty - uy * headLen
    ctx.fillStyle = '#000'; ctx.strokeStyle = '#000'; ctx.lineWidth = Math.min(U, V) * 0.105; ctx.lineCap = 'butt'
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(bx + ux * headLen * 0.15, by + uy * headLen * 0.15); ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(tx, ty)
    ctx.lineTo(bx + nx * headW / 2, by + ny * headW / 2)
    ctx.lineTo(bx - nx * headW / 2, by - ny * headW / 2)
    ctx.closePath(); ctx.fill()
    ctx.fillRect(U * 0.04, V * 0.94, U * 0.5, V * 0.035)
  },

  // the capitol: steps, columns, entablature, drum, dome, lantern
  dome(ctx, { U, V, cx }) {
    ctx.fillStyle = '#000'
    ctx.fillRect(U * 0.06, V * 0.9, U * 0.88, V * 0.05)
    ctx.fillRect(U * 0.1, V * 0.85, U * 0.8, V * 0.05)
    const cols = 7, cw = U * 0.07, x0 = U * 0.15, span = U * 0.7 - cw
    for (let i = 0; i < cols; i++) ctx.fillRect(x0 + (i * span) / (cols - 1), V * 0.5, cw, V * 0.35)
    ctx.fillRect(U * 0.12, V * 0.43, U * 0.76, V * 0.07)
    ctx.fillRect(cx - U * 0.18, V * 0.32, U * 0.36, V * 0.11)
    ctx.globalCompositeOperation = 'destination-out'
    for (let i = 0; i < 4; i++) ctx.fillRect(cx - U * 0.135 + i * U * 0.09, V * 0.345, U * 0.04, V * 0.06)
    ctx.globalCompositeOperation = 'source-over'
    ctx.beginPath(); ctx.arc(cx, V * 0.32, U * 0.21, Math.PI, TAU); ctx.closePath(); ctx.fill()
    ctx.fillRect(cx - U * 0.035, V * 0.05, U * 0.07, V * 0.06)
    ctx.fillRect(cx - U * 0.01, V * 0.0, U * 0.02, V * 0.06)
  },

  // a pyramid of gold bars with separating gaps and a carved highlight
  ingots(ctx, { U, V }) {
    const w = U * 0.42, h = V * 0.26
    const bar = (x, y) => {
      ctx.fillStyle = '#000'
      ctx.beginPath()
      ctx.moveTo(x + h * 0.42, y); ctx.lineTo(x + w - h * 0.42, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h)
      ctx.closePath(); ctx.fill()
      ctx.globalCompositeOperation = 'destination-out'
      ctx.fillRect(x + h * 0.2, y + h * 0.3, w - h * 0.4, h * 0.09)
      ctx.globalCompositeOperation = 'source-over'
    }
    bar(U * 0.04, V * 0.7); bar(U * 0.54, V * 0.7); bar(U * 0.29, V * 0.4)
  },

  // a hexagonal coin with a bold B
  hex(ctx, { cx, cy, R }) {
    ctx.strokeStyle = '#000'; ctx.fillStyle = '#000'; ctx.lineJoin = 'miter'
    ctx.beginPath()
    for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + (k * TAU) / 6; ctx[k ? 'lineTo' : 'moveTo'](cx + R * 0.94 * Math.cos(a), cy + R * 0.94 * Math.sin(a)) }
    ctx.closePath(); ctx.lineWidth = R * 0.12; ctx.stroke()
    ctx.font = `900 ${R * 1.6}px ${ART_FAMILY}`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('B', cx, cy + R * 0.08)
  },
}

function rasterIllustration(kind, wCols, hRows, r) {
  const S = 3
  const cv = document.createElement('canvas')
  cv.width = Math.max(1, Math.floor(wCols * S))
  cv.height = Math.max(1, Math.floor(hRows * S))
  const ctx = cv.getContext('2d', { willReadFrequently: true })
  ctx.setTransform(S, 0, 0, S / r, 0, 0)
  ctx.lineCap = 'round'
  const U = wCols, V = hRows * r
  const draw = ILLUS[kind] || ILLUS.globe
  draw(ctx, { U, V, cx: U / 2, cy: V / 2, R: Math.min(U, V) * 0.46 })
  const data = ctx.getImageData(0, 0, cv.width, cv.height).data
  const cov = new Float32Array(wCols * hRows)
  for (let rr = 0; rr < hRows; rr++) {
    for (let cc = 0; cc < wCols; cc++) {
      let sum = 0
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) sum += data[((rr * S + sy) * cv.width + (cc * S + sx)) * 4 + 3]
      cov[rr * wCols + cc] = sum / (S * S * 255)
    }
  }
  return cov
}

// Mark every cell touched (or neighbouring) by art coverage as "dynamic" so noise can drift it
function finishArt(L, g) {
  const { cols, rows } = g
  L.dyn = new Uint8Array(cols * rows)
  const cells = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (L.cov[r * cols + c] <= 0.03) continue
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const y = r + dy, x = c + dx
          if (y < 0 || y >= rows || x < 0 || x >= cols) continue
          const i = y * cols + x
          if (!L.dyn[i]) { L.dyn[i] = 1; cells.push(i) }
        }
      }
    }
  }
  L.artCells = Int32Array.from(cells)
  for (const i of cells) {
    const idx = clamp(Math.floor(L.cov[i] * 9.99), 0, 9)
    L.code[i] = RAMP.charCodeAt(idx)
    L.tone[i] = GRAD_TONE
    L.bold[i] = 1
  }
}

function blockLines(b, width) {
  return [
    { t: '-'.repeat(width), tone: 5, bold: 0 },
    { t: '', tone: 3, bold: 0 },
    ...wrapWords(b.h, width).map((t) => ({ t, tone: 0, bold: 1 })),
    { t: b.tag, tone: 4, bold: 0 },
    { t: '', tone: 3, bold: 0 },
    ...wrapWords(b.p, width).map((t) => ({ t, tone: 1, bold: 0 })),
  ]
}

function buildText(def, g) {
  const L = newLayout(g.cols * g.rows)
  const { cols, rows, mx, mt, mb, r, narrow } = g
  L.kind = 'text'
  L.illus = true
  L.cov = new Float32Array(cols * rows)

  const n = def.blocks.length
  const usable = rows - mt - mb - 2
  const gapR = 3
  const gapC = 6
  let artW = narrow ? Math.min(cols - 2 * mx, 34) : clamp(Math.floor(cols * 0.27), 26, 46)
  const availH = Math.floor((usable - (n - 1) * gapR) / n)
  let plan
  for (;;) {
    const artH = narrow ? Math.max(6, Math.round(artW / r)) : clamp(Math.round(artW / r), 8, availH)
    const tw = narrow ? cols - 2 * mx : Math.min(54, cols - 2 * mx - artW - gapC)
    const lines = def.blocks.map((b) => blockLines(b, tw))
    const heights = lines.map((l) => (narrow ? artH + 1 + l.length : Math.max(artH, l.length)))
    const total = heights.reduce((a, b) => a + b, 0) + (n - 1) * gapR
    plan = { artH, tw, lines, heights, total }
    if (total <= usable || artW <= 14) break
    artW -= 2
  }

  const { artH, tw, lines, heights, total } = plan
  const groupW = narrow ? tw : artW + gapC + tw
  const c0 = narrow ? mx : Math.floor((cols - groupW) / 2)
  let row = mt + 1 + Math.max(0, Math.floor((usable - total) / 2))

  def.blocks.forEach((b, k) => {
    const artLeft = k % 2 === 0
    const artCol = narrow ? mx : artLeft ? c0 : c0 + tw + gapC
    const textCol = narrow ? mx : artLeft ? c0 + artW + gapC : c0
    const artRow = narrow ? row : row + Math.floor((heights[k] - artH) / 2)
    const textRow = narrow ? row + artH + 1 : row + Math.floor((heights[k] - lines[k].length) / 2)

    const cov = rasterIllustration(b.art, artW, artH, r)
    for (let rr = 0; rr < artH; rr++) {
      for (let cc = 0; cc < artW; cc++) {
        const R = artRow + rr, C = artCol + cc
        if (R >= 0 && R < rows && C >= 0 && C < cols) L.cov[R * cols + C] = cov[rr * artW + cc]
      }
    }
    lines[k].forEach((ln, j) => put(L, g, textRow + j, textCol, ln.t, ln.tone, ln.bold))
    row += heights[k] + gapR
  })

  finishArt(L, g)
  return L
}

function rasterWord(lines, wCols, hRows, r, ys) {
  const S = 3
  const cv = document.createElement('canvas')
  cv.width = Math.max(1, Math.floor(wCols * S))
  cv.height = Math.max(1, Math.floor(hRows * S))
  const ctx = cv.getContext('2d', { willReadFrequently: true })
  ctx.font = `900 100px ${ART_FAMILY}`
  const wmax = Math.max(...lines.map((l) => ctx.measureText(l).width))
  const cap = ctx.measureText('H').actualBoundingBoxAscent || 70
  const yk = ys / r // rows per cell-width unit of height
  const gapF = 0.18
  let F = ((wCols * 0.985) / wmax) * 100
  const need = (f) => (lines.length * (cap * f) / 100 + (lines.length - 1) * ((cap * f) / 100) * gapF) * yk
  if (need(F) > hRows * 0.98) F *= (hRows * 0.98) / need(F)
  const capU = (cap * F) / 100
  const lineH = capU * (1 + gapF)
  const blockU = lines.length * capU + (lines.length - 1) * capU * gapF
  const HU = hRows / yk
  const y0 = (HU - blockU) / 2 + capU

  ctx.setTransform(S, 0, 0, S * yk, 0, 0)
  ctx.font = `900 ${F}px ${ART_FAMILY}`
  ctx.fillStyle = '#000'
  ctx.textBaseline = 'alphabetic'
  lines.forEach((l, k) => {
    const w = ctx.measureText(l).width
    ctx.fillText(l, (wCols - w) / 2, y0 + k * lineH)
  })

  const data = ctx.getImageData(0, 0, cv.width, cv.height).data
  const cov = new Float32Array(wCols * hRows)
  const W = cv.width
  for (let rr = 0; rr < hRows; rr++) {
    for (let cc = 0; cc < wCols; cc++) {
      let sum = 0
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) sum += data[((rr * S + sy) * W + (cc * S + sx)) * 4 + 3]
      }
      cov[rr * wCols + cc] = sum / (S * S * 255)
    }
  }
  return cov
}

function buildArt(def, g) {
  const L = newLayout(g.cols * g.rows)
  const { cols, rows, mx, mt, mb, r, narrow, cellW, cellH } = g

  // caption (bottom-left) + hint (bottom-right)
  const capWidth = Math.min(cols - 2 * mx, narrow ? cols - 2 * mx : 62)
  const capLines = []
  ;(def.caption || []).forEach((t, k) => {
    wrapWords(t, capWidth).forEach((l) => capLines.push({ t: l, head: k === 0 && def.caption.length > 1 }))
  })
  const capRows = capLines.length ? capLines.length + 1 : 0
  const capStart = rows - mb - capLines.length
  capLines.forEach((ln, k) => put(L, g, capStart + k, mx, ln.t, ln.head ? 0 : 3, ln.head ? 1 : 0))
  if (def.hint) put(L, g, narrow ? capStart - 2 : rows - mb - 1, cols - mx - def.hint.length, def.hint, 2, 1)

  // art box
  const reserve = def.reserveBottom || 0
  const ys = narrow ? 1.7 : 2.1
  const lines = narrow && def.linesNarrow ? def.linesNarrow : def.lines
  let top = mt + 1
  let bottom = rows - mb - capRows - 1 - reserve
  let c0 = mx
  let c1 = cols - mx - (narrow ? 0 : 4)
  let logoGeom = null

  if (def.logo) {
    if (narrow) {
      const size = 56
      logoGeom = { size, row: top, col: mx }
      top += Math.ceil(size / cellH) + 1
    } else {
      c0 = mx + Math.ceil(150 / cellW) + 4
    }
  }

  const wCols = Math.max(8, c1 - c0)
  const hRows = Math.max(4, bottom - top)
  const cov = rasterWord(lines, wCols, hRows, r, ys)

  L.kind = 'art'
  L.cov = new Float32Array(cols * rows)
  let minR = hRows, maxR = 0
  for (let rr = 0; rr < hRows; rr++) {
    for (let cc = 0; cc < wCols; cc++) {
      const v = cov[rr * wCols + cc]
      if (v > 0.03) { if (rr < minR) minR = rr; if (rr > maxR) maxR = rr }
      L.cov[(top + rr) * cols + c0 + cc] = v
    }
  }
  finishArt(L, g)

  const artRowsUsed = Math.max(1, maxR - minR + 1)
  const artMidRow = top + minR + artRowsUsed / 2
  L.artCenter = { row: artMidRow, col: (c0 + c1) / 2 }

  if (def.logo) {
    if (narrow) {
      L.logo = { x: g.offX + logoGeom.col * cellW, y: logoGeom.row * cellH, size: logoGeom.size }
    } else {
      const artH = artRowsUsed * cellH
      const size = clamp(artH * 0.82, 56, 150)
      L.logo = { x: g.offX + mx * cellW, y: artMidRow * cellH - size / 2, size }
    }
  }
  return L
}

function buildLayouts(g) {
  return STAGES.map((def) => (def.kind === 'art' ? buildArt(def, g) : buildText(def, g)))
}

/* ── engine ──────────────────────────────────────────────────────────────── */
export function createEngine({ canvas, getProgress, onFrame, onIntroDone, skipIntro = false, reduced = false }) {
  const ctx = canvas.getContext('2d')
  const N = STAGES.length
  let g, layouts, dpr, W, H
  let buckets = null
  let raf = 0
  let destroyed = false
  let p = getProgress()
  let lastNow = performance.now()
  const startedAt = lastNow
  let introDone = skipIntro || reduced
  let introNotified = false
  let resizeTimer = 0

  const out = { code: 32, tone: 3, bold: 0 }
  let artScale = 1 // <1 thins the art while it dissolves in or out
  const charCache = []
  const ch = (c) => charCache[c] || (charCache[c] = String.fromCharCode(c))

  function rebuild() {
    W = canvas.clientWidth
    H = canvas.clientHeight
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    g = measureGrid(W, H)
    layouts = buildLayouts(g)
    const n = g.cols * g.rows
    buckets = Array.from({ length: 2 * (8 + GRADIENT_STEPS) }, () => ({ idx: new Int32Array(n), code: new Uint16Array(n), n: 0 }))
  }

  function push(i, code, tone, bold) {
    if (code === 32) return
    if (tone === GRAD_TONE) tone = 8 + gradStep(i)
    const b = buckets[bold * (8 + GRADIENT_STEPS) + tone]
    b.idx[b.n] = i
    b.code[b.n] = code
    b.n++
  }

  // current gradient endpoints, eased toward the page palette for the scroll position
  const pal = { from: PALETTES[0][0].slice(), to: PALETTES[0][1].slice() }
  let gradColors = []
  function updatePalette(s, dt) {
    const a = Math.min(PALETTES.length - 1, Math.floor(s))
    const b = Math.min(PALETTES.length - 1, a + 1)
    const f = clamp(s - a)
    const k = f * f * (3 - 2 * f)
    const ease = reduced ? 1 : 1 - Math.exp(-dt / 220)
    for (let j = 0; j < 3; j++) {
      pal.from[j] += (mix(PALETTES[a][0][j], PALETTES[b][0][j], k) - pal.from[j]) * ease
      pal.to[j] += (mix(PALETTES[a][1][j], PALETTES[b][1][j], k) - pal.to[j]) * ease
    }
    gradColors = Array.from({ length: GRADIENT_STEPS }, (_, n) => {
      const t = n / (GRADIENT_STEPS - 1)
      return `rgb(${Math.round(mix(pal.from[0], pal.to[0], t))},${Math.round(mix(pal.from[1], pal.to[1], t))},${Math.round(mix(pal.from[2], pal.to[2], t))})`
    })
  }
  function gradStep(i) {
    const c = i % g.cols
    const r = (i / g.cols) | 0
    const t = clamp(0.9 * (c / g.cols) + 0.1 * (r / g.rows))
    return Math.round(t * (GRADIENT_STEPS - 1))
  }

  function sampleCov(cov, x, y) {
    const { cols, rows } = g
    const xi = Math.floor(x), yi = Math.floor(y)
    const xf = x - xi, yf = y - yi
    const at = (cx, cy) => (cx < 0 || cy < 0 || cx >= cols || cy >= rows ? 0 : cov[cy * cols + cx])
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1)
    return (a + (b - a) * xf) * (1 - yf) + (c + (d - c) * xf) * yf
  }

  // Resolve the settled glyph for cell i of layout L (art cells drift with noise)
  function settled(L, i, time) {
    if (L.dyn && L.dyn[i] && !reduced) {
      const { cols } = g
      const c = i % cols
      const r = (i / cols) | 0
      const tn = time * 0.00026
      const gain = L.illus ? 0.3 : 1
      const dx = (noise3(c * 0.06, r * 0.1, tn) - 0.5) * 2.0 * gain
      const dy = (noise3(c * 0.06 + 31.7, r * 0.1 + 17.3, tn + 9.1) - 0.5) * 1.2 * gain
      let v = sampleCov(L.cov, c + dx, r + dy) * artScale
      if (L.illus) v = clamp((v - 0.1) / 0.7) // push edges to solid ink / clean paper
      else if (v > 0.45) v *= 0.84 + (noise3(c * 0.15, r * 0.22, tn * 1.7 + 4.2) - 0.5) * 0.3
      const idx = clamp(Math.floor(v * 9.99), 0, 9)
      out.code = RAMP.charCodeAt(idx)
      out.tone = GRAD_TONE
      out.bold = 1
      return
    }
    out.code = L.code[i]
    out.tone = L.tone[i]
    out.bold = L.bold[i]
  }

  function wrapCode(r, c, shift) {
    const len = WRAP_TEXT.length
    return WRAP_TEXT.charCodeAt((((c + r * 11 + shift) % len) + len) % len)
  }

  function scrambleCell(i, local, time, fc, ft, fb, tc, tt, tb) {
    if (fc === 32 && tc === 32) return
    const bucket = Math.floor(time / 70)
    const roll = hash3(i, bucket, 7)
    if (roll < local * local * 0.9) push(i, tc, tt, tb)
    else push(i, SCRAMBLE_CODES[Math.floor(hash3(i, bucket + 3, 11) * SCRAMBLE_CODES.length)], 5, 0)
  }

  function flush() {
    const { cols, cellW, cellH, offX } = g
    const per = 8 + GRADIENT_STEPS
    for (let b = 0; b < 2 * per; b++) {
      const bk = buckets[b]
      if (!bk.n) continue
      const bold = b >= per ? 700 : 400
      const t = b % per
      ctx.font = `${bold} ${g.fontPx}px ${GRID_FAMILY}`
      ctx.fillStyle = t < 8 ? TONES[t] : gradColors[t - 8]
      for (let k = 0; k < bk.n; k++) {
        const i = bk.idx[k]
        const c = i % cols
        const r = (i / cols) | 0
        ctx.fillText(ch(bk.code[k]), offX + c * cellW, r * cellH + cellH * 0.82)
      }
      bk.n = 0
    }
  }

  function drawSettled(L, time) {
    const n = g.cols * g.rows
    for (let i = 0; i < n; i++) {
      if (!L.dyn || !L.dyn[i]) { if (L.code[i] === 32) continue }
      settled(L, i, time)
      push(i, out.code, out.tone, out.bold)
    }
  }

  function drawBlend(A, B, tt, time, style) {
    const { cols, rows } = g
    const n = cols * rows
    const D = 0.7
    for (let i = 0; i < n; i++) {
      const r = (i / cols) | 0
      const c = i - r * cols
      const artA = A.dyn && A.dyn[i] === 1
      const artB = B.dyn && B.dyn[i] === 1

      // illustrations dissolve through a dithered fade: old art thins out, new art develops
      if ((artA && A.illus) || (artB && B.illus)) {
        const delay = 0.5 * hash2(i, 21)
        const p = clamp((tt * 1.5 - delay) * 2.2)
        const src = p < 0.5 ? A : B
        const s = p < 0.5 ? 1 - 2 * p : 2 * p - 1
        if (src.dyn && src.dyn[i]) {
          artScale = s; settled(src, i, time); artScale = 1
          if (out.code !== 32) push(i, out.code, out.tone === GRAD_TONE ? GRAD_TONE : Math.min(7, out.tone + (s < 0.5 ? 1 : 0)), out.bold)
        } else if (src.code[i] !== 32 && hash2(i, 31) < s) {
          push(i, src.code[i], src.tone[i], src.bold[i])
        }
        continue
      }

      const delay = style === 'diag'
        ? 0.58 * (0.5 * (c / cols) + 0.5 * (r / rows)) + 0.12 * hash2(i, 5)
        : 0.58 * (r / rows) + 0.12 * hash2(i, 5)
      const local = clamp((tt * (1 + D) - delay) * 2.2)
      if (local <= 0) {
        if (A.code[i] === 32 && !artA) continue
        settled(A, i, time); push(i, out.code, out.tone, out.bold)
      } else if (local >= 1) {
        if (B.code[i] === 32 && !artB) continue
        settled(B, i, time); push(i, out.code, out.tone, out.bold)
      } else {
        const fc = A.code[i], tc = B.code[i]
        if (fc === 32 && tc === 32 && !artA && !artB) continue
        scrambleCell(i, local, time, fc, A.tone[i], A.bold[i], tc, B.tone[i], B.bold[i])
      }
    }
  }

  function drawWrap(wrapRemaining) {
    const { cols, rows } = g
    const K = 230
    for (let r = 0; r < rows; r++) {
      const dir = r % 2 ? 1 : -1
      const speed = 0.7 + 0.6 * hash2(r, 1)
      const shift = Math.round(dir * wrapRemaining * K * speed)
      for (let c = 0; c < cols; c++) push(r * cols + c, wrapCode(r, c, shift), 5, 0)
    }
  }

  function drawUnveil(v, time) {
    const { cols, rows, cellW, cellH } = g
    const L = layouts[0]
    const cc = L.artCenter.col, cr = L.artCenter.row
    const maxD = Math.hypot(cols * cellW, rows * cellH) * 0.5
    const D = 0.65
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c
        const d = Math.hypot((c - cc) * cellW, (r - cr) * cellH) / maxD
        const delay = d * 0.58 + 0.1 * hash2(i, 9)
        const local = clamp((v * (1 + D) - delay) * 2.4)
        if (local <= 0) {
          push(i, wrapCode(r, c, 0), 5, 0)
        } else if (local >= 1) {
          if (L.code[i] === 32 && !L.dyn[i]) continue
          settled(L, i, time); push(i, out.code, out.tone, out.bold)
        } else {
          settled(L, i, time)
          const tc = out.code, tt = out.tone, tb = out.bold
          const roll = hash3(i, Math.floor(time / 70), 13)
          if (roll < local * local * 0.9) push(i, tc, tt, tb)
          else push(i, SCRAMBLE_CODES[Math.floor(hash3(i, Math.floor(time / 70) + 5, 17) * SCRAMBLE_CODES.length)], 5, 0)
        }
      }
    }
  }

  function geometry() {
    const L0 = layouts[0]
    const hero = L0.logo || { x: g.offX + g.mx * g.cellW, y: H / 2 - 40, size: 80 }
    return {
      hero,
      nav: { x: g.offX + g.mx * g.cellW, y: 17, size: 22 },
    }
  }

  function frame(now) {
    if (destroyed) return
    raf = requestAnimationFrame(frame)
    const dt = Math.min(now - lastNow, 64)
    lastNow = now

    const target = getProgress()
    p = reduced ? target : p + (target - p) * (1 - Math.exp(-dt / 120))
    if (Math.abs(target - p) < 0.00005) p = target

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)
    ctx.textBaseline = 'alphabetic'

    const it = now - startedAt
    const intro = { active: false, draw: 1, move: 1, done: true }
    let s = p * (N - 1)
    updatePalette(s, dt)

    if (!introDone) {
      intro.active = true
      intro.done = false
      intro.draw = easeInOut(span(it, T_LOGO_DRAW))
      intro.move = easeInOut(span(it, T_LOGO_MOVE))
      const diamondU = easeInOut(span(it, T_DIAMOND))
      const maxR = (W + H) * 0.5 + 40
      const rad = diamondU * maxR
      if (diamondU >= 1) canvas.style.clipPath = 'none'
      else canvas.style.clipPath = `polygon(${W / 2}px ${H / 2 - rad}px, ${W / 2 + rad}px ${H / 2}px, ${W / 2}px ${H / 2 + rad}px, ${W / 2 - rad}px ${H / 2}px)`
      s = 0
      if (it < T_UNVEIL[0]) {
        if (diamondU > 0) drawWrap(Math.pow(1 - span(it, T_WRAP), 3))
      } else {
        drawUnveil(span(it, T_UNVEIL), now)
      }
      if (it >= INTRO_END) introDone = true
    } else {
      canvas.style.clipPath = 'none'
      const a = Math.min(N - 1, Math.floor(s))
      const f = a >= N - 1 ? 0 : s - a
      const b = Math.min(N - 1, a + 1)
      const tt = clamp((f - 0.22) / 0.56)
      if (reduced) drawSettled(layouts[f >= 0.5 ? b : a], now)
      else if (tt <= 0) drawSettled(layouts[a], now)
      else if (tt >= 1) drawSettled(layouts[b], now)
      else drawBlend(layouts[a], layouts[b], tt, now, layouts[a].kind === 'text' && layouts[b].kind === 'text' ? 'diag' : 'wave')
    }

    flush()

    if (introDone && !introNotified) { introNotified = true; onIntroDone && onIntroDone() }
    onFrame && onFrame({ s, p, intro, geom: geometry(), W, H, stages: N })
  }

  function onResize() {
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => { if (!destroyed) rebuild() }, 140)
  }

  rebuild()
  window.addEventListener('resize', onResize)
  raf = requestAnimationFrame(frame)

  return {
    stages: N,
    skipIntro() { introDone = true },
    destroy() {
      destroyed = true
      cancelAnimationFrame(raf)
      clearTimeout(resizeTimer)
      window.removeEventListener('resize', onResize)
    },
  }
}
