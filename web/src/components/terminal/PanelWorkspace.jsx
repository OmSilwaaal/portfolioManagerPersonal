import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Lock, Unlock, RotateCcw, Layers } from 'lucide-react'
import {
  applyResize,
  buildSnapTargets,
  clampPx,
  snapMove,
  toFraction,
  toPx,
} from './layoutMath'

/**
 * Below this canvas size free dragging stops being usable, so panels fall back
 * to a stacked column. The height floor also guards against the first layout
 * pass, where the canvas is only as tall as its own borders.
 */
const FREEFORM_MIN_WIDTH = 768
const FREEFORM_MIN_HEIGHT = 240

const WorkspaceContext = createContext(null)

export const useWorkspace = () => {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('<Panel> must be rendered inside <PanelWorkspace>')
  return ctx
}

const defaultLayout = (panels) =>
  Object.fromEntries(panels.map((p, i) => [p.id, { ...p.defaultRect, z: i + 1 }]))

function loadLayout(storageKey, panels) {
  const base = defaultLayout(panels)
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return { layout: base, locked: false }
    const saved = JSON.parse(raw)
    const layout = { ...base }
    for (const p of panels) {
      const r = saved?.panels?.[p.id]
      const valid =
        r && ['x', 'y', 'w', 'h'].every((k) => Number.isFinite(r[k])) && r.w > 0 && r.h > 0
      if (valid) layout[p.id] = { x: r.x, y: r.y, w: r.w, h: r.h, z: Number.isFinite(r.z) ? r.z : base[p.id].z }
    }
    return { layout, locked: Boolean(saved?.locked) }
  } catch {
    return { layout: base, locked: false }
  }
}

