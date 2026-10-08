import { rng } from './raster'

/* Calling-card scenes. Each painter draws a full-colour picture on a dark ground; the rasteriser
   turns brightness into character density and keeps the colour, so every layer reads in ASCII. */

const TAU = Math.PI * 2
const rgba = (r, g, b, a = 1) => `rgba(${r},${g},${b},${a})`

function sky(ctx, U, V, stops) {
  const g = ctx.createLinearGradient(0, 0, 0, V)
  stops.forEach(([p, c]) => g.addColorStop(p, c))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, U, V)
}

function glow(ctx, x, y, r, [R, G, B], a = 1) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, rgba(R, G, B, a))
  g.addColorStop(0.35, rgba(R, G, B, a * 0.45))
  g.addColorStop(1, rgba(R, G, B, 0))
  ctx.fillStyle = g
  ctx.fillRect(x - r, y - r, r * 2, r * 2)
}

function disc(ctx, x, y, r, color) {
  ctx.fillStyle = color
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill()
}

function stars(ctx, U, V, { n = 120, seed = 7, t = 0, maxY = 0.7, size = 0.42 } = {}) {
  const r = rng(seed)
  for (let i = 0; i < n; i++) {
    const x = r() * U, y = r() * V * maxY, ph = r() * TAU, sp = 0.6 + r() * 1.6, b = 0.35 + r() * 0.65
    const tw = 0.55 + 0.45 * Math.sin(t * sp + ph)
    ctx.fillStyle = rgba(255, 255, 255, b * tw)
    ctx.beginPath(); ctx.arc(x, y, size * (0.6 + b * 0.7), 0, TAU); ctx.fill()
  }
}

// a rolling ridge line: sum of sines with seeded phases plus a little jitter
function ridgeY(U, { base, amp, seed, rough = 1 }) {
  const r = rng(seed)
  const waves = [0, 1, 2, 3].map((k) => ({ f: (0.035 + r() * 0.05) * (1 + k * 1.7) * rough, p: r() * TAU, a: amp / (1 + k * 1.1) }))
  return (x) => base + waves.reduce((s, w) => s + Math.sin(x * w.f + w.p) * w.a, 0)
}

function ridge(ctx, U, V, opt, fill, { snow = null, step = 0.8 } = {}) {
  const y = ridgeY(U, opt)
  ctx.fillStyle = fill
  ctx.beginPath(); ctx.moveTo(0, V)
  for (let x = 0; x <= U; x += step) ctx.lineTo(x, y(x))
  ctx.lineTo(U, V); ctx.closePath(); ctx.fill()
  if (snow) {
    ctx.strokeStyle = snow; ctx.lineWidth = 1.0
    ctx.beginPath()
    for (let x = 0; x <= U; x += step) { const yy = y(x); x ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy) }
    ctx.stroke()
  }
  return y
}

function pine(ctx, x, y, h, color) {
  ctx.fillStyle = color
  for (let k = 0; k < 4; k++) {
    const top = y - h + (k * h) / 4.4, w = h * (0.2 + k * 0.1)
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x - w, top + h * 0.34); ctx.lineTo(x + w, top + h * 0.34); ctx.closePath(); ctx.fill()
  }
  ctx.fillRect(x - h * 0.03, y - h * 0.08, h * 0.06, h * 0.1)
}

function bird(ctx, x, y, s, flap) {
  ctx.strokeStyle = rgba(20, 20, 30, 0.9); ctx.lineWidth = 0.35
  ctx.beginPath()
  ctx.moveTo(x - s, y - flap * s); ctx.quadraticCurveTo(x - s * 0.4, y - s * 0.5, x, y)
  ctx.quadraticCurveTo(x + s * 0.4, y - s * 0.5, x + s, y - flap * s)
  ctx.stroke()
}

