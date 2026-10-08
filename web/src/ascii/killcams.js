/* Brightness drives character density, so every scene keeps a dark ground and bright subjects.
   Killcams: short looping ASCII action scenes shown with every winning trade, in the spirit of old arcade
   shooters. Each painter draws a full-colour frame at time `t` (seconds); the rasteriser turns it into characters.
   Everything loops on PERIOD seconds and is a pure function of t, so scenes are repeatable and testable. */

export const PERIOD = 6
const TAU = Math.PI * 2
const rgba = (r, g, b, a = 1) => `rgba(${r},${g},${b},${a})`
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v)
const ease = (x) => { const t = clamp(x); return t * t * (3 - 2 * t) }
const easeOut = (x) => 1 - Math.pow(1 - clamp(x), 3)
const seg = (u, a, b) => clamp((u - a) / (b - a))
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s) }

function sky(ctx, U, V, stops) {
  const g = ctx.createLinearGradient(0, 0, 0, V)
  stops.forEach(([p, c]) => g.addColorStop(p, c))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, U, V)
}
function glow(ctx, x, y, r, [R, G, B], a = 1) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, rgba(R, G, B, a))
  g.addColorStop(0.4, rgba(R, G, B, a * 0.45))
  g.addColorStop(1, rgba(R, G, B, 0))
  ctx.fillStyle = g
  ctx.fillRect(x - r, y - r, r * 2, r * 2)
}
function disc(ctx, x, y, r, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill() }
function line(ctx, x0, y0, x1, y1, w, color) {
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke()
}
function ground(ctx, U, V, y, top, bottom) {
  const g = ctx.createLinearGradient(0, y, 0, V)
  g.addColorStop(0, top); g.addColorStop(1, bottom)
  ctx.fillStyle = g; ctx.fillRect(0, y, U, V - y)
}

/* ── 1. REAPER: a skeleton swordsman cuts a soldier in half ───────────────── */
function soldier(ctx, hx, hy, s, pose) {
  // hx,hy = feet position, s = height in units. Drawn upright; caller clips/rotates halves.
  const armor = '#38bdf8', trim = '#e0f2fe', skin = '#fde68a', boots = '#7dd3fc'
  ctx.save(); ctx.translate(hx, hy); ctx.scale(s / 20, s / 20)
  line(ctx, -2, -8, -2.8, 0, 1.7, boots); line(ctx, 2, -8, 2.8 + pose * 0.6, 0, 1.7, boots) // legs
  ctx.fillStyle = armor; ctx.fillRect(-3.2, -15, 6.4, 7.2) // torso
  ctx.fillStyle = trim; ctx.fillRect(-3.2, -15, 6.4, 1.4); ctx.fillRect(-0.6, -15, 1.2, 7.2)
  line(ctx, -3.6, -14.2, -6.2, -8.8 + pose, 1.4, armor); line(ctx, 3.6, -14.2, 6.2, -8.8 - pose, 1.4, armor) // arms
  disc(ctx, 0, -18, 2.5, skin)
  ctx.fillStyle = '#38bdf8'; ctx.beginPath(); ctx.arc(0, -18.4, 2.8, Math.PI, TAU); ctx.fill() // helmet
  ctx.restore()
}