export default function PanelWorkspace({ panels, storageKey, children, className = '' }) {
  const canvasRef = useRef(null)
  const initial = useRef(null)
  if (!initial.current) initial.current = loadLayout(storageKey, panels)

  const [layout, setLayout] = useState(initial.current.layout)
  const [locked, setLocked] = useState(initial.current.locked)
  const [canvas, setCanvas] = useState({ w: 0, h: 0 })
  const measured = canvas.w > 0
  // The live interaction, mirrored into state purely so the chrome can react.
  const [active, setActive] = useState(null)

  const specs = useMemo(() => Object.fromEntries(panels.map((p) => [p.id, p])), [panels])
  const layoutRef = useRef(layout)
  layoutRef.current = layout
  const canvasSizeRef = useRef(canvas)
  canvasSizeRef.current = canvas
  const drag = useRef(null)

  const wantsFree = canvas.w >= FREEFORM_MIN_WIDTH
  const free = wantsFree && canvas.h >= FREEFORM_MIN_HEIGHT

  /* ── Measure the canvas instead of trusting viewport maths ───────────────
     The terminal sits inside a shell with a sidebar and a mobile bottom nav,
     so vh-based sizing overflows. A ResizeObserver is always right. */
  useLayoutEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      setCanvas((prev) =>
        Math.abs(prev.w - r.width) < 0.5 && Math.abs(prev.h - r.height) < 0.5
          ? prev
          : { w: r.width, h: r.height },
      )
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  /* Resolved pixel geometry. Clamping is derived here rather than written back
     into `layout`, so a transient or undersized canvas can never permanently
     squash the arrangement the user authored on a bigger screen. */
  const pxLayout = useMemo(() => {
    if (!canvas.w || !canvas.h) return {}
    const out = {}
    for (const [id, rect] of Object.entries(layout)) {
      const spec = specs[id]
      if (!spec) continue
      out[id] = clampPx(toPx(rect, canvas), canvas, spec.minW ?? 260, spec.minH ?? 140)
    }
    return out
  }, [layout, canvas, specs])
  const pxLayoutRef = useRef(pxLayout)
  pxLayoutRef.current = pxLayout

  /* Persist layout + lock state. */
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ v: 1, panels: layout, locked }))
    } catch {
      /* storage unavailable (private mode) — layout just won't persist */
    }
  }, [layout, locked, storageKey])

  const bringToFront = useCallback((id) => {
    setLayout((prev) => {
      if (!prev[id]) return prev
      const ids = Object.keys(prev)
      const top = Math.max(...ids.map((k) => prev[k].z ?? 0))
      if ((prev[id].z ?? 0) === top) return prev
      // Renumber 1..n with `id` on top rather than incrementing forever.
      const order = ids.sort((a, b) => (prev[a].z ?? 0) - (prev[b].z ?? 0)).filter((k) => k !== id)
      order.push(id)
      return Object.fromEntries(order.map((k, i) => [k, { ...prev[k], z: i + 1 }]))
    })
  }, [])

  const resetLayout = useCallback(() => {
    setLayout(defaultLayout(panels))
  }, [panels])

  /* ── Pointer-driven move / resize ─────────────────────────────────────── */
  const beginInteraction = useCallback(
    (id, mode, dir, e) => {
      if (locked || !free) return
      if (e.pointerType === 'mouse' && e.button !== 0) return
      const cv = canvasSizeRef.current
      const spec = specs[id]
      if (!cv.w || !cv.h || !spec) return

      e.preventDefault()
      e.stopPropagation()
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        /* capture is a nicety; window listeners carry the interaction */
      }
      bringToFront(id)

      const startPx = pxLayoutRef.current[id]
      if (!startPx) return
      drag.current = {
        id,
        mode,
        dir,
        pointerId: e.pointerId,
        originX: e.clientX,
        originY: e.clientY,
        startPx,
        startRect: layoutRef.current[id],
        canvas: cv,
        targets: buildSnapTargets(pxLayoutRef.current, id, cv),
        minW: spec.minW ?? 260,
        minH: spec.minH ?? 140,
        moved: false,
      }
      setActive({ id, mode, originPx: startPx, rectPx: startPx, guides: [] })
    },
    [bringToFront, free, locked, specs],
  )

  const interacting = active !== null
  useEffect(() => {
    if (!interacting) return

    let frame = null
    let pending = null

    const commit = () => {
      frame = null
      const d = drag.current
      if (!d || !pending) return
      const { rect, guides } = pending
      setLayout((prev) => ({ ...prev, [d.id]: { ...toFraction(rect, d.canvas), z: prev[d.id].z } }))
      setActive((prev) => (prev ? { ...prev, rectPx: rect, guides } : prev))
    }

    const onMove = (e) => {
      const d = drag.current
      if (!d || e.pointerId !== d.pointerId) return
      const dx = e.clientX - d.originX
      const dy = e.clientY - d.originY
      if (!d.moved && Math.hypot(dx, dy) > 2) d.moved = true

      if (d.mode === 'move') {
        const snapped = snapMove({ ...d.startPx, x: d.startPx.x + dx, y: d.startPx.y + dy }, d.targets)
        pending = {
          rect: clampPx(snapped.rect, d.canvas, d.minW, d.minH),
          guides: snapped.guides,
        }
      } else {
        pending = applyResize(d.startPx, d.dir, dx, dy, d.targets, d.canvas, d.minW, d.minH)
      }
      if (frame === null) frame = requestAnimationFrame(commit)
    }

    const finish = () => {
      if (frame !== null) cancelAnimationFrame(frame)
      drag.current = null
      setActive(null)
    }

    const onUp = (e) => {
      const d = drag.current
      if (d && e.pointerId !== undefined && e.pointerId !== d.pointerId) return
      if (frame !== null) commit()
      finish()
    }

    const onKeyDown = (e) => {
      if (e.key !== 'Escape') return
      const d = drag.current
      if (!d) return
      setLayout((prev) => ({ ...prev, [d.id]: d.startRect }))
      finish()
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [interacting])

  /* `L` toggles the lock, as long as the user isn't typing. */
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== 'l' && e.key !== 'L') return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target
      if (t?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t?.tagName)) return
      setLocked((v) => !v)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const ctx = useMemo(
    () => ({
      layout,
      pxLayout,
      specs,
      canvas,
      locked,
      free,
      active,
      beginInteraction,
      bringToFront,
    }),
    [layout, pxLayout, specs, canvas, locked, free, active, beginInteraction, bringToFront],
  )

  // Stacked mode follows the arrangement the user made on desktop (top-to-bottom,
  // then left-to-right) so the two views stay recognisably the same workspace.
  const stackOrder = useMemo(
    () =>
      panels
        .map((p) => p.id)
        .sort((a, b) => {
          const ra = layout[a]
          const rb = layout[b]
          if (!ra || !rb) return 0
          return Math.abs(ra.y - rb.y) > 0.04 ? ra.y - rb.y : ra.x - rb.x
        }),
    [panels, layout],
  )

  const orderedChildren = useMemo(() => {
    if (free) return children
    const byId = new Map(
      React.Children.toArray(children)
        .filter((c) => React.isValidElement(c) && c.props?.id)
        .map((c) => [c.props.id, c]),
    )
    return stackOrder.map((id) => byId.get(id)).filter(Boolean)
  }, [children, free, stackOrder])

  return (
    <WorkspaceContext.Provider value={ctx}>
      <div
        ref={canvasRef}
        data-workspace-canvas
        className={[
          'relative rounded-xl border border-[#1b1b1b] bg-[#080808]',
          wantsFree ? 'min-h-[360px] flex-1 overflow-hidden' : 'flex-none overflow-visible',
          active ? 'select-none' : '',
          className,
        ].join(' ')}
      >
        {/* Figma-style dot grid — brightens while something is being moved. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-xl transition-opacity duration-200"
          style={{
            opacity: active ? 0.85 : 0.35,
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.09) 1px, transparent 1px)',
            backgroundSize: '22px 22px',
          }}
        />

        {!measured ? null : free ? (
          <>
            {/* Where the panel came from, so the move reads as a move. */}
            {active && (
              <div
                aria-hidden
                className="pointer-events-none absolute z-0 rounded-lg border-2 border-dashed border-blue-500/45 bg-blue-500/[0.06]"
                style={{
                  left: active.originPx.x,
                  top: active.originPx.y,
                  width: active.originPx.w,
                  height: active.originPx.h,
                }}
              />
            )}

            {/* Alignment guides. */}
            {active?.guides.map((g, i) => (
              <div
                key={`${g.axis}-${g.pos}-${i}`}
                aria-hidden
                className="pointer-events-none absolute z-[70] bg-[#ff4d6d]"
                style={
                  g.axis === 'v'
                    ? { left: g.pos, top: 0, width: 1, height: '100%' }
                    : { top: g.pos, left: 0, height: 1, width: '100%' }
                }
              />
            ))}

            {children}

            {/* Live readout, Figma's blue measurement chip. */}
            {active && (
              <div
                aria-hidden
                className="pointer-events-none absolute z-[80] rounded bg-blue-600 px-2 py-0.5 font-mono text-[10px] font-bold text-white shadow-lg"
                style={{
                  left: Math.max(active.rectPx.x, 2),
                  top: Math.max(active.rectPx.y + active.rectPx.h + 6, 2),
                }}
              >
                {active.mode === 'move'
                  ? `${Math.round(active.rectPx.x)} , ${Math.round(active.rectPx.y)}`
                  : `${Math.round(active.rectPx.w)} × ${Math.round(active.rectPx.h)}`}
              </div>
            )}

            <WorkspaceToolbar
              floating
              locked={locked}
              free={free}
              interacting={interacting}
              onToggleLock={() => setLocked((v) => !v)}
              onReset={resetLayout}
            />
          </>
        ) : (
          <div className="relative z-10 flex flex-col gap-3 p-3">
            <div className="flex justify-end">
              <WorkspaceToolbar
                locked={locked}
                free={free}
                interacting={false}
                onToggleLock={() => setLocked((v) => !v)}
                onReset={resetLayout}
              />
            </div>
            {orderedChildren}
          </div>
        )}
      </div>
    </WorkspaceContext.Provider>
  )
}

