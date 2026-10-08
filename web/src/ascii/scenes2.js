import { rng } from './raster'
import { sky, glow, disc, stars, rgba, TAU } from './scenes'

/* Extra calling cards: the four "moment" cards (rug pull, volcano, lion, tiger), the summit climb, and one card per Elo tier.
   Same rules as scenes.js: a bold full-colour picture on a dark ground, in cell-width units (U wide, V tall, t in seconds).
   The grid is coarse, so shapes are big and lines are at least ~0.5 units wide. */

const ease = (x) => (x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x))
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x)
const fract = (x) => x - Math.floor(x)

function candle(ctx, x, w, open, close, hi, lo, up, dn) {
  const green = close <= open // canvas y grows downward, so a smaller y is a higher price
  ctx.strokeStyle = green ? up : dn
  ctx.lineWidth = 0.5
  ctx.beginPath(); ctx.moveTo(x, hi); ctx.lineTo(x, lo); ctx.stroke()
  ctx.fillStyle = green ? up : dn
  ctx.fillRect(x - w / 2, Math.min(open, close), w, Math.max(0.7, Math.abs(close - open)))
}

/* ── Rug pull: green candles climb, then the floor disappears. Loops every 9 seconds. ───────────────────────────── */
const RUG_N = 36
const RUG_PEAK = Math.floor(RUG_N * 0.64)
const rugSeries = (() => {
  const r = rng(77)
  const out = []
  let p = 0.12
  for (let i = 0; i < RUG_N; i++) {
    const open = p
    if (i < RUG_PEAK) p += 0.022 + r() * 0.03 + i * 0.0009 - (r() > 0.82 ? 0.03 : 0)
    else p = Math.max(0.03, p - (0.16 + r() * 0.1))
    out.push({ open, close: p, hi: Math.max(open, p) + r() * 0.03, lo: Math.min(open, p) - r() * 0.02 })
  }
  return out
})()

export function rugpull(ctx, { U, V, t }) {
  const cycle = 9
  const ph = (t % cycle) / cycle
  const rise = ease(ph / 0.6)               // candles appear left to right
  const crash = ph > 0.6 && ph < 0.86
  const shown = Math.floor(RUG_N * rise)
  const flash = ph > 0.6 && ph < 0.68 ? 1 - (ph - 0.6) / 0.08 : 0
  const fade = ph > 0.93 ? (ph - 0.93) / 0.07 : 0
  const bg = ctx.createLinearGradient(0, 0, 0, V)
  bg.addColorStop(0, '#04100a'); bg.addColorStop(1, ph > 0.6 ? '#1c0507' : '#06160d')
  ctx.fillStyle = bg; ctx.fillRect(0, 0, U, V)
  for (let g = 1; g < 5; g++) { ctx.fillStyle = rgba(120, 160, 140, 0.1); ctx.fillRect(0, (V * g) / 5, U, 0.25) }
  for (let g = 1; g < 12; g++) { ctx.fillStyle = rgba(120, 160, 140, 0.06); ctx.fillRect((U * g) / 12, 0, 0.25, V) }

  const left = U * 0.05, span = U * 0.9, cw = (span / RUG_N) * 0.62
  const Y = (p) => V * 0.92 - p * V * 1.25
  ctx.save()
  ctx.globalAlpha = 1 - fade
  let lastX = left, lastY = Y(rugSeries[0].open)
  for (let i = 0; i < shown; i++) {
    const c = rugSeries[i]
    const x = left + (i + 0.5) * (span / RUG_N)
    candle(ctx, x, cw, Y(c.open), Y(c.close), Y(c.hi), Y(c.lo), '#35f08a', '#ff3b4d')
    lastX = x; lastY = Y(c.close)
  }
  if (shown > 0) {
    // a pulsing price tag chasing the last candle
    const up = shown <= RUG_PEAK
    const col = up ? [53, 240, 138] : [255, 59, 77]
    glow(ctx, lastX, lastY, 9, col, 0.5 + 0.25 * Math.sin(t * 8))
    ctx.fillStyle = rgba(col[0], col[1], col[2], 0.9); ctx.fillRect(lastX + 1, lastY - 0.4, U - lastX - 1, 0.5)
  }
  ctx.restore()
  // the moment of the rug: red flash, glitch bars, and the verdict
  if (flash > 0) { ctx.fillStyle = rgba(255, 40, 60, 0.38 * flash); ctx.fillRect(0, 0, U, V) }
  if (crash || (ph >= 0.86 && ph < 0.93)) {
    const r = rng(Math.floor(t * 14))
    for (let i = 0; i < 5; i++) { ctx.fillStyle = rgba(255, 70, 90, 0.35); ctx.fillRect(r() * U * 0.7, r() * V, 8 + r() * 30, 0.5 + r() * 0.8) }
    ctx.font = `800 ${V * 0.3}px monospace`
    ctx.textAlign = 'center'
    ctx.fillStyle = rgba(255, 70, 90, 0.55 + 0.4 * Math.sin(t * 24))
    ctx.fillText('RUG PULLED', U * 0.5 + (r() - 0.5) * 1.6, V * 0.5)
    ctx.textAlign = 'left'
  }
}