/* 1 — Day One: sunrise over layered peaks */
export function sunrise(ctx, { U, V, t }) {
  sky(ctx, U, V, [[0, '#0b1030'], [0.25, '#4a3a8b'], [0.5, '#e0607b'], [0.72, '#ffb86b'], [1, '#fff0b8']])
  stars(ctx, U, V, { n: 50, seed: 3, t, maxY: 0.35 })
  const sx = U * 0.68, sy = V * 0.62
  glow(ctx, sx, sy, V * 1.1, [255, 190, 110], 0.55 + 0.08 * Math.sin(t * 0.9))
  disc(ctx, sx, sy, V * 0.21, '#fff6d6')
  for (let i = 0; i < 9; i++) { // soft rays
    const a = -Math.PI * 0.95 + (i / 8) * Math.PI * 0.9 + Math.sin(t * 0.4 + i) * 0.02
    ctx.strokeStyle = rgba(255, 220, 150, 0.16); ctx.lineWidth = 0.9
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(a) * V * 1.4, sy + Math.sin(a) * V * 1.4); ctx.stroke()
  }
  ridge(ctx, U, V, { base: V * 0.58, amp: V * 0.1, seed: 11, rough: 1.2 }, '#4a3482', { snow: rgba(255, 240, 245, 1) })
  ridge(ctx, U, V, { base: V * 0.7, amp: V * 0.09, seed: 23 }, '#2a2060', { snow: rgba(255, 215, 200, 0.8) })
  const mist = ctx.createLinearGradient(0, V * 0.72, 0, V * 0.86)
  mist.addColorStop(0, rgba(255, 190, 150, 0)); mist.addColorStop(1, rgba(255, 190, 150, 0.35))
  ctx.fillStyle = mist; ctx.fillRect(0, V * 0.72, U, V * 0.14)
  ridge(ctx, U, V, { base: V * 0.84, amp: V * 0.07, seed: 31, rough: 0.8 }, '#0c0a2a', { snow: rgba(255, 180, 160, 0.55) })
  for (let i = 0; i < 4; i++) bird(ctx, ((t * 2 + i * 9) % (U + 20)) - 10, V * (0.25 + i * 0.05) + Math.sin(t + i) * 0.6, 1.1 - i * 0.15, 0.4 + 0.5 * Math.sin(t * 5 + i))
}

/* 2 — First Contact: neon skyline at night */
export function skyline(ctx, { U, V, t }) {
  sky(ctx, U, V, [[0, '#05060f'], [0.55, '#1b1040'], [1, '#4a1a5e']])
  stars(ctx, U, V, { n: 70, seed: 5, t, maxY: 0.45 })
  glow(ctx, U * 0.2, V * 0.2, V * 0.5, [190, 200, 255], 0.35)
  disc(ctx, U * 0.2, V * 0.2, V * 0.07, '#f3f1ff')
  const r = rng(19)
  for (let layer = 0; layer < 2; layer++) {
    let x = layer ? -2 : -6
    const colorB = layer ? '#10122e' : '#1a1a46'
    while (x < U) {
      const w = 4 + r() * 8, h = V * (layer ? 0.28 : 0.4) * (0.45 + r() * 0.9)
      const y = V * 0.82 - h
      ctx.fillStyle = colorB; ctx.fillRect(x, y, w, h + V)
      const cols = Math.floor(w / 1.6), rowsN = Math.floor(h / 2)
      for (let cx = 0; cx < cols; cx++) {
        for (let ry = 0; ry < rowsN; ry++) {
          const on = r() > 0.55, flick = Math.sin(t * 0.5 + cx * 3.1 + ry * 1.7 + x) > 0.92
          if (!on || flick) continue
          const hue = r() > 0.8 ? [255, 90, 200] : r() > 0.5 ? [90, 220, 255] : [255, 220, 130]
          ctx.fillStyle = rgba(hue[0], hue[1], hue[2], layer ? 0.55 : 0.9)
          ctx.fillRect(x + 0.6 + cx * 1.6, y + 1 + ry * 2, 0.9, 1.1)
        }
      }
      if (!layer && r() > 0.7) { // neon sign
        const pulse = 0.65 + 0.35 * Math.sin(t * 2.2 + x)
        ctx.fillStyle = rgba(255, 70, 180, pulse); ctx.fillRect(x + w * 0.2, y + 0.8, w * 0.6, 0.9)
        glow(ctx, x + w / 2, y + 1.3, 5, [255, 70, 180], 0.4 * pulse)
      }
      if (!layer && r() > 0.8) { ctx.fillStyle = '#2a2a60'; ctx.fillRect(x + w / 2 - 0.2, y - 3, 0.4, 3) }
      x += w + 0.4
    }
  }
  const water = ctx.createLinearGradient(0, V * 0.82, 0, V)
  water.addColorStop(0, '#2a1450'); water.addColorStop(1, '#0a0620')
  ctx.fillStyle = water; ctx.fillRect(0, V * 0.82, U, V * 0.18)
  for (let i = 0; i < 40; i++) { // neon reflections
    const rx = r() * U, ry = V * 0.84 + r() * V * 0.15
    ctx.fillStyle = rgba(r() > 0.5 ? 255 : 90, r() > 0.5 ? 90 : 220, 220, 0.35 * (0.5 + 0.5 * Math.sin(t * 1.4 + i)))
    ctx.fillRect(rx, ry, 1 + r() * 4, 0.35)
  }
}