function skeleton(ctx, x, y, s, swing, t) {
  const bone = '#ffffff', shade = '#e5e1d4', cape = '#c026d3', capeEdge = '#fb7185'
  ctx.save(); ctx.translate(x, y); ctx.scale(s / 20, s / 20)
  // cape streaming behind
  const flap = Math.sin(t * 5) * 1.2
  ctx.fillStyle = cape
  ctx.beginPath(); ctx.moveTo(-1, -16); ctx.lineTo(-6 - flap * 0.6, -9); ctx.lineTo(-7 - flap, -1); ctx.lineTo(-3, -3); ctx.closePath(); ctx.fill()
  ctx.strokeStyle = capeEdge; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(-6 - flap * 0.6, -9); ctx.lineTo(-7 - flap, -1); ctx.stroke()
  // legs, pelvis, spine, ribs
  line(ctx, -1.8, -8, -2.8, 0, 1.4, bone); line(ctx, 1.8, -8, 3.6, 0, 1.4, bone)
  ctx.fillStyle = bone; ctx.fillRect(-2.6, -9.4, 5.2, 1.8)
  line(ctx, 0, -9, 0, -15.6, 1.2, shade)
  for (let i = 0; i < 3; i++) {
    const yy = -10.8 - i * 1.9, w = 3.6 - i * 0.4
    line(ctx, -w, yy, w, yy, 1.0, bone)
  }
  // skull
  disc(ctx, 0.4, -18.4, 3, bone)
  ctx.fillStyle = '#000'; ctx.fillRect(-1.6, -19.4, 2, 2.2); ctx.fillRect(1.2, -19.4, 2, 2.2)
  ctx.fillRect(-0.4, -16.7, 1.6, 1.4)
  
  // sword arm (shoulder at 1,-15.5): angle from raised (-120deg) to follow-through (+40deg)
  const a = (-120 + 160 * swing) * Math.PI / 180
  const sx = 1, sy = -15.5
  const hx = sx + Math.cos(a) * 5.5, hy = sy + Math.sin(a) * 5.5
  line(ctx, sx, sy, hx, hy, 1.3, bone)
  const bx = hx + Math.cos(a) * 17, by = hy + Math.sin(a) * 17
  line(ctx, hx, hy, bx, by, 1.8, '#a5f3fc')
  line(ctx, hx, hy, bx, by, 0.9, '#ffffff')
  line(ctx, hx - Math.sin(a) * 1.6, hy + Math.cos(a) * 1.6, hx + Math.sin(a) * 1.6, hy - Math.cos(a) * 1.6, 0.9, '#f59e0b')
  ctx.restore()
  return { x: x + (bx * s) / 20, y: y + (by * s) / 20 }
}