/* ── Volcano: lava bombs, rolling smoke, glowing rivers. Erupts every 7 seconds. ───────────────────────────────── */
export function volcano(ctx, { U, V, t }) {
  const cycle = 7
  const c = t % cycle
  const burst = c < 3.6 ? Math.sin((c / 3.6) * Math.PI) : 0
  sky(ctx, U, V, [[0, '#12040a'], [0.5, '#4a0f12'], [1, '#a8280a']])
  glow(ctx, U * 0.5, V * 0.42, V * (0.9 + burst * 0.7), [255, 120, 30], 0.35 + burst * 0.4)
  stars(ctx, U, V, { n: 40, seed: 9, t, maxY: 0.4 })

  // back ridges
  ctx.fillStyle = '#2a0a0e'
  ctx.beginPath(); ctx.moveTo(0, V); ctx.lineTo(0, V * 0.7); ctx.lineTo(U * 0.16, V * 0.55); ctx.lineTo(U * 0.3, V * 0.72); ctx.lineTo(U * 0.7, V * 0.7); ctx.lineTo(U * 0.86, V * 0.5); ctx.lineTo(U, V * 0.68); ctx.lineTo(U, V); ctx.fill()

  const cx = U * 0.5, top = V * 0.36, rim = U * 0.07, base = U * 0.34
  // smoke plume
  for (let i = 0; i < 14; i++) {
    const age = fract(t * 0.13 + i / 14)
    const x = cx + Math.sin(i * 2.3 + t * 0.4) * (3 + age * 14) + age * 6
    const y = top - age * V * 0.62
    const r = 3 + age * 11
    ctx.fillStyle = rgba(60 + age * 40, 30 + age * 30, 34 + age * 30, 0.5 * (1 - age) + 0.1)
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill()
    if (burst > 0.2) glow(ctx, x, y + r * 0.6, r * 1.4, [255, 110, 30], 0.18 * burst * (1 - age))
  }
  // cone
  const body = ctx.createLinearGradient(0, top, 0, V)
  body.addColorStop(0, '#5a1a14'); body.addColorStop(0.5, '#2e0d0d'); body.addColorStop(1, '#140505')
  ctx.fillStyle = body
  ctx.beginPath(); ctx.moveTo(cx - base, V); ctx.lineTo(cx - rim, top); ctx.quadraticCurveTo(cx, top + 1.4, cx + rim, top); ctx.lineTo(cx + base, V); ctx.closePath(); ctx.fill()
  // crater glow
  glow(ctx, cx, top, 12 + burst * 12, [255, 170, 60], 0.65 + burst * 0.35)
  ctx.fillStyle = '#ffd27a'; ctx.beginPath(); ctx.ellipse(cx, top, rim * 0.8, 0.9, 0, 0, TAU); ctx.fill()
  // lava rivers
  const flows = [[-0.04, -0.2, 0.2], [0.03, 0.18, 0.5], [0.0, -0.05, 0.8]]
  flows.forEach(([ox, sx, d], k) => {
    ctx.strokeStyle = rgba(255, 130 + 60 * Math.sin(t * 2 + k), 30, 0.65 + 0.3 * burst)
    ctx.lineWidth = 0.9 + burst * 0.6
    ctx.beginPath(); ctx.moveTo(cx + ox * U, top + 0.6)
    for (let y = 0; y <= 1; y += 0.1) ctx.lineTo(cx + ox * U + sx * base * y * 1.6 + Math.sin(y * 9 + k + t * 0.8) * 0.9, top + 0.6 + y * (V - top) * d + y * (V - top) * (1 - d) * 0.8)
    ctx.stroke()
  })
  // lava bombs on ballistic arcs
  const r = rng(31)
  const shots = 46
  for (let i = 0; i < shots; i++) {
    const birth = (i / shots) * 3.4
    const vx = (r() - 0.5) * 0.9, vy = 0.55 + r() * 0.75, hot = r()
    const tau = c - birth
    if (tau < 0 || tau > 2.6) continue
    const x = cx + vx * tau * 24
    const y = top - (vy * tau * V * 0.62 - 0.5 * tau * tau * V * 0.5)
    if (y > V) continue
    const a = 1 - tau / 2.6
    glow(ctx, x, y, 3.4, [255, 150, 40], 0.4 * a)
    ctx.fillStyle = hot > 0.5 ? rgba(255, 235, 150, a) : rgba(255, 120, 40, a)
    ctx.beginPath(); ctx.arc(x, y, 0.9 + hot * 0.7, 0, TAU); ctx.fill()
  }
  // embers drifting everywhere
  for (let i = 0; i < 30; i++) {
    const rr = rng(i + 400)
    const x = rr() * U, y = V - ((t * (0.8 + rr()) * 2 + rr() * V) % V)
    ctx.fillStyle = rgba(255, 170, 70, 0.5 * rr()); ctx.fillRect(x + Math.sin(t + i) * 1.2, y, 0.6, 0.6)
  }
  if (burst > 0.7) { ctx.fillStyle = rgba(255, 220, 160, (burst - 0.7) * 0.5); ctx.fillRect(0, 0, U, V) } // eruption flash
}

/* ── Roaring big cats: a mane / stripes, an angry face and a jaw that swings open with expanding sound rings. ───── */
function roarRings(ctx, x, y, t, period, col, reach = 1) {
  const ph = fract(t / period)
  for (let k = 0; k < 4; k++) {
    const p = fract(ph + k / 4)
    ctx.strokeStyle = rgba(col[0], col[1], col[2], (1 - p) * 0.8)
    ctx.lineWidth = 0.9
    ctx.beginPath(); ctx.arc(x, y, 6 + p * 34 * reach, -0.9, 0.9); ctx.stroke()
    ctx.beginPath(); ctx.arc(x, y, 6 + p * 34 * reach, Math.PI - 0.9, Math.PI + 0.9); ctx.stroke()
  }
}

function mouth(ctx, cx, cy, w, open, fang = '#fff8e6') {
  const h = w * 0.55 * open
  ctx.fillStyle = '#3a0508'
  ctx.beginPath(); ctx.moveTo(cx - w * 0.5, cy); ctx.quadraticCurveTo(cx, cy + h * 2.1, cx + w * 0.5, cy); ctx.quadraticCurveTo(cx, cy - h * 0.2, cx - w * 0.5, cy); ctx.fill()
  ctx.fillStyle = '#c4243a'; ctx.beginPath(); ctx.ellipse(cx, cy + h * 1.15, w * 0.22, h * 0.45, 0, 0, TAU); ctx.fill() // tongue
  ctx.fillStyle = fang
  const tooth = (x, y, s) => { ctx.beginPath(); ctx.moveTo(x - s * 0.45, y); ctx.lineTo(x + s * 0.45, y); ctx.lineTo(x, y + s); ctx.fill() }
  tooth(cx - w * 0.32, cy + h * 0.15, 1.6 + open * 2.6); tooth(cx + w * 0.32, cy + h * 0.15, 1.6 + open * 2.6)
  const lower = (x, s) => { ctx.beginPath(); ctx.moveTo(x - s * 0.4, cy + h * 1.95); ctx.lineTo(x + s * 0.4, cy + h * 1.95); ctx.lineTo(x, cy + h * 1.95 - s); ctx.fill() }
  lower(cx - w * 0.22, 1.2 + open * 1.6); lower(cx + w * 0.22, 1.2 + open * 1.6)
}

function roarCycle(t, period) {
  const p = fract(t / period)
  // quick jaw drop, hold, slow close
  return p < 0.15 ? ease(p / 0.15) : p < 0.62 ? 1 : 1 - ease((p - 0.62) / 0.38)
}

