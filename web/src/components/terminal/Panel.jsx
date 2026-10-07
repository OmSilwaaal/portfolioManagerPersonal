import React from 'react'
import { GripVertical, Lock } from 'lucide-react'
import { useWorkspace } from './PanelWorkspace'

/** The eight Figma resize handles: four edges, four corners. */
const HANDLES = [
  { dir: 'n', cursor: 'ns-resize', className: 'top-0 left-4 right-4 h-2' },
  { dir: 's', cursor: 'ns-resize', className: 'bottom-0 left-4 right-4 h-2' },
  { dir: 'w', cursor: 'ew-resize', className: 'left-0 top-4 bottom-4 w-2' },
  { dir: 'e', cursor: 'ew-resize', className: 'right-0 top-4 bottom-4 w-2' },
  { dir: 'nw', cursor: 'nwse-resize', className: 'top-0 left-0 h-4 w-4', corner: 'top-[2px] left-[2px]' },
  { dir: 'ne', cursor: 'nesw-resize', className: 'top-0 right-0 h-4 w-4', corner: 'top-[2px] right-[2px]' },
  { dir: 'sw', cursor: 'nesw-resize', className: 'bottom-0 left-0 h-4 w-4', corner: 'bottom-[2px] left-[2px]' },
  { dir: 'se', cursor: 'nwse-resize', className: 'bottom-0 right-0 h-4 w-4', corner: 'bottom-[2px] right-[2px]' },
]

/**
 * `bare` hosts a panel that already brings its own card chrome: the workspace
 * adds no header or background, just a floating grip and the resize handles.
 */
export default function Panel({ id, title, icon: Icon, actions, children, bodyClassName = '', bare = false }) {
  const { pxLayout, layout, specs, locked, free, active, accent, beginInteraction, bringToFront, registerNode } = useWorkspace()
  const spec = specs[id]
  if (!spec) return null

  const isActive = active?.id === id
  const isMoving = isActive && active.mode === 'move'
  const isResizing = isActive && active.mode === 'resize'

  // Free canvas positions absolutely; the stacked fallback is plain flow layout.
  const px = pxLayout[id]
  if (free && !px) return null

  const positioning = free
    ? {
        style: { left: px.x, top: px.y, width: px.w, height: px.h, zIndex: layout[id]?.z ?? 1 },
        className: 'absolute',
      }
    : {
        // Stacked panels size to their content unless a panel needs a floor
        // (the chart, whose body is a flexible box with nothing to measure).
        style: { minHeight: spec.stackedHeight ?? 0 },
        className: 'relative w-full',
      }

  return (
    <section
      ref={(el) => registerNode(id, free ? el : null)}
      style={isActive ? { ...positioning.style, '--tw-ring-color': `${accent}99` } : positioning.style}
      onPointerDown={() => free && !locked && bringToFront(id)}
      className={[
        positioning.className,
        'group flex min-w-0 flex-col',
        bare ? 'rounded-[28px]' : 'overflow-hidden rounded-lg border bg-[#111] shadow-xl',
        isActive ? 'ring-2' : bare ? '' : 'border-[#222]',
        isMoving ? 'cursor-grabbing' : '',
        // Only animate when idle, otherwise the panel lags behind the cursor.
        isActive ? '' : 'transition-[border-color,box-shadow] duration-150',
      ].join(' ')}
    >
      {bare ? (
        free &&
        !locked && (
          <div
            onPointerDown={(e) => beginInteraction(id, 'move', null, e)}
            style={{ touchAction: 'none' }}
            title="Drag to move  ·  edges and corners resize"
            className={`absolute top-3 right-3 z-30 rounded-full bg-black/40 p-1.5 text-[#a39d8d] opacity-0 backdrop-blur-md transition hover:text-white group-hover:opacity-100 ${
              isMoving ? 'cursor-grabbing opacity-100' : 'cursor-grab'
            }`}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </div>
        )
      ) : (
      <header
        onPointerDown={(e) => beginInteraction(id, 'move', null, e)}
        style={{ touchAction: 'none' }}
        className={[
          'flex shrink-0 items-center gap-2 border-b border-[#1e1e1e] bg-[#141414] px-3 py-2',
          free && !locked ? (isMoving ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default',
        ].join(' ')}
      >
        {free && (
          <span
            aria-hidden
            className={`-ml-1 shrink-0 transition-colors ${
              locked ? 'text-amber-500/60' : 'text-gray-600 group-hover:text-gray-400'
            }`}
          >
            {locked ? <Lock className="h-3.5 w-3.5" /> : <GripVertical className="h-4 w-4" />}
          </span>
        )}
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-blue-400" />}
        <h2 className="min-w-0 flex-1 truncate text-[11px] font-black uppercase tracking-[0.12em] text-gray-300">
          {title}
        </h2>
        {actions && (
          // Keep buttons in the header from starting a drag.
          <div className="flex shrink-0 items-center gap-1" onPointerDown={(e) => e.stopPropagation()}>
            {actions}
          </div>
        )}
      </header>
      )}

      <div
        className={
          bare
            ? `min-h-0 min-w-0 flex-1 ${bodyClassName}`
            : `min-h-0 flex-1 overflow-auto overscroll-contain ${bodyClassName}`
        }
      >
        {children}
      </div>

      {free && !locked && (
        <>
          {HANDLES.map((h) => (
            <div
              key={h.dir}
              onPointerDown={(e) => beginInteraction(id, 'resize', h.dir, e)}
              style={{ cursor: h.cursor, touchAction: 'none' }}
              className={`absolute z-20 ${h.className}`}
            >
              {h.corner && (
                <span
                  aria-hidden
                  style={{ borderColor: accent }}
                  className={`pointer-events-none absolute h-2 w-2 rounded-[1px] border bg-white opacity-0 transition-opacity group-hover:opacity-100 ${
                    isResizing ? 'opacity-100' : ''
                  } ${h.corner}`}
                />
              )}
            </div>
          ))}
        </>
      )}
    </section>
  )
}
