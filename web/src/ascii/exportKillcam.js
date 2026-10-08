import { rasterize, cellMetrics, GRID_FONT, SCENE_RAMP } from './raster'
import { KILLCAMS, KILLCAM_LABELS, KILLCAM_EDGE, killcamFor, PERIOD } from './killcams'

/**
 * Records a killcam to an MP4 the user can post.
 *
 * The scene is re-rendered to an offscreen canvas rather than captured from the
 * DOM, so the clip is branded, sized for a story, and independent of whatever
 * the page happens to be showing.
 *
 * MP4 only, by design. MediaRecorder will happily hand back WebM, which most
 * phones refuse to accept into a story, so an unsupported browser is told
 * plainly instead of being given a file that will not post.
 */

const SCENE_CODES = Array.from(SCENE_RAMP, (c) => c.charCodeAt(0))

// Ordered by preference: constrained baseline H.264 is the most widely playable.
const MP4_TYPES = [
  'video/mp4;codecs=avc1.42E01E',
  'video/mp4;codecs=avc1.4D401E',
  'video/mp4;codecs=avc1',
  'video/mp4',
]

export function mp4MimeType() {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return null
  return MP4_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? null
}

export const canExportMp4 = () =>
  typeof document !== 'undefined' &&
  typeof HTMLCanvasElement !== 'undefined' &&
  typeof HTMLCanvasElement.prototype.captureStream === 'function' &&
  mp4MimeType() !== null

const money = (n) => `${n < 0 ? '-' : '+'}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`

/** The brand mark, drawn at a given size. This is why the clip is worth sharing for us. */
function drawLogo(g, x, y, size, color = '#f0ebe0') {
  const h = size / 2
  g.strokeStyle = color
  g.lineWidth = Math.max(2, size * 0.09)
  g.lineJoin = 'miter'
  g.beginPath(); g.moveTo(x, y - h); g.lineTo(x + h, y); g.lineTo(x, y + h); g.lineTo(x - h, y); g.closePath(); g.stroke()
  const i = h * 0.52
  g.beginPath(); g.moveTo(x, y - i); g.lineTo(x + i, y); g.lineTo(x, y + i); g.lineTo(x - i, y); g.closePath(); g.stroke()
}

/**
 * Builds a frame painter bound to one scene and layout. Metrics and the glyph
 * grid are computed once, not per frame.
 */
function makeFrameRenderer({ ctx, W, H, key, scene, title, subtitle, handle }) {
  const sceneTop = Math.round(H * 0.20)
  const sceneH = Math.round(H * 0.44)
  const cols = 82
  // Pick the font size that makes `cols` cells span the frame, then derive rows.
  const unit = cellMetrics(10).w / 10
  const px = (W / cols) / unit
  const m = cellMetrics(px)
  const rows = Math.max(8, Math.floor(sceneH / m.h))
  const edge = KILLCAM_EDGE[key] ?? 3
  const font = (w, s) => `${w} ${s}px -apple-system, "Inter", "Helvetica Neue", Arial, sans-serif`

  return (t) => {
    ctx.fillStyle = '#07070a'
    ctx.fillRect(0, 0, W, H)

    // ── scene ──
    const img = rasterize(scene, cols, rows, { t, aspect: m.aspect, mode: 'tone', gamma: 0.7, edge })
    ctx.font = `700 ${px}px ${GRID_FONT}`
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = 'left'
    let last = ''
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c
        const idx = img.code[i]
        if (!idx) continue
        // Setting fillStyle is the expensive part; only touch it when it changes.
        const col = `rgb(${img.r[i]},${img.g[i]},${img.b[i]})`
        if (col !== last) { ctx.fillStyle = col; last = col }
        ctx.fillText(String.fromCharCode(SCENE_CODES[idx]), c * m.w, sceneTop + r * m.h + m.h * 0.82)
      }
    }

    // fade the scene into the ground at both edges so it sits in the frame
    const fade = Math.round(sceneH * 0.18)
    for (const [y0, y1] of [[sceneTop, sceneTop + fade], [sceneTop + sceneH - fade, sceneTop + sceneH]]) {
      const grad = ctx.createLinearGradient(0, y0, 0, y1)
      const up = y0 === sceneTop
      grad.addColorStop(0, up ? '#07070a' : 'rgba(7,7,10,0)')
      grad.addColorStop(1, up ? 'rgba(7,7,10,0)' : '#07070a')
      ctx.fillStyle = grad
      ctx.fillRect(0, y0, W, y1 - y0)
    }

    // ── branding ──
    const pad = Math.round(W * 0.075)
    drawLogo(ctx, pad + W * 0.032, H * 0.085, W * 0.064)
    ctx.fillStyle = '#f0ebe0'
    ctx.font = font(700, W * 0.046)
    ctx.textAlign = 'left'
    ctx.fillText('TRAVAUXUS', pad + W * 0.085, H * 0.085 + W * 0.017)

    // scene name + REC, matching the in-app chrome
    ctx.font = font(700, W * 0.026)
    ctx.fillStyle = 'rgba(255,255,255,0.78)'
    ctx.fillText(KILLCAM_LABELS[key], pad, sceneTop + sceneH + W * 0.055)
    ctx.textAlign = 'right'
    ctx.fillStyle = '#ff5a6a'
    ctx.fillText('● REC', W - pad, sceneTop - W * 0.03)

    // ── the trade ──
    ctx.textAlign = 'left'
    ctx.fillStyle = '#fff'
    ctx.font = font(800, W * 0.125)
    ctx.fillText(title, pad, H * 0.775)
    ctx.fillStyle = '#34d399'
    ctx.font = font(800, W * 0.105)
    ctx.fillText(subtitle, pad, H * 0.855)
    if (handle) {
      ctx.fillStyle = 'rgba(255,255,255,0.62)'
      ctx.font = font(500, W * 0.038)
      ctx.fillText(handle, pad, H * 0.905)
    }
    ctx.fillStyle = 'rgba(255,255,255,0.42)'
    ctx.font = font(500, W * 0.03)
    ctx.fillText('Paper trading · travauxus.com', pad, H * 0.955)
  }
}

