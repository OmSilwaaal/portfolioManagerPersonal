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

export default function PanelWorkspace({
  panels,
  storageKey,
  children,
  className = '',
  // Canvas chrome. Pass `surface=""` to let a page's own background show through.
  surface = 'rounded-xl border border-[#1b1b1b] bg-[#080808]',
  // Optional element painted on the canvas floor, under everything, in both the free and the stacked view.
  // It is forced non-interactive here rather than trusted to opt out, because anything that swallowed a
  // pointerdown would break dragging.
  backdrop = null,
  showGrid = true,
  // Minimum canvas width for free dragging. Raise it to line up with a page that
  // only pins itself to the viewport height at a wider breakpoint.
  freeformMinWidth = FREEFORM_MIN_WIDTH,
  // Optional ref, populated with { locked, toggleLock, reset } so a page's own
  // toolbar can drive the workspace.
  controls,
  // Accent for the drag chrome (ghost, readout, lock pill). Defaults to blue;
  // pages with their own palette pass their own hex.
  accent = '#3b82f6',
}) {
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
  // Live DOM handles. A drag writes geometry straight to these instead of going
  // through React, so a gesture costs two renders (start and end) rather than one
  // per frame.
  const nodes = useRef(new Map())
  const ghostRef = useRef(null)
  const readoutRef = useRef(null)
  const guideRefs = [useRef(null), useRef(null)]
  const registerNode = useCallback((id, el) => {
    if (el) nodes.current.set(id, el)
    else nodes.current.delete(id)
  }, [])

  const wantsFree = canvas.w >= freeformMinWidth
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
        node: nodes.current.get(id) || null,
        rect: startPx,
      }
      // Promote the panel to its own layer, and drop the frosted-glass backdrop
      // for the duration: re-blurring a moving element every frame is the single
      // most expensive thing on this canvas.
      if (drag.current.node) drag.current.node.style.willChange = 'transform'
      canvasRef.current?.setAttribute('data-interacting', 'true')
      setActive({ id, mode, originPx: startPx, rectPx: startPx })
    },
    [bringToFront, free, locked, specs],
  )

  const interacting = active !== null
  useEffect(() => {
    if (!interacting) return

    let frame = null
    let pending = null

    // Paint the frame by hand. `transform` keeps a move off the layout path
    // entirely; a resize still has to touch width/height, but only on one node.
    const paint = () => {
      frame = null
      const d = drag.current
      if (!d || !pending) return
      const { rect, guides } = pending
      d.rect = rect

      if (d.node) {
        d.node.style.transform = `translate3d(${rect.x - d.startPx.x}px, ${rect.y - d.startPx.y}px, 0)`
        if (d.mode === 'resize') {
          d.node.style.width = `${rect.w}px`
          d.node.style.height = `${rect.h}px`
        }
      }

      const readout = readoutRef.current
      if (readout) {
        readout.textContent = d.mode === 'move'
          ? `${Math.round(rect.x)} , ${Math.round(rect.y)}`
          : `${Math.round(rect.w)} × ${Math.round(rect.h)}`
        readout.style.transform = `translate3d(${Math.max(rect.x, 2)}px, ${Math.max(rect.y + rect.h + 6, 2)}px, 0)`
      }

      guideRefs.forEach((ref, i) => {
        const el = ref.current
        if (!el) return
        const g = guides[i]
        if (!g) {
          if (el.style.display !== 'none') el.style.display = 'none'
          return
        }
        // Set discrete properties; assigning to cssText here would append to it
        // every frame and force a re-parse of an ever-growing string.
        const vertical = g.axis === 'v'
        el.style.display = 'block'
        el.style.width = vertical ? '1px' : '100%'
        el.style.height = vertical ? '100%' : '1px'
        el.style.transform = vertical
          ? `translate3d(${g.pos}px, 0, 0)`
          : `translate3d(0, ${g.pos}px, 0)`
      })
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
      if (frame === null) frame = requestAnimationFrame(paint)
    }

    // Hand geometry back to React and strip the inline overrides in the same tick,
    // so there is no frame where both the transform and the new rect are applied.
    const finish = (commitRect) => {
      if (frame !== null) cancelAnimationFrame(frame)
      const d = drag.current
      drag.current = null
      canvasRef.current?.removeAttribute('data-interacting')
      if (d?.node) {
        // Write the final box back explicitly rather than clearing to ''. React
        // owns these properties, and on a move the width/height it would render
        // are unchanged from the previous render -- so its style diff skips them
        // and a cleared value is never restored, leaving the panel to collapse to
        // its content size.
        const final = commitRect || d.startPx
        d.node.style.transform = ''
        d.node.style.willChange = ''
        d.node.style.left = `${final.x}px`
        d.node.style.top = `${final.y}px`
        d.node.style.width = `${final.w}px`
        d.node.style.height = `${final.h}px`
      }
      if (d && commitRect) {
        setLayout((prev) => (prev[d.id]
          ? { ...prev, [d.id]: { ...toFraction(commitRect, d.canvas), z: prev[d.id].z } }
          : prev))
      }
      setActive(null)
    }

    const onUp = (e) => {
      const d = drag.current
      if (d && e.pointerId !== undefined && e.pointerId !== d.pointerId) return
      finish(d?.moved ? d.rect : null)
    }

    const onKeyDown = (e) => {
      if (e.key !== 'Escape') return
      if (!drag.current) return
      finish(null) // drop the gesture; the committed rect is already correct
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

  const toggleLock = useCallback(() => setLocked((v) => !v), [])
  useEffect(() => {
    if (!controls) return
    controls.current = { locked, toggleLock, reset: resetLayout }
  }, [controls, locked, toggleLock, resetLayout])

  const ctx = useMemo(
    () => ({
      layout,
      pxLayout,
      specs,
      accent,
      canvas,
      locked,
      free,
      active,
      beginInteraction,
      bringToFront,
      registerNode,
    }),
    [layout, pxLayout, specs, accent, canvas, locked, free, active, beginInteraction, bringToFront, registerNode],
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
          'relative',
          surface,
          wantsFree ? 'min-h-[360px] flex-1 overflow-hidden' : 'flex-none overflow-visible',
          active ? 'select-none' : '',
          className,
        ].join(' ')}
      >
        {backdrop && (
          <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">{backdrop}</div>
        )}

        {/* Figma-style dot grid — brightens while something is being moved. */}
        {showGrid && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-0 rounded-xl transition-opacity duration-200"
            style={{
              opacity: active ? 0.85 : 0.35,
              backgroundImage: 'radial-gradient(var(--on-ink-text-4) 1px, transparent 1px)',
              backgroundSize: '22px 22px',
            }}
          />
        )}

        {!measured ? null : free ? (
          <>
            {/* Where the panel came from, so the move reads as a move. */}
            {active && (
              <div
                aria-hidden
                data-workspace-ghost
                ref={ghostRef}
                className="pointer-events-none absolute z-0 rounded-lg border-2 border-dashed"
                style={{
                  borderColor: `${accent}73`,
                  backgroundColor: `${accent}10`,
                  left: active.originPx.x,
                  top: active.originPx.y,
                  width: active.originPx.w,
                  height: active.originPx.h,
                }}
              />
            )}

            {/* Alignment guides. */}
            {active && guideRefs.map((ref, i) => (
              <div
                key={i}
                ref={ref}
                aria-hidden
                data-workspace-guide
                className="pointer-events-none absolute left-0 top-0 z-[70] bg-[#ff4d6d]"
                style={{ display: 'none' }}
              />
            ))}

            {children}

            {/* Live readout, Figma's blue measurement chip. */}
            {active && (
              <div
                aria-hidden
                data-workspace-readout
                ref={readoutRef}
                className="pointer-events-none absolute left-0 top-0 z-[80] rounded-sm px-2 py-0.5 font-mono text-[11px] font-bold"
                style={{
                  backgroundColor: accent,
                  color: '#0d0c08',
                  transform: `translate3d(${Math.max(active.rectPx.x, 2)}px, ${Math.max(active.rectPx.y + active.rectPx.h + 6, 2)}px, 0)`,
                }}
              >
                {active.mode === 'move'
                  ? `${Math.round(active.rectPx.x)} , ${Math.round(active.rectPx.y)}`
                  : `${Math.round(active.rectPx.w)} × ${Math.round(active.rectPx.h)}`}
              </div>
            )}

            <WorkspaceToolbar
              floating
              accent={accent}
              locked={locked}
              free={free}
              interacting={interacting}
              onToggleLock={toggleLock}
              onReset={resetLayout}
            />
          </>
        ) : (
          <div className="relative z-10 flex flex-col gap-3 p-3">
            <div className="flex justify-end">
              <WorkspaceToolbar
                accent={accent}
                locked={locked}
                free={free}
                interacting={false}
                onToggleLock={toggleLock}
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

function WorkspaceToolbar({ locked, free, floating, interacting, accent = '#3b82f6', onToggleLock, onReset }) {
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
      <div className="t-panel pointer-events-auto flex items-center gap-1 p-1" style={{ boxShadow: '0 8px 24px -10px rgba(0,0,0,0.5)' }}>
        <button
          type="button"
          onClick={onToggleLock}
          aria-pressed={locked}
          title={locked ? 'Unlock layout (L)' : 'Lock layout (L)'}
          className={`t-btn flex items-center gap-1.5 px-3 py-1.5 text-[11px] uppercase tracking-wider ${locked ? 't-on' : ''}`}
        >
          {locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">{locked ? 'Locked' : 'Unlocked'}</span>
        </button>

        <button
          type="button"
          onClick={onReset}
          disabled={locked}
          title={locked ? 'Unlock to reset the layout' : 'Reset panels to the default layout'}
          className="t-btn flex items-center gap-1.5 px-3 py-1.5 text-[11px] uppercase tracking-wider disabled:opacity-40"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Reset</span>
        </button>

        {!free && (
          <span
            title="Drag and resize become available on a wider screen"
            className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--on-ink-text-3)' }}
          >
            <Layers className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Stacked</span>
          </span>
        )}
      </div>
    </div>
  )
}