export function lion(ctx, { U, V, t }) {
  const period = 4
  const o = roarCycle(t, period)
  sky(ctx, U, V, [[0, '#1c0c2e'], [0.45, '#b4452a'], [0.7, '#ffb347'], [1, '#2a1208']])
  glow(ctx, U * 0.78, V * 0.58, V * 0.9, [255, 190, 90], 0.5)
  disc(ctx, U * 0.78, V * 0.58, V * 0.14, '#ffe3a0')
  // acacia silhouettes
  ctx.fillStyle = '#1c0b08'
  ;[[0.12, 0.72], [0.9, 0.68]].forEach(([fx, fy]) => {
    const x = U * fx, y = V * fy
    ctx.fillRect(x - 0.4, y, 0.8, V - y)
    ctx.beginPath(); ctx.ellipse(x, y, 9, 2.1, 0, 0, TAU); ctx.fill()
  })
  ctx.fillStyle = '#150806'; ctx.fillRect(0, V * 0.9, U, V * 0.1)

  const cx = U * 0.5 + Math.sin(t * 40) * 0.25 * o, cy = V * 0.52
  roarRings(ctx, cx, cy + 2, t, period, [255, 214, 140], 1.15)
  // mane: two rings of flame-shaped spikes that sway
  for (let ring = 0; ring < 2; ring++) {
    const n = 26 + ring * 8, R0 = V * (0.5 - ring * 0.06)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU
      const sway = Math.sin(t * 1.6 + i * 1.3 + ring) * 0.07 + o * 0.05
      const len = R0 * (1.28 + 0.12 * Math.sin(i * 2.1) + o * 0.1)
      const w = 0.12
      ctx.fillStyle = ring ? '#8a3a10' : '#c8651a'
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(a - w) * R0 * 0.8, cy + Math.sin(a - w) * R0 * 0.8)
      ctx.lineTo(cx + Math.cos(a + sway) * len, cy + Math.sin(a + sway) * len)
      ctx.lineTo(cx + Math.cos(a + w) * R0 * 0.8, cy + Math.sin(a + w) * R0 * 0.8)
      ctx.fill()
    }
  }
  glow(ctx, cx, cy, V * 0.7, [255, 140, 40], 0.22)
  // ears
  ctx.fillStyle = '#b86a24'
  ;[-1, 1].forEach((s) => { ctx.beginPath(); ctx.arc(cx + s * V * 0.3, cy - V * 0.3, 3.4, 0, TAU); ctx.fill(); ctx.fillStyle = '#5a2208'; ctx.beginPath(); ctx.arc(cx + s * V * 0.3, cy - V * 0.3, 1.7, 0, TAU); ctx.fill(); ctx.fillStyle = '#b86a24' })
  // face
  const face = ctx.createRadialGradient(cx, cy - 2, 2, cx, cy, V * 0.42)
  face.addColorStop(0, '#f2c27a'); face.addColorStop(1, '#c98a3c')
  ctx.fillStyle = face; ctx.beginPath(); ctx.ellipse(cx, cy, V * 0.34, V * 0.4, 0, 0, TAU); ctx.fill()
  ctx.fillStyle = '#f7dfae'; ctx.beginPath(); ctx.ellipse(cx, cy + V * 0.14, V * 0.2, V * 0.15, 0, 0, TAU); ctx.fill() // muzzle
  // brow + eyes (narrow and furious)
  ctx.strokeStyle = '#4a1c08'; ctx.lineWidth = 1.1
  ;[-1, 1].forEach((s) => {
    const ex = cx + s * V * 0.14, ey = cy - V * 0.08
    ctx.beginPath(); ctx.moveTo(ex - s * 4.2, ey - 2.6 - o * 0.8); ctx.lineTo(ex + s * 0.8, ey - 0.4); ctx.stroke()
    ctx.fillStyle = '#ffe14a'; ctx.beginPath(); ctx.ellipse(ex, ey, 2.2, 1.0 + (1 - o) * 0.4, s * -0.25, 0, TAU); ctx.fill()
    ctx.fillStyle = '#1a0a04'; ctx.fillRect(ex - 0.35, ey - 0.8, 0.7, 1.6)
  })
  // nose
  ctx.fillStyle = '#5a1f1a'; ctx.beginPath(); ctx.moveTo(cx - 2.2, cy + V * 0.05); ctx.lineTo(cx + 2.2, cy + V * 0.05); ctx.lineTo(cx, cy + V * 0.11); ctx.fill()
  mouth(ctx, cx, cy + V * 0.14, V * 0.3, 0.12 + o * 0.95)
  // sun-rays of the roar lighting the mane edge
  if (o > 0.6) glow(ctx, cx, cy + V * 0.2, V * 0.55, [255, 120, 60], 0.18 * o)
}

export function tiger(ctx, { U, V, t }) {
  const period = 4.4
  const o = roarCycle(t + 1.3, period)
  sky(ctx, U, V, [[0, '#031a16'], [0.55, '#0d4a3c'], [1, '#04120f']])
  glow(ctx, U * 0.2, V * 0.3, V * 0.8, [140, 255, 200], 0.2)
  disc(ctx, U * 0.2, V * 0.3, V * 0.1, '#e8fff2')
  // bamboo
  const rb = rng(12)
  for (let i = 0; i < 16; i++) {
    const x = rb() * U, w = 0.8 + rb() * 0.9, sway = Math.sin(t * 0.7 + i) * 0.5
    ctx.fillStyle = rgba(30, 120 + rb() * 80, 80, 0.55)
    ctx.fillRect(x + sway, 0, w, V)
    for (let k = 0; k < 6; k++) { ctx.fillStyle = rgba(10, 60, 40, 0.8); ctx.fillRect(x + sway - 0.2, (k + rb()) * (V / 6), w + 0.4, 0.4) }
  }
  // fireflies
  for (let i = 0; i < 26; i++) {
    const rr = rng(i + 60), x = (rr() * U + Math.sin(t * 0.5 + i) * 4 + U) % U, y = (rr() * V + Math.cos(t * 0.6 + i) * 3 + V) % V
    ctx.fillStyle = rgba(220, 255, 120, 0.8 * (0.5 + 0.5 * Math.sin(t * 2.4 + i * 1.9))); ctx.fillRect(x, y, 0.7, 0.7)
  }
  const cx = U * 0.5 + Math.sin(t * 38) * 0.25 * o, cy = V * 0.54
  roarRings(ctx, cx, cy + 3, t + 1.3, period, [140, 255, 200], 1.15)
  // ears
  ;[-1, 1].forEach((s) => {
    ctx.fillStyle = '#e6761c'; ctx.beginPath(); ctx.arc(cx + s * V * 0.31, cy - V * 0.3, 3.6, 0, TAU); ctx.fill()
    ctx.fillStyle = '#0b0b0b'; ctx.beginPath(); ctx.arc(cx + s * V * 0.31, cy - V * 0.3, 2.3, 0, TAU); ctx.fill()
    ctx.fillStyle = '#f4f0e6'; ctx.beginPath(); ctx.arc(cx + s * V * 0.31, cy - V * 0.3, 1.0, 0, TAU); ctx.fill()
  })
  // head: orange skull, white cheek ruffs
  ctx.fillStyle = '#f4f0e6'; ctx.beginPath(); ctx.ellipse(cx, cy + V * 0.06, V * 0.43, V * 0.34, 0, 0, TAU); ctx.fill()
  const face = ctx.createRadialGradient(cx, cy - 2, 2, cx, cy, V * 0.4)
  face.addColorStop(0, '#ff9a2e'); face.addColorStop(1, '#d35a0e')
  ctx.fillStyle = face; ctx.beginPath(); ctx.ellipse(cx, cy - V * 0.03, V * 0.32, V * 0.37, 0, 0, TAU); ctx.fill()
  ctx.fillStyle = '#fff6e6'; ctx.beginPath(); ctx.ellipse(cx, cy + V * 0.15, V * 0.19, V * 0.13, 0, 0, TAU); ctx.fill()
  // stripes: forehead and cheeks, thick wedges that flare when it roars
  ctx.fillStyle = '#120a06'
  for (let i = -3; i <= 3; i++) { // forehead
    const x = cx + i * 2.3, h = 4.5 - Math.abs(i) * 0.7
    ctx.beginPath(); ctx.moveTo(x - 0.55, cy - V * 0.37 + 0.2); ctx.lineTo(x + 0.55, cy - V * 0.37 + 0.2); ctx.lineTo(x + (i ? Math.sign(i) * 0.2 : 0), cy - V * 0.37 + h); ctx.fill()
  }
  ;[-1, 1].forEach((s) => {
    for (let k = 0; k < 4; k++) {
      const y = cy - V * 0.12 + k * 3.1
      ctx.beginPath(); ctx.moveTo(cx + s * V * 0.31, y); ctx.lineTo(cx + s * (V * 0.18 - o * 0.4), y + 0.7 + k * 0.2); ctx.lineTo(cx + s * V * 0.31, y + 1.5); ctx.fill()
    }
    // eyes: acid yellow, slit pupils, angry brow
    const ex = cx + s * V * 0.14, ey = cy - V * 0.1
    ctx.strokeStyle = '#120a06'; ctx.lineWidth = 1.2
    ctx.beginPath(); ctx.moveTo(ex - s * 4, ey - 2.4 - o); ctx.lineTo(ex + s * 0.8, ey - 0.5); ctx.stroke()
    ctx.fillStyle = '#d9ff4a'; ctx.beginPath(); ctx.ellipse(ex, ey, 2.2, 1.1, s * -0.2, 0, TAU); ctx.fill()
    ctx.fillStyle = '#120a06'; ctx.fillRect(ex - 0.3, ey - 0.9, 0.6, 1.8)
  })
  ctx.fillStyle = '#e0657a'; ctx.beginPath(); ctx.moveTo(cx - 2.2, cy + V * 0.06); ctx.lineTo(cx + 2.2, cy + V * 0.06); ctx.lineTo(cx, cy + V * 0.12); ctx.fill()
  mouth(ctx, cx, cy + V * 0.15, V * 0.3, 0.12 + o * 0.95)
}

