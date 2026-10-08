import AsciiCanvas from './AsciiCanvas'
import { sampleGradient } from './palettes'

/* The Travauxus mark (a diamond inside a diamond) built as a thick 3D slab that turns about its vertical axis,
   drawn as ASCII. Edges nearer the viewer are brighter, so the spin reads as depth. */
const OUTER = [[0, -1], [1, 0], [0, 1], [-1, 0]]
const INNER = OUTER.map(([x, y]) => [x * 0.5, y * 0.5])
const DEPTH = 0.22

function logoSpin(ctx, { U, V, t }) {
  const cx = U / 2, cy = V / 2
  const R = Math.min(U * 0.34, V * 0.46)
  const a = t * 1.15
  const ca = Math.cos(a), sa = Math.sin(a)
  const project = ([x, y], z) => {
    const X = x * ca + z * sa, Z = -x * sa + z * ca
    const k = 1 / (1 - Z * 0.35)
    return [cx + X * R * k * 1.0, cy + y * R * k, Z]
  }
  const shade = (z) => {
    const [r, g, b] = sampleGradient('blue', Math.max(0, Math.min(1, 0.5 + z * 0.6)))
    return `rgb(${r},${g},${b})`
  }
  const loop = (pts, z, width) => {
    const p = pts.map((v) => project(v, z))
    ctx.lineWidth = width
    for (let i = 0; i < p.length; i++) {
      const [x0, y0, z0] = p[i], [x1, y1, z1] = p[(i + 1) % p.length]
      ctx.strokeStyle = shade((z0 + z1) / 2)
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke()
    }
    return p
  }
  // translucent faces first so the slab looks solid, then edges back to front
  const face = (pts, z, alpha) => {
    const p = pts.map((v) => project(v, z))
    ctx.fillStyle = `rgba(56,189,248,${alpha})`
    ctx.beginPath(); p.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill()
  }
  const front = Math.cos(a) >= 0
  face(OUTER, front ? -DEPTH : DEPTH, 0.16)
  loop(OUTER, front ? -DEPTH : DEPTH, 0.9)
  loop(INNER, front ? -DEPTH : DEPTH, 0.8)
  OUTER.forEach((v) => { // struts between front and back
    const [x0, y0, z0] = project(v, -DEPTH), [x1, y1, z1] = project(v, DEPTH)
    ctx.strokeStyle = shade((z0 + z1) / 2); ctx.lineWidth = 0.8
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke()
  })
  face(OUTER, front ? DEPTH : -DEPTH, 0.26)
  loop(OUTER, front ? DEPTH : -DEPTH, 1.2)
  loop(INNER, front ? DEPTH : -DEPTH, 1.0)
}

export default function SpinLogo({ cols = 34, rows = 15, fontPx = 7, style }) {
  return <AsciiCanvas painter={logoSpin} cols={cols} rows={rows} fontPx={fontPx} fps={14} gamma={0.6} label="Travauxus logo, turning" style={style} />
}
