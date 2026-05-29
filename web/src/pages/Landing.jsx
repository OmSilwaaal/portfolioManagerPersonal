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
  const canvasRef = useRef(null)
  const logoRef   = useRef(null)
  const rafRef    = useRef(null)
  const cbRef     = useRef(onDone)
  useEffect(() => { cbRef.current = onDone }, [onDone])

  useEffect(() => {
    const canvas = canvasRef.current
    const logo   = logoRef.current
    if (!canvas) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const W = window.innerWidth, H = window.innerHeight
    canvas.width  = W * dpr
    canvas.height = H * dpr
    canvas.style.width  = W + 'px'
    canvas.style.height = H + 'px'
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)
    ctx.fillStyle = INK
    ctx.fillRect(0, 0, W, H)

    // t=180ms: logo fades in via CSS transition
    const t1 = setTimeout(() => {
      if (!logo) return
      logo.style.transition = 'opacity 0.9s cubic-bezier(0.16,1,0.3,1), transform 1s cubic-bezier(0.16,1,0.3,1)'
      logo.style.opacity    = '1'
      logo.style.transform  = 'translate(-50%,-50%) scale(1)'
    }, 180)

    // t=1820ms: canvas zoom — diamond hole expands, logo flies out
    const t2 = setTimeout(() => {
      const cx = W / 2, cy = H / 2
      const maxR = cx + cy + 360
      const DUR  = 980
      let t0 = null
      if (logo) { logo.style.transition = 'none'; logo.style.filter = 'none' }

      const tick = (ts) => {
        if (!t0) t0 = ts
        const raw  = Math.min((ts - t0) / DUR, 1)
        const ease = raw * raw  // ease-in-quad

        // Refill dark background
        ctx.globalCompositeOperation = 'source-over'
        ctx.fillStyle = INK
        ctx.fillRect(0, 0, W, H)

        // Punch transparent diamond hole — GPU compositing, no DOM mutations
        const r = maxR * ease
        ctx.globalCompositeOperation = 'destination-out'
        ctx.fillStyle = 'rgba(0,0,0,1)'
        ctx.beginPath()
        ctx.moveTo(cx,     cy - r)
        ctx.lineTo(cx + r, cy    )
        ctx.lineTo(cx,     cy + r)
        ctx.lineTo(cx - r, cy    )
        ctx.closePath()
        ctx.fill()
        ctx.globalCompositeOperation = 'source-over'

        // Logo scales up gently and fades
        if (logo) {
          const scale = 1 + ease * 2.5
          const alpha = Math.max(0, 1 - ease * 3)
          logo.style.transform = `translate(-50%,-50%) scale(${scale})`
          logo.style.opacity   = String(alpha)
        }

        if (raw < 1) { rafRef.current = requestAnimationFrame(tick) }
        else         { cbRef.current?.() }
      }
      rafRef.current = requestAnimationFrame(tick)
    }, 1820)

    return () => {
      clearTimeout(t1); clearTimeout(t2)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'block', pointerEvents: 'none' }}
      />
      <div
        ref={logoRef}
        style={{
          position: 'fixed',
          top: '50%', left: '50%',
          transform: 'translate(-50%,-50%) scale(0.86)',
          opacity: 0,
          zIndex: 10001,
          willChange: 'transform, opacity',
          pointerEvents: 'none',
          filter: [
            'drop-shadow(0 0 3px rgba(240,235,224,0.52))',
            'drop-shadow(0 0 14px rgba(240,235,224,0.18))',
            'drop-shadow(0 0 44px rgba(240,235,224,0.07))',
          ].join(' '),
        }}
      >
        <svg width="210" height="210" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L22 12L12 22L2 12Z"       stroke={CREAM} strokeWidth="0.62" strokeLinejoin="round" />
          <path d="M12 6.5L17.5 12L12 17.5L6.5 12Z" stroke={CREAM} strokeWidth="0.62" strokeLinejoin="round" />
        </svg>
      </div>
    </>
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
        <div style={{
          opacity: rdy ? 1 : 0,
          transform: rdy ? 'translateY(0) scale(1)' : 'translateY(-6px) scale(0.92)',
          transition: 'opacity 0.9s cubic-bezier(0.16,1,0.3,1), transform 1s cubic-bezier(0.16,1,0.3,1)',
          filter: [
            'drop-shadow(0 0 3px rgba(240,235,224,0.52))',
            'drop-shadow(0 0 14px rgba(240,235,224,0.18))',
            'drop-shadow(0 0 44px rgba(240,235,224,0.07))',
          ].join(' '),
        }}>
          <Logo size="sm" />
        </div>
        <button
          onClick={onEnter}
          style={{
            opacity: rdy ? 1 : 0,
            transform: rdy ? 'translateY(0)' : 'translateY(-6px)',
            transition: 'opacity 0.9s cubic-bezier(0.16,1,0.3,1) 0.2s, transform 1s cubic-bezier(0.16,1,0.3,1) 0.2s, background 0.2s',
            fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 700,
            letterSpacing: '0.09em', textTransform: 'uppercase',
            padding: '9px 22px', border: `1px solid rgba(240,235,224,0.28)`,
            background: 'transparent', color: CREAM, cursor: 'pointer', borderRadius: 2,
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(240,235,224,0.1)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          Sign in →
        </button>
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
      </div>

      <div ref={scrollIndRef} style={{ position: 'absolute', bottom: 24, right: 56, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, opacity: rdy ? 1 : 0, transition: 'opacity .6s' }}>
        <Tag>Scroll</Tag>
        <div style={{ width: 1, height: 44, background: `linear-gradient(to bottom, transparent, ${MUTED})`, animation: 'drip 2.4s ease-in-out infinite' }} />
      </div>
    </section>
  )
}