/* ── Summit: someone at the foot of a huge mountain, looking up. Progress lights the climb. ──────────────────────── */
const TIER_COLORS = ['#f87171', '#d6a15c', '#7dd3fc', '#38bdf8', '#818cf8', '#c084fc', '#fb923c', '#fde047']
const summitCache = new Map()

export function makeSummit(progress = 0.3) {
  const key = Math.round(clamp(progress) * 50)
  if (summitCache.has(key)) return summitCache.get(key)
  const prog = key / 50
  const painter = (ctx, { U, V, t }) => {
    sky(ctx, U, V, [[0, '#050a22'], [0.5, '#1a2058'], [0.85, '#5a3a78'], [1, '#c8707a']])
    stars(ctx, U, V, { n: 90, seed: 21, t, maxY: 0.55 })
    // aurora ribbon behind the summit
    for (let i = 0; i < 30; i++) {
      const x = (i / 29) * U, y = V * 0.16 + Math.sin(i * 0.5 + t * 0.7) * 2.4
      ctx.fillStyle = rgba(90, 255, 190, 0.12 + 0.07 * Math.sin(t + i)); ctx.fillRect(x, y, U / 28, 3 + Math.sin(i + t) * 1.2)
    }
    const sx = U * 0.62, sy = V * 0.1 // summit
    // far range
    ctx.fillStyle = '#26225a'
    ctx.beginPath(); ctx.moveTo(0, V); ctx.lineTo(0, V * 0.62); ctx.lineTo(U * 0.18, V * 0.44); ctx.lineTo(U * 0.34, V * 0.6); ctx.lineTo(U * 0.9, V * 0.52); ctx.lineTo(U, V * 0.6); ctx.lineTo(U, V); ctx.fill()
    // main mountain: jagged left face (lit) and shadowed right face
    const lit = ctx.createLinearGradient(sx - U * 0.4, sy, sx, V)
    lit.addColorStop(0, '#f2f6ff'); lit.addColorStop(0.35, '#8a96c8'); lit.addColorStop(1, '#2a2f66')
    ctx.fillStyle = lit
    ctx.beginPath(); ctx.moveTo(U * 0.08, V); ctx.lineTo(U * 0.3, V * 0.62); ctx.lineTo(U * 0.4, V * 0.5); ctx.lineTo(U * 0.47, V * 0.42); ctx.lineTo(U * 0.54, V * 0.28); ctx.lineTo(sx - 2, sy + V * 0.05); ctx.lineTo(sx, sy); ctx.lineTo(sx + 3, V * 0.38); ctx.lineTo(sx + 2, V); ctx.closePath(); ctx.fill()
    ctx.fillStyle = '#14163e'
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + 3, V * 0.38); ctx.lineTo(U * 0.74, V * 0.52); ctx.lineTo(U * 0.82, V * 0.66); ctx.lineTo(U * 0.95, V); ctx.lineTo(sx + 2, V); ctx.closePath(); ctx.fill()
    ctx.strokeStyle = rgba(255, 255, 255, 0.55); ctx.lineWidth = 0.55; ctx.beginPath(); ctx.moveTo(U * 0.4, V * 0.5); ctx.lineTo(U * 0.47, V * 0.42); ctx.lineTo(U * 0.54, V * 0.28); ctx.lineTo(sx - 2, sy + V * 0.05); ctx.lineTo(sx, sy); ctx.stroke()
    // snow drift on the flank
    ctx.fillStyle = rgba(255, 255, 255, 0.6)
    for (let i = 0; i < 18; i++) { const rr = rng(i + 5); ctx.fillRect(U * (0.4 + rr() * 0.2), V * (0.35 + rr() * 0.4), 2 + rr() * 3, 0.5) }

    // the trail: switchbacks from the climber's rock up to the summit; flags mark the eight tiers
    const pts = []
    for (let i = 0; i <= 40; i++) {
      const f = i / 40
      pts.push([U * (0.2 + f * 0.43) + Math.sin(f * 16) * (4 - f * 2.4), V * (0.9 - f * 0.78)])
    }
    ctx.strokeStyle = rgba(255, 220, 160, 0.3); ctx.lineWidth = 0.55; ctx.setLineDash([1.2, 1])
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); ctx.setLineDash([])
    // climbed part glows
    const upTo = Math.floor(prog * 40)
    ctx.strokeStyle = rgba(255, 220, 120, 0.95); ctx.lineWidth = 0.9
    ctx.beginPath(); pts.slice(0, upTo + 1).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke()
    TIER_COLORS.forEach((col, i) => {
      const [x, y] = pts[Math.round(((i + 0.5) / 8) * 40)]
      const reached = (i + 0.5) / 8 <= prog + 0.06
      ctx.fillStyle = reached ? '#fff' : rgba(255, 255, 255, 0.28); ctx.fillRect(x - 0.2, y - 3.4, 0.45, 3.4)
      ctx.fillStyle = reached ? col : rgba(130, 140, 180, 0.4)
      ctx.beginPath(); ctx.moveTo(x + 0.25, y - 3.4); ctx.lineTo(x + 3 + Math.sin(t * 4 + i) * 0.35, y - 2.6); ctx.lineTo(x + 0.25, y - 1.8); ctx.fill()
      if (reached) glow(ctx, x + 1, y - 2.5, 4, [255, 230, 160], 0.22)
    })
    // you, on the trail
    const [mx, my] = pts[upTo]
    glow(ctx, mx, my, 5, [255, 230, 140], 0.6 + 0.2 * Math.sin(t * 3))
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(mx, my - 0.7, 0.9, 0, TAU); ctx.fill()
    // summit beacon
    glow(ctx, sx, sy, 9 + Math.sin(t * 2.4) * 2, [255, 240, 170], 0.7)
    ctx.fillStyle = '#fff'; ctx.fillRect(sx - 0.3, sy - 4 - Math.sin(t * 2.4), 0.6, 4)
    for (let i = 0; i < 6; i++) { // beam rays
      const a = -Math.PI / 2 + (i - 2.5) * 0.28 + Math.sin(t * 0.6 + i) * 0.04
      ctx.strokeStyle = rgba(255, 240, 180, 0.18); ctx.lineWidth = 0.8
      ctx.beginPath(); ctx.moveTo(sx, sy - 1); ctx.lineTo(sx + Math.cos(a) * 16, sy - 1 + Math.sin(a) * 16); ctx.stroke()
    }
    // foreground: rocks and the watcher, head tipped back, headlamp aimed at the peak
    ctx.fillStyle = '#080614'
    ctx.beginPath(); ctx.moveTo(0, V); ctx.lineTo(0, V * 0.8); ctx.lineTo(U * 0.07, V * 0.76); ctx.lineTo(U * 0.12, V * 0.84); ctx.lineTo(U * 0.2, V * 0.82); ctx.lineTo(U * 0.26, V * 0.9); ctx.lineTo(U * 0.34, V); ctx.fill()
    const fx = U * 0.12, fy = V * 0.78
    ctx.fillStyle = '#0a0818'
    ctx.beginPath(); ctx.ellipse(fx, fy - 4.2, 1.5, 1.7, -0.4, 0, TAU); ctx.fill()               // head tilted up
    ctx.beginPath(); ctx.moveTo(fx - 1.6, fy - 3); ctx.lineTo(fx + 1.6, fy - 3); ctx.lineTo(fx + 2.1, fy); ctx.lineTo(fx - 2.1, fy); ctx.fill() // body / pack
    ctx.fillRect(fx - 1.6, fy, 0.9, 2.2); ctx.fillRect(fx + 0.7, fy, 0.9, 2.2)
    ctx.strokeStyle = '#0a0818'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(fx + 1.5, fy - 2.4); ctx.lineTo(fx + 3.4, fy - 4.6); ctx.stroke() // arm pointing up
    const lampX = fx + 1.2, lampY = fy - 5.3
    const beam = ctx.createLinearGradient(lampX, lampY, sx, sy)
    beam.addColorStop(0, rgba(255, 245, 190, 0.5)); beam.addColorStop(1, rgba(255, 245, 190, 0))
    ctx.fillStyle = beam; ctx.beginPath(); ctx.moveTo(lampX, lampY); ctx.lineTo(sx - 5, sy + 3); ctx.lineTo(sx + 5, sy + 3); ctx.fill()
    ctx.fillStyle = '#fff6c0'; ctx.fillRect(lampX - 0.3, lampY - 0.3, 0.8, 0.8)
    // drifting snow
    for (let i = 0; i < 40; i++) { const rr = rng(i + 700); ctx.fillStyle = rgba(255, 255, 255, 0.6); ctx.fillRect((rr() * U + t * 2 * (0.4 + rr())) % U, (rr() * V + t * 3 * (0.4 + rr())) % V, 0.5, 0.5) }
  }
  summitCache.set(key, painter)
  return painter
}
export const summit = makeSummit(0.35)