/* 3 — Inner Circle: dusk ocean with a sailboat */
export function ocean(ctx, { U, V, t }) {
  sky(ctx, U, V, [[0, '#0c1a4a'], [0.4, '#3a4a9a'], [0.58, '#ff8c6b'], [0.6, '#ffd29a'], [1, '#07204a']])
  const hx = U * 0.5, hy = V * 0.6
  glow(ctx, hx, hy, V * 0.9, [255, 170, 110], 0.5)
  disc(ctx, hx, hy - V * 0.02, V * 0.13, '#ffe8b8')
  for (let i = 0; i < 16; i++) { // sun glints on the water
    const y = hy + 1.5 + i * (V * 0.4) / 16
    const w = (2 + i * 0.9) * (0.7 + 0.5 * Math.sin(t * 2 + i * 1.7))
    ctx.fillStyle = rgba(255, 220, 160, 0.65 - i * 0.03); ctx.fillRect(hx - w / 2, y, w, 0.45)
  }
  const layers = [
    { base: V * 0.64, amp: 0.7, f: 0.35, c: '#17306a', sp: 0.8 },
    { base: V * 0.74, amp: 1.0, f: 0.28, c: '#102658', sp: 1.1 },
    { base: V * 0.85, amp: 1.5, f: 0.22, c: '#0a1c46', sp: 1.5 },
  ]
  layers.forEach((l, k) => {
    ctx.fillStyle = l.c
    ctx.beginPath(); ctx.moveTo(0, V)
    for (let x = 0; x <= U; x += 0.8) ctx.lineTo(x, l.base + Math.sin(x * l.f + t * l.sp + k) * l.amp + Math.sin(x * l.f * 2.3 - t * l.sp * 0.7) * l.amp * 0.4)
    ctx.lineTo(U, V); ctx.closePath(); ctx.fill()
    ctx.strokeStyle = rgba(190, 220, 255, 0.55); ctx.lineWidth = 0.55; ctx.stroke()
  })
  // sailboat bobbing
  const bx = U * 0.22 + Math.sin(t * 0.2) * 3, by = V * 0.69 + Math.sin(t * 1.3) * 0.5
  ctx.fillStyle = '#1b1235'; ctx.beginPath(); ctx.moveTo(bx - 3, by); ctx.lineTo(bx + 3, by); ctx.lineTo(bx + 2, by + 1.2); ctx.lineTo(bx - 2, by + 1.2); ctx.fill()
  ctx.fillStyle = '#f7e9d0'; ctx.beginPath(); ctx.moveTo(bx, by - 5.5); ctx.lineTo(bx, by - 0.2); ctx.lineTo(bx + 3, by - 0.2); ctx.fill()
  ctx.fillStyle = '#e8c8a0'; ctx.beginPath(); ctx.moveTo(bx - 0.4, by - 4.5); ctx.lineTo(bx - 0.4, by - 0.2); ctx.lineTo(bx - 2.6, by - 0.2); ctx.fill()
  for (let i = 0; i < 3; i++) bird(ctx, ((t * 1.4 + i * 14) % (U + 20)) - 10, V * (0.22 + i * 0.06), 1.2, 0.3 + 0.6 * Math.sin(t * 4 + i))
}

