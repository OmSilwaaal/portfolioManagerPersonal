import React, { useEffect, useMemo, useRef } from 'react'
import AsciiCanvas from '../../ascii/AsciiCanvas'
import { useThemeTokens } from './asciiSurface'

/**
 * The "are you sure?" that appears when an order goes out.
 *
 * It has no button on purpose, and more than that: it has no pointer events at
 * all. Any pointerdown or keypress anywhere closes it, and because nothing in it
 * can be the target of a click, a click aimed at the submit button underneath
 * still reaches the submit button. Someone hammering Buy in a fast market is
 * never fighting this thing — that is the whole brief for it.
 *
 * A nonce rather than a boolean: pressing Buy twice in a row has to restart the
 * glyph and the timer, and a boolean that is already true would do neither.
 */

const COLS = 24
const ROWS = 12
const CELL_PX = 11
const FPS = 12
const AUTO_MS = 3600

const FALLBACK = { '--negative': '#dd6a56' }

function makePainter(colour) {
  return function paintHazard(ctx, { U, V, t }) {
    const cx = U / 2
    const cy = V / 2
    // A slow throb, so it catches the eye once and then stops demanding it.
    const R = Math.min(U, V) * 0.42 * (1 + 0.035 * Math.sin(t * 5))
    ctx.strokeStyle = colour
    ctx.lineWidth = 0.55

    const tri = [[0, -1], [0.92, 0.66], [-0.92, 0.66]]
    ctx.beginPath()
    tri.forEach(([x, y], i) => {
      const X = cx + x * R
      const Y = cy + y * R
      if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y)
    })
    ctx.closePath()
    ctx.stroke()

    ctx.lineWidth = 0.7
    ctx.beginPath()
    ctx.moveTo(cx, cy - R * 0.42)
    ctx.lineTo(cx, cy + R * 0.14)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(cx, cy + R * 0.4, 0.2, 0, Math.PI * 2)
    ctx.stroke()
  }
}

export default function TradeWarning({ nonce, side, detail, onDismiss }) {
  const hostRef = useRef(null)
  const tokens = useThemeTokens(hostRef, FALLBACK)
  const painter = useMemo(() => makePainter(tokens['--negative']), [tokens])
  const reduced = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  /* onDismiss is an inline closure at the call site, so depending on it here would tear down and
     rebuild this effect on every render of the ticket — and the ticket re-renders constantly,
     on every quote and every price tick. The auto-dismiss timer would restart each time and the
     overlay would simply never time out. Going through a ref keeps the effect keyed on the
     nonce alone, which is the only thing that should ever restart it. */
  const dismiss = useRef(onDismiss)
  dismiss.current = onDismiss
  useEffect(() => {
    if (!nonce) return undefined
    // Capture phase, and no preventDefault or stopPropagation anywhere: this listens for the
    // click, it does not consume it.
    const close = () => dismiss.current()
    window.addEventListener('pointerdown', close, true)
    window.addEventListener('keydown', close, true)
    window.addEventListener('wheel', close, true)
    const t = setTimeout(close, AUTO_MS)
    return () => {
      window.removeEventListener('pointerdown', close, true)
      window.removeEventListener('keydown', close, true)
      window.removeEventListener('wheel', close, true)
      clearTimeout(t)
    }
  }, [nonce])

  if (!nonce) return null

  return (
    <div ref={hostRef} className="t-warn" role="alertdialog" aria-label="Order sent">
      {/* key on the nonce so a second press replays the glyph from the top */}
      <AsciiCanvas
        key={nonce}
        painter={painter}
        cols={COLS}
        rows={ROWS}
        fontPx={CELL_PX}
        fps={reduced ? 0 : FPS}
        gamma={0.85}
        label="Warning"
      />
      <p className="t-warn-head">Are you sure?</p>
      <p className="t-warn-sub">
        {side === 'buy' ? 'Buy' : 'Sell'} order sent{detail ? ` · ${detail}` : ''}. Paper trading — no real funds move.
      </p>
      <p className="t-warn-hint">Click anywhere to dismiss</p>
    </div>
  )
}
