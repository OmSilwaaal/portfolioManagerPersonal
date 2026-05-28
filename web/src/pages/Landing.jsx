import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

const CREAM  = 'var(--paper)'
const INK    = 'var(--ink-900)'
const MUTED  = 'var(--on-ink-text-3)'
const BORDER = 'var(--on-ink-border)'

function useScrollY() {
  const [y, setY] = useState(0)
  useEffect(() => {
    let raf
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => { setY(window.scrollY); raf = null })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => { window.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf) }
  }, [])
  return y
}

function useMouse() {
  const [pos, setPos] = useState(() => ({
    x: typeof window !== 'undefined' ? window.innerWidth / 2 : 0,
    y: typeof window !== 'undefined' ? window.innerHeight / 2 : 0,
    nx: 0, ny: 0,
  }))
  useEffect(() => {
    let raf = null, pending = null
    const onMove = (e) => {
      pending = { x: e.clientX, y: e.clientY, nx: (e.clientX / window.innerWidth) - 0.5, ny: (e.clientY / window.innerHeight) - 0.5 }
      if (raf) return
      raf = requestAnimationFrame(() => { setPos(pending); raf = null })
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => { window.removeEventListener('mousemove', onMove); if (raf) cancelAnimationFrame(raf) }
  }, [])
  return pos
}

function useElementProgress(ref) {
  const [p, setP] = useState(0)
  useEffect(() => {
    let raf
    const update = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        const el = ref.current
        if (!el) { raf = null; return }
        const r = el.getBoundingClientRect()
        const vh = window.innerHeight
        setP(Math.max(0, Math.min(1, (vh - r.top) / (r.height + vh))))
        raf = null
      })
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [ref])
  return p
}

const TICKER_POOL = [
  { sym: 'AAPL',  yahoo: 'AAPL',    x: 6,  y: 18, delay: 0   },
  { sym: 'NVDA',  yahoo: 'NVDA',    x: 78, y: 26, delay: 1.4 },
  { sym: 'BTC',   yahoo: 'BTC-USD', x: 12, y: 78, delay: 2.6 },
  { sym: 'GOLD',  yahoo: 'GC=F',    x: 84, y: 71, delay: 0.8 },
  { sym: 'TSLA',  yahoo: 'TSLA',    x: 88, y: 8,  delay: 2.0 },
  { sym: 'MSFT',  yahoo: 'MSFT',    x: 34, y: 15, delay: 1.2 },
  { sym: 'SPY',   yahoo: 'SPY',     x: 55, y: 62, delay: 2.1 },
  { sym: 'META',  yahoo: 'META',    x: 20, y: 35, delay: 3.0 },
  { sym: 'AMZN',  yahoo: 'AMZN',    x: 65, y: 88, delay: 0.5 },
  { sym: 'QQQ',   yahoo: 'QQQ',     x: 44, y: 55, delay: 1.7 },
  { sym: 'ETH',   yahoo: 'ETH-USD', x: 90, y: 88, delay: 2.8 },
  { sym: 'GOOGL', yahoo: 'GOOGL',   x: 38, y: 82, delay: 1.1 },
  { sym: 'JPM',   yahoo: 'JPM',     x: 72, y: 40, delay: 2.3 },
  { sym: 'FOMC',  yahoo: null,      x: 70, y: 50, delay: 1.8, staticD: 'NOV 22',  staticTone: 'mut' },
  { sym: 'CPI',   yahoo: null,      x: 4,  y: 45, delay: 3.2, staticD: '3.4',     staticTone: 'mut' },
]

function useLivePrices() {
  const [prices, setPrices] = useState({})
  useEffect(() => {
    const yahoSyms = TICKER_POOL.filter(t => t.yahoo).map(t => t.yahoo)
    const simulate = () => {
      const mock = {}
      TICKER_POOL.forEach((t, i) => {
        if (t.yahoo) mock[t.sym] = parseFloat((Math.sin(Date.now() * 0.00001 + i * 2.3) * 4.5).toFixed(2))
      })
      setPrices(mock)
    }
    const fetchPrices = async () => {
      try {
        const res = await fetch(
          `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${yahoSyms.join(',')}`,
          { signal: AbortSignal.timeout(4000) }
        )
        const json = await res.json()
        const result = {}
        json?.quoteResponse?.result?.forEach(q => {
          const ticker = TICKER_POOL.find(t => t.yahoo === q.symbol)
          if (ticker && q.regularMarketChangePercent != null)
            result[ticker.sym] = parseFloat(q.regularMarketChangePercent.toFixed(2))
        })
        if (Object.keys(result).length > 0) setPrices(result)
        else simulate()
      } catch { simulate() }
    }
    fetchPrices()
    const iv = setInterval(fetchPrices, 60000)
    return () => clearInterval(iv)
  }, [])
  return prices
}

function Tag({ children, tone = 'muted', style: s }) {
  const color = {
    muted: 'var(--on-ink-text-3)', bright: CREAM, paper: CREAM,
    moss: 'var(--moss-200)', ochre: 'var(--ochre-300)', clay: 'var(--clay-300)',
    act: 'var(--urgency-act)', dark: 'var(--on-paper-text-3)',
  }[tone] || tone
  return (
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 500, letterSpacing: '0.24em', textTransform: 'uppercase', color, ...s }}>{children}</span>
  )
}

function Logo({ size = 'md', tone = 'paper' }) {
  const sizes = { sm: { icon: 22, text: 14 }, md: { icon: 26, text: 16 }, lg: { icon: 30, text: 19 } }
  const { icon, text } = sizes[size] || sizes.md
  const stroke = tone === 'paper' ? CREAM : INK
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <svg width={icon} height={icon} viewBox="0 0 24 24" fill="none">
        <path d="M12 2L22 12L12 22L2 12Z" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M12 6.5L17.5 12L12 17.5L6.5 12Z" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
      <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, color: stroke, letterSpacing: '-0.01em', fontSize: text }}>Travauxus</span>
    </div>
  )
}

function Button({ children, variant = 'primary', tone = 'paper', onClick, href, icon, style: s }) {
  const [hov, setHov] = useState(false)
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: 12,
    fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 700,
    letterSpacing: '0.09em', textTransform: 'uppercase',
    padding: '14px 30px', borderRadius: 2, border: 0,
    textDecoration: 'none', cursor: 'pointer',
    transition: 'opacity .2s, transform .2s, background .2s, color .2s',
    transform: hov ? 'translateY(-2px)' : 'translateY(0)',
    opacity: hov && variant === 'primary' ? 0.82 : 1,
  }
  const variants = {
    primary: { background: tone === 'paper' ? CREAM : INK, color: tone === 'paper' ? INK : CREAM },
    secondary: { background: 'transparent', color: tone === 'paper' ? INK : CREAM, border: `1px solid ${tone === 'paper' ? 'var(--on-paper-border)' : BORDER}` },
    ghost: { background: 'transparent', color: tone === 'ink' ? 'var(--on-ink-text-3)' : 'var(--on-paper-text-3)', borderBottom: `1px solid ${tone === 'ink' ? 'rgba(240,235,224,0.18)' : 'rgba(11,11,11,0.18)'}`, padding: '0 0 2px', borderRadius: 0 },
  }
  const El = href ? 'a' : 'button'
  return (
    <El href={href} onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} style={{ ...base, ...variants[variant], ...s }}>
      {children}
      {icon === 'arrow' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg>}
    </El>
  )
}

function Rule({ vis = true, delay = 0, color = BORDER, style: s }) {
  return (
    <div style={{ height: 1, background: color, transformOrigin: 'left', transform: vis ? 'scaleX(1)' : 'scaleX(0)', transition: `transform 1.5s cubic-bezier(0.16,1,0.3,1) ${delay}ms`, ...s }} />
  )
}