export function reaper(ctx, { U, V, t }) {
  const u = (t % PERIOD) / PERIOD
  sky(ctx, U, V, [[0, '#040108'], [0.55, '#14051c'], [1, '#2a0a22']])
  glow(ctx, U * 0.8, V * 0.2, V * 0.5, [255, 170, 150], 0.22)
  disc(ctx, U * 0.78, V * 0.22, V * 0.13, '#ffe9e2')
  for (let i = 0; i < 40; i++) { ctx.fillStyle = rgba(255, 255, 255, 0.4 + 0.4 * Math.sin(t * 2 + i)); ctx.fillRect(hash(i) * U, hash(i + 40) * V * 0.45, 0.5, 0.5) }
  // dead trees + tombstones
  ctx.fillStyle = '#12031a'
  ;[0.06, 0.93].forEach((p, k) => { ctx.fillRect(U * p, V * 0.52, 1.1, V * 0.3); line(ctx, U * p, V * 0.58, U * p + (k ? -4 : 4), V * 0.45, 0.8, '#12031a'); line(ctx, U * p, V * 0.66, U * p + (k ? 4 : -4), V * 0.55, 0.8, '#12031a') })
  ground(ctx, U, V, V * 0.84, '#14061a', '#040106')
  for (let i = 0; i < 6; i++) { const gx = U * (0.1 + i * 0.16); ctx.fillStyle = '#3b1d4a'; ctx.fillRect(gx, V * 0.76, 2.4, 3.4); ctx.beginPath(); ctx.arc(gx + 1.2, V * 0.76, 1.2, Math.PI, TAU); ctx.fill() }
  // ground mist
  const mist = ctx.createLinearGradient(0, V * 0.72, 0, V * 0.9)
  mist.addColorStop(0, rgba(255, 120, 160, 0)); mist.addColorStop(1, rgba(255, 120, 160, 0.1))
  ctx.fillStyle = mist; ctx.fillRect(0, V * 0.72, U, V * 0.18)

  const floorY = V * 0.88, h = V * 0.56
  const swing = ease(seg(u, 0.22, 0.4))
  const cutAt = 0.4
  const hitP = seg(u, cutAt, 0.78)

  // the skeleton lunges forward as it swings
  const lunge = easeOut(seg(u, 0.12, 0.4)) * U * 0.1
  const tip = skeleton(ctx, U * 0.22 + lunge, floorY, h, swing, t)

  // slash trail
  if (u > 0.3 && u < 0.52) {
    const k = 1 - seg(u, 0.4, 0.52)
    ctx.save(); ctx.globalAlpha = k * clamp(seg(u, 0.3, 0.38))
    ctx.strokeStyle = '#67e8f9'; ctx.lineWidth = 3.4; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(U * 0.36, floorY - h * 0.98); ctx.quadraticCurveTo(U * 0.5, floorY - h * 0.05, U * 0.72, floorY - h * 0.62); ctx.stroke()
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.stroke()
    ctx.restore()
  }

  // the soldier, split along the slash line into two halves
  const vx = U * 0.62, vh = h * 0.95, midY = floorY - vh * 0.5
  const slope = -0.5
  const cutY = (x) => midY + (x - vx) * slope
  const drawHalf = (upper, dx, dy, rot) => {
    ctx.save()
    ctx.translate(dx, dy)
    ctx.translate(vx, midY); ctx.rotate(rot); ctx.translate(-vx, -midY)
    ctx.beginPath()
    ctx.moveTo(vx - 20, cutY(vx - 20)); ctx.lineTo(vx + 20, cutY(vx + 20))
    ctx.lineTo(vx + 20, upper ? -50 : V + 50); ctx.lineTo(vx - 20, upper ? -50 : V + 50); ctx.closePath(); ctx.clip()
    soldier(ctx, vx, floorY, vh, upper ? 0 : 0)
    ctx.restore()
  }
  const pre = u < cutAt
  if (pre) {
    soldier(ctx, vx + Math.sin(t * 3) * 0.2, floorY, vh, Math.sin(t * 4))
  } else {
    drawHalf(false, 0, easeOut(hitP) * 0.8, easeOut(hitP) * 0.06)
    drawHalf(true, easeOut(hitP) * U * 0.12, -easeOut(hitP) * V * 0.18 + hitP * hitP * V * 0.2, easeOut(hitP) * 0.9)
    // glowing cut edge fading
    const f = 1 - seg(u, cutAt, 0.6)
    if (f > 0) { ctx.save(); ctx.globalAlpha = f; line(ctx, vx - 7, cutY(vx - 7), vx + 7, cutY(vx + 7), 1.2, '#ffffff'); glow(ctx, vx, midY, 9, [255, 240, 200], f * 0.7); ctx.restore() }
    // blood
    for (let i = 0; i < 46; i++) {
      const ang = -Math.PI * (0.1 + 0.8 * hash(i)), sp = 6 + hash(i + 7) * 14, k = hitP * 1.4
      const bx = vx + Math.cos(ang) * sp * k * 2.2, by = midY + Math.sin(ang) * sp * k * 2.2 + 26 * k * k
      ctx.fillStyle = rgba(255, 40, 70, 1 - hitP * 0.6); ctx.fillRect(bx, by, 1.3, 1.6)
    }
  }
  // impact flash
  const fl = 1 - seg(u, cutAt, cutAt + 0.06)
  if (u >= cutAt && fl > 0) { ctx.fillStyle = rgba(255, 255, 255, fl * 0.3); ctx.fillRect(0, 0, U, V) }
  void tip
}