/* ── Elo tier cards, bottom of the ladder to the top ─────────────────────────────────────────────────────────── */

/* Rekt: a red market meltdown. Candles rain down, the ground cracks and embers rise. */
export function rekt(ctx, { U, V, t }) {
  sky(ctx, U, V, [[0, '#0c0204'], [0.6, '#3a0710'], [1, '#6a1008']])
  glow(ctx, U * 0.5, V, V * 1.2, [255, 60, 30], 0.35 + 0.1 * Math.sin(t * 5))
  const r = rng(8)
  for (let i = 0; i < 22; i++) { // falling red candles
    const x = r() * U, sp = 5 + r() * 9, len = 3 + r() * 6, y = ((t * sp + r() * V * 2) % (V * 1.3)) - V * 0.15
    ctx.strokeStyle = rgba(255, 70, 70, 0.55); ctx.lineWidth = 0.4; ctx.beginPath(); ctx.moveTo(x, y - len); ctx.lineTo(x, y + 1.5); ctx.stroke()
    ctx.fillStyle = rgba(255, 60, 70, 0.9); ctx.fillRect(x - 0.9, y - len * 0.5, 1.8, len * 0.7)
  }
  // a chart line falling off a cliff
  ctx.strokeStyle = '#ff4256'; ctx.lineWidth = 0.9; ctx.beginPath()
  for (let i = 0; i <= 40; i++) { const f = i / 40, x = U * (0.08 + f * 0.84), y = V * (0.2 + f * f * 0.62) + Math.sin(f * 30 + t * 3) * 0.5; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y) }
  ctx.stroke()
  // cracked, glowing ground
  ctx.fillStyle = '#140305'; ctx.fillRect(0, V * 0.86, U, V * 0.14)
  for (let i = 0; i < 9; i++) {
    const x = r() * U, w = 0.5 + 0.3 * Math.sin(t * 2 + i)
    ctx.strokeStyle = rgba(255, 130, 40, 0.85); ctx.lineWidth = w + 0.3
    ctx.beginPath(); ctx.moveTo(x, V * 0.86); ctx.lineTo(x + (r() - 0.5) * 8, V * 0.92); ctx.lineTo(x + (r() - 0.5) * 10, V); ctx.stroke()
  }
  for (let i = 0; i < 40; i++) { const rr = rng(i + 90); ctx.fillStyle = rgba(255, 160, 70, 0.7 * rr()); ctx.fillRect((rr() * U + Math.sin(t + i) * 2), V - ((t * (1 + rr() * 3) * 2 + rr() * V) % V), 0.6, 0.6) }
  ctx.font = `800 ${V * 0.3}px monospace`; ctx.textAlign = 'center'
  ctx.fillStyle = rgba(255, 90, 100, 0.5 + 0.3 * Math.sin(t * 7)); ctx.fillText('REKT', U * 0.5, V * 0.56); ctx.textAlign = 'left'
}

/* Rookie: a bronze coin spinning over a dawn field while a seedling grows. */
export function rookie(ctx, { U, V, t }) {
  sky(ctx, U, V, [[0, '#0a1a22'], [0.55, '#2a5a58'], [0.8, '#e0a868'], [1, '#3a2410']])
  stars(ctx, U, V, { n: 45, seed: 33, t, maxY: 0.4 })
  glow(ctx, U * 0.5, V * 0.86, V * 1.1, [255, 190, 110], 0.45)
  ctx.fillStyle = '#1a0f08'; ctx.beginPath(); ctx.moveTo(0, V); ctx.lineTo(0, V * 0.84); for (let x = 0; x <= U; x += 2) ctx.lineTo(x, V * 0.86 + Math.sin(x * 0.18) * 0.6); ctx.lineTo(U, V); ctx.fill()
  // seedling that grows and resets
  const grow = ease(fract(t / 8) / 0.7)
  const sx = U * 0.5, base = V * 0.86
  ctx.strokeStyle = '#6fe08a'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(sx, base); ctx.quadraticCurveTo(sx + 1, base - grow * 5, sx, base - grow * 9); ctx.stroke()
  ;[-1, 1].forEach((s) => { ctx.fillStyle = '#4fd36e'; ctx.beginPath(); ctx.ellipse(sx + s * 2.6 * grow, base - grow * 7, 2.6 * grow, 1.1 * grow, s * -0.5, 0, TAU); ctx.fill() })
  // coin: width follows cos so it reads as a spin
  const spin = Math.cos(t * 3.2), cw = Math.max(0.5, Math.abs(spin) * V * 0.27)
  const cy = V * 0.38 + Math.sin(t * 1.6) * 1.6
  glow(ctx, U * 0.5, cy, V * 0.5, [255, 190, 100], 0.35)
  const g = ctx.createLinearGradient(U * 0.5 - cw, cy, U * 0.5 + cw, cy)
  g.addColorStop(0, '#7a4a1c'); g.addColorStop(0.5, '#f0b878'); g.addColorStop(1, '#8a5522')
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(U * 0.5, cy, cw, V * 0.27, 0, 0, TAU); ctx.fill()
  ctx.strokeStyle = '#ffe2b0'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.ellipse(U * 0.5, cy, cw, V * 0.27, 0, 0, TAU); ctx.stroke()
  if (cw > V * 0.1) { ctx.font = `800 ${V * 0.3 * Math.abs(spin)}px monospace`; ctx.textAlign = 'center'; ctx.fillStyle = '#5a3210'; ctx.fillText(spin > 0 ? '5' : '$', U * 0.5, cy + V * 0.1); ctx.textAlign = 'left' }
  for (let i = 0; i < 12; i++) { const a = t * 1.5 + (i / 12) * TAU; ctx.fillStyle = rgba(255, 230, 170, 0.5 + 0.4 * Math.sin(t * 5 + i)); ctx.fillRect(U * 0.5 + Math.cos(a) * 17, cy + Math.sin(a) * 9, 0.6, 0.6) }
}