/* 4 — Constellation: ringed planet in a nebula */
export function orbit(ctx, { U, V, t }) {
  ctx.fillStyle = '#04030c'; ctx.fillRect(0, 0, U, V)
  glow(ctx, U * 0.78, V * 0.3, V * 1.1, [120, 60, 200], 0.4)
  glow(ctx, U * 0.2, V * 0.78, V * 0.9, [30, 150, 200], 0.34)
  glow(ctx, U * 0.5, V * 0.5, V * 0.8, [200, 60, 140], 0.18)
  stars(ctx, U, V, { n: 170, seed: 13, t, maxY: 1 })
  const px = U * 0.5, py = V * 0.52, pr = V * 0.3
  const rings = (front) => {
    ctx.save(); ctx.translate(px, py); ctx.rotate(-0.34)
    ;[[1.5, 'rgba(255,214,150,0.85)', 0.5], [1.75, 'rgba(210,160,255,0.65)', 0.4], [2.0, 'rgba(160,200,255,0.5)', 0.3]].forEach(([k, c, w]) => {
      ctx.strokeStyle = c; ctx.lineWidth = w * 2
      ctx.beginPath(); ctx.ellipse(0, 0, pr * k * 1.15, pr * k * 0.3, 0, front ? 0 : Math.PI, front ? Math.PI : TAU); ctx.stroke()
    })
    ctx.restore()
  }
  rings(false)
  const g = ctx.createLinearGradient(px - pr, py - pr, px + pr, py + pr)
  g.addColorStop(0, '#ffd9a0'); g.addColorStop(0.45, '#d98a5a'); g.addColorStop(1, '#4a2a5a')
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, pr, 0, TAU); ctx.fill()
  ctx.save(); ctx.beginPath(); ctx.arc(px, py, pr, 0, TAU); ctx.clip()
  for (let i = 0; i < 7; i++) { // cloud bands
    ctx.fillStyle = rgba(i % 2 ? 255 : 120, i % 2 ? 230 : 60, i % 2 ? 190 : 90, 0.2)
    ctx.fillRect(px - pr, py - pr + (i + 0.4) * ((pr * 2) / 7) + Math.sin(t * 0.4 + i) * 0.4, pr * 2, pr * 0.1)
  }
  const shade = ctx.createRadialGradient(px - pr * 0.45, py - pr * 0.45, pr * 0.2, px, py, pr * 1.1)
  shade.addColorStop(0, rgba(0, 0, 0, 0)); shade.addColorStop(1, rgba(0, 0, 10, 0.78))
  ctx.fillStyle = shade; ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2)
  ctx.restore()
  rings(true)
  const a = t * 0.5, mx = px + Math.cos(a) * pr * 2.8, my = py + Math.sin(a) * pr * 0.9 - 1
  disc(ctx, mx, my, V * 0.05, '#dfe6ff'); glow(ctx, mx, my, V * 0.18, [180, 200, 255], 0.25)
}

