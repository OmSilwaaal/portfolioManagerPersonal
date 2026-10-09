import { useEffect, useState } from 'react'

/**
 * The two things every ASCII texture in the terminal needs: the theme colours it
 * is drawn with, and a character grid sized to the box it has to cover.
 *
 * Both backdrops (the logo on the workspace floor, the wave behind the alert
 * rail) had identical copies of these; they live here so there is one place that
 * knows how the terminal's ASCII surfaces are measured and coloured.
 */

/**
 * Read custom properties off a live element, re-reading whenever the theme flips.
 * `fallback` is what is used before the first measurement and if a token is unset,
 * so a texture never paints in the browser default of black.
 */
export function useThemeTokens(ref, fallback) {
  const [tokens, setTokens] = useState(fallback)
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const names = Object.keys(fallback)
    const read = () => {
      const cs = getComputedStyle(el)
      setTokens((prev) => {
        let changed = false
        const next = {}
        for (const k of names) {
          next[k] = cs.getPropertyValue(k).trim() || fallback[k]
          if (next[k] !== prev[k]) changed = true
        }
        return changed ? next : prev
      })
    }
    read()
    // The app toggles `dark` on <html>, so the class attribute is the signal.
    const mo = new MutationObserver(read)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => mo.disconnect()
    // fallback is a literal at every call site; keying on the names keeps the effect stable.
  }, [ref, Object.keys(fallback).join(',')]) // eslint-disable-line react-hooks/exhaustive-deps
  return tokens
}

/**
 * A character grid that covers the host box at `cellPx`, capped at `maxCells` so a
 * huge display cannot run away with per-frame work. Measurement is debounced
 * because reallocating the canvas mid-resize is a known jank source.
 */
export function useAsciiGrid(ref, { cellPx, maxCells, minCols = 12, minRows = 3, quietMs = 120 }) {
  const [grid, setGrid] = useState({ cols: 0, rows: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    let quiet = 0
    const measure = () => {
      const { width, height } = el.getBoundingClientRect()
      if (width < 2 || height < 2) return // the first layout pass can report ~0; wait for a real one
      const cw = cellPx * 0.6 // monospace advance is about 0.6em
      const ch = cellPx * 1.18
      let cols = Math.max(minCols, Math.ceil(width / cw))
      let rows = Math.max(minRows, Math.ceil(height / ch))
      if (cols * rows > maxCells) {
        const k = Math.sqrt(maxCells / (cols * rows))
        cols = Math.max(minCols, Math.floor(cols * k))
        rows = Math.max(minRows, Math.floor(rows * k))
      }
      setGrid((prev) => (prev.cols === cols && prev.rows === rows ? prev : { cols, rows }))
    }
    measure()
    const ro = new ResizeObserver(() => {
      clearTimeout(quiet)
      quiet = setTimeout(measure, quietMs)
    })
    ro.observe(el)
    return () => { clearTimeout(quiet); ro.disconnect() }
  }, [ref, cellPx, maxCells, minCols, minRows, quietMs])
  return grid
}