/**
 * @returns {Promise<Blob>} an MP4 of one full loop of the scene.
 * @throws if the browser cannot produce MP4.
 */
export function recordKillcamMp4({
  anim, seed, ticker, pnl, handle,
  width = 720, height = 1280,
  // The scenes loop on PERIOD, so exactly one period gives a seamless clip and
  // the smallest file that still shows the whole animation.
  seconds = PERIOD,
  // The art is drawn on a coarse grid; more than its own frame rate adds bytes,
  // not motion.
  fps = 12,
  onProgress,
} = {}) {
  const mimeType = mp4MimeType()
  if (!canExportMp4()) {
    return Promise.reject(new Error('This browser cannot record MP4. Try Safari, or Chrome on a recent desktop.'))
  }

  const key = killcamFor(anim ?? seed)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { alpha: false })

  const drawFrame = makeFrameRenderer({
    ctx, W: width, H: height, key, scene: KILLCAMS[key],
    title: `$${String(ticker ?? '').toUpperCase()}`,
    subtitle: Number.isFinite(pnl) ? money(pnl) : '',
    handle,
  })

  return new Promise((resolve, reject) => {
    let stream
    try {
      drawFrame(0)                       // paint before capturing, or frame 1 is blank
      stream = canvas.captureStream(fps)
    } catch (err) {
      reject(err); return
    }

    const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_600_000 })
    const chunks = []
    rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data) }
    rec.onerror = (e) => { cleanup(); reject(e.error ?? new Error('Recording failed')) }
    rec.onstop = () => {
      cleanup()
      const blob = new Blob(chunks, { type: mimeType.split(';')[0] })
      blob.size ? resolve(blob) : reject(new Error('Recording produced no data'))
    }

    const total = Math.round(seconds * fps)
    let frame = 0
    let timer = 0
    const step = () => {
      frame += 1
      drawFrame(frame / fps)
      onProgress?.(Math.min(1, frame / total))
      if (frame >= total) { rec.stop(); return }
      timer = setTimeout(step, 1000 / fps)
    }
    function cleanup() {
      clearTimeout(timer)
      stream.getTracks().forEach((t) => t.stop())
    }

    rec.start()
    // Capture has to run in real time: MediaRecorder stamps frames by wall clock,
    // so pushing them faster would just produce a shorter, sped-up clip.
    timer = setTimeout(step, 1000 / fps)
  })
}

export const killcamFileName = (ticker) =>
  `travauxus-${String(ticker ?? 'win').toUpperCase()}-killcam.mp4`