/* 5 — Joined the Club: old-growth forest at dusk with fireflies */
export function forest(ctx, { U, V, t }) {
  sky(ctx, U, V, [[0, '#06161c'], [0.3, '#18705f'], [0.62, '#7fd6a2'], [1, '#d4f5c8']])
  glow(ctx, U * 0.7, V * 0.3, V * 0.7, [220, 255, 220], 0.4)
  disc(ctx, U * 0.7, V * 0.3, V * 0.09, '#f4ffec')
  const r = rng(41)
  ridge(ctx, U, V, { base: V * 0.6, amp: V * 0.08, seed: 5 }, '#1d6b66')
  ;[[0.62, '#12505a', 0.34, 22], [0.74, '#0b3540', 0.46, 18], [0.92, '#04161e', 0.62, 14]].forEach(([base, col, hf, n], layer) => {
    for (let i = 0; i < n; i++) pine(ctx, (i + r() * 0.7) * (U / n), V * base + r() * 2, V * hf * (0.7 + r() * 0.5), col)
    const fog = ctx.createLinearGradient(0, V * base - 4, 0, V * base + 5)
    fog.addColorStop(0, rgba(150, 220, 190, 0)); fog.addColorStop(1, rgba(150, 220, 190, 0.16 - layer * 0.03))
    ctx.fillStyle = fog; ctx.fillRect(0, V * base - 4, U, 9)
  })
  for (let i = 0; i < 26; i++) { // fireflies
    const fx = (r() * U + Math.sin(t * 0.4 + i) * 3 + U) % U, fy = V * (0.5 + r() * 0.45) + Math.cos(t * 0.5 + i * 2) * 1.5
    const on = 0.5 + 0.5 * Math.sin(t * (1 + r()) + i * 5)
    glow(ctx, fx, fy, 2.2, [220, 255, 120], 0.8 * on)
  }
}

/* 6 — Regular: dune sea beneath a huge moon */
export function dunes(ctx, { U, V, t }) {
  sky(ctx, U, V, [[0, '#1a0b3a'], [0.45, '#7a3a6a'], [0.75, '#f08a5a'], [1, '#ffc88a']])
  stars(ctx, U, V, { n: 60, seed: 21, t, maxY: 0.4 })
  const mx = U * 0.3, my = V * 0.34
  glow(ctx, mx, my, V * 0.8, [255, 230, 200], 0.4)
  disc(ctx, mx, my, V * 0.2, '#fff0d8')
  ctx.fillStyle = rgba(190, 150, 140, 0.35)
  ;[[-0.06, -0.04, 0.04], [0.05, 0.03, 0.05], [-0.02, 0.07, 0.03]].forEach(([dx, dy, rr]) => { ctx.beginPath(); ctx.arc(mx + dx * V * 2, my + dy * V * 2, rr * V, 0, TAU); ctx.fill() })
  const dune = (base, amp, seed, light, dark) => {
    const y = ridgeY(U, { base, amp, seed, rough: 0.55 })
    ctx.fillStyle = dark
    ctx.beginPath(); ctx.moveTo(0, V); for (let x = 0; x <= U; x += 0.8) ctx.lineTo(x, y(x)); ctx.lineTo(U, V); ctx.fill()
    ctx.fillStyle = light // sun-facing slopes
    ctx.beginPath(); ctx.moveTo(0, V)
    for (let x = 0; x <= U; x += 0.8) { const slope = y(x + 1) - y(x - 1); ctx.lineTo(x, slope < 0 ? y(x) : y(x) + 0.001 + Math.max(0, 1.3 - slope * 1.2)) }
    ctx.lineTo(U, V); ctx.fill()
    return y
  }
  dune(V * 0.68, V * 0.07, 3, '#c97a5a', '#8a4a58')
  const yMid = dune(V * 0.78, V * 0.07, 9, '#e8a070', '#a85a58')
  dune(V * 0.9, V * 0.06, 17, '#f4b88a', '#c0705a')
  for (let i = 0; i < 4; i++) { // caravan on the middle ridge
    const x = ((t * 1.1 + i * 3.2) % (U + 10)) - 5
    ctx.fillStyle = '#2a1230'
    ctx.fillRect(x, yMid(x) - 1.7, 1.6, 1.1); ctx.fillRect(x + 1.2, yMid(x) - 2.6, 0.5, 1); ctx.fillRect(x + 0.1, yMid(x) - 0.6, 0.3, 0.7); ctx.fillRect(x + 1.2, yMid(x) - 0.6, 0.3, 0.7)
  }
}

