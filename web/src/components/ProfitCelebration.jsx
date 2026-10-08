import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useGetMyProfileQuery } from '../api/profilesApi'
import { getIdentity, initialsOf } from '../utils/identity'
import Killcam from '../ascii/Killcam'

/* A full-screen "you just made money" moment, modelled on trading-app PnL cards.
   Fire it from anywhere with useCelebrate()({ ticker, realizedPnl, realizedPnlPct, invested, proceeds }). */

const MINT = '#2ee6a6'
const MIN_PCT = 1 // below +1% isn't worth a parade

const TIERS = [
  { min: 500, label: 'LEGENDARY', sub: 'Absolutely unreal. Screenshot this.', color: '#f5c451', glow: 'rgba(245,196,81,0.35)' },
  { min: 100, label: 'MOON SHOT', sub: 'You more than doubled it.', color: '#a78bfa', glow: 'rgba(167,139,250,0.35)' },
  { min: 25, label: 'BIG WIN', sub: 'That is a serious move.', color: MINT, glow: 'rgba(46,230,166,0.30)' },
  { min: 0, label: 'NICE TRADE', sub: 'Green is green. Keep stacking.', color: MINT, glow: 'rgba(46,230,166,0.22)' },
]
const tierFor = (pct) => TIERS.find((t) => pct >= t.min) ?? TIERS[TIERS.length - 1]