/* Trader: a steady blue uptrend with a glowing moving average and a scrolling tape. */
export function trader(ctx, { U, V, t }) {
  sky(ctx, U, V, [[0, '#02101e'], [1, '#06223a']])
  for (let g = 1; g < 6; g++) { ctx.fillStyle = rgba(120, 190, 255, 0.08); ctx.fillRect(0, (V * g) / 6, U, 0.25) }
  const scroll = t * 1.4, n = 38, step = U / (n - 1)
  const price = (i) => 0.3 + (i * 0.0165) + Math.sin(i * 0.55) * 0.07 + Math.sin(i * 1.7) * 0.025
  const Y = (p) => V * 0.82 - p * V * 0.9
  const off = fract(scroll / step) * step
  const base = Math.floor(scroll / step)
  const pts = []
  for (let k = -1; k < n + 1; k++) {
    const i = base + k, x = k * step - off + step
    const o = price(i), c = price(i + 1)
    candle(ctx, x, step * 0.5, Y(o), Y(c), Y(Math.max(o, c) + 0.025), Y(Math.min(o, c) - 0.02), '#4ac6ff', '#9a7bff')
    pts.push([x, Y((o + c) / 2 - 0.035)])
  }
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.9; ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke()
  glow(ctx, U * 0.92, pts[pts.length - 3][1], 8, [90, 200, 255], 0.55)
  // ticker tape
  ctx.fillStyle = rgba(10, 40, 70, 0.9); ctx.fillRect(0, V * 0.9, U, V * 0.1)
  ctx.font = `700 ${V * 0.075}px monospace`
  const tape = '  AAPL +1.2%   NVDA +3.4%   SOL +8.1%   TSLA +0.7%   BTC +2.2%   WIF +14%   ETH +1.9%  '
  const tw = tape.length * V * 0.045
  ctx.fillStyle = '#7de2ff'; ctx.fillText(tape + tape, -((t * 9) % tw), V * 0.97)
}

/* Shark: underwater light shafts, a shark patrolling across, a dorsal fin on the surface, drifting bubbles. */
export function shark(ctx, { U, V, t }) {
  sky(ctx, U, V, [[0, '#2a8fb8'], [0.18, '#0a5a86'], [1, '#021a30']])
  for (let i = 0; i < 7; i++) { // god rays
    const x = U * (0.1 + i * 0.14) + Math.sin(t * 0.4 + i) * 3
    ctx.fillStyle = rgba(190, 240, 255, 0.07 + 0.04 * Math.sin(t + i)); ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 6, 0); ctx.lineTo(x + 18, V); ctx.lineTo(x + 3, V); ctx.fill()
  }
  ctx.strokeStyle = rgba(220, 250, 255, 0.7); ctx.lineWidth = 0.55; ctx.beginPath()
  for (let x = 0; x <= U; x += 1) { const y = V * 0.12 + Math.sin(x * 0.3 + t * 2) * 0.5; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y) }
  ctx.stroke()
  const sx = U * 1.25 - ((t * 11) % (U * 1.6)), sy = V * 0.5 + Math.sin(t * 0.8) * 3
  const dir = -1
  const wag = Math.sin(t * 5) * 1.5
  // body
  const body = ctx.createLinearGradient(0, sy - 5, 0, sy + 5)
  body.addColorStop(0, '#5a6e86'); body.addColorStop(0.6, '#8fa0b4'); body.addColorStop(1, '#e8eef4')
  ctx.fillStyle = body
  ctx.beginPath()
  ctx.moveTo(sx + dir * 14, sy)
  ctx.quadraticCurveTo(sx + dir * 5, sy - 6.4, sx - dir * 6, sy - 2.2)
  ctx.lineTo(sx - dir * 14, sy - 4 + wag); ctx.lineTo(sx - dir * 11, sy + wag * 0.4); ctx.lineTo(sx - dir * 14.5, sy + 4 + wag)
  ctx.lineTo(sx - dir * 6, sy + 1.6)
  ctx.quadraticCurveTo(sx + dir * 5, sy + 5, sx + dir * 14, sy)
  ctx.fill()
  ctx.beginPath(); ctx.moveTo(sx + dir * 1, sy - 3.6); ctx.lineTo(sx - dir * 2, sy - 8); ctx.lineTo(sx - dir * 4.5, sy - 2.6); ctx.fill() // dorsal
  ctx.beginPath(); ctx.moveTo(sx + dir * 3, sy + 2.4); ctx.lineTo(sx - dir * 2.4, sy + 6.4); ctx.lineTo(sx - dir * 2.8, sy + 1.6); ctx.fill() // pectoral
  ctx.fillStyle = '#04101c'; ctx.fillRect(sx + dir * 9 - 0.4, sy - 1.4, 0.9, 0.9) // eye
  ctx.strokeStyle = '#1a2a3a'; ctx.lineWidth = 0.4; for (let g = 0; g < 4; g++) { ctx.beginPath(); ctx.moveTo(sx + dir * (4 + g * 0.8), sy - 0.6); ctx.lineTo(sx + dir * (4 + g * 0.8), sy + 1.2); ctx.stroke() }
  // surface fin of a second, further shark
  const fx = U * ((t * 0.045) % 1.2) - 6
  ctx.fillStyle = '#5a6e86'; ctx.beginPath(); ctx.moveTo(fx, V * 0.14); ctx.lineTo(fx + 1, V * 0.04 + Math.sin(t) * 0.3); ctx.lineTo(fx + 3.2, V * 0.14); ctx.fill()
  for (let i = 0; i < 30; i++) { const rr = rng(i + 3); ctx.strokeStyle = rgba(220, 245, 255, 0.5); ctx.lineWidth = 0.3; ctx.beginPath(); ctx.arc((rr() * U + Math.sin(t + i) * 1.5), V - ((t * (2 + rr() * 4) + rr() * V) % V), 0.4 + rr() * 0.6, 0, TAU); ctx.stroke() }
}

