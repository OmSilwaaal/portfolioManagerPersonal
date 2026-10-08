import { useMemo } from 'react'
import AsciiCanvas from './AsciiCanvas'
import { gradientFill } from './raster'

/* One animated ASCII shape per feed section. They idle (slow rotation, drifting candles, a radar sweep, ...) and
   swap when you pick a different filter. Colour is painted directly, so each shape keeps its own palette. */
const TAU = Math.PI * 2

function globe(ctx, { U, V, t }) {
  const cx = U / 2, cy = V / 2, R = Math.min(U, V) * 0.46
  ctx.strokeStyle = gradientFill(ctx, 'ice', cx - R, cy - R, cx + R, cy + R)
  ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke()
  for (let k = 0; k < 6; k++) { // meridians sweep around the sphere
    const a = (k / 6) * Math.PI + t * 0.7
    ctx.beginPath(); ctx.ellipse(cx, cy, Math.max(0.2, R * Math.abs(Math.cos(a))), R, 0, 0, TAU); ctx.stroke()
  }
  for (const lat of [-0.62, -0.3, 0, 0.3, 0.62]) { // parallels
    const w = Math.sqrt(1 - lat * lat) * R
    ctx.beginPath(); ctx.ellipse(cx, cy + lat * R, w, w * 0.16, 0, 0, TAU); ctx.stroke()
  }
}

function stocks(ctx, { U, V, t }) {
  const n = 8, bw = U * 0.075, gap = (U * 0.88 - n * bw) / (n - 1), base = V * 0.9
  for (let i = 0; i < n; i++) {
    const phase = t * 0.9 + i * 0.8
    const mid = 0.28 + (i / n) * 0.42 + Math.sin(phase) * 0.07
    const body = 0.07 + Math.abs(Math.sin(phase * 1.3)) * 0.09
    const up = Math.cos(phase * 1.3) > -0.2
    const top = mid + body / 2, bot = mid - body / 2
    const Y = (v) => base - v * V * 0.82
    const x = U * 0.06 + i * (bw + gap)
    ctx.fillStyle = ctx.strokeStyle = up ? '#4ade80' : '#fb7185'
    ctx.lineWidth = 1.4
    ctx.beginPath(); ctx.moveTo(x + bw / 2, Y(top + 0.07)); ctx.lineTo(x + bw / 2, Y(bot - 0.07)); ctx.stroke()
    ctx.fillRect(x, Y(top), bw, Math.max(1.2, Y(bot) - Y(top)))
  }
  ctx.fillStyle = '#a3a3a3'; ctx.fillRect(U * 0.04, base + 1.2, U * 0.92, 0.9)
}