/* 7 — Watchtower: a wall of live-looking charts */
export function storm(ctx, { U, V, t }) {
  ctx.fillStyle = '#050a0e'; ctx.fillRect(0, 0, U, V)
  ctx.strokeStyle = rgba(60, 120, 120, 0.2); ctx.lineWidth = 0.18
  for (let x = 0; x < U; x += 6) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, V); ctx.stroke() }
  for (let y = 0; y < V; y += 4.5) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(U, y); ctx.stroke() }
  const series = (seed, off, color, fill, base, vol) => {
    const r = rng(seed)
    const pts = []
    let v = base
    for (let i = 0; i < 160; i++) { v += (r() - 0.46) * vol; v = Math.max(V * 0.08, Math.min(V * 0.92, v)); pts.push(v) }
    const scroll = (t * 4 + off) % 60
    ctx.beginPath()
    for (let x = 0; x <= U; x += 0.9) {
      const k = (x + scroll) / 0.9, i = Math.floor(k), f = k - i
      const y = pts[i % 160] * (1 - f) + pts[(i + 1) % 160] * f
      x ? ctx.lineTo(x, y) : ctx.moveTo(x, y)
    }
    ctx.strokeStyle = color; ctx.lineWidth = 0.65; ctx.stroke()
    ctx.lineTo(U, V); ctx.lineTo(0, V); ctx.closePath(); ctx.fillStyle = fill; ctx.fill()
  }
  series(3, 0, '#3dff9a', rgba(40, 255, 150, 0.1), V * 0.7, 2.2)
  series(8, 22, '#ff5a7a', rgba(255, 70, 110, 0.07), V * 0.45, 2.6)
  series(15, 41, '#58b8ff', rgba(80, 180, 255, 0.07), V * 0.3, 2)
  const r = rng(77)
  for (let i = 0; i < 9; i++) { // candles in the foreground
    const x = U * 0.58 + i * 3.6, up = r() > 0.4, h = 3 + r() * 6, y = V * 0.5 + Math.sin(i * 0.9 + t * 0.6) * 3
    const c = up ? '#3dff9a' : '#ff5a7a'
    ctx.strokeStyle = c; ctx.lineWidth = 0.3; ctx.beginPath(); ctx.moveTo(x + 0.9, y - 2); ctx.lineTo(x + 0.9, y + h + 2); ctx.stroke()
    ctx.fillStyle = c; ctx.fillRect(x, y, 1.8, h)
  }
  const pulse = 0.5 + 0.5 * Math.sin(t * 3)
  glow(ctx, U * 0.9, V * 0.18, 9, [60, 255, 160], 0.5 * pulse)
}