/* Whale: a night sea, a moon, and a whale that breaches in a high arc every 8 seconds. */
export function whale(ctx, { U, V, t }) {
  sky(ctx, U, V, [[0, '#050a26'], [0.55, '#1c2a70'], [0.7, '#2b3f95'], [1, '#050c2a']])
  stars(ctx, U, V, { n: 80, seed: 14, t, maxY: 0.5 })
  glow(ctx, U * 0.2, V * 0.22, V * 0.8, [180, 200, 255], 0.35)
  disc(ctx, U * 0.2, V * 0.22, V * 0.12, '#f4f6ff')
  const sea = (k, c, base, amp, sp) => {
    ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(0, V)
    for (let x = 0; x <= U; x += 1) ctx.lineTo(x, base + Math.sin(x * 0.28 + t * sp + k) * amp + Math.sin(x * 0.11 - t * sp * 0.6) * amp)
    ctx.lineTo(U, V); ctx.fill()
    ctx.strokeStyle = rgba(190, 210, 255, 0.5); ctx.lineWidth = 0.5; ctx.stroke()
  }
  sea(0, '#13236a', V * 0.66, 0.6, 1.0)
  // breach
  const c = t % 8, dur = 3.2
  if (c < dur) {
    const p = c / dur
    const x = U * (0.35 + p * 0.38), y = V * 0.7 - Math.sin(p * Math.PI) * V * 0.72
    const ang = (p - 0.5) * -2.1
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang)
    const grad = ctx.createLinearGradient(0, -5, 0, 5); grad.addColorStop(0, '#1a2a5a'); grad.addColorStop(1, '#a8b8d8')
    ctx.fillStyle = grad
    ctx.beginPath(); ctx.moveTo(-14, 0); ctx.quadraticCurveTo(-5, -7, 8, -3.5); ctx.quadraticCurveTo(14, -1, 15, 1.4); ctx.quadraticCurveTo(6, 6, -6, 3); ctx.quadraticCurveTo(-11, 1.4, -14, 0); ctx.fill()
    ctx.beginPath(); ctx.moveTo(-13, 0); ctx.lineTo(-19, -4.5); ctx.lineTo(-17.6, 0.4); ctx.lineTo(-19.4, 4.6); ctx.closePath(); ctx.fill() // flukes
    ctx.beginPath(); ctx.moveTo(1, 2.4); ctx.lineTo(-3, 7.5); ctx.lineTo(-4.4, 2.8); ctx.fill() // flipper
    ctx.fillStyle = '#e8f0ff'; ctx.fillRect(10, -0.8, 0.9, 0.9)
    ctx.restore()
    // spray at take-off and splash-down
    ;[0.04, 0.94].forEach((at, j) => {
      const d = Math.abs(p - at)
      if (d < 0.12) for (let i = 0; i < 18; i++) {
        const rr = rng(i + j * 30), a = -Math.PI / 2 + (rr() - 0.5) * 2.2, s = (0.12 - d) * 160 * (0.4 + rr())
        const sx = U * (0.35 + at * 0.38)
        ctx.fillStyle = rgba(230, 245, 255, 0.8); ctx.fillRect(sx + Math.cos(a) * s * 0.6, V * 0.7 + Math.sin(a) * s - (1 - d * 8) * 0.5, 0.7, 0.7)
      }
    })
  } else {
    const x = U * (0.35 + 0.38), p2 = (c - dur) / 2 // ripples after splash
    if (p2 < 1) { ctx.strokeStyle = rgba(220, 240, 255, 1 - p2); ctx.lineWidth = 0.6; ctx.beginPath(); ctx.ellipse(x, V * 0.7, 3 + p2 * 22, 0.7 + p2 * 1.6, 0, 0, TAU); ctx.stroke() }
  }
  sea(2, '#0a1650', V * 0.76, 0.9, 1.4)
  sea(4, '#060d34', V * 0.88, 1.2, 1.8)
}

/* Kraken: tentacles lash up from a storm sea under flashing lightning. */
export function kraken(ctx, { U, V, t }) {
  const bolt = fract(t / 3.1) < 0.06 || (fract(t / 3.1) > 0.12 && fract(t / 3.1) < 0.15)
  sky(ctx, U, V, [[0, bolt ? '#8a6ad0' : '#0d0622'], [0.6, bolt ? '#5a3a9a' : '#2a0f4a'], [1, '#07020f']])
  if (bolt) {
    const r = rng(Math.floor(t / 3.1) + 4)
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath()
    let x = U * (0.2 + r() * 0.6), y = 0; ctx.moveTo(x, y)
    while (y < V * 0.6) { x += (r() - 0.5) * 7; y += 3 + r() * 3; ctx.lineTo(x, y) }
    ctx.stroke()
  }
  const tent = (x0, h, ph, w0, col) => {
    const segs = 22
    ctx.fillStyle = col
    for (let i = 0; i <= segs; i++) {
      const f = i / segs
      const x = x0 + Math.sin(f * 5 + t * 1.4 + ph) * (3 + f * 7) + Math.sin(t * 0.7 + ph) * 3 * f
      const y = V * 0.82 - f * h
      ctx.beginPath(); ctx.arc(x, y, Math.max(0.4, w0 * (1 - f * 0.9)), 0, TAU); ctx.fill()
      if (i % 3 === 0 && f > 0.1) { ctx.fillStyle = rgba(255, 190, 240, 0.85); ctx.beginPath(); ctx.arc(x + 0.1, y, w0 * (1 - f * 0.9) * 0.28, 0, TAU); ctx.fill(); ctx.fillStyle = col } // suckers
    }
  }
  tent(U * 0.28, V * 0.72, 0, 3.2, '#3b1a6a'); tent(U * 0.5, V * 0.88, 2, 3.8, '#4d1f86'); tent(U * 0.7, V * 0.66, 4, 3, '#3b1a6a'); tent(U * 0.4, V * 0.5, 1, 2.4, '#5f2aa0'); tent(U * 0.84, V * 0.45, 3, 2.2, '#5f2aa0')
  glow(ctx, U * 0.5, V * 0.7, 16, [190, 90, 255], 0.2)
  const wave = (base, c, amp, sp, k) => {
    ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(0, V)
    for (let x = 0; x <= U; x += 1) ctx.lineTo(x, base + Math.sin(x * 0.32 + t * sp + k) * amp + Math.sin(x * 0.13 - t * sp) * amp * 0.7)
    ctx.lineTo(U, V); ctx.fill(); ctx.strokeStyle = rgba(210, 170, 255, 0.55); ctx.lineWidth = 0.55; ctx.stroke()
  }
  wave(V * 0.8, '#1a0a38', 1.3, 2.2, 0); wave(V * 0.9, '#0c0420', 1.6, 2.8, 3)
  for (let i = 0; i < 50; i++) { const rr = rng(i + 77); ctx.fillStyle = rgba(190, 150, 255, 0.45); ctx.fillRect((rr() * U + t * 4) % U, (rr() * V + t * 18) % V, 0.3, 1.2) } // rain
}

