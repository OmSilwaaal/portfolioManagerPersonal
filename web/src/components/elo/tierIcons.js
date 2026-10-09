// Small ASCII icons for the Elo ladder: one 24x24 drawing per tier, rasterised by the
// house AsciiCanvas. Each gets about 25x13 characters, so a shape has to be one clear
// silhouette — anything finer than that turns to noise.

const BOX = 24

/** Scale a 24x24 drawing into the painter's cell-unit box and centre it. */
function boxed(draw, color) {
  return (ctx, { U, V }) => {
    const s = (Math.min(U, V) * 0.92) / BOX
    ctx.translate((U - BOX * s) / 2, (V - BOX * s) / 2)
    ctx.scale(s, s)
    ctx.lineWidth = 1.8
    ctx.strokeStyle = color
    draw(ctx)
  }
}

const stroke = (ctx, d, w) => { ctx.lineWidth = w || 1.8; ctx.stroke(new Path2D(d)) }

/*
 * Outlines, not solids. A filled shape rasterises to a uniform block of '@' and loses its
 * silhouette; a stroke lands as a bright line a cell or two wide and still reads at the
 * ~25x13 characters an icon gets. Same reason the app's other ASCII icons are outlines.
 */
const DRAW = {
  // a fall that hits the floor
  rekt: (ctx) => {
    stroke(ctx, 'M12 2 V14.5', 2)
    stroke(ctx, 'M5 8.5 L12 16.5 L19 8.5', 2)
    stroke(ctx, 'M2.5 21 H21.5', 2)
  },
  // flag planted on day one
  rookie: (ctx) => { stroke(ctx, 'M6 22.5 V1.5', 2); stroke(ctx, 'M6.5 2.5 L19 6.75 L6.5 11 Z') },
  // two candles, wick through body
  trader: (ctx) => {
    stroke(ctx, 'M7.5 1.5 V21.5'); stroke(ctx, 'M3.8 6.5 H11.2 V16 H3.8 Z')
    stroke(ctx, 'M16.5 3 V23'); stroke(ctx, 'M12.8 10 H20.2 V19.5 H12.8 Z')
  },
  // dorsal fin breaking the surface
  shark: (ctx) => {
    stroke(ctx, 'M12.5 1.5 C14 8 18 13 22.5 16.5 H3 C7.5 13.5 11 8 12.5 1.5 Z')
    stroke(ctx, 'M1.5 21 H22.5', 2)
  },
  // long body, forked fluke, a blow going up
  whale: (ctx) => {
    stroke(ctx, 'M2 13.5 C4 8 10 6.5 14 9 C16.5 10.5 18 12.5 18.5 14 C15 19.5 5.5 19.5 2 13.5 Z')
    stroke(ctx, 'M17.5 14.5 L23 8 L22 20.5 Z')
    stroke(ctx, 'M9.5 7 C8.5 3.5 11 2.5 12 0.8')
    stroke(ctx, 'M5.5 13 H5.6', 2.6)
  },
  // a dome over three arms
  kraken: (ctx) => {
    stroke(ctx, 'M4.5 12 C4.5 4 19.5 4 19.5 12')
    stroke(ctx, 'M4.5 12 H19.5')
    stroke(ctx, 'M7 12.5 C4.5 16 8 18 5 22.5')
    stroke(ctx, 'M12 12.5 C12 16.5 14 18.5 12 23')
    stroke(ctx, 'M17 12.5 C19.5 16 16 18 19 22.5')
  },
  // a massif with a capped peak
  titan: (ctx) => {
    stroke(ctx, 'M1.5 21 L9 3.5 L13.5 12 L17 6 L22.5 21 Z')
    stroke(ctx, 'M6 10.5 L9 3.5 L12.2 10.5')
  },
  // the crown at the end of the ladder
  legend: (ctx) => {
    stroke(ctx, 'M2.5 18 L4.5 4.5 L9 11.5 L12 2.5 L15 11.5 L19.5 4.5 L21.5 18 Z')
    stroke(ctx, 'M3 21.5 H21', 2)
  },
}

const cache = new Map()

/** Painter for a tier's icon, drawn in `color`. Memoised: the painter identity is AsciiCanvas's redraw key. */
export function tierIconPainter(id, color) {
  const key = `${id}|${color}`
  let p = cache.get(key)
  if (!p) {
    p = boxed(DRAW[id] || DRAW.rookie, color)
    cache.set(key, p)
  }
  return p
}

const srgb = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
const luminance = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b)
const PAPER_COOL_LIGHT = [11, 11, 10]
// --ink-800 on paper is #e8e7e1 (luminance 0.806); 0.140 is the darkest a colour can be
// and still clear 4.5:1 against it.
const MAX_LUM_ON_PAPER = 0.14

const inkCache = new Map()

/**
 * The tier colours in utils/elo.js were picked for the ink theme, where every one of them
 * clears 5.6:1. On paper the bright ones (Legend's yellow is 1.3:1) vanish, so they are
 * walked toward the paper theme's darkest token until they are readable. Same hue, same tier.
 */
export function tierInk(hex, isDark) {
  if (isDark) return hex
  let out = inkCache.get(hex)
  if (out) return out
  const n = parseInt(hex.slice(1), 16)
  const base = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  let mixed = base
  for (let t = 0; t <= 1.0001 && luminance(mixed) > MAX_LUM_ON_PAPER; t += 0.02) {
    mixed = base.map((v, i) => Math.round(v * (1 - t) + PAPER_COOL_LIGHT[i] * t))
  }
  out = `#${mixed.map((v) => v.toString(16).padStart(2, '0')).join('')}`
  inkCache.set(hex, out)
  return out
}