/* 8 — Evangelist: aurora over a frozen lake */
export function aurora(ctx, { U, V, t }) {
  sky(ctx, U, V, [[0, '#02050f'], [0.6, '#06182a'], [1, '#0a2a3a']])
  stars(ctx, U, V, { n: 120, seed: 29, t, maxY: 0.6 })
  for (let band = 0; band < 3; band++) {
    const hue = [[60, 255, 170], [90, 200, 255], [190, 110, 255]][band]
    for (let x = 0; x < U; x += 0.8) {
      const w = Math.sin(x * 0.06 + t * 0.5 + band * 1.8) + Math.sin(x * 0.13 - t * 0.35 + band) * 0.5
      const top = V * (0.12 + band * 0.07) + w * V * 0.08
      const h = V * (0.3 + 0.1 * Math.sin(x * 0.2 + t * 0.7 + band))
      const g = ctx.createLinearGradient(0, top, 0, top + h)
      g.addColorStop(0, rgba(hue[0], hue[1], hue[2], 0)); g.addColorStop(0.3, rgba(hue[0], hue[1], hue[2], 0.5)); g.addColorStop(1, rgba(hue[0], hue[1], hue[2], 0))
      ctx.fillStyle = g; ctx.fillRect(x, top, 0.9, h)
    }
  }
  ridge(ctx, U, V, { base: V * 0.74, amp: V * 0.08, seed: 33 }, '#050c18', { snow: rgba(200, 235, 255, 0.35) })
  const lake = ctx.createLinearGradient(0, V * 0.8, 0, V)
  lake.addColorStop(0, '#0a2a3a'); lake.addColorStop(1, '#03101c')
  ctx.fillStyle = lake; ctx.fillRect(0, V * 0.8, U, V * 0.2)
  for (let i = 0; i < 10; i++) { // reflected glow
    ctx.fillStyle = rgba(80, 255, 190, 0.1); ctx.fillRect(U * (0.05 + i * 0.1), V * 0.82 + (i % 3) * 1.6, 6, 0.5)
  }
}

/* 9 — Gilded: a golden hall of arches */
export function gilded(ctx, { U, V, t }) {
  sky(ctx, U, V, [[0, '#1a0f05'], [0.5, '#4a2a0a'], [1, '#2a1706']])
  glow(ctx, U * 0.5, V * 0.3, V * 1.2, [255, 200, 90], 0.45 + 0.06 * Math.sin(t))
  for (let i = 0; i < 5; i++) { // light shafts
    const x = U * (0.18 + i * 0.16)
    ctx.fillStyle = rgba(255, 215, 120, 0.07 + 0.03 * Math.sin(t + i))
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 3, 0); ctx.lineTo(x + 9 + i * 1.2, V); ctx.lineTo(x - 5, V); ctx.fill()
  }
  const arches = 4
  for (let k = 0; k < arches; k++) {
    const w = U * (0.5 - k * 0.1), cx = U / 2, top = V * (0.08 + k * 0.1), r = w / 2 * (0.5 + k * 0.05)
    ctx.strokeStyle = rgba(255, 205 - k * 25, 90 - k * 10, 0.9 - k * 0.12); ctx.lineWidth = 0.9 - k * 0.12
    ctx.beginPath(); ctx.moveTo(cx - w / 2, V * 0.9 - k * 2); ctx.lineTo(cx - w / 2, top + r); ctx.arc(cx, top + r, w / 2, Math.PI, 0); ctx.lineTo(cx + w / 2, V * 0.9 - k * 2); ctx.stroke()
  }
  for (let i = 0; i < 8; i++) { // columns
    const x = U * (0.06 + i * 0.125) + (i > 3 ? U * 0.02 : 0)
    const g = ctx.createLinearGradient(x, 0, x + 2.4, 0)
    g.addColorStop(0, '#6a4410'); g.addColorStop(0.5, '#ffd36a'); g.addColorStop(1, '#6a4410')
    ctx.fillStyle = g; ctx.fillRect(x, V * 0.22, 2.4, V * 0.65)
    ctx.fillStyle = '#ffd36a'; ctx.fillRect(x - 0.5, V * 0.2, 3.4, 0.9); ctx.fillRect(x - 0.5, V * 0.86, 3.4, 0.9)
  }
  const floor = ctx.createLinearGradient(0, V * 0.88, 0, V)
  floor.addColorStop(0, '#6a4410'); floor.addColorStop(1, '#1a0f05')
  ctx.fillStyle = floor; ctx.fillRect(0, V * 0.88, U, V * 0.12)
  for (let i = 0; i < 14; i++) { ctx.fillStyle = rgba(255, 220, 130, 0.22 * (0.5 + 0.5 * Math.sin(t * 1.5 + i))); ctx.fillRect(i * (U / 14) + 1, V * 0.9 + (i % 3) * 1.3, 3, 0.4) }
  for (let i = 0; i < 22; i++) { // drifting gold dust
    const r = rng(i + 90), x = (r() * U + t * (0.5 + r())) % U, y = (r() * V + t * 0.6) % V
    ctx.fillStyle = rgba(255, 230, 150, 0.7 * (0.4 + 0.6 * Math.sin(t * 2 + i))); ctx.fillRect(x, y, 0.5, 0.5)
  }
}

