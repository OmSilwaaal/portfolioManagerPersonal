import { STAGES, WRAP_TEXT } from './content'

/* ── constants ───────────────────────────────────────────────────────────── */
// Greys on warm paper, index 0 = ink … 7 = faint
const TONES = ['#101010', '#232321', '#3a3a37', '#54544e', '#75756d', '#9a9a91', '#b8b8af', '#d2d1c9']
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

function buildText(def, g) {
  const L = newLayout(g.cols * g.rows)
  const { cols, rows, mx, mt, mb } = g
  const n = def.blocks.length
  const wide = cols >= 104 && n > 1
  const gap = 8
  const bw = wide
    ? Math.min(60, Math.floor((cols - 2 * mx - gap * (n - 1)) / n))
    : Math.min(n > 1 ? 64 : 70, cols - 2 * mx)

  const blockLines = def.blocks.map((b) => {
    const lines = [
      { t: '-'.repeat(bw), tone: 5, bold: 0 },
      { t: '', tone: 3, bold: 0 },
      ...wrapWords(b.h, bw).map((t) => ({ t, tone: 0, bold: 1 })),
      { t: b.tag, tone: 4, bold: 0 },
      { t: '', tone: 3, bold: 0 },
      ...wrapWords(b.p, bw).map((t) => ({ t, tone: 1, bold: 0 })),
    ]
    return lines
  })

  const heights = blockLines.map((l) => l.length)
  const total = wide ? Math.max(...heights) : heights.reduce((a, b) => a + b, 0) + (n - 1) * 3
  const usable = rows - mt - mb
  const start = clamp(mt + Math.floor((usable - total) / 2), mt + 1, rows)
  const totalW = wide ? n * bw + (n - 1) * gap : bw
  const c0 = wide ? Math.floor((cols - totalW) / 2) : mx

  let row = start
  blockLines.forEach((lines, bi) => {
    const col = wide ? c0 + bi * (bw + gap) : c0
    if (!wide && bi > 0) row += 3
    const r0 = wide ? start : row
    lines.forEach((ln, k) => put(L, g, r0 + k, col, ln.t, ln.tone, ln.bold))
    if (!wide) row += lines.length
  })
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

function toneForIndex(idx) {
  return idx >= 8 ? 0 : idx >= 6 ? 1 : idx >= 4 ? 2 : idx >= 2 ? 3 : 4
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

  L.cov = new Float32Array(cols * rows)
  L.dyn = new Uint8Array(cols * rows)
  let minR = hRows, maxR = 0
  for (let rr = 0; rr < hRows; rr++) {
    for (let cc = 0; cc < wCols; cc++) {
      const v = cov[rr * wCols + cc]
      if (v > 0.03) { if (rr < minR) minR = rr; if (rr > maxR) maxR = rr }
      L.cov[(top + rr) * cols + c0 + cc] = v
    }
  }
  // dilate so noise-warped edges may grow outwards
  const cells = []
  for (let rr = -2; rr < hRows + 2; rr++) {
    for (let cc = -2; cc < wCols + 2; cc++) {
      const R = top + rr, C = c0 + cc
      if (R < 0 || R >= rows || C < 0 || C >= cols) continue
      let hit = false
      for (let dy = -2; dy <= 2 && !hit; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const y = rr + dy, x = cc + dx
          if (y >= 0 && y < hRows && x >= 0 && x < wCols && cov[y * wCols + x] > 0.03) { hit = true; break }
        }
      }
      if (hit) { const i = R * cols + C; L.dyn[i] = 1; cells.push(i) }
    }
  }
  L.artCells = Int32Array.from(cells)
  // static fallback (used while morphing)
  for (const i of cells) {
    const idx = clamp(Math.floor(L.cov[i] * 9.99), 0, 9)
    L.code[i] = RAMP.charCodeAt(idx)
    L.tone[i] = toneForIndex(idx)
    L.bold[i] = 1
  }

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
    buckets = Array.from({ length: 16 }, () => ({ idx: new Int32Array(n), code: new Uint16Array(n), n: 0 }))
  }

  function push(i, code, tone, bold) {
    if (code === 32) return
    const b = buckets[bold * 8 + tone]
    b.idx[b.n] = i
    b.code[b.n] = code
    b.n++
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
      const dx = (noise3(c * 0.06, r * 0.1, tn) - 0.5) * 2.0
      const dy = (noise3(c * 0.06 + 31.7, r * 0.1 + 17.3, tn + 9.1) - 0.5) * 1.2
      let v = sampleCov(L.cov, c + dx, r + dy)
      if (v > 0.45) v *= 0.84 + (noise3(c * 0.15, r * 0.22, tn * 1.7 + 4.2) - 0.5) * 0.3
      const idx = clamp(Math.floor(v * 9.99), 0, 9)
      out.code = RAMP.charCodeAt(idx)
      out.tone = toneForIndex(idx)
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
    for (let b = 0; b < 16; b++) {
      const bk = buckets[b]
      if (!bk.n) continue
      const bold = b >= 8 ? 700 : 400
      ctx.font = `${bold} ${g.fontPx}px ${GRID_FAMILY}`
      ctx.fillStyle = TONES[b & 7]
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

  function drawBlend(A, B, tt, time) {
    const { cols, rows } = g
    const n = cols * rows
    const D = 0.7
    for (let i = 0; i < n; i++) {
      const r = (i / cols) | 0
      const delay = 0.58 * (r / rows) + 0.12 * hash2(i, 5)
      const local = clamp((tt * (1 + D) - delay) * 2.2)
      if (local <= 0) {
        if (A.code[i] === 32 && !(A.dyn && A.dyn[i])) continue
        settled(A, i, time); push(i, out.code, out.tone, out.bold)
      } else if (local >= 1) {
        if (B.code[i] === 32 && !(B.dyn && B.dyn[i])) continue
        settled(B, i, time); push(i, out.code, out.tone, out.bold)
      } else {
        const fc = A.code[i], tc = B.code[i]
        if (fc === 32 && tc === 32 && !(A.dyn && A.dyn[i]) && !(B.dyn && B.dyn[i])) continue
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
      else drawBlend(layouts[a], layouts[b], tt, now)
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