/* Titan: a banded giant with a crackling storm, rings and moons in a starfield. */
export function titan(ctx, { U, V, t }) {
  ctx.fillStyle = '#05030a'; ctx.fillRect(0, 0, U, V)
  glow(ctx, U * 0.5, V * 0.5, V * 1.3, [255, 120, 40], 0.18)
  stars(ctx, U, V, { n: 140, seed: 41, t, maxY: 1 })
  const px = U * 0.5, py = V * 0.52, pr = V * 0.34
  const ring = (front, k, c, w) => { ctx.save(); ctx.translate(px, py); ctx.rotate(-0.28); ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.ellipse(0, 0, pr * k * 1.15, pr * k * 0.28, 0, front ? 0 : Math.PI, front ? Math.PI : TAU); ctx.stroke(); ctx.restore() }
  ;[[1.45, 'rgba(255,200,130,0.85)', 1.3], [1.7, 'rgba(255,150,80,0.6)', 0.9], [1.95, 'rgba(255,230,190,0.4)', 0.6]].forEach(([k, c, w]) => ring(false, k, c, w))
  const g = ctx.createLinearGradient(px, py - pr, px, py + pr)
  g.addColorStop(0, '#ffcf8a'); g.addColorStop(0.3, '#e0702a'); g.addColorStop(0.6, '#ffb060'); g.addColorStop(1, '#6a2a14')
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, pr, 0, TAU); ctx.fill()
  ctx.save(); ctx.beginPath(); ctx.arc(px, py, pr, 0, TAU); ctx.clip()
  for (let i = 0; i < 9; i++) { // storm bands sliding at different speeds
    const y = py - pr + (i + 0.5) * ((pr * 2) / 9), dir = i % 2 ? 1 : -1
    ctx.fillStyle = rgba(i % 2 ? 255 : 120, i % 2 ? 235 : 50, i % 2 ? 190 : 20, 0.28)
    for (let k = 0; k < 6; k++) ctx.fillRect(px - pr + ((k * 14 + t * 5 * dir * (1 + i * 0.1)) % (pr * 2.4)) - pr * 0.2, y, 9, 0.9)
  }
  // great storm
  ctx.fillStyle = rgba(255, 90, 40, 0.65); ctx.beginPath(); ctx.ellipse(px + pr * 0.25, py + pr * 0.2, pr * 0.2, pr * 0.1, 0, 0, TAU); ctx.fill()
  const shade = ctx.createRadialGradient(px - pr * 0.5, py - pr * 0.45, pr * 0.2, px, py, pr * 1.08)
  shade.addColorStop(0, rgba(0, 0, 0, 0)); shade.addColorStop(1, rgba(10, 0, 10, 0.82)); ctx.fillStyle = shade; ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2)
  ctx.restore()
  ring(true, 1.45, 'rgba(255,200,130,0.95)', 1.3); ring(true, 1.7, 'rgba(255,150,80,0.7)', 0.9); ring(true, 1.95, 'rgba(255,230,190,0.5)', 0.6)
  // lightning arcs leaping off the limb
  if (fract(t / 1.7) < 0.2) {
    const r = rng(Math.floor(t / 1.7) + 9), a0 = r() * TAU
    ctx.strokeStyle = '#fff6c0'; ctx.lineWidth = 0.8; ctx.beginPath()
    let x = px + Math.cos(a0) * pr, y = py + Math.sin(a0) * pr; ctx.moveTo(x, y)
    for (let i = 0; i < 6; i++) { x += Math.cos(a0) * 3 + (r() - 0.5) * 4; y += Math.sin(a0) * 3 + (r() - 0.5) * 4; ctx.lineTo(x, y) }
    ctx.stroke(); glow(ctx, x, y, 7, [255, 230, 160], 0.6)
  }
  ;[[0.9, 0.31, '#d8d0ff', 1.3], [1.2, 0.2, '#ffd0a0', 0.9]].forEach(([sp, rad, col, sz], i) => { // moons
    const a = t * sp * 0.5 + i * 2.4
    disc(ctx, px + Math.cos(a) * pr * 2.3, py + Math.sin(a) * pr * 0.55, sz, col)
  })
}

/* Legend: a crowned sunburst with rising embers of gold and a ring of laurels. */
export function legend(ctx, { U, V, t }) {
  sky(ctx, U, V, [[0, '#1a1000'], [0.5, '#5a3a00'], [1, '#1a0f00']])
  const cx = U * 0.5, cy = V * 0.52
  glow(ctx, cx, cy, V * 1.3, [255, 205, 70], 0.55 + 0.1 * Math.sin(t * 2))
  for (let i = 0; i < 24; i++) { // rotating rays, alternating long and short
    const a = t * 0.3 + (i / 24) * TAU, len = V * (i % 2 ? 0.95 : 1.4), w = 0.07
    ctx.fillStyle = rgba(255, 220, 120, i % 2 ? 0.28 : 0.45)
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a - w) * len, cy + Math.sin(a - w) * len); ctx.lineTo(cx + Math.cos(a + w) * len, cy + Math.sin(a + w) * len); ctx.fill()
  }
  // laurel wreath
  ;[-1, 1].forEach((s) => {
    for (let i = 0; i < 11; i++) {
      const f = i / 10, a = Math.PI * (0.62 + f * 0.8), x = cx + s * Math.cos(a - Math.PI * 0.5) * V * 0.4 * 1.0, y = cy + V * 0.05 - Math.sin(a - Math.PI * 0.5) * V * 0.38 * 0.5 - f * 0
      const lx = cx + s * (V * 0.34 * Math.sin(f * 2.4 + 0.2) + 3), ly = cy + V * 0.34 - f * V * 0.62
      ctx.fillStyle = rgba(250, 210, 90, 0.9); ctx.beginPath(); ctx.ellipse(lx, ly, 2.4, 1.0, s * (-0.7 + f * 1.4), 0, TAU); ctx.fill()
      void x; void y
    }
  })
  // crown
  const w = V * 0.46, h = V * 0.34, bx = cx - w / 2, by = cy + h / 2
  const g = ctx.createLinearGradient(0, cy - h, 0, by); g.addColorStop(0, '#fff2a8'); g.addColorStop(0.5, '#f5b82a'); g.addColorStop(1, '#a8680a')
  ctx.fillStyle = g
  ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx - 1.5, cy - h * 0.55); ctx.lineTo(bx + w * 0.22, cy - h * 0.05); ctx.lineTo(bx + w * 0.38, cy - h * 0.75); ctx.lineTo(cx, cy - h * 0.1); ctx.lineTo(bx + w * 0.62, cy - h * 0.75); ctx.lineTo(bx + w * 0.78, cy - h * 0.05); ctx.lineTo(bx + w + 1.5, cy - h * 0.55); ctx.lineTo(bx + w, by); ctx.closePath(); ctx.fill()
  ctx.fillStyle = '#7a4408'; ctx.fillRect(bx, by - h * 0.12, w, h * 0.14)
  ;[[bx + w * 0.22, '#ff4a6a'], [cx, '#4ad8ff'], [bx + w * 0.78, '#ff4a6a']].forEach(([x, col], i) => { const pulse = 0.6 + 0.4 * Math.sin(t * 3 + i); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, by - h * 0.05, 1.1, 0, TAU); ctx.fill(); glow(ctx, x, by - h * 0.05, 4, i === 1 ? [90, 220, 255] : [255, 90, 120], 0.5 * pulse) })
  ;[bx - 1.5, bx + w * 0.38, bx + w * 0.62, bx + w + 1.5].forEach((x, i) => { const yy = [cy - h * 0.55, cy - h * 0.75, cy - h * 0.75, cy - h * 0.55][i]; disc(ctx, x, yy, 1.0, '#fff8d0') })
  for (let i = 0; i < 60; i++) { // rising gold
    const rr = rng(i + 10), x = rr() * U, sp = 2 + rr() * 5, y = V - ((t * sp + rr() * V) % V)
    ctx.fillStyle = rgba(255, 215, 90, 0.35 + 0.5 * rr()); ctx.fillRect(x + Math.sin(t + i) * 1.5, y, 0.6, 0.6)
  }
}

export const SCENES2 = { rugpull, volcano, lion, tiger, summit, rekt, rookie, trader, shark, whale, kraken, titan, legend }