/* 10 — Thirty Days: the Capitol at dawn */
export function capitol(ctx, { U, V, t }) {
  sky(ctx, U, V, [[0, '#18204a'], [0.45, '#8a6a9a'], [0.75, '#ffb48a'], [1, '#ffe2b0']])
  stars(ctx, U, V, { n: 40, seed: 4, t, maxY: 0.3 })
  glow(ctx, U * 0.5, V * 0.62, V * 1.1, [255, 190, 130], 0.5)
  for (let i = 0; i < 3; i++) { // thin clouds
    const x = ((t * 0.8 + i * 40) % (U + 30)) - 15
    ctx.fillStyle = rgba(255, 200, 190, 0.25); ctx.beginPath(); ctx.ellipse(x, V * (0.2 + i * 0.1), 11, 1.2, 0, 0, TAU); ctx.fill()
  }
  const cx = U / 2, base = V * 0.86
  ctx.fillStyle = '#2a2250'
  ctx.fillRect(cx - U * 0.34, base - V * 0.2, U * 0.68, V * 0.2)
  ctx.fillRect(cx - U * 0.24, base - V * 0.3, U * 0.48, V * 0.1)
  ctx.fillRect(cx - U * 0.1, base - V * 0.46, U * 0.2, V * 0.16)
  ctx.beginPath(); ctx.arc(cx, base - V * 0.46, U * 0.105, Math.PI, 0); ctx.fill()
  ctx.fillRect(cx - 0.7, base - V * 0.78, 1.4, V * 0.18)
  ctx.beginPath(); ctx.arc(cx, base - V * 0.6, 1.2, 0, TAU); ctx.fill()
  for (let i = 0; i < 18; i++) { // columns as pale slits
    ctx.fillStyle = rgba(255, 190, 150, 0.6); ctx.fillRect(cx - U * 0.32 + i * (U * 0.64) / 17, base - V * 0.18, 0.8, V * 0.16)
  }
  for (let i = 0; i < 8; i++) { ctx.fillStyle = rgba(255, 200, 160, 0.55); ctx.fillRect(cx - U * 0.2 + i * 5, base - V * 0.4, 0.7, V * 0.08) }
  const flag = (x, y) => { // fluttering flag
    ctx.fillStyle = '#d9d2ff'; ctx.fillRect(x, y - 5, 0.3, 6)
    ctx.beginPath(); ctx.moveTo(x + 0.3, y - 5)
    for (let k = 0; k <= 4; k++) ctx.lineTo(x + 0.3 + k, y - 5 + Math.sin(t * 4 + k) * 0.35)
    for (let k = 4; k >= 0; k--) ctx.lineTo(x + 0.3 + k, y - 3.4 + Math.sin(t * 4 + k) * 0.35)
    ctx.fillStyle = '#ff6a7a'; ctx.fill()
  }
  flag(cx - U * 0.33, base - V * 0.2); flag(cx + U * 0.32, base - V * 0.2)
  ctx.fillStyle = '#1b1640'; ctx.fillRect(0, base, U, V - base)
  ctx.fillStyle = '#2a2250'; for (let i = 0; i < 4; i++) ctx.fillRect(cx - U * 0.3 + i * 2, base - i * 0.0 + 0.2 + i * 0.6, U * 0.6 - i * 4, 0.5)
}

export const SCENES = { sunrise, skyline, ocean, orbit, forest, dunes, storm, aurora, gilded, capitol }

// shared painting helpers for the extra scenes in scenes2.js
export { sky, glow, disc, stars, ridge, ridgeY, rgba, TAU }
