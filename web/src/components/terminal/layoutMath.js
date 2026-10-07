/**
 * Geometry helpers for the freeform terminal workspace.
 *
 * Panel rects are stored as fractions of the canvas (0..1) so a layout a user
 * arranges on a 27" monitor still reads correctly on a laptop — and so a panel
 * can never end up off-screen. All interaction math happens in pixels, then
 * converts back to fractions on commit.
 */

export const SNAP_PX = 7

export const toPx = (rect, canvas) => ({
  x: rect.x * canvas.w,
  y: rect.y * canvas.h,
  w: rect.w * canvas.w,
  h: rect.h * canvas.h,
})

export const toFraction = (rect, canvas) => ({
  x: rect.x / canvas.w,
  y: rect.y / canvas.h,
  w: rect.w / canvas.w,
  h: rect.h / canvas.h,
})

/** Keep a pixel rect fully inside the canvas while honouring its minimum size. */
export function clampPx(rect, canvas, minW, minH) {
  const w = Math.min(Math.max(rect.w, Math.min(minW, canvas.w)), canvas.w)
  const h = Math.min(Math.max(rect.h, Math.min(minH, canvas.h)), canvas.h)
  return {
    w,
    h,
    x: Math.min(Math.max(rect.x, 0), Math.max(canvas.w - w, 0)),
    y: Math.min(Math.max(rect.y, 0), Math.max(canvas.h - h, 0)),
  }
}

/**
 * Alignment targets: canvas edges + centre, plus every other panel's edges and
 * centres. Figma snaps to exactly these. Takes an already-resolved pixel map.
 */
export function buildSnapTargets(pxLayout, excludeId, canvas) {
  const v = [0, canvas.w / 2, canvas.w]
  const h = [0, canvas.h / 2, canvas.h]
  for (const [id, p] of Object.entries(pxLayout)) {
    if (id === excludeId) continue
    v.push(p.x, p.x + p.w / 2, p.x + p.w)
    h.push(p.y, p.y + p.h / 2, p.y + p.h)
  }
  return { v, h }
}

/** Nearest target to `value` within SNAP_PX, or null. */
function nearest(value, targets) {
  let best = null
  let bestDelta = SNAP_PX + 1
  for (const t of targets) {
    const delta = Math.abs(t - value)
    if (delta < bestDelta) {
      bestDelta = delta
      best = t
    }
  }
  return best === null ? null : { pos: best, delta: best - value }
}

/**
 * Snap a *moving* rect: tries its left/centre/right (and top/middle/bottom)
 * against the targets and shifts the whole rect by the smallest winning nudge.
 * Returns the adjusted rect plus the guide lines to draw.
 */
export function snapMove(rect, targets) {
  const guides = []
  let { x, y } = rect

  const xEdges = [rect.x, rect.x + rect.w / 2, rect.x + rect.w]
  let bestX = null
  for (const edge of xEdges) {
    const hit = nearest(edge, targets.v)
    if (hit && (bestX === null || Math.abs(hit.delta) < Math.abs(bestX.delta))) bestX = hit
  }
  if (bestX) {
    x += bestX.delta
    guides.push({ axis: 'v', pos: bestX.pos })
  }

  const yEdges = [rect.y, rect.y + rect.h / 2, rect.y + rect.h]
  let bestY = null
  for (const edge of yEdges) {
    const hit = nearest(edge, targets.h)
    if (hit && (bestY === null || Math.abs(hit.delta) < Math.abs(bestY.delta))) bestY = hit
  }
  if (bestY) {
    y += bestY.delta
    guides.push({ axis: 'h', pos: bestY.pos })
  }

  return { rect: { ...rect, x, y }, guides }
}

/**
 * Apply a resize for a handle direction ('n', 'ne', 'e', …), snapping only the
 * edges the handle actually moves.
 */
export function applyResize(startPx, dir, dx, dy, targets, canvas, minW, minH) {
  let { x, y, w, h } = startPx
  const guides = []

  if (dir.includes('e')) {
    let right = startPx.x + startPx.w + dx
    const hit = nearest(right, targets.v)
    if (hit) {
      right = hit.pos
      guides.push({ axis: 'v', pos: hit.pos })
    }
    w = right - x
  }
  if (dir.includes('w')) {
    let left = startPx.x + dx
    const hit = nearest(left, targets.v)
    if (hit) {
      left = hit.pos
      guides.push({ axis: 'v', pos: hit.pos })
    }
    w = startPx.x + startPx.w - left
    x = left
  }
  if (dir.includes('s')) {
    let bottom = startPx.y + startPx.h + dy
    const hit = nearest(bottom, targets.h)
    if (hit) {
      bottom = hit.pos
      guides.push({ axis: 'h', pos: hit.pos })
    }
    h = bottom - y
  }
  if (dir.includes('n')) {
    let top = startPx.y + dy
    const hit = nearest(top, targets.h)
    if (hit) {
      top = hit.pos
      guides.push({ axis: 'h', pos: hit.pos })
    }
    h = startPx.y + startPx.h - top
    y = top
  }

  // Minimum size has to push the *anchored* edge back, not drift the panel.
  const mw = Math.min(minW, canvas.w)
  const mh = Math.min(minH, canvas.h)
  if (w < mw) {
    if (dir.includes('w')) x = startPx.x + startPx.w - mw
    w = mw
  }
  if (h < mh) {
    if (dir.includes('n')) y = startPx.y + startPx.h - mh
    h = mh
  }

  // Never let a drag past the canvas edge shrink the panel from the far side.
  if (x < 0) {
    if (dir.includes('w')) w += x
    x = 0
  }
  if (y < 0) {
    if (dir.includes('n')) h += y
    y = 0
  }
  if (x + w > canvas.w) w = canvas.w - x
  if (y + h > canvas.h) h = canvas.h - y

  return { rect: clampPx({ x, y, w, h }, canvas, minW, minH), guides }
}
