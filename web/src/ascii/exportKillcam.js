import { rasterize, cellMetrics, GRID_FONT, SCENE_RAMP } from './raster'
import { KILLCAMS, KILLCAM_LABELS, KILLCAM_EDGE, killcamFor, PERIOD } from './killcams'

/**
 * Records a killcam to an MP4 the user can post.
 *
 * The scene is re-rendered to an offscreen canvas rather than captured from the
 * DOM, so the clip is branded, sized for a story, and independent of whatever
 * the page happens to be showing.
 *
 * Two encoders, in order:
 *
 *  1. WebCodecs `VideoEncoder` + an MP4 muxer. This is the path that works on
 *     iOS. Safari has shipped the WebCodecs video interfaces since 16.4, and it
 *     avoids both of the pieces that are broken there: canvas.captureStream,
 *     which WebKit has long-standing bugs around, and MediaRecorder.stop, which
 *     has been reported to hang or never fire on iOS. It also encodes as fast
 *     as the CPU allows instead of in real time, because timestamps are set
 *     explicitly rather than taken from the wall clock.
 *  2. MediaRecorder, for desktop browsers without WebCodecs.
 *
 * MP4 either way: MediaRecorder will happily hand back WebM, which phones
 * generally refuse into a story, so a browser that can produce neither is told
 * plainly rather than given a file that will not post.
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

const hasWebCodecs = () =>
  typeof window !== 'undefined' &&
  typeof window.VideoEncoder === 'function' &&
  typeof window.VideoFrame === 'function'

const hasMediaRecorderPath = () =>
  typeof HTMLCanvasElement !== 'undefined' &&
  typeof HTMLCanvasElement.prototype.captureStream === 'function' &&
  mp4MimeType() !== null

export const canExportMp4 = () =>
  typeof document !== 'undefined' && (hasWebCodecs() || hasMediaRecorderPath())

/**
 * H.264 support varies sharply by profile AND level, and a level too low for the
 * frame size is reported as unsupported rather than silently downscaled — so ask
 * about the actual dimensions instead of trusting a codec string.
 * 720x1280 is 3600 macroblocks, which is exactly Level 3.1's ceiling, hence 4.0
 * first.
 */
const AVC_CANDIDATES = [
  'avc1.420028', // Baseline 4.0 — widest playback
  'avc1.4d0028', // Main 4.0
  'avc1.640028', // High 4.0
  'avc1.420032', // Baseline 5.0
  'avc1.4d0032', // Main 5.0
  'avc1.42001f', // Baseline 3.1
  'avc1.4d001f', // Main 3.1
]

async function pickAvcConfig(width, height, framerate, bitrate) {
  for (const codec of AVC_CANDIDATES) {
    // `avc` format gives the muxer length-prefixed samples rather than Annex-B.
    const config = { codec, width, height, framerate, bitrate, avc: { format: 'avc' } }
    try {
      const res = await window.VideoEncoder.isConfigSupported(config)
      if (res?.supported) return res.config ?? config
    } catch {
      /* some builds throw instead of reporting unsupported */
    }
  }
  return null
}

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

/** Encode with WebCodecs. Works on iOS, and runs faster than real time. */
async function encodeWithWebCodecs({ drawFrame, canvas, width, height, fps, totalFrames, bitrate, onProgress }) {
  const config = await pickAvcConfig(width, height, fps, bitrate)
  if (!config) throw new Error('UNSUPPORTED')

  // Only fetched when someone actually exports, so it costs nothing to load the app.
  const { Muxer, ArrayBufferTarget } = await import('mp4-muxer')
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width, height, frameRate: fps },
    fastStart: 'in-memory',   // metadata up front: phones expect it before they will play
  })

  let encodeError = null
  const encoder = new window.VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { encodeError = e },
  })
  encoder.configure(config)

  const usPerFrame = 1e6 / fps
  for (let i = 0; i < totalFrames; i++) {
    if (encodeError) break
    drawFrame(i / fps)
    const frame = new window.VideoFrame(canvas, { timestamp: Math.round(i * usPerFrame), duration: Math.round(usPerFrame) })
    // A keyframe every two seconds keeps seeking and thumbnailing sane.
    encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 })
    frame.close()
    onProgress?.((i + 1) / totalFrames)
    // Let the encoder drain and keep the main thread responsive.
    if (encoder.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 0))
  }

  if (encodeError) { try { encoder.close() } catch { /* already closed */ } throw encodeError }
  await encoder.flush()
  encoder.close()
  muxer.finalize()
  return new Blob([muxer.target.buffer], { type: 'video/mp4' })
}

/** Fallback for desktop browsers without WebCodecs. Runs in real time. */
function encodeWithMediaRecorder({ drawFrame, canvas, fps, totalFrames, bitrate, onProgress }) {
  const mimeType = mp4MimeType()
  return new Promise((resolve, reject) => {
    let stream
    try {
      drawFrame(0)                       // paint before capturing, or frame 1 is blank
      stream = canvas.captureStream(fps)
    } catch (err) { reject(err); return }

    const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitrate })
    const chunks = []
    const cleanup = () => { clearTimeout(timer); stream.getTracks().forEach((t) => t.stop()) }
    let timer = 0
    rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data) }
    rec.onerror = (e) => { cleanup(); reject(e.error ?? new Error('Recording failed')) }
    rec.onstop = () => {
      cleanup()
      const blob = new Blob(chunks, { type: mimeType.split(';')[0] })
      blob.size ? resolve(blob) : reject(new Error('Recording produced no data'))
    }

    let frame = 0
    const step = () => {
      frame += 1
      drawFrame(frame / fps)
      onProgress?.(Math.min(1, frame / totalFrames))
      if (frame >= totalFrames) { rec.stop(); return }
      timer = setTimeout(step, 1000 / fps)
    }
    rec.start()
    // Real time is required here: MediaRecorder stamps frames by wall clock, so
    // pushing them faster would just produce a shorter, sped-up clip.
    timer = setTimeout(step, 1000 / fps)
  })
}

/**
 * @returns {Promise<Blob>} an MP4 of one full loop of the scene.
 * @throws if the browser can produce neither WebCodecs nor MediaRecorder MP4.
 */
export async function recordKillcamMp4({
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
  if (!canExportMp4()) {
    throw new Error('This browser cannot make an MP4. Try Safari on iOS 16.4+, or an up-to-date Chrome.')
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

  const opts = { drawFrame, canvas, width, height, fps, totalFrames: Math.round(seconds * fps), // Sparse glyphs on a flat ground compress very well; 2.6 Mbps was spending
    // bytes on nothing. 1.3 halves the file with no visible loss.
    bitrate: 1_300_000, onProgress }

  if (hasWebCodecs()) {
    try {
      return await encodeWithWebCodecs(opts)
    } catch (err) {
      // No usable H.264 config, or the encoder failed: fall through if we can.
      if (!hasMediaRecorderPath()) {
        throw err?.message === 'UNSUPPORTED'
          ? new Error('This browser has no H.264 encoder for this size.')
          : err
      }
    }
  }
  return encodeWithMediaRecorder(opts)
}

export const killcamFileName = (ticker) =>
  `travauxus-${String(ticker ?? 'win').toUpperCase()}-killcam.mp4`