function Line({ children, vis, delay = 0, outline = false, weight = 700, stretch = 125, size = 'clamp(64px, 12vw, 170px)', indent = 0, color = CREAM, stroke = 1 }) {
  return (
    <div style={{ overflow: 'hidden', lineHeight: 0.86, marginLeft: indent }}>
      <div style={{
        fontFamily: 'var(--font-display)', fontStretch: `${stretch}%`,
        fontVariationSettings: `'wdth' ${stretch}, 'wght' ${weight}`,
        fontWeight: weight, fontSize: size, letterSpacing: '-0.045em',
        color: outline ? 'transparent' : color,
        WebkitTextStroke: outline ? `${stroke}px ${color}` : undefined,
        transform: vis ? 'translateY(0)' : 'translateY(108%)',
        transition: `transform 1.15s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
      }}>{children}</div>
    </div>
  )
}

function Cursor() {
  const dot = useRef(null), ring = useRef(null)
  const pos = useRef({ x: -300, y: -300 }), rp = useRef({ x: -300, y: -300 })
  const sc = useRef(1), tsc = useRef(1)
  useEffect(() => {
    const mv = e => { pos.current = { x: e.clientX, y: e.clientY } }
    const ov = e => { if (e.target.closest('a,button,[data-draggable]')) tsc.current = 2.6 }
    const ou = e => { if (e.target.closest('a,button,[data-draggable]')) tsc.current = 1 }
    document.addEventListener('mousemove', mv)
    document.addEventListener('mouseover', ov)
    document.addEventListener('mouseout', ou)
    let raf
    const loop = () => {
      rp.current.x += (pos.current.x - rp.current.x) * 0.09
      rp.current.y += (pos.current.y - rp.current.y) * 0.09
      sc.current += (tsc.current - sc.current) * 0.12
      if (dot.current) dot.current.style.transform = `translate(${pos.current.x - 3}px,${pos.current.y - 3}px)`
      if (ring.current) ring.current.style.transform = `translate(${rp.current.x - 20}px,${rp.current.y - 20}px) scale(${sc.current})`
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseover', ov); document.removeEventListener('mouseout', ou); cancelAnimationFrame(raf) }
  }, [])
  return (
    <>
      <div ref={dot} style={{ position: 'fixed', top: 0, left: 0, zIndex: 9999, pointerEvents: 'none', width: 6, height: 6, borderRadius: '50%', background: CREAM, mixBlendMode: 'difference' }} />
      <div ref={ring} style={{ position: 'fixed', top: 0, left: 0, zIndex: 9998, pointerEvents: 'none', width: 40, height: 40, borderRadius: '50%', border: `1px solid ${CREAM}`, mixBlendMode: 'difference' }} />
    </>
  )
}

function Preloader({ onDone }) {
  const [phase, setPhase] = useState(0)
  const maskPolyRef = useRef(null)
  const logoRef     = useRef(null)
  const rafRef      = useRef(null)
  const cbRef       = useRef(onDone)
  useEffect(() => { cbRef.current = onDone }, [onDone])

  // ── Timeline ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 180)   // logo fades in
    const t2 = setTimeout(() => setPhase(2), 1200)  // hold
    const t3 = setTimeout(() => setPhase(3), 1850)  // zoom through
    return () => [t1, t2, t3].forEach(clearTimeout)
  }, [])

  // ── Phase 1: logo appears (CSS transition via direct ref) ─────────────────
  useEffect(() => {
    if (phase !== 1 || !logoRef.current) return
    const el = logoRef.current
    requestAnimationFrame(() => {
      el.style.transition = 'opacity 0.95s cubic-bezier(0.16,1,0.3,1), transform 1.05s cubic-bezier(0.16,1,0.3,1)'
      el.style.opacity    = '1'
      el.style.transform  = 'translate(-50%,-50%) scale(1)'
    })
  }, [phase])

  // ── Phase 3: zoom through the logo hole (RAF) ─────────────────────────────
  useEffect(() => {
    if (phase !== 3) return
    const el   = logoRef.current
    const poly = maskPolyRef.current
    if (!el || !poly) return

    const cx = window.innerWidth  / 2
    const cy = window.innerHeight / 2
    // Diamond (45°-rotated square) covers all viewport corners when
    // its L1 radius exceeds half-width + half-height.
    const maxR    = cx + cy + 360
    const DURATION = 1020
    let t0 = null

    el.style.transition = 'none'

    const tick = (ts) => {
      if (!t0) t0 = ts
      const raw  = Math.min((ts - t0) / DURATION, 1)
      // Ease-in-quad: starts gently (hole peeks open), then accelerates
      const ease = raw * raw

      // Expand the diamond cutout in the dark overlay
      const r = maxR * ease
      poly.setAttribute('points',
        `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`)

      // Logo rushes toward camera and fades
      const scale = 1 + ease * 24
      const alpha = Math.max(0, 1 - ease * 2.6)
      el.style.transform = `translate(-50%,-50%) scale(${scale})`
      el.style.opacity   = String(alpha)

      if (raw < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        cbRef.current?.()
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [phase])

  // Stable center coords for initial SVG render (before RAF takes over)
  const cx0 = typeof window !== 'undefined' ? window.innerWidth  / 2 : 960
  const cy0 = typeof window !== 'undefined' ? window.innerHeight / 2 : 540

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, overflow: 'hidden', pointerEvents: phase >= 3 ? 'none' : 'auto' }}>

      {/* Dark overlay — the diamond hole in the mask grows during zoom */}
      <svg
        width="100%" height="100%"
        style={{ position: 'absolute', inset: 0, display: 'block' }}
      >
        <defs>
          <mask id="logo-hole-mask">
            {/* White = overlay visible (dark); black = hole (transparent) */}
            <rect width="100%" height="100%" fill="white" />
            <polygon
              ref={maskPolyRef}
              fill="black"
              points={`${cx0},${cy0} ${cx0},${cy0} ${cx0},${cy0} ${cx0},${cy0}`}
            />
          </mask>
        </defs>
        <rect width="100%" height="100%" fill={INK} mask="url(#logo-hole-mask)" />
      </svg>

      {/* Logo — cream strokes, slight multi-layer bloom, fades in then rockets out */}
      <div
        ref={logoRef}
        style={{
          position: 'absolute',
          top: '50%', left: '50%',
          transform: 'translate(-50%,-50%) scale(0.86)',
          opacity: 0,
          willChange: 'transform, opacity',
          // Three-layer bloom: tight inner glow + soft mid + wide diffuse halo
          filter: [
            'drop-shadow(0 0 3px rgba(240,235,224,0.52))',
            'drop-shadow(0 0 14px rgba(240,235,224,0.18))',
            'drop-shadow(0 0 44px rgba(240,235,224,0.07))',
          ].join(' '),
        }}
      >
        <svg width="210" height="210" viewBox="0 0 24 24" fill="none">
          {/* Outer diamond */}
          <path
            d="M12 2L22 12L12 22L2 12Z"
            stroke={CREAM}
            strokeWidth="0.62"
            strokeLinejoin="round"
          />
          {/* Inner diamond — the hole the camera flies through */}
          <path
            d="M12 6.5L17.5 12L12 17.5L6.5 12Z"
            stroke={CREAM}
            strokeWidth="0.62"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  )
}

function FloatingTicker({ t, idx, mouseX, mouseY, visible, price }) {
  const W = typeof window !== 'undefined' ? window.innerWidth  : 1280
  const H = typeof window !== 'undefined' ? window.innerHeight : 800
  const mx = mouseX / W
  const my = mouseY / H
  const tx = t.x / 100
  const ty = t.y / 100
  const pullX = (mx - tx) * (28 + (idx % 5) * 9)
  const pullY = (my - ty) * (18 + (idx % 4) * 7)
  const pct = price ?? null
  const d = pct != null ? `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%` : (t.staticD || '')
  const tone = pct != null ? (pct >= 0 ? 'pos' : 'neg') : (t.staticTone || 'mut')
  const color = tone === 'pos' ? 'var(--positive)' : tone === 'neg' ? 'var(--negative)' : MUTED
  return (
    <div style={{ position: 'absolute', top: `${t.y}%`, left: `${t.x}%`, transform: `translate3d(${pullX}px, ${pullY}px, 0)`, transition: `transform ${1.2 + (idx % 3) * 0.25}s cubic-bezier(0.16,1,0.3,1), opacity .7s ease`, opacity: visible ? 1 : 0, pointerEvents: 'none', willChange: 'transform, opacity' }}>
      <div style={{ animation: `tickerDrift 9s ease-in-out ${t.delay}s infinite`, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.24em', textTransform: 'uppercase', color: MUTED }}>{t.sym}</span>
        {d && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color, letterSpacing: '0.04em' }}>{d}</span>}
      </div>
    </div>
  )
}

function Hero({ onEnter }) {
  const [rdy, setRdy] = useState(false)
  const mouse = useMouse()
  const prices = useLivePrices()
  const sectionRef = useRef(null)
  const scrollIndRef = useRef(null)
  const [tickerState, setTickerState] = useState(() => ({
    visible: new Set([0, 1, 2, 3, 4, 5, 6]),
    positions: Object.fromEntries(TICKER_POOL.map((t, i) => [i, { x: t.x, y: t.y }])),
  }))
  const moveCountRef = useRef(0)
  const cursorPosRef = useRef({ x: typeof window !== 'undefined' ? window.innerWidth / 2 : 0, y: typeof window !== 'undefined' ? window.innerHeight / 2 : 0 })

  useEffect(() => { const t = setTimeout(() => setRdy(true), 220); return () => clearTimeout(t) }, [])

  useEffect(() => {
    let raf = null
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        const p = Math.min(window.scrollY / (window.innerHeight || 1), 1)
        if (sectionRef.current) sectionRef.current.style.opacity = String(1 - p * 0.4)
        if (scrollIndRef.current) scrollIndRef.current.style.opacity = String(Math.max(0, 1 - p * 2))
        raf = null
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { window.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf) }
  }, [])

  useEffect(() => {
    const onMove = (e) => {
      cursorPosRef.current = { x: e.clientX, y: e.clientY }
      moveCountRef.current++
      if (moveCountRef.current % 70 !== 0) return
      const W = window.innerWidth, H = window.innerHeight
      const cx = cursorPosRef.current.x, cy = cursorPosRef.current.y
      setTickerState(prev => {
        const visible = [...prev.visible]
        const hidden = TICKER_POOL.map((_, i) => i).filter(i => !prev.visible.has(i))
        if (hidden.length === 0) return prev
        const removeIdx = visible[Math.floor(Math.random() * visible.length)]
        const addIdx = hidden[Math.floor(Math.random() * hidden.length)]
        const spread = 140
        const nx = Math.max(4, Math.min(88, ((cx + (Math.random() - 0.5) * spread) / W) * 100))
        const ny = Math.max(8, Math.min(82, ((cy + (Math.random() - 0.5) * spread) / H) * 100))
        const next = new Set(prev.visible)
        next.delete(removeIdx)
        next.add(addIdx)
        return { visible: next, positions: { ...prev.positions, [addIdx]: { x: nx, y: ny } } }
      })
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  return (
    <section ref={sectionRef} style={{ position: 'relative', minHeight: '100vh', background: INK, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '0 clamp(20px,4vw,48px) 60px', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 60, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 clamp(20px,4vw,48px)', zIndex: 10 }}>
        <Logo size="sm" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
          <Button variant="primary" tone="paper" onClick={onEnter}>Get started</Button>
        </div>
      </div>

      {/* Founder quote — upper right, shifted toward center */}
      <div style={{
        position: 'absolute', top: '18%', right: 'clamp(60px,10vw,160px)',
        textAlign: 'right', pointerEvents: 'none', zIndex: 2,
        opacity: rdy ? 1 : 0, transition: 'opacity .8s ease 1.0s',
        maxWidth: 420,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 14, marginBottom: 18 }}>
          <Tag>Market Intelligence</Tag>
          <div style={{ width: 28, height: 1, background: BORDER }} />
          <Tag>Vol. 01 · Est. 2026</Tag>
        </div>
        <blockquote style={{ margin: 0 }}>
          <p style={{ fontFamily: 'var(--font-accent-serif)', fontStyle: 'italic', fontWeight: 400, fontSize: 'clamp(20px, 2.2vw, 32px)', lineHeight: 1.35, color: CREAM, margin: 0, letterSpacing: '0.01em' }}>
            "We believe markets should be legible. That every investor — not just the ones in glass towers — deserves the same fluency."
          </p>
          <footer style={{ marginTop: 16, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.28em', textTransform: 'uppercase', color: MUTED }}>
            — Om Poper, Co-Founder
          </footer>
        </blockquote>
      </div>

      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {TICKER_POOL.map((t, i) => (
          <FloatingTicker key={i} t={{ ...t, ...tickerState.positions[i] }} idx={i} mouseX={mouse.x} mouseY={mouse.y} visible={tickerState.visible.has(i)} price={prices[t.sym]} />
        ))}
      </div>

      <div style={{ position: 'absolute', left: 22, top: '50%', transform: 'translateY(-50%) rotate(-90deg)', transformOrigin: 'left top', opacity: rdy ? 1 : 0, transition: 'opacity .8s ease 1.1s' }}>
        <Tag style={{ letterSpacing: '0.38em' }}>An archive of the present →</Tag>
      </div>

      <div style={{ position: 'relative', zIndex: 2, transform: `translate3d(${mouse.nx * 14}px, ${mouse.ny * 8}px, 0)`, transition: 'transform .8s cubic-bezier(0.16,1,0.3,1)' }}>
        <Line vis={rdy} delay={0}>THE</Line>
        <Line vis={rdy} delay={80} indent="5vw" stretch={125}>MARKET,</Line>
        <Rule vis={rdy} delay={280} style={{ margin: '14px 0 18px' }} />
        <Line vis={rdy} delay={160} outline indent="13vw" stretch={120} stroke={1.2}>EXPLAINED.</Line>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 48, flexWrap: 'wrap', gap: 24, position: 'relative', zIndex: 2 }}>
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: 14, lineHeight: 1.9, color: MUTED, maxWidth: 300, margin: 0, opacity: rdy ? 1 : 0, transform: rdy ? 'none' : 'translateY(16px)', transition: 'opacity .9s ease .7s, transform .9s ease .7s' }}>AI news feed · stock watchlist · government<br />trades · price alerts · paper trading.<br />All in plain English.</p>
        <div style={{ opacity: rdy ? 1 : 0, transition: 'opacity .9s ease .8s' }}>
          <Button variant="primary" tone="paper" icon="arrow" onClick={onEnter}>Get started free</Button>
        </div>
      </div>

      <div ref={scrollIndRef} style={{ position: 'absolute', bottom: 24, right: 56, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, opacity: rdy ? 1 : 0, transition: 'opacity .6s' }}>
        <Tag>Scroll</Tag>
        <div style={{ width: 1, height: 44, background: `linear-gradient(to bottom, transparent, ${MUTED})`, animation: 'drip 2.4s ease-in-out infinite' }} />
      </div>
    </section>
  )
}

function DualMarquee() {
  return (
    <div style={{ background: CREAM, padding: '14px 0 13px', position: 'relative', zIndex: 2 }}>
      <div style={{ overflow: 'hidden', padding: '4px 0' }}>
        <div style={{ display: 'flex', animation: 'marquee 32s linear infinite', width: 'max-content', willChange: 'transform' }}>
          {[...Array(3)].flatMap((_, k) =>
            ['Real-time intelligence', 'AI-powered', 'Portfolio impact', 'Market signals', 'Plain English', 'Act with confidence', 'No jargon', 'Urgency scoring']
              .map((w, i) => (
                <span key={`a${k}-${i}`} style={{ fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(11,11,11,0.3)', whiteSpace: 'nowrap', padding: '0 26px' }}>
                  {w}<span style={{ marginLeft: 26, opacity: 0.2 }}>×</span>
                </span>
              ))
          )}
        </div>
      </div>
      <div style={{ overflow: 'hidden', padding: '4px 0', marginTop: 6 }}>
        <div style={{ display: 'flex', animation: 'marqueeRev 38s linear infinite', width: 'max-content', willChange: 'transform' }}>
          {[...Array(3)].flatMap((_, k) =>
            ['AAPL  +2.40%', 'NVDA  −3.18%', 'MSFT  +0.45%', 'BTC  $42,180', 'GOLD  +1.20%', 'TSLA  −1.05%', 'CPI  3.4%', 'FOMC NOV 22', 'SPY  +0.18%', 'QQQ  +0.42%']
              .map((w, i) => (
                <span key={`b${k}-${i}`} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', color: 'rgba(11,11,11,0.42)', whiteSpace: 'nowrap', padding: '0 26px' }}>
                  {w}<span style={{ marginLeft: 26, opacity: 0.18 }}>·</span>
                </span>
              ))
          )}
        </div>
      </div>
    </div>
  )
}

const LANG_ROWS = [
  { text: 'Le marché est en mouvement — Les signaux arrivent trop vite — Aucune donnée ne vous échappe — Intelligence du marché — Analyse en temps réel — ', dir: 1,  dur: 42, sz: 13,  wt: 400, font: 'sans', op: 0.48 },
  { text: '市場が動いている — シグナルが速すぎる — リアルタイム分析 — 市場情報 — 人工知能 — 投資家向けの分析 — ', dir: -1, dur: 34, sz: 13,  wt: 400, font: 'sans', op: 0.44 },
  { text: 'MARCHÉ LIBRE — ', dir: 1, dur: 60, sz: 185, wt: 700, font: 'display', stretch: 125, op: 0.10 },
  { text: 'AAPL +2.40% — NVDA −3.18% — BTC $42,180 — GOLD +1.20% — TSLA −1.05% — QQQ +0.42% — META +1.73% — SPY +0.18% — AMZN +0.98% — MSFT +0.61% — ', dir: -1, dur: 24, sz: 11, wt: 500, font: 'mono', op: 0.36 },
  { text: 'Der Markt bewegt sich zu schnell — Keine Daten entgehen dir — Echtzeit-Analyse — Künstliche Intelligenz — Marktintelligenz — ', dir: 1,  dur: 40, sz: 13,  wt: 400, font: 'sans', op: 0.48 },
  { text: '市场正在运动 — 信号来得太快了 — 实时分析 — 人工智能 — 市场情报 — 投资者数据分析 — ', dir: -1, dur: 36, sz: 13,  wt: 400, font: 'sans', op: 0.44 },
  { text: 'El mercado se mueve — Las señales llegan demasiado rápido — Ningún dato se te escapa — La inteligencia del mercado — ', dir: 1,  dur: 44, sz: 13,  wt: 400, font: 'sans', op: 0.48 },
  { text: 'INTELLIGENCE — ', dir: -1, dur: 72, sz: 225, wt: 700, font: 'display', stretch: 125, op: 0.085 },
  { text: '시장이 움직이고 있습니다 — 신호가 너무 빠르게 옵니다 — 실시간 분석 — 인공 지능 — 시장 정보 — ', dir: 1,  dur: 48, sz: 13,  wt: 400, font: 'sans', op: 0.44 },
  { text: 'Il mercato si muove velocemente — I segnali arrivano troppo presto — Nessun dato ti sfugge — Intelligenza artificiale — ', dir: -1, dur: 38, sz: 13,  wt: 400, font: 'sans', op: 0.48 },
  { text: 'О рынке в реальном времени — Искусственный интеллект — Никакие данные не ускользнут — Финансовая аналитика — ', dir: 1,  dur: 43, sz: 13,  wt: 400, font: 'sans', op: 0.44 },
  { text: '市場 — MARCHÉ — MARKT — 시장 — MERCADO — MARKET — РЫНОК — ', dir: -1, dur: 30, sz: 36,  wt: 600, font: 'display', stretch: 105, op: 0.20 },
  { text: 'Every signal — Every trade — Every move — Every market — Plain English — No jargon — Act with confidence — Real-time intelligence — ', dir: 1,  dur: 36, sz: 13,  wt: 400, font: 'sans', op: 0.48 },
  { text: 'SIGNAL — ', dir: 1, dur: 88, sz: 275, wt: 700, font: 'display', stretch: 125, op: 0.065 },
  { text: 'Marché libre — Données en direct — Cours en temps réel — Portfolio intelligence — Signaux du marché — Investisseurs avisés — ', dir: -1, dur: 45, sz: 13,  wt: 400, font: 'sans', op: 0.48 },
]

function LanguageWall() {
  const ref = useRef(null)
  const [vis, setVis] = useState(false)
  useEffect(() => {
    const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVis(true) }, { threshold: 0.02 })
    if (ref.current) o.observe(ref.current)
    return () => o.disconnect()
  }, [])
  return (
    <section ref={ref} style={{ background: CREAM, overflow: 'hidden', position: 'relative', padding: '0', contain: 'layout paint' }}>
      <div style={{ position: 'absolute', top: 14, left: 'clamp(20px,4vw,48px)', zIndex: 10 }}>
        <Tag tone="dark" style={{ letterSpacing: '0.32em' }}>§ 02 — The signal</Tag>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {LANG_ROWS.map((row, i) => {
          const fontFamily = row.font === 'display' ? 'var(--font-display)' : row.font === 'mono' ? 'var(--font-mono)' : 'var(--font-sans)'
          const varSettings = row.font === 'display' && row.stretch ? { fontVariationSettings: `'wdth' ${row.stretch}, 'wght' ${row.wt}`, fontStretch: `${row.stretch}%` } : {}
          const anim = row.dir === 1 ? 'marquee' : 'marqueeRev'
          const lh = row.sz >= 100 ? 0.84 : 1.0
          const ls = row.font === 'mono' ? '0.06em' : row.sz >= 100 ? '-0.045em' : '-0.01em'
          return (
            <div key={i} style={{ overflow: 'hidden', lineHeight: lh }}>
              <div style={{ display: 'flex', animation: vis ? `${anim} ${row.dur}s linear infinite` : 'none', width: 'max-content', opacity: row.op, willChange: 'transform' }}>
                {[...Array(3)].map((_, k) => (
                  <span key={k} style={{ fontFamily, fontSize: row.sz, fontWeight: row.wt, color: INK, whiteSpace: 'nowrap', letterSpacing: ls, paddingRight: row.sz >= 100 ? '0.4em' : '2.5em', ...varSettings }}>{row.text}</span>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}



const PHYS_ITEMS = [
  // ── ghosted big words ──────────────────────────────────────────────────────
  { type: 'big',   v: 'NVIDIA',      col: 'rgba(11,11,11,0.07)', sz: 92,  wt: 700 },
  { type: 'big',   v: 'APPLE',       col: 'rgba(11,11,11,0.07)', sz: 76,  wt: 700 },
  { type: 'big',   v: 'SIGNAL',      col: 'rgba(11,11,11,0.05)', sz: 64,  wt: 700 },
  { type: 'big',   v: 'TESLA',       col: 'rgba(11,11,11,0.06)', sz: 70,  wt: 700 },
  { type: 'big',   v: 'META',        col: 'rgba(11,11,11,0.05)', sz: 58,  wt: 700 },
  { type: 'big',   v: 'MARKET',      col: 'rgba(11,11,11,0.04)', sz: 52,  wt: 700 },
  { type: 'big',   v: 'BITCOIN',     col: 'rgba(11,11,11,0.06)', sz: 80,  wt: 700 },
  { type: 'big',   v: 'GOOGLE',      col: 'rgba(11,11,11,0.05)', sz: 66,  wt: 700 },
  { type: 'big',   v: 'AMAZON',      col: 'rgba(11,11,11,0.04)', sz: 54,  wt: 700 },
  // ── price changes ──────────────────────────────────────────────────────────
  { type: 'price', v: '+2.40%',      col: 'var(--moss-500)'                       },
  { type: 'price', v: '−3.18%',      col: 'var(--clay-500)'                       },
  { type: 'price', v: '$192.40',     col: 'rgba(11,11,11,0.55)'                   },
  { type: 'price', v: '+1.73%',      col: 'var(--moss-500)'                       },
  { type: 'price', v: '−1.05%',      col: 'var(--clay-500)'                       },
  { type: 'price', v: '+0.61%',      col: 'var(--moss-500)'                       },
  { type: 'price', v: '−0.44%',      col: 'var(--clay-500)'                       },
  { type: 'price', v: '$408.20',     col: 'rgba(11,11,11,0.55)'                   },
  { type: 'price', v: '+4.21%',      col: 'var(--moss-500)'                       },
  { type: 'price', v: '−2.07%',      col: 'var(--clay-500)'                       },
  { type: 'price', v: '+5.32%',      col: 'var(--moss-500)'                       },
  { type: 'price', v: '−4.71%',      col: 'var(--clay-500)'                       },
  { type: 'price', v: '+0.29%',      col: 'var(--moss-500)'                       },
  { type: 'price', v: '−2.44%',      col: 'var(--clay-500)'                       },
  { type: 'price', v: '$284.50',     col: 'rgba(11,11,11,0.55)'                   },
  { type: 'price', v: '+3.15%',      col: 'var(--moss-500)'                       },
  { type: 'price', v: '−1.88%',      col: 'var(--clay-500)'                       },
  // ── action / signal tags ──────────────────────────────────────────────────
  { type: 'tag',   v: 'ACT NOW'                                                   },
  { type: 'tag',   v: 'WATCH'                                                     },
  { type: 'tag',   v: 'FOMC'                                                      },
  { type: 'tag',   v: 'CPI 3.4%'                                                  },
  { type: 'tag',   v: 'EARNINGS'                                                  },
  { type: 'tag',   v: 'BEARISH'                                                   },
  { type: 'tag',   v: 'BULLISH'                                                   },
  { type: 'tag',   v: 'IPO'                                                       },
  { type: 'tag',   v: 'BUY'                                                       },
  { type: 'tag',   v: 'SELL'                                                      },
  { type: 'tag',   v: 'HOLD'                                                      },
  { type: 'tag',   v: 'SHORT'                                                     },
  { type: 'tag',   v: 'LONG'                                                      },
  { type: 'tag',   v: 'RALLY'                                                     },
  { type: 'tag',   v: 'RATE HIKE'                                                 },
  { type: 'tag',   v: 'SPLIT'                                                     },
  // ── data labels ────────────────────────────────────────────────────────────
  { type: 'label', v: 'NOV·22'                                                    },
  { type: 'label', v: 'BTC $42,180'                                               },
  { type: 'label', v: 'QQQ +0.42%'                                                },
  { type: 'label', v: 'TSLA −1.05%'                                               },
  { type: 'label', v: 'MSFT +0.61%'                                               },
  { type: 'label', v: 'SPY +0.18%'                                                },
  { type: 'label', v: 'GOLD +1.20%'                                               },
  { type: 'label', v: 'JPM −0.44%'                                                },
  { type: 'label', v: 'AMZN +0.98%'                                               },
  { type: 'label', v: 'AAPL $192.40'                                              },
  { type: 'label', v: 'META +1.73%'                                               },
  { type: 'label', v: 'ETH $2,840'                                                },
  { type: 'label', v: 'GOOGL +0.82%'                                              },
  { type: 'label', v: 'DXY 104.2'                                                 },
  { type: 'label', v: 'OIL $78.40'                                                },
  { type: 'label', v: '10Y 4.32%'                                                 },
  { type: 'label', v: 'VIX 16.2'                                                  },
  { type: 'label', v: 'SOL +4.21%'                                                },
  { type: 'label', v: 'XOM +0.33%'                                                },
  { type: 'label', v: 'UNH −1.12%'                                                },
  { type: 'label', v: 'NFLX +2.88%'                                               },
  { type: 'label', v: 'AMD +3.14%'                                                },
  { type: 'label', v: 'EUR/USD 1.08'                                              },
  { type: 'label', v: 'GBP/USD 1.27'                                              },
  { type: 'label', v: 'USD/JPY 149.2'                                             },
  { type: 'label', v: '2Y 5.01%'                                                  },
  { type: 'label', v: '30Y 4.45%'                                                 },
  { type: 'label', v: 'SILVER $23.4'                                              },
  { type: 'label', v: 'CRUDE +0.82%'                                              },
  { type: 'label', v: 'WHEAT 580'                                                 },
  { type: 'label', v: 'CORN 445'                                                  },
  { type: 'label', v: 'RUSSELL +0.33%'                                            },
  { type: 'label', v: 'DAX +1.20%'                                                },
  { type: 'label', v: 'NIKKEI −0.80%'                                             },
  { type: 'label', v: 'FTSE +0.55%'                                               },
  { type: 'label', v: 'CAC −0.34%'                                                },
  { type: 'label', v: 'PLTR +7.44%'                                               },
  { type: 'label', v: 'INTC −2.30%'                                               },
  { type: 'label', v: 'BA −1.50%'                                                 },
  { type: 'label', v: 'GS +0.90%'                                                 },
  { type: 'label', v: 'V +1.11%'                                                  },
  { type: 'label', v: 'MA +0.88%'                                                 },
  { type: 'label', v: 'PYPL −3.20%'                                               },
  { type: 'label', v: 'COIN +8.15%'                                               },
  { type: 'label', v: 'DOGE $0.12'                                                },
  { type: 'label', v: 'XRP $0.63'                                                 },
  { type: 'label', v: 'CRM +1.22%'                                                },
  { type: 'label', v: 'SNOW −2.10%'                                               },
  { type: 'label', v: 'UBER +3.44%'                                               },
  { type: 'label', v: 'MCD +0.72%'                                                },
  { type: 'label', v: 'KO +0.44%'                                                 },
  { type: 'label', v: 'PEP +0.38%'                                                },
  { type: 'label', v: 'CVX −0.91%'                                                },
  { type: 'label', v: 'WMT +1.02%'                                                },
  { type: 'label', v: 'DIS −0.65%'                                                },
  { type: 'label', v: 'SBUX +1.55%'                                               },
  { type: 'label', v: 'ABNB +2.30%'                                               },
]

function PhysicsConvergence() {
  const isTouchDevice = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
  const sectionRef = useRef(null)
  const p = useElementProgress(sectionRef)
  const containerRef = useRef(null)
  const titleRef = useRef(null)
  const itemRefs = useRef([])
  const [triggered, setTriggered] = useState(false)
  const cursorRef = useRef({ x: 0, y: 0 })
  const cleanupRef = useRef(null)

  // Trigger once when section enters viewport
  useEffect(() => {
    if (p > 0.05 && !triggered) setTriggered(true)
  }, [p, triggered])

  // Track cursor globally
  useEffect(() => {
    const mv = (e) => { cursorRef.current = { x: e.clientX, y: e.clientY } }
    window.addEventListener('mousemove', mv, { passive: true })
    return () => window.removeEventListener('mousemove', mv)
  }, [])

  // Init Matter.js once triggered (skip on touch devices)
  useEffect(() => {
    if (!triggered || isTouchDevice) return

    let rafId = null

    const initPhysics = (Matter) => {
      const { Engine, Bodies, Body, Composite, Mouse, MouseConstraint } = Matter
      const container = containerRef.current
      if (!container) return

      const W = container.offsetWidth || window.innerWidth
      const H = container.offsetHeight || window.innerHeight

      const engine = Engine.create({ positionIterations: 6, velocityIterations: 6 })
      engine.gravity.y = 3.2

      // Create a body per item using element dimensions
      const mBodies = PHYS_ITEMS.map((item, i) => {
        const el = itemRefs.current[i]
        const bw = (el ? el.offsetWidth : 80) + 28
        const bh = (el ? el.offsetHeight : 34) + 18
        // Stagger spawn positions across top
        const spawnX = W * 0.08 + (i / PHYS_ITEMS.length) * W * 0.84 + (Math.random() - 0.5) * 80
        const spawnY = -80 - Math.random() * H * 0.9
        return Bodies.rectangle(spawnX, spawnY, bw, bh, {
          restitution: 0.08,
          friction: 0.6,
          frictionAir: 0.012,
          density: 0.004,
          angle: (Math.random() - 0.5) * 0.45,
        })
      })

      // Static boundaries
      const floor = Bodies.rectangle(W / 2, H * 0.87, W * 4, 50, { isStatic: true, friction: 0.5 })
      const wallL = Bodies.rectangle(-25, H / 2, 50, H * 4, { isStatic: true })
      const wallR = Bodies.rectangle(W + 25, H / 2, 50, H * 4, { isStatic: true })
      Composite.add(engine.world, [...mBodies, floor, wallL, wallR])

      // Static body matching the centered title — items bounce/slide off it
      requestAnimationFrame(() => {
        const titleEl = titleRef.current
        if (!titleEl) return
        const cRect = container.getBoundingClientRect()
        const tRect = titleEl.getBoundingClientRect()
        if (tRect.width === 0) return
        const tx = tRect.left - cRect.left + tRect.width / 2
        const ty = tRect.top - cRect.top + tRect.height / 2
        const titleBody = Bodies.rectangle(tx, ty, tRect.width + 48, tRect.height + 20, {
          isStatic: true,
          friction: 0.02,
          frictionStatic: 0.04,
          restitution: 0.3,
          label: 'title',
        })
        Composite.add(engine.world, titleBody)
      })

      // Mouse constraint — elastic, not stiff
      const mouse = Mouse.create(container)
      // Remove Matter.js wheel listeners so the page can still scroll normally
      mouse.element.removeEventListener('mousewheel', mouse.mousewheel)
      mouse.element.removeEventListener('DOMMouseScroll', mouse.mousewheel)
      const mc = MouseConstraint.create(engine, {
        mouse,
        constraint: { stiffness: 0.06, damping: 0.12, render: { visible: false } },
      })
      Composite.add(engine.world, mc)

      // RAF loop: update engine + sync DOM positions
      let prev = performance.now()
      const tick = (now) => {
        const delta = Math.min(now - prev, 50)
        prev = now

        // Soft cursor influence — repel nearby bodies gently
        const rect = container.getBoundingClientRect()
        const cx = cursorRef.current.x - rect.left
        const cy = cursorRef.current.y - rect.top
        mBodies.forEach(b => {
          const dx = b.position.x - cx
          const dy = b.position.y - cy
          const dist = Math.hypot(dx, dy)
          if (dist < 140 && dist > 1) {
            const f = 0.000065 * (1 - dist / 140)
            Body.applyForce(b, b.position, { x: (dx / dist) * f, y: (dy / dist) * f })
          }
        })

        Engine.update(engine, delta)

        // Sync DOM elements to physics positions
        mBodies.forEach((b, i) => {
          const el = itemRefs.current[i]
          if (!el) return
          const isDragging = mc.body === b
          el.style.left = b.position.x + 'px'
          el.style.top  = b.position.y + 'px'
          el.style.transform = `translate(-50%, -50%) rotate(${b.angle}rad)`
          if (isDragging) {
            el.style.filter    = 'drop-shadow(0 18px 36px rgba(11,11,11,0.28))'
            el.style.scale     = '1.08'
            el.style.zIndex    = '20'
            el.style.cursor    = 'grabbing'
          } else {
            el.style.filter    = ''
            el.style.scale     = '1'
            el.style.zIndex    = ''
            el.style.cursor    = 'grab'
          }
        })

        rafId = requestAnimationFrame(tick)
      }
      rafId = requestAnimationFrame(tick)

      cleanupRef.current = () => {
        cancelAnimationFrame(rafId)
        Engine.clear(engine)
      }
    }

    if (window.Matter) {
      initPhysics(window.Matter)
    } else {
      const s = document.createElement('script')
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/matter-js/0.19.0/matter.min.js'
      s.onload = () => { if (window.Matter) initPhysics(window.Matter) }
      s.onerror = () => console.warn('Matter.js CDN load failed')
      document.head.appendChild(s)
    }

    return () => { cleanupRef.current?.() }
  }, [triggered])

  const renderItem = (f, i) => {
    const base = {
      position: 'absolute', left: '50%', top: '-200px',
      transform: 'translate(-50%, -50%)',
      cursor: 'grab', userSelect: 'none', WebkitUserSelect: 'none',
      willChange: 'transform, left, top',
    }
    if (f.type === 'big') return (
      <span key={i} ref={el => { itemRefs.current[i] = el }} style={{ ...base, fontFamily: 'var(--font-display)', fontVariationSettings: `'wdth' 125, 'wght' ${f.wt}`, fontStretch: '125%', fontWeight: f.wt, fontSize: f.sz, color: f.col, letterSpacing: '-0.05em', lineHeight: 0.82, whiteSpace: 'nowrap' }}>{f.v}</span>
    )
    if (f.type === 'price') return (
      <span key={i} ref={el => { itemRefs.current[i] = el }} style={{ ...base, fontFamily: 'var(--font-mono)', fontSize: 26, fontWeight: 600, color: f.col, whiteSpace: 'nowrap' }}>{f.v}</span>
    )
    if (f.type === 'tag') return (
      <span key={i} ref={el => { itemRefs.current[i] = el }} style={{ ...base, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.24em', textTransform: 'uppercase', padding: '6px 12px', border: '1px solid rgba(11,11,11,0.24)', color: INK, background: CREAM, whiteSpace: 'nowrap' }}>{f.v}</span>
    )
    if (f.type === 'label') return (
      <span key={i} ref={el => { itemRefs.current[i] = el }} style={{ ...base, fontFamily: 'var(--font-mono)', fontSize: 13, color: 'rgba(11,11,11,0.44)', letterSpacing: '0.12em', whiteSpace: 'nowrap' }}>{f.v}</span>
    )
    return null
  }

  if (isTouchDevice) {
    return (
      <section style={{ background: CREAM, padding: '80px 24px 60px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ marginBottom: 40 }}>
          <Tag tone="dark" style={{ letterSpacing: '0.32em' }}>§ 06 — From chaos, signal</Tag>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          {PHYS_ITEMS.filter(f => f.type === 'tag' || f.type === 'price' || f.type === 'label').map((f, i) => (
            <span key={i} style={{
              fontFamily: 'var(--font-mono)',
              fontSize: f.type === 'price' ? 20 : f.type === 'tag' ? 10 : 12,
              fontWeight: f.type === 'price' ? 600 : 500,
              padding: f.type === 'tag' ? '5px 10px' : '0',
              border: f.type === 'tag' ? '1px solid rgba(11,11,11,0.22)' : 'none',
              color: f.col || (f.type === 'tag' ? INK : 'rgba(11,11,11,0.44)'),
              letterSpacing: f.type === 'tag' ? '0.18em' : '0.08em',
              textTransform: f.type === 'tag' ? 'uppercase' : 'none',
              whiteSpace: 'nowrap',
            }}>{f.v}</span>
          ))}
        </div>
      </section>
    )
  }

  return (
    <section ref={sectionRef} style={{ background: CREAM, height: '100vh', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 48, left: 'clamp(20px,4vw,48px)', zIndex: 10 }}>
        <Tag tone="dark" style={{ letterSpacing: '0.32em' }}>§ 06 — From chaos, signal</Tag>
      </div>
      <div style={{ position: 'absolute', top: 48, right: 'clamp(20px,4vw,48px)', zIndex: 10, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgba(11,11,11,0.36)', letterSpacing: '0.18em' }}>
        Drag · Play
      </div>

      <div ref={containerRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
        {PHYS_ITEMS.map((f, i) => renderItem(f, i))}
      </div>

      {/* Centered title — physics items bounce off this */}
      <div ref={titleRef} style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 5, pointerEvents: 'none',
        textAlign: 'center', lineHeight: 0.86,
      }}>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontVariationSettings: "'wdth' 125, 'wght' 700",
          fontStretch: '125%', fontWeight: 700,
          fontSize: 'clamp(52px, 8.5vw, 140px)',
          color: INK, letterSpacing: '-0.048em',
          opacity: 0.82, whiteSpace: 'nowrap',
        }}>SIGNAL FROM</div>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontVariationSettings: "'wdth' 125, 'wght' 700",
          fontStretch: '125%', fontWeight: 700,
          fontSize: 'clamp(52px, 8.5vw, 140px)',
          color: 'transparent',
          WebkitTextStroke: `1.5px ${INK}`,
          letterSpacing: '-0.048em',
          opacity: 0.55, whiteSpace: 'nowrap',
        }}>THE NOISE.</div>
      </div>
    </section>
  )
}

/* ── Radial reveal overlay ────────────────────────────────────────────────── */
function RadialRevealOverlay({ trigger }) {
  const canvasRef = useRef(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const parent = canvas.parentElement
    if (!parent) return
    const W = parent.offsetWidth || 340
    const H = parent.offsetHeight || 260
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')
    const cx = W / 2
    const cy = H / 2
    const maxR = Math.hypot(W, H) / 2 + 4
    let rafId = null
    let start = null
    const DURATION = 520

    const tick = (ts) => {
      if (!start) start = ts
      const t = Math.min((ts - start) / DURATION, 1)
      const eased = 1 - Math.pow(1 - t, 2.6)
      const r = eased * maxR

      ctx.clearRect(0, 0, W, H)
      ctx.globalCompositeOperation = 'source-over'
      ctx.fillStyle = 'rgb(11,11,11)'
      ctx.fillRect(0, 0, W, H)

      ctx.globalCompositeOperation = 'destination-out'
      const grad = ctx.createRadialGradient(cx, cy, Math.max(0, r - 28), cx, cy, r)
      grad.addColorStop(0, 'rgba(0,0,0,1)')
      grad.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, W, H)

      if (t < 1) rafId = requestAnimationFrame(tick)
      else ctx.clearRect(0, 0, W, H)
    }

    rafId = requestAnimationFrame(tick)
    return () => { if (rafId) cancelAnimationFrame(rafId) }
  }, [trigger])
  return (
    <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none' }} />
  )
}


/* ── Features data ───────────────────────────────────────────────────────── */
const FEATURES = [
  {
    id: 'feed', n: '01', title: 'AI NEWS FEED', tag: 'Daily · AI-scored',
    hint: [
      { text: 'ACT NOW', color: 'var(--urgency-act)' },
      { text: 'WATCH',   color: 'var(--urgency-watch)' },
      { text: 'LOW',     color: 'var(--urgency-low)' },
    ],
    body: 'Every story scored Act Now, Watch, or Low. Know which news actually moves your holdings before the market reacts.',
  },
  {
    id: 'watch', n: '02', title: 'STOCK WATCHLIST', tag: 'Live data',
    hint: [
      { text: 'AAPL +2.40%', color: 'var(--positive)' },
      { text: 'NVDA −3.18%', color: 'var(--negative)' },
    ],
    body: "Track any ticker with real-time prices, TradingView charts, and one-tap AI context on why it's moving.",
  },
  {
    id: 'gov', n: '03', title: 'GOV TRADES', tag: 'STOCK Act',
    hint: [
      { text: 'PELOSI',     color: MUTED },
      { text: 'NVDA · BUY', color: 'var(--positive)' },
      { text: '$500K',      color: MUTED },
    ],
    body: "Congressional stock trades the moment they're disclosed — see what senators and representatives are actually buying.",
  },
  {
    id: 'alerts', n: '04', title: 'PRICE ALERTS', tag: 'Instant',
    hint: [
      { text: '◉ AAPL > $200', color: 'var(--moss-200)' },
      { text: 'TRIGGERED',     color: 'var(--positive)' },
    ],
    body: 'Set a target price on any stock or crypto. Checked every five minutes — marked triggered the instant conditions are met.',
  },
  {
    id: 'comm', n: '05', title: 'COMMODITIES', tag: 'Macro',
    hint: [
      { text: 'GOLD +1.20%', color: 'var(--positive)' },
      { text: 'OIL −0.82%',  color: 'var(--negative)' },
    ],
    body: 'Gold, crude oil, gas, wheat — with AI-generated context on why prices are moving today, not just the number.',
  },
  {
    id: 'paper', n: '06', title: 'PAPER TRADING', tag: 'Risk-free',
    hint: [
      { text: '#1 LEADERBOARD', color: 'var(--ochre-300)' },
      { text: 'P&L +$117',      color: 'var(--positive)' },
    ],
    body: 'Start with $500 virtual cash. Buy, sell, set stop-losses and take-profit orders. Compete on the live global leaderboard.',
  },
]

/* ── Features section — editorial row layout ─────────────────────────────── */
function FeaturesSection() {
  const [active, setActive] = useState(null)
  const tooltipRef = useRef(null)
  const isMobile = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

  useEffect(() => {
    let raf = null
    const onMove = (e) => {
      if (!tooltipRef.current) return
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = null
        if (!tooltipRef.current) return
        const vw = window.innerWidth, vh = window.innerHeight
        const tw = 340, th = 220
        let x = e.clientX + 32
        let y = e.clientY - 32
        if (x + tw > vw - 20) x = e.clientX - tw - 32
        if (y < 20) y = 20
        if (y + th > vh - 20) y = vh - th - 20
        tooltipRef.current.style.left = x + 'px'
        tooltipRef.current.style.top = y + 'px'
      })
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => { window.removeEventListener('mousemove', onMove); if (raf) cancelAnimationFrame(raf) }
  }, [])

  const activeFeature = FEATURES.find(f => f.id === active)

  return (
    <section style={{ background: INK, borderTop: `1px solid ${BORDER}`, position: 'relative' }}>
      {/* Header */}
      <div style={{ padding: '64px clamp(20px,4vw,48px) 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <Tag style={{ letterSpacing: '0.32em' }}>§ 03 — What's inside</Tag>
          <div style={{ marginTop: 14, fontFamily: 'var(--font-display)', fontVariationSettings: "'wdth' 125, 'wght' 700", fontStretch: '125%', fontWeight: 700, fontSize: 'clamp(36px,6vw,84px)', color: CREAM, letterSpacing: '-0.045em', lineHeight: 0.9 }}>
            SIX TOOLS.<br />ONE PLATFORM.
          </div>
        </div>
        {!isMobile && (
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', color: MUTED, margin: 0 }}>Hover a row →</p>
        )}
      </div>

      {/* Editorial rows */}
      <div style={{ marginTop: 48, borderTop: `1px solid ${BORDER}` }}>
        {FEATURES.map((f) => {
          const isActive = active === f.id
          return (
            <article
              key={f.id}
              onMouseEnter={() => !isMobile && setActive(f.id)}
              onMouseLeave={() => !isMobile && setActive(null)}
              style={{
                display: 'flex', alignItems: 'center', flexWrap: 'wrap',
                gap: '2vw',
                padding: '26px clamp(20px,4vw,48px)',
                borderBottom: `1px solid ${BORDER}`,
                background: isActive ? 'rgba(240,235,224,0.022)' : 'transparent',
                transition: 'background 0.4s cubic-bezier(0.16,1,0.3,1)',
                cursor: 'crosshair',
              }}
            >
              {/* Index number */}
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 500,
                letterSpacing: '0.28em',
                color: isActive ? MUTED : 'rgba(240,235,224,0.22)',
                flexShrink: 0, minWidth: 22,
                transition: 'color 0.3s',
              }}>{f.n}</span>

              {/* Feature name — large editorial display type */}
              <span style={{
                fontFamily: 'var(--font-display)',
                fontVariationSettings: "'wdth' 125, 'wght' 700",
                fontStretch: '125%', fontWeight: 700,
                fontSize: 'clamp(22px, 3.6vw, 58px)',
                color: isActive ? CREAM : 'rgba(240,235,224,0.58)',
                letterSpacing: '-0.04em', lineHeight: 0.92,
                flex: '0 0 auto',
                transition: 'color 0.35s cubic-bezier(0.16,1,0.3,1)',
              }}>{f.title}</span>

              {/* Expanding rule */}
              <div style={{
                flex: 1, height: 1, minWidth: 16,
                background: isActive ? 'rgba(240,235,224,0.14)' : BORDER,
                transition: 'background 0.4s',
              }} />

              {/* Raw typographic data hint */}
              <div style={{
                display: 'flex', gap: 18, alignItems: 'center', flexShrink: 0,
                opacity: isActive ? 1 : 0.42,
                transition: 'opacity 0.35s',
              }}>
                {f.hint.map((h, i) => (
                  <span key={i} style={{
                    fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 500,
                    letterSpacing: '0.18em', textTransform: 'uppercase',
                    color: h.color, whiteSpace: 'nowrap',
                  }}>{h.text}</span>
                ))}
              </div>

              {/* Tag + directional arrow */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                <Tag style={{
                  color: isActive ? 'var(--moss-200)' : 'var(--on-ink-text-4)',
                  transition: 'color 0.3s', letterSpacing: '0.16em',
                }}>{f.tag}</Tag>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 12,
                  color: isActive ? CREAM : 'rgba(240,235,224,0.16)',
                  transition: 'color 0.3s, transform 0.3s',
                  display: 'inline-block',
                  transform: isActive ? 'translate(3px,-2px)' : 'none',
                }}>↘</span>
              </div>

              {/* Mobile: description inline */}
              {isMobile && (
                <p style={{ width: '100%', fontFamily: 'var(--font-sans)', fontSize: 13, color: MUTED, lineHeight: 1.75, margin: '10px 0 0 30px' }}>{f.body}</p>
              )}
            </article>
          )
        })}
      </div>

      {/* Bottom strip */}
      <div style={{ padding: '20px clamp(20px,4vw,48px)', borderTop: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <Tag>Free tier available · Pro from $12/mo</Tag>
        <Tag style={{ color: 'var(--moss-200)' }}>No credit card required →</Tag>
      </div>

      {/* Cursor-following tooltip with scramble reveal (desktop only) */}
      {!isMobile && (
        <div
          ref={tooltipRef}
          style={{
            position: 'fixed', top: 0, left: 0,
            zIndex: 9000, pointerEvents: 'none',
            width: 340,
            opacity: activeFeature ? 1 : 0,
          }}
        >
          {activeFeature && (
            <div key={activeFeature.id} style={{ background: CREAM, border: `1px solid rgba(11,11,11,0.13)`, padding: '26px 28px 28px', position: 'relative' }}>
              {/* Number + title row */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.28em', color: 'rgba(11,11,11,0.26)', textTransform: 'uppercase' }}>{activeFeature.n}</span>
                <span style={{ fontFamily: 'var(--font-display)', fontVariationSettings: "'wdth' 110, 'wght' 700", fontWeight: 700, fontSize: 22, color: INK, letterSpacing: '-0.025em', lineHeight: 1 }}>{activeFeature.title}</span>
              </div>
              {/* Data hint chips */}
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 16 }}>
                {activeFeature.hint.map((h, i) => (
                  <span key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: h.color }}>{h.text}</span>
                ))}
              </div>
              <div style={{ height: 1, background: 'rgba(11,11,11,0.08)', marginBottom: 18 }} />
              <p style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'rgba(11,11,11,0.82)', lineHeight: 1.88, margin: 0, fontWeight: 400 }}>{activeFeature.body}</p>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function CtaSection({ onEnter }) {
  const ref = useRef(null)
  const p = useElementProgress(ref)
  const mouse = useMouse()
  return (
    <section ref={ref} style={{ background: INK, minHeight: '100vh', padding: '60px clamp(20px,4vw,48px)', display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 48, left: 'clamp(20px,4vw,48px)' }}><Tag style={{ letterSpacing: '0.32em' }}>§ 07 — Begin</Tag></div>
      <div style={{ maxWidth: 1500, margin: '0 auto', width: '100%' }}>
        <Rule vis={p > 0.1} />
        <div style={{ marginTop: 48, transform: `translate3d(${mouse.nx * 12}px, ${mouse.ny * 8}px, 0)`, transition: 'transform .8s cubic-bezier(0.16,1,0.3,1)' }}>
          {['START', 'READING', 'DIFFERENTLY.'].map((ln, i) => (
            <div key={i} style={{ overflow: 'hidden', lineHeight: 0.88, marginBottom: 4 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontVariationSettings: "'wdth' 125, 'wght' 700", fontStretch: '125%', fontWeight: 700, fontSize: 'clamp(60px, 12vw, 200px)', letterSpacing: '-0.05em', color: i === 2 ? 'transparent' : CREAM, WebkitTextStroke: i === 2 ? `1.2px ${CREAM}` : undefined, display: 'block', marginLeft: i === 1 ? '8vw' : i === 2 ? '4vw' : 0, transform: p > 0.1 ? 'translateY(0)' : 'translateY(108%)', transition: `transform 1.15s cubic-bezier(0.16,1,0.3,1) ${i * 90}ms` }}>{ln}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 52, display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap', opacity: p > 0.2 ? 1 : 0, transition: 'opacity .9s ease .5s' }}>
          <Button variant="primary" tone="paper" icon="arrow" onClick={onEnter}>Get started free</Button>
          <Button variant="ghost" tone="ink">View pricing</Button>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer style={{ background: '#070707', borderTop: `1px solid ${BORDER}`, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', minHeight: 520 }}>
        {/* Left: large scrolling motive, pinned to bottom-left */}
        <div style={{ flex: 1, overflow: 'hidden', paddingBottom: 48, minWidth: 0 }}>
          <div style={{ display: 'flex', animation: 'marquee 18s linear infinite', width: 'max-content', willChange: 'transform' }}>
            {[...Array(4)].map((_, i) => (
              <span key={i} style={{ fontFamily: 'var(--font-display)', fontVariationSettings: "'wdth' 125, 'wght' 700", fontStretch: '125%', fontWeight: 700, fontSize: 'clamp(100px, 17vw, 260px)', letterSpacing: '-0.05em', color: 'transparent', WebkitTextStroke: `1px ${CREAM}`, paddingRight: 60, whiteSpace: 'nowrap', opacity: 0.65 }}>TRAVAUXUS —</span>
            ))}
          </div>
        </div>

        {/* Right: all content stacked vertically */}
        <div style={{ borderLeft: `1px solid ${BORDER}`, padding: '60px clamp(20px,4vw,48px)', display: 'flex', flexDirection: 'column', gap: 36, minWidth: 'min(300px,100%)', alignSelf: 'stretch', justifyContent: 'flex-end' }}>
          <Logo size="sm" />
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'rgba(240,235,224,0.22)', maxWidth: 220, lineHeight: 1.8, margin: 0 }}>AI news feed, stock watchlist, gov trades, price alerts, and paper trading — in plain English.</p>
          {[
            { col: 'Product', links: ['Features', 'Pricing', 'Changelog'] },
            { col: 'Archive', links: ['Today', 'This week', 'Vol. 01'] },
            { col: 'Legal',   links: ['Disclaimer', 'Terms', 'Privacy'] },
          ].map(({ col, links }) => (
            <div key={col}>
              <Tag style={{ display: 'block', marginBottom: 12 }}>{col}</Tag>
              {links.map(l => <div key={l} style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'rgba(240,235,224,0.32)', marginBottom: 8 }}>{l}</div>)}
            </div>
          ))}
          <div style={{ paddingTop: 20, borderTop: '1px solid rgba(240,235,224,0.06)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Tag>© {new Date().getFullYear()} Travauxus</Tag>
            <Tag>For informational purposes only. Not financial advice.</Tag>
          </div>
        </div>
      </div>
    </footer>
  )
}

const SECTIONS = ['§ 01', '§ 02', '§ 03', '§ 04', '§ 05', '§ 06']

function ScrollIndex() {
  const dotsRef = useRef([])

  useEffect(() => {
    let raf = null
    const update = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = null
        const max = document.documentElement.scrollHeight - window.innerHeight
        const progress = max > 0 ? window.scrollY / max : 0
        const at = progress * (SECTIONS.length - 1)
        dotsRef.current.forEach((dot, i) => {
          if (!dot) return
          const here = Math.abs(at - i) < 0.5
          dot.style.opacity = here ? '1' : '0.4'
          const label = dot.firstElementChild
          const line = dot.lastElementChild
          if (label) label.textContent = here ? SECTIONS[i] : ''
          if (line) line.style.width = here ? '22px' : '8px'
        })
      })
    }
    window.addEventListener('scroll', update, { passive: true })
    update()
    return () => { window.removeEventListener('scroll', update); if (raf) cancelAnimationFrame(raf) }
  }, [])

  return (
    <div style={{ position: 'fixed', right: 22, top: '50%', transform: 'translateY(-50%)', zIndex: 50, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, mixBlendMode: 'difference', color: CREAM }}>
      {SECTIONS.map((s, i) => (
        <div key={s} ref={el => { dotsRef.current[i] = el }} style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: 0.4, transition: 'opacity .3s' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.18em', color: 'inherit' }}></span>
          <span style={{ width: 8, height: 1, background: 'currentColor', transition: 'width .3s' }} />
        </div>
      ))}
    </div>
  )
}

export default function Landing() {
  const navigate = useNavigate()
  const [loaded, setLoaded] = useState(false)
  const [showCursor, setShowCursor] = useState(false)
  const onEnter = () => navigate('/onboarding')

  useEffect(() => {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)')
    setShowCursor(mq.matches)
  }, [])

  return (
    <div style={{ background: INK, overflowX: 'hidden' }}>
      <style>{`
        .trx-body-grain::before {
          content: ''; position: fixed; inset: 0; z-index: 9997; pointer-events: none;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.88' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
          background-size: 180px 180px; opacity: 0.033; mix-blend-mode: overlay;
        }
        @media (hover: hover) and (pointer: fine) { .trx-cursor-hidden, .trx-cursor-hidden * { cursor: none !important; } }
        @media (max-width: 640px) { .trx-nav-links { display: none !important; } }
        @keyframes tooltipReveal {
          0%   { filter: blur(10px); }
          100% { filter: blur(0px); }
        }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>

      {!loaded && <Preloader onDone={() => setLoaded(true)} />}
      {loaded && showCursor && <Cursor />}
      <ScrollIndex />

      <Hero onEnter={onEnter} />
      <DualMarquee />
      <LanguageWall />
      <FeaturesSection />
<PhysicsConvergence />
      <CtaSection onEnter={onEnter} />
      <Footer />
    </div>
  )
}