function crypto(ctx, { U, V, t }) {
  const cx = U / 2, cy = V / 2, R = Math.min(U, V) * 0.44
  const spin = Math.cos(t * 1.7), rx = Math.max(0.18 * R, R * Math.abs(spin))
  const g = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R)
  g.addColorStop(0, '#fde047'); g.addColorStop(0.5, '#f59e0b'); g.addColorStop(1, '#b45309')
  ctx.fillStyle = g
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, R, 0, 0, TAU); ctx.fill()
  ctx.strokeStyle = '#fff7c2'; ctx.lineWidth = 1.2
  ctx.beginPath(); ctx.ellipse(cx, cy, rx * 0.8, R * 0.8, 0, 0, TAU); ctx.stroke()
  if (rx > R * 0.45) {
    ctx.save(); ctx.translate(cx, cy); ctx.scale(Math.sign(spin) * (rx / R), 1)
    ctx.fillStyle = '#7c2d12'; ctx.font = `900 ${R * 1.15}px Fraunces, serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('B', 0, R * 0.06); ctx.restore()
  }
}

function gov(ctx, { U, V, t }) {
  const cx = U / 2, base = V * 0.92
  const g = gradientFill(ctx, 'ice', cx - U * 0.4, 0, cx + U * 0.4, V)
  ctx.fillStyle = g
  ctx.fillRect(U * 0.1, base - 1.4, U * 0.8, 1.4); ctx.fillRect(U * 0.15, base - 2.8, U * 0.7, 1.4)
  for (let i = 0; i < 6; i++) ctx.fillRect(U * 0.2 + i * U * 0.12, base - V * 0.32, U * 0.065, V * 0.28)
  ctx.fillRect(U * 0.16, base - V * 0.38, U * 0.68, 1.6)
  ctx.fillRect(cx - U * 0.18, base - V * 0.52, U * 0.36, V * 0.14)
  ctx.beginPath(); ctx.arc(cx, base - V * 0.52, U * 0.2, Math.PI, TAU); ctx.fill()
  ctx.fillRect(cx - 0.5, base - V * 0.86, 1, V * 0.14)
  const w = Math.sin(t * 5) * 0.5 // flag
  ctx.fillStyle = '#fb7185'
  ctx.beginPath(); ctx.moveTo(cx + 0.5, base - V * 0.86); ctx.lineTo(cx + 5, base - V * 0.84 + w); ctx.lineTo(cx + 0.5, base - V * 0.78); ctx.fill()
}

function commodities(ctx, { U, V, t }) {
  const w = U * 0.42, h = V * 0.26
  const bars = [[U * 0.04, V * 0.66], [U * 0.54, V * 0.66], [U * 0.29, V * 0.36]]
  const path = (x, y) => { ctx.beginPath(); ctx.moveTo(x + h * 0.4, y); ctx.lineTo(x + w - h * 0.4, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath() }
  const g = ctx.createLinearGradient(0, V * 0.3, 0, V)
  g.addColorStop(0, '#fde047'); g.addColorStop(1, '#d97706')
  ctx.fillStyle = g
  bars.forEach(([x, y]) => { path(x, y); ctx.fill() })
  // a glint sweeps across every bar
  ctx.save(); ctx.globalCompositeOperation = 'source-atop'
  const gx = ((t * 0.5) % 1.6 - 0.3) * U
  const gl = ctx.createLinearGradient(gx - 4, 0, gx + 4, 0)
  gl.addColorStop(0, 'rgba(255,255,255,0)'); gl.addColorStop(0.5, 'rgba(255,255,255,0.95)'); gl.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gl; ctx.fillRect(0, 0, U, V)
  ctx.restore()
}

function macro(ctx, { U, V, t }) {
  const cx = U / 2, cy = V / 2, R = Math.min(U, V) * 0.46
  ctx.strokeStyle = '#6ee7b7'; ctx.lineWidth = 1
  for (const k of [1, 0.66, 0.33]) { ctx.beginPath(); ctx.arc(cx, cy, R * k, 0, TAU); ctx.stroke() }
  ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke()
  const a = t * 1.4
  for (let k = 0; k < 14; k++) { // fading sweep trail
    ctx.strokeStyle = `rgba(110,231,183,${0.9 - k * 0.06})`; ctx.lineWidth = 1.6
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a - k * 0.07) * R, cy + Math.sin(a - k * 0.07) * R); ctx.stroke()
  }
  ;[[0.5, 0.9], [0.7, 3.4], [0.35, 5.1]].forEach(([r, th]) => { // blips light up as the sweep passes
    const d = ((a - th) % TAU + TAU) % TAU
    if (d < 1.6) { ctx.fillStyle = `rgba(253,224,71,${1 - d / 1.6})`; ctx.beginPath(); ctx.arc(cx + Math.cos(th) * R * r, cy + Math.sin(th) * R * r, 1.4, 0, TAU); ctx.fill() }
  })
}

export const SHAPES = { all: globe, stocks, crypto, 'gov-trades': gov, commodities, macro }

export default function SectionShape({ kind = 'all', cols = 34, rows = 15, fontPx = 7, style }) {
  const painter = useMemo(() => SHAPES[kind] ?? SHAPES.all, [kind])
  return (
    <AsciiCanvas key={kind} painter={painter} cols={cols} rows={rows} fontPx={fontPx} fps={10} gamma={0.6} label={`${kind} section`} style={style} />
  )
}