/* ── 2. GUNSHIP: a helicopter strafes a compound ──────────────────────────── */
function chopper(ctx, x, y, s, t, firing) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s / 10, s / 10)
  const body = '#cbd5e1', hi = '#ffffff'
  // tail boom + fin
  ctx.fillStyle = body; ctx.beginPath(); ctx.moveTo(4, -1); ctx.lineTo(19, -1.2); ctx.lineTo(19, 0.6); ctx.lineTo(4, 2); ctx.closePath(); ctx.fill()
  ctx.beginPath(); ctx.moveTo(17, -1); ctx.lineTo(20, -5); ctx.lineTo(21, -5); ctx.lineTo(19.5, 0.5); ctx.closePath(); ctx.fill()
  // cabin
  ctx.fillStyle = '#e2e8f0'; ctx.beginPath(); ctx.ellipse(0, 1, 6.5, 4, 0, 0, TAU); ctx.fill()
  const gl = ctx.createLinearGradient(-6, -3, -1, 3); gl.addColorStop(0, '#bae6fd'); gl.addColorStop(1, '#38bdf8')
  ctx.fillStyle = gl; ctx.beginPath(); ctx.ellipse(-2.4, 0.4, 3.3, 2.4, -0.1, 0, TAU); ctx.fill()
  line(ctx, -5, 1.2, 4, 1.2, 0.5, hi)
  // skids
  line(ctx, -5, 6, 4.5, 6, 1.1, '#e2e8f0'); line(ctx, -2.5, 4.4, -3.5, 6, 0.9, '#e2e8f0'); line(ctx, 2, 4.6, 2.8, 6, 0.9, '#e2e8f0')
  // rotor mast + blades (blurred disc + two bright blades)
  line(ctx, 0, -3, 0, -5, 0.9, hi)
  ctx.fillStyle = rgba(220, 235, 255, 0.28); ctx.beginPath(); ctx.ellipse(0, -5.2, 15, 1.1, 0, 0, TAU); ctx.fill()
  const ph = t * 22
  line(ctx, -15 * Math.cos(ph), -5.2 + Math.sin(ph) * 0.7, 15 * Math.cos(ph), -5.2 - Math.sin(ph) * 0.7, 0.7, '#e2e8f0')
  line(ctx, -15 * Math.sin(ph * 1.3), -5.2, 15 * Math.sin(ph * 1.3), -5.2, 0.5, rgba(226, 232, 240, 0.7))
  // tail rotor
  disc(ctx, 20.5, -3, 1.6 + Math.abs(Math.sin(t * 40)) * 0.6, rgba(226, 232, 240, 0.5))
  // chin gun + muzzle flash
  line(ctx, -6, 4, -9.5, 5, 1.2, '#f1f5f9')
  if (firing) glow(ctx, -10, 5.2, 4.5, [255, 220, 120], 0.95)
  ctx.restore()
}