/* ── Section divider — compact multi-language marquee strip ──────────────── */
const DIVIDER_ROWS = [
  { words: ['Real-time intelligence', 'AI-powered', 'Portfolio impact', 'Market signals', 'Plain English', 'Act with confidence', 'No jargon', 'Urgency scoring'], dir: 1,  dur: 30, font: 'var(--font-sans)', sz: 10, wt: 600, ls: '0.2em', upper: true,  sep: '×' },
  { words: ['Le marché est en mouvement', '市場が動いている', 'Der Markt bewegt sich', '시장이 움직이고 있습니다', 'El mercado se mueve', '市场正在运动', 'O рынке в реальном времени', 'Il mercato si muove'], dir: -1, dur: 38, font: 'var(--font-sans)', sz: 10, wt: 400, ls: '0.04em', upper: false, sep: '—' },
  { words: ['AAPL +2.40%', 'NVDA −3.18%', 'MSFT +0.45%', 'BTC $42,180', 'GOLD +1.20%', 'TSLA −1.05%', 'CPI 3.4%', 'SPY +0.18%', 'QQQ +0.42%', 'META +1.73%'], dir: 1,  dur: 24, font: 'var(--font-mono)', sz: 10, wt: 500, ls: '0.08em', upper: false, sep: '·' },
]