const money = (n) => {
  const a = Math.abs(n)
  if (a >= 1e9) return `$${(a / 1e9).toFixed(2)}B`
  if (a >= 1e6) return `$${(a / 1e6).toFixed(2)}M`
  if (a >= 1e4) return `$${(a / 1e3).toFixed(1)}K`
  return `$${a.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
const pctText = (p) => `+${p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`

const CelebrationContext = createContext(() => {})
export const useCelebrate = () => useContext(CelebrationContext)

export function CelebrationProvider({ children }) {
  const [queue, setQueue] = useState([])
  const seen = useRef(new Set())

  const celebrate = useCallback((win) => {
    if (!win || !(win.realizedPnl > 0) || !(win.realizedPnlPct >= MIN_PCT)) return
    // Same sale reported twice (e.g. a refetched portfolio) shouldn't pop twice
    const key = `${win.ticker}:${win.shares}:${win.price}:${win.realizedPnl}`
    if (seen.current.has(key)) return
    seen.current.add(key)
    setQueue((q) => [...q, win])
  }, [])

  const dismiss = useCallback(() => setQueue((q) => q.slice(1)), [])
  const value = useMemo(() => celebrate, [celebrate])

  return (
    <CelebrationContext.Provider value={value}>
      {children}
      {queue[0] && <WinModal key={`${queue[0].ticker}-${queue[0].realizedPnl}`} win={queue[0]} onClose={dismiss} />}
    </CelebrationContext.Provider>
  )
}

/* ─── Confetti ───────────────────────────────────────────────────────────── */
function Confetti({ colors, count }) {
  const ref = useRef(null)

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const canvas = ref.current
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const resize = () => {
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()

    const W = () => window.innerWidth
    const H = () => window.innerHeight
    const parts = Array.from({ length: count }, (_, i) => {
      // Two cannons from the bottom corners plus a rain from the top
      const cannon = i % 3
      const fromTop = cannon === 2
      return {
        x: fromTop ? Math.random() * W() : cannon === 0 ? 0 : W(),
        y: fromTop ? -20 : H() * 0.85,
        vx: fromTop ? (Math.random() - 0.5) * 3 : (cannon === 0 ? 1 : -1) * (6 + Math.random() * 9),
        vy: fromTop ? 2 + Math.random() * 3 : -(12 + Math.random() * 12),
        size: 6 + Math.random() * 7,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.4,
        color: colors[i % colors.length],
        round: Math.random() < 0.3,
      }
    })

    let raf
    const start = performance.now()
    const tick = (now) => {
      const t = now - start
      ctx.clearRect(0, 0, W(), H())
      for (const p of parts) {
        p.vy += 0.32
        p.vx *= 0.992
        p.x += p.vx
        p.y += p.vy
        p.rot += p.vr
        ctx.save()
        ctx.globalAlpha = Math.max(0, Math.min(1, (4200 - t) / 1200))
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.fillStyle = p.color
        if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2); ctx.fill() }
        else ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
        ctx.restore()
      }
      if (t < 4200) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    window.addEventListener('resize', resize)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
  }, [colors, count])

  return <canvas ref={ref} aria-hidden style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
}

/* ─── Count-up ───────────────────────────────────────────────────────────── */
function useCountUp(target, ms = 1100) {
  const [v, setV] = useState(0)
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setV(target); return }
    let raf
    const start = performance.now()
    const tick = (now) => {
      const p = Math.min(1, (now - start) / ms)
      setV(target * (1 - Math.pow(1 - p, 3)))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return v
}

/* ─── Shareable image (drawn straight to canvas so it works without DOM capture) ─── */
// Natural size of the card artwork. Both output formats draw this same content
// through a transform, so there is exactly one layout to maintain.
const CARD_W = 900, CARD_H = 1100

const FORMATS = {
  // The original square-ish card.
  card:  { w: 900,  h: 1100, label: 'Card' },
  // Instagram / WhatsApp story. 1080x1920 is the native size; content is kept
  // inside the vertical middle so neither platform's top and bottom UI covers it.
  story: { w: 1080, h: 1920, label: 'Story' },
}

function paintBackdrop(g, W, H, tier, glowY) {
  const bg = g.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, '#16181b'); bg.addColorStop(1, '#070808')
  g.fillStyle = bg; g.fillRect(0, 0, W, H)
  const glow = g.createRadialGradient(W / 2, glowY, 20, W / 2, glowY, Math.max(W, H) * 0.5)
  glow.addColorStop(0, tier.glow); glow.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = glow; g.fillRect(0, 0, W, H)
}

// Everything except the backdrop, in CARD_W x CARD_H coordinates.
function drawCardContent(g, win, identity, tier) {
  const W = CARD_W
  g.textBaseline = 'alphabetic'
  const font = (w, s) => `${w} ${s}px -apple-system, "Inter", "Helvetica Neue", Arial, sans-serif`

  // brand mark
  g.strokeStyle = '#f0ebe0'; g.lineWidth = 4; g.lineJoin = 'round'
  g.beginPath(); g.moveTo(90, 80); g.lineTo(122, 112); g.lineTo(90, 144); g.lineTo(58, 112); g.closePath(); g.stroke()
  g.beginPath(); g.moveTo(90, 98); g.lineTo(104, 112); g.lineTo(90, 126); g.lineTo(76, 112); g.closePath(); g.stroke()
  g.fillStyle = '#f0ebe0'; g.font = font(600, 36); g.textAlign = 'left'; g.fillText('Travauxus', 146, 124)

  g.fillStyle = tier.color; g.font = font(800, 30); g.fillText(tier.label, 60, 250)
  g.fillStyle = '#fff'; g.font = font(700, 96); g.fillText(`$${win.ticker}`, 60, 350)

  // pnl pill
  g.fillStyle = tier.color
  g.beginPath(); g.roundRect(60, 400, W - 120, 150, 18); g.fill()
  g.fillStyle = '#04120c'; g.font = font(800, 92); g.textAlign = 'left'
  g.fillText(`+${money(win.realizedPnl)}`, 90, 508)

  const rows = [
    ['PNL', pctText(win.realizedPnlPct), tier.color],
    ['Invested', money(win.invested), '#fff'],
    ['Position', money(win.proceeds), '#fff'],
  ]
  rows.forEach(([k, v, col], i) => {
    const y = 650 + i * 78
    g.fillStyle = '#d4d4d8'; g.font = font(500, 38); g.textAlign = 'left'; g.fillText(k, 70, y)
    g.fillStyle = col; g.font = font(700, 40); g.textAlign = 'right'; g.fillText(v, W - 70, y)
  })

  // trader
  g.textAlign = 'left'
  g.fillStyle = '#26282c'; g.beginPath(); g.arc(112, 960, 46, 0, Math.PI * 2); g.fill()
  g.fillStyle = '#f0ebe0'; g.font = font(700, 36); g.textAlign = 'center'; g.fillText(initialsOf(identity.name), 112, 973)
  g.textAlign = 'left'
  g.fillStyle = '#fff'; g.font = font(700, 44); g.fillText(identity.name, 182, 956)
  if (identity.handle) { g.fillStyle = '#9ca3af'; g.font = font(500, 30); g.fillText(identity.handle, 182, 998) }
  g.fillStyle = '#6b7280'; g.font = font(500, 26); g.fillText('Paper trading · travauxus.com', 60, 1060)
}

function renderCardImage(win, identity, tier, format = 'card') {
  const { w: W, h: H } = FORMATS[format] ?? FORMATS.card
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const g = c.getContext('2d')

  if (format === 'story') {
    // Keep the artwork clear of the ~250px the platforms overlay at top and
    // bottom, and centre it in what is left.
    const SAFE_TOP = 300, SAFE_BOTTOM = 300
    const usableH = H - SAFE_TOP - SAFE_BOTTOM
    const scale = Math.min((W * 0.92) / CARD_W, usableH / CARD_H)
    const dw = CARD_W * scale, dh = CARD_H * scale
    const x = (W - dw) / 2, y = SAFE_TOP + (usableH - dh) / 2
    paintBackdrop(g, W, H, tier, y + 330 * scale)
    g.save(); g.translate(x, y); g.scale(scale, scale)
    drawCardContent(g, win, identity, tier)
    g.restore()
  } else {
    paintBackdrop(g, W, H, tier, 330)
    drawCardContent(g, win, identity, tier)
  }
  return c
}

/* ─── Modal ──────────────────────────────────────────────────────────────── */
function WinModal({ win, onClose }) {
  const { user } = useAuth()
  const { data: profile } = useGetMyProfileQuery(undefined, { skip: !user })
  const identity = getIdentity(user, profile)
  const tier = tierFor(win.realizedPnlPct)
  const pnl = useCountUp(win.realizedPnl)
  const [shareNote, setShareNote] = useState('')
  // Story is the default: this modal exists to be posted, and 9:16 is what the
  // places people post to actually want.
  const [format, setFormat] = useState('story')
  const closeRef = useRef(null)
  const colors = useMemo(() => [tier.color, '#ffffff', '#f5c451', '#60a5fa'], [tier.color])

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose])

  const shareText = `Just banked +${money(win.realizedPnl)} (${pctText(win.realizedPnlPct)}) on $${win.ticker} on Travauxus`

  const fileName = `travauxus-${win.ticker}-win${format === 'story' ? '-story' : ''}.png`

  const getBlob = () =>
    new Promise((resolve) => renderCardImage(win, identity, tier, format).toBlob(resolve, 'image/png'))

  const download = async () => {
    const blob = await getBlob()
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = fileName
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const share = async () => {
    setShareNote('')
    try {
      const blob = await getBlob()
      const file = blob && new File([blob], fileName, { type: 'image/png' })
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: shareText })
      } else if (navigator.share) {
        await navigator.share({ text: shareText })
      } else {
        await navigator.clipboard.writeText(shareText)
        setShareNote('Copied to clipboard')
      }
    } catch (err) {
      if (err?.name !== 'AbortError') setShareNote('Could not share — try Download')
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${tier.label}: you made ${money(win.realizedPnl)} on ${win.ticker}`}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(6px)', animation: 'winFade 200ms ease-out' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <style>{`
        @keyframes winFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes winPop { 0% { transform: scale(.86) translateY(24px); opacity: 0 } 60% { transform: scale(1.02) } 100% { transform: scale(1) translateY(0); opacity: 1 } }
        @keyframes winShine { from { transform: translateX(-120%) } to { transform: translateX(220%) } }
        @media (prefers-reduced-motion: reduce) { .win-anim { animation: none !important } }
      `}</style>
      <Confetti colors={colors} count={150} />

      <div className="relative w-full max-w-sm win-anim" style={{ animation: 'winPop 520ms cubic-bezier(.2,.9,.3,1.2)' }}>
        <div
          className="relative overflow-hidden rounded-3xl p-6"
          style={{
            background: 'linear-gradient(160deg,#17191c 0%,#0a0b0c 100%)',
            border: `1px solid ${tier.color}40`,
            boxShadow: `0 0 80px ${tier.glow}, 0 30px 60px rgba(0,0,0,.6)`,
          }}
        >
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full pointer-events-none" style={{ background: `radial-gradient(circle, ${tier.glow}, transparent 65%)` }} />

          <div className="relative flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M12 2L22 12L12 22L2 12Z" stroke="#f0ebe0" strokeWidth="1.5" strokeLinejoin="round" />
                <path d="M12 6.5L17.5 12L12 17.5L6.5 12Z" stroke="#f0ebe0" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
              <span className="text-[13px] font-semibold text-[#f0ebe0] tracking-tight">Travauxus</span>
            </div>
            <button ref={closeRef} onClick={onClose} aria-label="Close" className="text-white/40 hover:text-white transition-colors w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>

          <div className="relative mb-4" style={{ marginInline: -4 }}>
            <Killcam seed={`${win.ticker}:${win.realizedPnl}`} cols={84} rows={20} style={{ borderRadius: 12 }} />
          </div>

          <p className="relative text-[11px] font-extrabold tracking-[0.25em] mb-1" style={{ color: tier.color }}>{tier.label}</p>
          <h2 className="relative text-4xl font-bold text-white mb-1">{win.ticker}</h2>
          <p className="relative text-xs text-white/40 mb-5">
            {win.auto === 'target_price' ? 'Target hit — auto-sold' : tier.sub}
          </p>

          <div className="relative overflow-hidden rounded-xl px-5 py-4 mb-5" style={{ background: tier.color }}>
            <span className="text-[34px] leading-none font-extrabold tabular-nums" style={{ color: '#04120c' }}>+{money(pnl)}</span>
            <span aria-hidden className="absolute inset-y-0 w-1/3 win-anim" style={{ background: 'linear-gradient(100deg,transparent,rgba(255,255,255,.55),transparent)', animation: 'winShine 1.4s .5s ease-out 1 both' }} />
          </div>

          <dl className="relative space-y-2.5 mb-6 text-[15px]">
            {[
              ['PNL', pctText(win.realizedPnlPct), tier.color],
              ['Invested', money(win.invested), '#fff'],
              ['Position', money(win.proceeds), '#fff'],
            ].map(([k, v, c]) => (
              <div key={k} className="flex items-center justify-between">
                <dt className="text-white/70">{k}</dt>
                <dd className="font-bold tabular-nums" style={{ color: c }}>{v}</dd>
              </div>
            ))}
          </dl>

          <div className="relative flex items-center gap-3 pt-4 border-t border-white/10">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold overflow-hidden flex-shrink-0" style={{ background: '#26282c', color: '#f0ebe0' }}>
              {profile?.avatar_url
                ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                : initialsOf(identity.name)}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">{identity.name}</p>
              {identity.handle && <p className="text-xs text-white/40 truncate">{identity.handle}</p>}
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <button onClick={share} className="flex-1 py-3 rounded-xl text-sm font-semibold text-[#04120c] transition-transform hover:scale-[1.02] active:scale-[0.98]" style={{ background: tier.color }}>
            Share
          </button>
          <button onClick={download} className="px-5 py-3 rounded-xl text-sm font-semibold text-white bg-white/10 hover:bg-white/15 transition-colors">
            Save image
          </button>
          <button onClick={onClose} className="px-5 py-3 rounded-xl text-sm font-medium text-white/60 hover:text-white transition-colors">
            Done
          </button>
        </div>
        <div role="radiogroup" aria-label="Image size" className="flex justify-center gap-1 mt-3">
          {Object.entries(FORMATS).map(([id, f]) => (
            <button
              key={id}
              role="radio"
              aria-checked={format === id}
              onClick={() => setFormat(id)}
              className={`px-3 py-1 rounded-lg text-[11px] font-semibold tracking-wide transition-colors ${
                format === id ? 'bg-white/15 text-white' : 'text-white/45 hover:text-white/80'
              }`}
            >
              {f.label} <span className="font-normal opacity-60">{f.w}×{f.h}</span>
            </button>
          ))}
        </div>
        <p className="text-center text-xs text-white/40 mt-2 h-4" aria-live="polite">{shareNote}</p>
      </div>
    </div>
  )
}