export function gunship(ctx, { U, V, t }) {
  const u = (t % PERIOD) / PERIOD
  sky(ctx, U, V, [[0, '#02030a'], [0.5, '#0a0a22'], [0.8, '#2a0f24'], [1, '#3a1420']])
  glow(ctx, U * 0.86, V * 0.72, V * 0.55, [255, 170, 90], 0.4)
  disc(ctx, U * 0.86, V * 0.72, V * 0.09, '#ffe7a8')
  // far hills + near hills
  ctx.fillStyle = '#12081a'; ctx.beginPath(); ctx.moveTo(0, V)
  for (let x = 0; x <= U; x += 1) ctx.lineTo(x, V * 0.7 + Math.sin(x * 0.11) * 2 + Math.sin(x * 0.05) * 3)
  ctx.lineTo(U, V); ctx.fill()
  ground(ctx, U, V, V * 0.84, '#0c0612', '#030106')

  // target compound (right): bunker, tower, truck, fuel tank
  const tx = U * 0.66, gy = V * 0.84
  const destroyed = u > 0.62
  ctx.fillStyle = destroyed ? '#3a1a22' : '#9ca3af'
  ctx.fillRect(tx, gy - 5, 10, 5); ctx.fillRect(tx + 12, gy - 11, 3, 11); ctx.fillRect(tx + 11, gy - 13, 5, 2)
  ctx.fillStyle = destroyed ? '#2a141a' : '#cbd5e1'; ctx.fillRect(tx - 9, gy - 3.4, 7, 3.4); ctx.fillRect(tx - 6, gy - 5.2, 4, 2)
  disc(ctx, tx - 8, gy, 1, '#0b0b0b'); disc(ctx, tx - 3, gy, 1, '#0b0b0b')
  ctx.fillStyle = destroyed ? '#3a1a22' : '#d1d5db'; ctx.beginPath(); ctx.ellipse(tx + 22, gy - 3, 3.4, 3, 0, 0, TAU); ctx.fill(); ctx.fillRect(tx + 18.6, gy - 3, 6.8, 3)

  // helicopter slides in, hovers, drifts out
  const hx = U * 0.16 + easeOut(seg(u, 0, 0.18)) * U * 0.14 + Math.sin(t * 1.4) * 0.8 - ease(seg(u, 0.88, 1)) * U * 0.5
  const hy = V * 0.28 + Math.sin(t * 2.1) * 0.9
  const firing = u > 0.2 && u < 0.62
  chopper(ctx, hx, hy, V * 0.13, t, firing && Math.floor(t * 18) % 2 === 0)

  // tracers: bright dashes travelling from the gun to the compound
  if (firing) {
    const gx = hx - V * 0.13 * 0.95, gyy = hy + V * 0.13 * 0.5
    for (let i = 0; i < 6; i++) {
      const k = (t * 3.2 + i / 6) % 1
      const px = gx + (tx + 6 - gx) * k, py = gyy + (gy - 4 - gyy) * k
      const px2 = gx + (tx + 6 - gx) * (k - 0.035), py2 = gyy + (gy - 4 - gyy) * (k - 0.035)
      line(ctx, px2, py2, px, py, 0.55, '#fef9c3')
    }
    for (let i = 0; i < 3; i++) glow(ctx, tx + hash(i + Math.floor(t * 9)) * 22, gy - hash(i + 9) * 4, 2.2, [255, 200, 90], 0.95) // impacts
  }
  // explosion
  if (u > 0.58) {
    const k = seg(u, 0.58, 0.95)
    const r = V * 0.5 * easeOut(k)
    glow(ctx, tx + 12, gy - 4 - r * 0.15, r * 1.8, [255, 120, 30], (1 - k * 0.7))
    glow(ctx, tx + 12, gy - 4, r, [255, 240, 150], (1 - k) * 0.95)
    for (let i = 0; i < 36; i++) {
      const ang = -Math.PI * hash(i), sp = 8 + hash(i + 5) * 16
      ctx.fillStyle = rgba(255, 200 - hash(i) * 120, 60, 1 - k)
      ctx.fillRect(tx + 12 + Math.cos(ang) * sp * k * 2, gy - 4 + Math.sin(ang) * sp * k * 2 + 20 * k * k, 0.9, 0.9)
    }
    // smoke column
    for (let i = 0; i < 8; i++) { const sy = gy - 4 - k * V * 0.5 * (i / 8); disc(ctx, tx + 12 + Math.sin(i * 2 + t) * 1.4, sy, 2 + i * 0.5, rgba(150, 140, 160, 0.4 * (1 - k * 0.6))) }
  }
}