function SectionDivider() {
  return (
    <div style={{ background: CREAM, borderTop: `1px solid rgba(11,11,11,0.07)`, borderBottom: `1px solid rgba(11,11,11,0.07)`, overflow: 'hidden' }}>
      {DIVIDER_ROWS.map((row, i) => (
        <div key={i} style={{ overflow: 'hidden', padding: '5px 0' }}>
          <div style={{
            display: 'flex',
            animation: `${row.dir === 1 ? 'marquee' : 'marqueeRev'} ${row.dur}s linear infinite`,
            width: 'max-content',
            willChange: 'transform',
          }}>
            {[...Array(4)].flatMap((_, k) =>
              row.words.map((w, j) => (
                <span key={`${k}-${j}`} style={{
                  fontFamily: row.font,
                  fontSize: row.sz,
                  fontWeight: row.wt,
                  letterSpacing: row.ls,
                  textTransform: row.upper ? 'uppercase' : 'none',
                  color: 'rgba(11,11,11,0.38)',
                  whiteSpace: 'nowrap',
                  padding: '0 22px',
                }}>
                  {w}<span style={{ marginLeft: 22, opacity: 0.25 }}>{row.sep}</span>
                </span>
              ))
            )}
          </div>
        </div>
      ))}
    </div>
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

      const engine = Engine.create({ positionIterations: 10, velocityIterations: 10, constraintIterations: 4 })
      engine.gravity.y = 0.9

      // Create a body per item using element dimensions
      const mBodies = PHYS_ITEMS.map((item, i) => {
        const el = itemRefs.current[i]
        const bw = (el ? el.offsetWidth : 80) + 28
        const bh = (el ? el.offsetHeight : 34) + 18
        // Stagger spawn positions across top
        const spawnX = W * 0.08 + (i / PHYS_ITEMS.length) * W * 0.84 + (Math.random() - 0.5) * 80
        const spawnY = -80 - Math.random() * H * 0.9
        return Bodies.rectangle(spawnX, spawnY, bw, bh, {
          restitution: 0.35,
          friction: 0.15,
          frictionAir: 0.045,
          density: 0.002,
          angle: (Math.random() - 0.5) * 0.45,
        })
      })

      // Static boundaries
      const floor = Bodies.rectangle(W / 2, H * 0.87, W * 4, 50, { isStatic: true, friction: 0.5 })
      const wallL = Bodies.rectangle(-25, H / 2, 50, H * 4, { isStatic: true })
      const wallR = Bodies.rectangle(W + 25, H / 2, 50, H * 4, { isStatic: true })
      Composite.add(engine.world, [...mBodies, floor, wallL, wallR])


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

      // Cache container rect — avoids getBoundingClientRect() inside RAF tick
      let containerRect = container.getBoundingClientRect()
      const updateRect = () => { containerRect = container.getBoundingClientRect() }
      window.addEventListener('resize', updateRect, { passive: true })
      window.addEventListener('scroll', updateRect, { passive: true })

      // RAF loop: update engine + sync DOM positions
      let prev = performance.now()
      const tick = (now) => {
        const delta = Math.min(now - prev, 32)
        prev = now

        // Soft cursor influence — repel nearby bodies gently
        const cx = cursorRef.current.x - containerRect.left
        const cy = cursorRef.current.y - containerRect.top
        for (let i = 0; i < mBodies.length; i++) {
          const b = mBodies[i]
          const dx = b.position.x - cx
          const dy = b.position.y - cy
          const dist = Math.hypot(dx, dy)
          if (dist < 140 && dist > 1) {
            const f = 0.000065 * (1 - dist / 140)
            Body.applyForce(b, b.position, { x: (dx / dist) * f, y: (dy / dist) * f })
          }
        }

        Engine.update(engine, delta)

        // Sync DOM — single transform string per element, no left/top mutations
        for (let i = 0; i < mBodies.length; i++) {
          const b  = mBodies[i]
          const el = itemRefs.current[i]
          if (!el) continue
          const isDragging = mc.body === b
          const scale = isDragging ? 1.08 : 1
          el.style.transform = `translate(${b.position.x}px, ${b.position.y}px) translate(-50%, -50%) rotate(${b.angle}rad) scale(${scale})`
          if (isDragging) {
            el.style.filter  = 'drop-shadow(0 18px 36px rgba(11,11,11,0.28))'
            el.style.zIndex  = '20'
            el.style.cursor  = 'grabbing'
          } else {
            el.style.filter  = ''
            el.style.zIndex  = ''
            el.style.cursor  = 'grab'
          }
        }

        rafId = requestAnimationFrame(tick)
      }
      rafId = requestAnimationFrame(tick)

      cleanupRef.current = () => {
        cancelAnimationFrame(rafId)
        Engine.clear(engine)
        window.removeEventListener('resize', updateRect)
        window.removeEventListener('scroll', updateRect)
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
      position: 'absolute', left: 0, top: 0,
      transform: 'translate(-200px, -200px)',
      cursor: 'grab', userSelect: 'none', WebkitUserSelect: 'none',
      willChange: 'transform',
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

/* ── Features section — sticky scroll squish (Odin's Crow style) ─────────── */
const LOGO_CARD = { id: 'logo', isLogo: true }
const ALL_CARDS = [...FEATURES, LOGO_CARD]

function FeaturesSection() {
  const outerRef = useRef(null)
  const tooltipRef = useRef(null)
  const cardRefs = useRef([])        // direct DOM refs — no React re-render on scroll
  const circleRef = useRef(null)
  const [active, setActive] = useState(null)
  const isMobile = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

  const N = ALL_CARDS.length // 7 (6 features + logo)
  // 100vh of scroll per new card entering = (N-1)*100vh total scroll distance
  const SCROLL_PER_CARD_VH = 100

  // Update card widths directly on every scroll frame — no setState, no re-render
  useEffect(() => {
    let raf = null
    let circleShown = false

    const update = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = null
        if (!outerRef.current) return
        const rect = outerRef.current.getBoundingClientRect()
        const scrollable = outerRef.current.offsetHeight - window.innerHeight
        const p = Math.max(0, Math.min(1, -rect.top / scrollable))

        // v = continuous visible card count: 1 → N
        const v = 1 + p * (N - 1)

        // Update each card's width directly
        for (let i = 0; i < N; i++) {
          const el = cardRefs.current[i]
          if (el) el.style.width = `${Math.max(0, Math.min(1, v - i)) / v * 100}%`
        }

        // Trigger circle once last card is ~90% of its final share
        if (!circleShown && v > N - 0.1) {
          circleShown = true
          if (circleRef.current) circleRef.current.style.strokeDashoffset = '0'
        }
        // Reset if user scrolls back
        if (circleShown && v < N - 0.2) {
          circleShown = false
          if (circleRef.current) circleRef.current.style.strokeDashoffset = '1'
        }
      })
    }

    window.addEventListener('scroll', update, { passive: true })
    update()
    return () => { window.removeEventListener('scroll', update); if (raf) cancelAnimationFrame(raf) }
  }, [N])

  // Tooltip mouse tracking
  useEffect(() => {
    let raf = null
    const onMove = (e) => {
      if (!tooltipRef.current || raf) return
      raf = requestAnimationFrame(() => {
        raf = null
        if (!tooltipRef.current) return
        const vw = window.innerWidth, vh = window.innerHeight
        const tw = 340, th = 220
        let x = e.clientX + 32, y = e.clientY - 32
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
    <section style={{ background: INK, borderTop: `1px solid ${BORDER}` }}>
      {/* Header — normal flow above the sticky area */}
      <div style={{ padding: '64px clamp(20px,4vw,48px) 48px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <Tag style={{ letterSpacing: '0.32em' }}>§ 03 — What's inside</Tag>
          <div style={{ marginTop: 14, fontFamily: 'var(--font-display)', fontVariationSettings: "'wdth' 125, 'wght' 700", fontStretch: '125%', fontWeight: 700, fontSize: 'clamp(36px,6vw,84px)', color: CREAM, letterSpacing: '-0.045em', lineHeight: 0.9 }}>
            SIX TOOLS.<br />ONE PLATFORM.
          </div>
        </div>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', color: MUTED, margin: 0 }}>Scroll to explore →</p>
      </div>

      {/* Outer div: tall enough to force scrolling through all cards */}
      {/* Height = sticky panel (100vh) + scroll space (N-1 cards × 100vh each) */}
      <div
        ref={outerRef}
        style={{ position: 'relative', height: `calc(100vh + ${(N - 1) * SCROLL_PER_CARD_VH}vh)` }}
      >
        <div style={{
          position: 'sticky', top: 0,
          height: '100vh',
          display: 'flex',
          overflow: 'hidden',
          borderTop: `1px solid ${BORDER}`,
        }}>
          {ALL_CARDS.map((card, i) => {
            const isLogoCard = card.isLogo
            const f = isLogoCard ? null : card
            const initWidth = i === 0 ? '100%' : '0%'

            return (
              <div
                key={card.id}
                ref={el => { cardRefs.current[i] = el }}
                onMouseEnter={() => !isMobile && !isLogoCard && setActive(card.id)}
                onMouseLeave={() => !isMobile && setActive(null)}
                style={{
                  width: initWidth,
                  flexShrink: 0,
                  height: '100%',
                  borderRight: i < N - 1 ? `1px solid ${BORDER}` : 'none',
                  overflow: 'hidden',
                  position: 'relative',
                  background: isLogoCard ? 'rgba(240,235,224,0.03)' : active === card.id ? 'rgba(240,235,224,0.04)' : 'transparent',
                  transition: 'background 0.3s',
                  cursor: isLogoCard ? 'default' : 'crosshair',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  padding: '16px 14px 18px',
                  boxSizing: 'border-box',
                }}
              >
                {isLogoCard ? (
                  /* ── Logo finale card ──────────────────────────────────── */
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16, position: 'relative' }}>
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                      <svg width="44" height="44" viewBox="0 0 24 24" fill="none">
                        <path d="M12 2L22 12L12 22L2 12Z" stroke={CREAM} strokeWidth="1.5" strokeLinejoin="round" />
                        <path d="M12 6.5L17.5 12L12 17.5L6.5 12Z" stroke={CREAM} strokeWidth="1.5" strokeLinejoin="round" />
                      </svg>
                      {/* Circle draws tightly around the diamond icon */}
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 100 100"
                        preserveAspectRatio="none"
                        style={{ position: 'absolute', top: '-16px', left: '-16px', width: 'calc(100% + 32px)', height: 'calc(100% + 32px)', pointerEvents: 'none', overflow: 'visible' }}
                      >
                        <path
                          ref={circleRef}
                          d="M 54,4 C 76,1 98,16 98,38 C 98,60 84,88 60,96 C 36,104 8,94 2,72 C -4,50 8,18 26,8 C 38,2 46,3 54,4"
                          fill="none"
                          stroke="rgba(240,235,224,0.85)"
                          strokeWidth="2"
                          strokeLinecap="round"
                          pathLength="1"
                          strokeDasharray="0.94 0.06"
                          style={{ strokeDashoffset: 1, transition: 'stroke-dashoffset 750ms cubic-bezier(0.77,0,0.175,1)' }}
                        />
                      </svg>
                    </div>
                    <span style={{
                      fontFamily: 'var(--font-display)',
                      fontVariationSettings: "'wdth' 125, 'wght' 700",
                      fontStretch: '125%', fontWeight: 700,
                      fontSize: 'clamp(8px, 1vw, 16px)',
                      color: CREAM, letterSpacing: '0.22em', textTransform: 'uppercase',
                      writingMode: 'vertical-rl', textOrientation: 'mixed',
                    }}>Travauxus</span>
                  </div>
                ) : (
                  /* ── Feature card ──────────────────────────────────────── */
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.24em', color: 'rgba(240,235,224,0.28)', flexShrink: 0 }}>{f.n}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--moss-200)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{f.tag}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '8px 0' }}>
                      <span style={{
                        fontFamily: 'var(--font-display)',
                        fontVariationSettings: "'wdth' 125, 'wght' 700",
                        fontStretch: '125%', fontWeight: 700,
                        fontSize: 'clamp(13px, 2vw, 38px)',
                        color: CREAM,
                        letterSpacing: '0.06em',
                        lineHeight: 1.0,
                        writingMode: 'vertical-rl',
                        textOrientation: 'mixed',
                        textTransform: 'uppercase',
                        overflow: 'hidden',
                        maxHeight: '80%',
                      }}>{f.title}</span>
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.12em', textTransform: 'uppercase', color: f.hint[0].color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{f.hint[0].text}</span>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Bottom strip */}
      <div style={{ padding: '20px clamp(20px,4vw,48px)', borderTop: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <Tag>Free tier available · Pro from $12/mo</Tag>
        <Tag style={{ color: 'var(--moss-200)' }}>No credit card required →</Tag>
      </div>

      {/* Cursor-following tooltip (desktop only) */}
      {!isMobile && (
        <div
          ref={tooltipRef}
          style={{ position: 'fixed', top: 0, left: 0, zIndex: 9000, pointerEvents: 'none', width: 340, opacity: activeFeature ? 1 : 0, transition: 'opacity 0.18s ease' }}
        >
          {activeFeature && (
            <div key={activeFeature.id} style={{ background: CREAM, border: `1px solid rgba(11,11,11,0.13)`, padding: '26px 28px 28px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.28em', color: 'rgba(11,11,11,0.26)', textTransform: 'uppercase' }}>{activeFeature.n}</span>
                <span style={{ fontFamily: 'var(--font-display)', fontVariationSettings: "'wdth' 110, 'wght' 700", fontWeight: 700, fontSize: 22, color: INK, letterSpacing: '-0.025em', lineHeight: 1 }}>{activeFeature.title}</span>
              </div>
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
            { col: 'Product', links: [{ label: 'Features', href: null }, { label: 'Pricing', href: null }, { label: 'Changelog', href: null }] },
            { col: 'Archive', links: [{ label: 'Today', href: null }, { label: 'This week', href: null }, { label: 'Vol. 01', href: null }] },
            { col: 'Legal',   links: [{ label: 'Disclaimer', href: '/disclaimer' }, { label: 'Terms', href: '/terms' }, { label: 'Privacy', href: '/privacy' }] },
          ].map(({ col, links }) => (
            <div key={col}>
              <Tag style={{ display: 'block', marginBottom: 12 }}>{col}</Tag>
              {links.map(({ label, href }) => href
                ? <a key={label} href={href} style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: 13, color: 'rgba(240,235,224,0.32)', marginBottom: 8, textDecoration: 'none', transition: 'color 150ms' }} onMouseEnter={e => e.currentTarget.style.color = 'rgba(240,235,224,0.72)'} onMouseLeave={e => e.currentTarget.style.color = 'rgba(240,235,224,0.32)'}>{label}</a>
                : <div key={label} style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'rgba(240,235,224,0.32)', marginBottom: 8 }}>{label}</div>
              )}
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
  const [loaded, setLoaded] = useState(() => sessionStorage.getItem('tvx_intro') === '1')
  const [showCursor, setShowCursor] = useState(false)
  const onEnter = () => navigate('/onboarding')

  useEffect(() => {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)')
    setShowCursor(mq.matches)
  }, [])

  return (
    <div style={{ background: INK, overflowX: 'clip' }}>
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

      {!loaded && <Preloader onDone={() => { sessionStorage.setItem('tvx_intro', '1'); setLoaded(true) }} />}
      {loaded && showCursor && <Cursor />}
      <ScrollIndex />

      <Hero onEnter={onEnter} />
      <SectionDivider />
      <FeaturesSection />
      <SectionDivider />
      <PhysicsConvergence />
      <SectionDivider />
      <CtaSection onEnter={onEnter} />
      <Footer />
    </div>
  )
}