function WorkspaceToolbar({ locked, free, floating, interacting, onToggleLock, onReset }) {
  return (
    <div
      className={`pointer-events-none z-[90] flex max-w-full justify-center transition-opacity duration-150 ${
        floating
          ? `absolute bottom-0 left-1/2 -translate-x-1/2 p-3 ${
              interacting ? 'opacity-0' : 'opacity-70 hover:opacity-100'
            }`
          : ''
      }`}
      style={floating ? { paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' } : undefined}
    >
      <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-[#2a2a2a] bg-[#111]/95 p-1 shadow-2xl backdrop-blur">
        <button
          type="button"
          onClick={onToggleLock}
          aria-pressed={locked}
          title={locked ? 'Unlock layout (L)' : 'Lock layout (L)'}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition ${
            locked
              ? 'bg-amber-500/15 text-amber-400 shadow-[0_0_14px_rgba(245,158,11,0.18)]'
              : 'bg-blue-600/15 text-blue-400 hover:bg-blue-600/25'
          }`}
        >
          {locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">{locked ? 'Locked' : 'Unlocked'}</span>
        </button>

        <button
          type="button"
          onClick={onReset}
          disabled={locked}
          title={locked ? 'Unlock to reset the layout' : 'Reset panels to the default layout'}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-400 transition hover:bg-[#1e1e1e] hover:text-white disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-gray-400"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Reset</span>
        </button>

        {!free && (
          <span
            title="Drag and resize become available on a wider screen"
            className="flex items-center gap-1.5 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500"
          >
            <Layers className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Stacked</span>
          </span>
        )}
      </div>
    </div>
  )
}