/* ── 3. NUKE: tactical nuke over a city skyline ───────────────────────────── */
export function nuke(ctx, { U, V, t }) {
  const u = (t % PERIOD) / PERIOD
  const flash = u < 0.2 ? 0.45 * seg(u, 0.1, 0.16) * (1 - seg(u, 0.16, 0.24)) : 0
  const blast = seg(u, 0.14, 0.9)
  sky(ctx, U, V, [[0, '#02030a'], [0.6, lerpHex('#0a0a24', '#2a0e08', blast)], [1, lerpHex('#1a1030', '#4a1a08', blast)]])
  for (let i = 0; i < 40; i++) { ctx.fillStyle = rgba(255, 255, 255, (0.4 + 0.4 * Math.sin(t * 2 + i)) * (1 - blast)); ctx.fillRect(hash(i) * U, hash(i + 40) * V * 0.5, 0.5, 0.5) }
  const gy = V * 0.86, cx = U * 0.5

  // skyline silhouettes (fade to rubble as the wave passes)
  let x = -2
  for (let i = 0; i < 30 && x < U; i++) {
    const w = 3 + hash(i + 3) * 5, hgt = V * (0.12 + hash(i + 11) * 0.34)
    const dist = Math.abs(x + w / 2 - cx) / (U * 0.5)
    const wave = clamp((blast * 1.6 - dist) * 2)
    const h2 = hgt * (1 - wave * 0.75)
    ctx.fillStyle = rgba(46, 38, 78, 1); ctx.fillRect(x, gy - h2, w, h2)
    if (wave < 0.3) for (let k = 0; k < 6; k++) { ctx.fillStyle = rgba(255, 220, 120, 0.7); ctx.fillRect(x + 0.6 + (k % 2) * 1.8, gy - h2 + 1.2 + Math.floor(k / 2) * 2.4, 0.8, 1) }
    x += w + 0.3
  }
  ground(ctx, U, V, gy, '#1a1024', '#040206')

  if (u > 0.12) {
    // fireball + stem + cap
    const k = seg(u, 0.12, 0.85)
    const stemH = V * 0.62 * easeOut(k), stemW = 2 + k * 3
    const g = ctx.createLinearGradient(0, gy, 0, gy - stemH)
    g.addColorStop(0, '#ffd27a'); g.addColorStop(0.6, '#ff8a3a'); g.addColorStop(1, '#d9531a')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.moveTo(cx - stemW * 1.8, gy); ctx.lineTo(cx - stemW, gy - stemH); ctx.lineTo(cx + stemW, gy - stemH); ctx.lineTo(cx + stemW * 1.8, gy); ctx.closePath(); ctx.fill()
    const capR = V * 0.26 * easeOut(seg(u, 0.18, 0.85)), capY = gy - stemH
    const cg = ctx.createRadialGradient(cx, capY, 0, cx, capY, capR * 1.4)
    cg.addColorStop(0, '#fff4c0'); cg.addColorStop(0.35, '#ffb02a'); cg.addColorStop(0.75, '#d9421a'); cg.addColorStop(1, rgba(90, 20, 10, 0))
    ctx.fillStyle = cg
    for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.ellipse(cx + (i - 3) * capR * 0.42 + Math.sin(t * 2 + i) * 0.6, capY + Math.cos(i) * capR * 0.18, capR * 0.55, capR * 0.42, 0, 0, TAU); ctx.fill() }
    glow(ctx, cx, gy, V * 0.6 * easeOut(k), [255, 160, 60], 0.4 * (1 - k * 0.4))
    // shockwave ring along the ground
    const ring = easeOut(seg(u, 0.14, 0.7)) * U * 0.62
    ctx.strokeStyle = rgba(255, 240, 210, 0.8 * (1 - seg(u, 0.14, 0.7))); ctx.lineWidth = 1.1
    ctx.beginPath(); ctx.ellipse(cx, gy + 1, ring, ring * 0.12, 0, 0, TAU); ctx.stroke()
  }
  if (flash > 0) { ctx.fillStyle = rgba(255, 255, 255, flash); ctx.fillRect(0, 0, U, V) }
}
function lerpHex(a, b, t) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const A = p(a), B = p(b)
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`
}

/* ── 4. SNIPER: scope picture, headshot, slow-motion bullet ───────────────── */
export function sniper(ctx, { U, V, t }) {
  const u = (t % PERIOD) / PERIOD
  const cx = U * 0.5, cy = V * 0.5, R = V * 0.46
  ctx.fillStyle = '#020203'; ctx.fillRect(0, 0, U, V)
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.clip()
  // scene inside the scope (sways a little, kicks on the shot)
  const sway = Math.sin(t * 1.3) * 0.8, kick = u > 0.52 ? Math.exp(-(u - 0.52) * 18) * -3 : 0
  ctx.translate(sway, kick)
  sky(ctx, U, V, [[0, '#08121f'], [0.55, '#2a2018'], [0.56, '#0e1f14'], [1, '#07100a']])
  glow(ctx, U * 0.22, V * 0.42, V * 0.45, [255, 220, 150], 0.4)
  // distant treeline
  ctx.fillStyle = '#245a38'; for (let x = 0; x < U; x += 2.2) { const h = 3 + hash(x) * 4; ctx.beginPath(); ctx.moveTo(x, V * 0.56); ctx.lineTo(x + 1.1, V * 0.56 - h); ctx.lineTo(x + 2.2, V * 0.56); ctx.fill() }
  // target walking across
  const tx = U * 0.28 + seg(u, 0, 0.52) * U * 0.24 + (u > 0.52 ? seg(u, 0.52, 0.8) * 3 : 0)
  const feet = V * 0.8, th = V * 0.3
  const stride = Math.sin(t * 6) * 1.4 * (u < 0.52 ? 1 : 0)
  const fallen = easeOut(seg(u, 0.54, 0.8))
  ctx.save(); ctx.translate(tx, feet); ctx.rotate(-fallen * 1.45); ctx.translate(-tx, -feet)
  line(ctx, tx - 0.8, feet - th * 0.4, tx - 0.8 - stride, feet, 1.3, '#e4e4e7'); line(ctx, tx + 0.8, feet - th * 0.4, tx + 0.8 + stride, feet, 1.3, '#e4e4e7')
  ctx.fillStyle = '#fde047'; ctx.fillRect(tx - 1.8, feet - th * 0.82, 3.6, th * 0.44)
  line(ctx, tx - 1.8, feet - th * 0.78, tx - 2.8, feet - th * 0.5, 1.1, '#fde047'); line(ctx, tx + 1.8, feet - th * 0.78, tx + 2.8, feet - th * 0.5, 1.1, '#fde047')
  if (u < 0.52) { disc(ctx, tx, feet - th * 0.92, 1.4, '#fff1d6'); ctx.fillStyle = '#7dd3fc'; ctx.beginPath(); ctx.arc(tx, feet - th * 0.95, 1.6, Math.PI, TAU); ctx.fill() }
  ctx.restore()
  // headshot burst
  if (u >= 0.52 && u < 0.82) {
    const k = seg(u, 0.52, 0.82), hx = tx, hy = feet - th * 0.92
    glow(ctx, hx, hy, 7 * (1 - k * 0.5), [255, 60, 60], 1 - k)
    for (let i = 0; i < 26; i++) { const a = TAU * hash(i), sp = 3 + hash(i + 3) * 9; ctx.fillStyle = rgba(230, 20, 40, 1 - k); ctx.fillRect(hx + Math.cos(a) * sp * k * 2, hy + Math.sin(a) * sp * k * 2 + 7 * k * k, 0.9, 0.9) }
  }
  ctx.restore()
  // bullet streak (slow motion) across the scope
  if (u >= 0.5 && u < 0.62) {
    const k = seg(u, 0.5, 0.58)
    line(ctx, cx - R * 0.95 + k * R * 0.9, cy + R * 0.05, cx - R * 0.95 + k * R * 0.9 + R * 0.3, cy + R * 0.05, 0.6, '#fff7c2')
  }
  // scope furniture: crosshair, mil dots, range ring, vignette
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 0.45
  ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke()
  for (let i = -4; i <= 4; i++) { if (i) { disc(ctx, cx + i * R * 0.18, cy, 0.4, '#fff'); disc(ctx, cx, cy + i * R * 0.18, 0.4, '#fff') } }
  ctx.strokeStyle = 'rgba(160,255,190,0.9)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke()
  if (u >= 0.5 && u < 0.56) { ctx.fillStyle = rgba(255, 255, 255, 0.28 * (1 - seg(u, 0.5, 0.56))); ctx.fillRect(0, 0, U, V) }
}

export const KILLCAMS = { reaper, gunship, nuke, sniper }
export const KILLCAM_LABELS = { reaper: 'REAPER', gunship: 'GUNSHIP', nuke: 'TACTICAL NUKE', sniper: 'HEADSHOT' }
export const killcamFor = (key) => {
  const names = Object.keys(KILLCAMS)
  if (KILLCAMS[key]) return key
  let h = 0
  for (const c of String(key ?? '')) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return names[h % names.length]
}
