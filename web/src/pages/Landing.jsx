import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

// ─── Design atoms ─────────────────────────────────────────────────────────────
const CREAM  = 'var(--paper)'
const INK    = 'var(--ink-900)'
const MUTED  = 'var(--on-ink-text-3)'
const BORDER = 'var(--on-ink-border)'

// ─── Hooks ────────────────────────────────────────────────────────────────────
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
  const [pos, setPos] = useState({ x: 0, y: 0, nx: 0, ny: 0 })
  useEffect(() => {
    const onMove = (e) => {
      const nx = (e.clientX / window.innerWidth) - 0.5
      const ny = (e.clientY / window.innerHeight) - 0.5
      setPos({ x: e.clientX, y: e.clientY, nx, ny })
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
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
        const total = r.height + vh
        const passed = vh - r.top
        setP(Math.max(0, Math.min(1, passed / total)))
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


// ─── Live prices from Yahoo Finance (falls back to simulated) ─────────────────
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
          if (ticker && q.regularMarketChangePercent != null) {
            result[ticker.sym] = parseFloat(q.regularMarketChangePercent.toFixed(2))
          }
        })
        if (Object.keys(result).length > 0) setPrices(result)
        else simulate()
      } catch {
        simulate()
      }
    }

    fetchPrices()
    const iv = setInterval(fetchPrices, 60000)
    return () => clearInterval(iv)
  }, [])
  return prices
}

// ─── Primitive components ─────────────────────────────────────────────────────
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
    secondary: {
      background: 'transparent', color: tone === 'paper' ? INK : CREAM,
      border: `1px solid ${tone === 'paper' ? 'var(--on-paper-border)' : BORDER}`,
    },
    ghost: {
      background: 'transparent',
      color: tone === 'ink' ? 'var(--on-ink-text-3)' : 'var(--on-paper-text-3)',
      borderBottom: `1px solid ${tone === 'ink' ? 'rgba(240,235,224,0.18)' : 'rgba(11,11,11,0.18)'}`,
      padding: '0 0 2px', borderRadius: 0,
    },
  }
  const El = href ? 'a' : 'button'
  return (
    <El href={href} onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ ...base, ...variants[variant], ...s }}
    >
      {children}
      {icon === 'arrow' && (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      )}
    </El>
  )
}

function Rule({ vis = true, delay = 0, color = BORDER, style: s }) {
  return (
    <div style={{
      height: 1, background: color, transformOrigin: 'left',
      transform: vis ? 'scaleX(1)' : 'scaleX(0)',
      transition: `transform 1.5s cubic-bezier(0.16,1,0.3,1) ${delay}ms`, ...s,
    }} />
  )
}

function Line({ children, vis, delay = 0, outline = false, weight = 700, stretch = 125, size = 'clamp(64px, 12vw, 170px)', indent = 0, color = CREAM, stroke = 1 }) {
  return (
    <div style={{ overflow: 'hidden', lineHeight: 0.86, marginLeft: indent }}>
      <div style={{
        fontFamily: 'var(--font-display)',
        fontStretch: `${stretch}%`,
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
    const ov = e => { if (e.target.closest('a,button')) tsc.current = 2.6 }
    const ou = e => { if (e.target.closest('a,button')) tsc.current = 1 }
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
    return () => {
      document.removeEventListener('mousemove', mv)
      document.removeEventListener('mouseover', ov)
      document.removeEventListener('mouseout', ou)
      cancelAnimationFrame(raf)
    }
  }, [])
  return (
    <>
      <div ref={dot} style={{ position: 'fixed', top: 0, left: 0, zIndex: 9999, pointerEvents: 'none', width: 6, height: 6, borderRadius: '50%', background: CREAM, mixBlendMode: 'difference' }} />
      <div ref={ring} style={{ position: 'fixed', top: 0, left: 0, zIndex: 9998, pointerEvents: 'none', width: 40, height: 40, borderRadius: '50%', border: `1px solid ${CREAM}`, mixBlendMode: 'difference' }} />
    </>
  )
}

// ─── Preloader ────────────────────────────────────────────────────────────────
function Preloader({ onDone }) {
  const [stage, setStage] = useState(0)
  useEffect(() => {
    const t1 = setTimeout(() => setStage(1), 250)
    const t2 = setTimeout(() => setStage(2), 1400)
    const t3 = setTimeout(() => setStage(3), 2000)
    const t4 = setTimeout(onDone, 2700)
    return () => { [t1, t2, t3, t4].forEach(clearTimeout) }
  }, [onDone])

  const [n, setN] = useState(0)
  useEffect(() => {
    if (stage < 1) return
    let raf, start = null
    const tick = (ts) => {
      if (!start) start = ts
      const p = Math.min((ts - start) / 1100, 1)
      setN(Math.round((1 - Math.pow(1 - p, 3)) * 100))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => raf && cancelAnimationFrame(raf)
  }, [stage])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000, background: INK,
      transform: stage >= 3 ? 'translateY(-100%)' : 'translateY(0)',
      transition: 'transform .9s cubic-bezier(0.76,0,0.24,1)',
      pointerEvents: stage >= 3 ? 'none' : 'auto',
      overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 24, left: 32 }}><Tag>Travauxus / Vol. 01</Tag></div>
      <div style={{ position: 'absolute', top: 24, right: 32 }}><Tag>An archive of the present</Tag></div>
      <div style={{ position: 'absolute', bottom: 24, left: 32 }}><Tag>Est. 2026 · New York</Tag></div>
      <div style={{ position: 'absolute', bottom: 24, right: 32 }}><Tag>{String(n).padStart(3, '0')}%</Tag></div>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14 }}>
        <div style={{ overflow: 'hidden', lineHeight: 0.86 }}>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontVariationSettings: "'wdth' 125, 'wght' 700", fontStretch: '125%', fontWeight: 700,
            fontSize: 'clamp(72px, 14vw, 220px)', letterSpacing: '-0.05em', color: CREAM,
            transform: stage >= 2 ? 'translateY(0)' : 'translateY(110%)',
            transition: 'transform 1.1s cubic-bezier(0.16,1,0.3,1)',
          }}>TRAVAUXUS</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, opacity: stage >= 2 ? 1 : 0, transition: 'opacity .6s ease .2s' }}>
          <span style={{ width: 32, height: 1, background: MUTED }} />
          <Tag>The Market, Explained.</Tag>
          <span style={{ width: 32, height: 1, background: MUTED }} />
        </div>
      </div>
      <div style={{ position: 'absolute', bottom: 80, left: 32, right: 32 }}>
        <div style={{ height: 1, background: 'rgba(240,235,224,0.08)' }}>
          <div style={{ height: 1, background: CREAM, width: `${n}%`, transition: 'width .1s linear' }} />
        </div>
      </div>
    </div>
  )
}

// ─── 1. HERO — tickers with live prices + mouse fade ─────────────────────────
function FloatingTicker({ t, mouse, visible, price }) {
  const depth = 18 + (t.x % 3) * 6
  const pct = price ?? null
  const d = pct != null
    ? `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`
    : (t.staticD || '')
  const tone = pct != null ? (pct >= 0 ? 'pos' : 'neg') : (t.staticTone || 'mut')
  const color = tone === 'pos' ? 'var(--positive)' : tone === 'neg' ? 'var(--negative)' : MUTED

  return (
    <div style={{
      position: 'absolute', top: `${t.y}%`, left: `${t.x}%`,
      transform: `translate3d(${mouse.nx * depth * -1}px, ${mouse.ny * depth * -1}px, 0)`,
      transition: 'transform .6s cubic-bezier(0.16,1,0.3,1), opacity .7s ease',
      opacity: visible ? 1 : 0,
      pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4,
      animation: `tickerDrift 9s ease-in-out ${t.delay}s infinite`,
    }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.24em', textTransform: 'uppercase', color: MUTED }}>{t.sym}</span>
      {d && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color, letterSpacing: '0.04em' }}>{d}</span>}
    </div>
  )
}

function Hero({ onEnter }) {
  const [rdy, setRdy] = useState(false)
  const mouse = useMouse()
  const scrollY = useScrollY()
  const prices = useLivePrices()

  // Start with first 7 tickers visible
  const [visibleSet, setVisibleSet] = useState(() => new Set([0, 1, 2, 3, 4, 5, 6]))
  const moveCountRef = useRef(0)

  useEffect(() => { const t = setTimeout(() => setRdy(true), 220); return () => clearTimeout(t) }, [])

  // Swap one ticker on every ~70 mouse movements
  useEffect(() => {
    const onMove = () => {
      moveCountRef.current++
      if (moveCountRef.current % 70 !== 0) return
      setVisibleSet(prev => {
        const visible = [...prev]
        const hidden = TICKER_POOL.map((_, i) => i).filter(i => !prev.has(i))
        if (hidden.length === 0) return prev
        const next = new Set(prev)
        next.delete(visible[Math.floor(Math.random() * visible.length)])
        next.add(hidden[Math.floor(Math.random() * hidden.length)])
        return next
      })
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  const heroProgress = Math.min(scrollY / (window.innerHeight || 1), 1)

  return (
    <section style={{
      position: 'relative', minHeight: '100vh', background: INK,
      display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
      padding: '0 48px 60px', overflow: 'hidden',
      opacity: 1 - heroProgress * 0.4,
    }}>
      {/* Top nav */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 60, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 48px', zIndex: 10 }}>
        <Logo size="sm" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
          <a href="#archive" style={{ fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED, textDecoration: 'none' }}>Archive</a>
          <a href="#manifesto" style={{ fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED, textDecoration: 'none' }}>Manifesto</a>
          <Button variant="primary" tone="paper" onClick={onEnter}>Get started</Button>
        </div>
      </div>

      {/* Floating tickers — all in pool, fade in/out on mouse move */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {TICKER_POOL.map((t, i) => (
          <FloatingTicker key={i} t={t} mouse={mouse} visible={visibleSet.has(i)} price={prices[t.sym]} />
        ))}
      </div>

      {/* Corner labels */}
      <div style={{ position: 'absolute', top: 78, right: 48, display: 'flex', alignItems: 'center', gap: 14, opacity: rdy ? 1 : 0, transition: 'opacity .8s ease .9s' }}>
        <Tag>Market Intelligence</Tag>
        <div style={{ width: 28, height: 1, background: BORDER }} />
        <Tag>Vol. 01 · Est. 2026</Tag>
      </div>

      {/* Vertical archive label */}
      <div style={{
        position: 'absolute', left: 22, top: '50%',
        transform: 'translateY(-50%) rotate(-90deg)', transformOrigin: 'left top',
        opacity: rdy ? 1 : 0, transition: 'opacity .8s ease 1.1s',
      }}>
        <Tag style={{ letterSpacing: '0.38em' }}>An archive of the present →</Tag>
      </div>

      {/* Main display type with mouse parallax */}
      <div style={{
        position: 'relative', zIndex: 2,
        transform: `translate3d(${mouse.nx * 14}px, ${mouse.ny * 8}px, 0)`,
        transition: 'transform .8s cubic-bezier(0.16,1,0.3,1)',
      }}>
        <Line vis={rdy} delay={0}>THE</Line>
        <Line vis={rdy} delay={80} indent="5vw" stretch={125}>MARKET,</Line>
        <Rule vis={rdy} delay={280} style={{ margin: '14px 0 18px' }} />
        <Line vis={rdy} delay={160} outline indent="13vw" stretch={120} stroke={1.2}>EXPLAINED.</Line>
      </div>

      {/* Bottom row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 48, flexWrap: 'wrap', gap: 24, position: 'relative', zIndex: 2 }}>
        <p style={{
          fontFamily: 'var(--font-sans)', fontSize: 14, lineHeight: 1.9,
          color: MUTED, maxWidth: 280, margin: 0,
          opacity: rdy ? 1 : 0, transform: rdy ? 'none' : 'translateY(16px)',
          transition: 'opacity .9s ease .7s, transform .9s ease .7s',
        }}>Real-time market intelligence<br />in plain English. No jargon.</p>
        <div style={{ opacity: rdy ? 1 : 0, transition: 'opacity .9s ease .8s' }}>
          <Button variant="primary" tone="paper" icon="arrow" onClick={onEnter}>Get started free</Button>
        </div>
      </div>

      {/* Scroll drip */}
      <div style={{
        position: 'absolute', bottom: 24, right: 56,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
        opacity: rdy ? Math.max(0, 1 - heroProgress * 2) : 0, transition: 'opacity .6s',
      }}>
        <Tag>Scroll</Tag>
        <div style={{ width: 1, height: 44, background: `linear-gradient(to bottom, transparent, ${MUTED})`, animation: 'drip 2.4s ease-in-out infinite' }} />
      </div>
    </section>
  )
}

// ─── 2. DUAL MARQUEE ─────────────────────────────────────────────────────────
function DualMarquee() {
  return (
    <div style={{ background: CREAM, padding: '14px 0 13px', position: 'relative', zIndex: 2 }}>
      <div style={{ overflow: 'hidden', padding: '4px 0' }}>
        <div style={{ display: 'flex', animation: 'marquee 32s linear infinite', width: 'max-content' }}>
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
        <div style={{ display: 'flex', animation: 'marqueeRev 38s linear infinite', width: 'max-content' }}>
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

// ─── 3. STATEMENT — word-by-word reveal ──────────────────────────────────────
function Statement() {
  const ref = useRef(null)
  const p = useElementProgress(ref)
  const text = "We believe markets should be legible. That every investor — not just the ones in glass towers — deserves the same fluency. So we built the intelligence layer the market never had.".split(' ')

  return (
    <section ref={ref} style={{ background: CREAM, padding: '160px 48px', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 80, left: 48 }}>
        <Tag tone="dark" style={{ letterSpacing: '0.32em' }}>§ 01 — Manifesto</Tag>
      </div>
      <div style={{ position: 'absolute', top: 80, right: 48 }}>
        <Tag tone="dark" style={{ letterSpacing: '0.32em' }}>{String(Math.min(100, Math.round(p * 100))).padStart(3, '0')}</Tag>
      </div>
      <div style={{ maxWidth: 1200, margin: '0 auto', paddingTop: 40 }}>
        <div style={{
          fontFamily: 'var(--font-display)', fontVariationSettings: "'wdth' 100, 'wght' 500", fontWeight: 500,
          fontSize: 'clamp(28px, 4.4vw, 64px)', letterSpacing: '-0.025em', lineHeight: 1.12, color: INK,
        }}>
          {text.map((w, i) => {
            const start = i / text.length
            const local = Math.max(0, Math.min(1, (p - 0.05 - start * 0.7) * 4))
            return (
              <span key={i} style={{
                opacity: 0.12 + local * 0.88,
                fontWeight: (w.endsWith('.') || w.endsWith(',')) ? 700 : 500,
                transition: 'opacity .12s linear',
                marginRight: '0.28em',
                whiteSpace: w === '—' ? 'nowrap' : 'normal',
              }}>{w}</span>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ─── 4. PINNED ARCHIVE — horizontal scroll ────────────────────────────────────
const ARCHIVE = [
  { n: '001', y: '03:14', ticker: 'AAPL', headline: 'Apple beats Q3; Services hits all-time high.', urgency: 'Act' },
  { n: '002', y: '03:48', ticker: 'NVDA', headline: 'Senate panel signals new AI export curbs.', urgency: 'Watch' },
  { n: '003', y: '04:01', ticker: 'BTC',  headline: 'Spot-ETF flows positive for fourth day.', urgency: 'Low' },
  { n: '004', y: '04:22', ticker: 'GOLD', headline: 'Bullion edges to seven-week high on weak dollar.', urgency: 'Low' },
  { n: '005', y: '05:05', ticker: 'FOMC', headline: "Minutes Wednesday — 'higher for longer' read.", urgency: 'Watch' },
  { n: '006', y: '05:18', ticker: 'TSLA', headline: 'Berlin Gigafactory restart slips a week.', urgency: 'Low' },
  { n: '007', y: '05:44', ticker: 'OXY',  headline: "Buffett's Berkshire boosts Occidental again.", urgency: 'Watch' },
  { n: '008', y: '06:30', ticker: 'META', headline: 'Reels ad load hits parity with Feed.', urgency: 'Low' },
]

function PinnedArchive() {
  const ref = useRef(null)
  const p = useElementProgress(ref)
  const stage = Math.max(0, Math.min(1, (p - 0.15) / 0.7))
  const maxScroll = ARCHIVE.length * 380 + 240 - (typeof window !== 'undefined' ? window.innerWidth : 1280)
  const urgencyColor = u => u === 'Act' ? 'var(--urgency-act)' : u === 'Watch' ? 'var(--urgency-watch)' : 'var(--urgency-low)'

  return (
    <section ref={ref} id="archive" style={{ background: INK, height: '300vh', position: 'relative' }}>
      <div style={{ position: 'sticky', top: 0, height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '64px 48px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <Tag style={{ letterSpacing: '0.32em' }}>§ 02 — The archive</Tag>
            <div style={{ marginTop: 12, fontFamily: 'var(--font-display)', fontVariationSettings: "'wdth' 125, 'wght' 700", fontStretch: '125%', fontWeight: 700, fontSize: 'clamp(40px, 6vw, 90px)', color: CREAM, letterSpacing: '-0.045em', lineHeight: 0.9 }}>
              EVERY SIGNAL,<br />INDEXED.
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <Tag>Drag → scroll</Tag>
            <div style={{ marginTop: 12, fontFamily: 'var(--font-mono)', fontSize: 11, color: MUTED, letterSpacing: '0.18em' }}>
              {String(Math.min(ARCHIVE.length, Math.floor(stage * ARCHIVE.length) + 1)).padStart(3, '0')} / {String(ARCHIVE.length).padStart(3, '0')}
            </div>
          </div>
        </div>

        <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
          <div style={{
            display: 'flex', gap: 32, padding: '0 48px',
            transform: `translateX(${-stage * maxScroll}px)`,
            transition: 'transform .1s linear', willChange: 'transform',
          }}>
            {ARCHIVE.map((a, i) => {
              const cardCenter = (i + 0.5) * 380 - stage * maxScroll + 24
              const vw = typeof window !== 'undefined' ? window.innerWidth : 1280
              const dist = Math.abs(cardCenter - vw / 2)
              const scale = Math.max(0.86, 1 - dist / (vw * 1.6))
              const opacity = Math.max(0.35, 1 - dist / (vw * 0.9))
              return (
                <article key={a.n} style={{
                  flex: '0 0 348px', background: 'rgba(240,235,224,0.03)', border: '1px solid rgba(240,235,224,0.08)',
                  borderRadius: 3, padding: '32px 28px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                  minHeight: 420, transform: `scale(${scale})`, opacity, transition: 'transform .25s, opacity .25s',
                }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontVariationSettings: "'wdth' 125, 'wght' 700", fontStretch: '125%', fontWeight: 700, fontSize: 96, color: CREAM, letterSpacing: '-0.05em', lineHeight: 0.85 }}>{a.n}</span>
                      <Tag style={{ color: urgencyColor(a.urgency) }}>{a.urgency}</Tag>
                    </div>
                    <div style={{ marginTop: 24, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.24em', color: MUTED }}>
                      {a.y} · {a.ticker}
                    </div>
                  </div>
                  <div style={{ fontFamily: 'var(--font-display)', fontVariationSettings: "'wdth' 100, 'wght' 500", fontWeight: 500, fontSize: 24, letterSpacing: '-0.02em', lineHeight: 1.22, color: CREAM }}>
                    {a.headline}
                  </div>
                  <div style={{ borderTop: '1px solid rgba(240,235,224,0.08)', paddingTop: 14, display: 'flex', justifyContent: 'space-between' }}>
                    <Tag style={{ color: MUTED, fontSize: 9 }}>From the feed</Tag>
                    <Tag style={{ color: MUTED, fontSize: 9 }}>↘</Tag>
                  </div>
                </article>
              )
            })}
          </div>
        </div>

        <div style={{ padding: '0 48px 48px' }}>
          <div style={{ height: 1, background: 'rgba(240,235,224,0.10)', position: 'relative' }}>
            <div style={{ height: 1, background: CREAM, width: `${stage * 100}%`, transition: 'width .1s linear' }} />
            <div style={{ position: 'absolute', top: -3, left: `${stage * 100}%`, width: 1, height: 7, background: CREAM, transform: 'translateX(-50%)' }} />
          </div>
          <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between' }}>
            <Tag>Vol. 01 · Today</Tag>
            <Tag>Live archive · auto-updating</Tag>
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── 5. LANGUAGE WALL — multilingual text stream ─────────────────────────────
const LANG_ROWS = [
  { text: 'Le marché est en mouvement — Les signaux arrivent trop vite — Aucune donnée ne vous échappe — Intelligence du marché — Analyse en temps réel — ', dir: 1,  dur: 42, sz: 13,  wt: 400, font: 'sans', op: 0.48 },
  { text: '市場が動いている — シグナルが速すぎる — リアルタイム分析 — 市場情報 — 人工知能 — 投資家向けの分析 — ', dir: -1, dur: 34, sz: 13,  wt: 400, font: 'sans', op: 0.44 },
  { text: 'MARCHÉ LIBRE — ', dir: 1, dur: 60, sz: 185, wt: 700, font: 'display', stretch: 125, op: 0.10 },
  { text: 'AAPL +2.40% — NVDA −3.18% — BTC $42,180 — GOLD +1.20% — TSLA −1.05% — QQQ +0.42% — META +1.73% — SPY +0.18% — AMZN +0.98% — MSFT +0.61% — ', dir: -1, dur: 24, sz: 11,  wt: 500, font: 'mono', op: 0.36 },
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
    const o = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setVis(true) },
      { threshold: 0.02 }
    )
    if (ref.current) o.observe(ref.current)
    return () => o.disconnect()
  }, [])

  return (
    <section ref={ref} style={{ background: CREAM, overflow: 'hidden', position: 'relative', padding: '72px 0' }}>
      <div style={{ position: 'absolute', top: 32, left: 48, zIndex: 10 }}>
        <Tag tone="dark" style={{ letterSpacing: '0.32em' }}>§ 03 — The signal</Tag>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {LANG_ROWS.map((row, i) => {
          const fontFamily = row.font === 'display'
            ? 'var(--font-display)'
            : row.font === 'mono'
            ? 'var(--font-mono)'
            : 'var(--font-sans)'
          const varSettings = row.font === 'display' && row.stretch
            ? { fontVariationSettings: `'wdth' ${row.stretch}, 'wght' ${row.wt}`, fontStretch: `${row.stretch}%` }
            : {}
          const anim = row.dir === 1 ? 'marquee' : 'marqueeRev'
          const lh = row.sz >= 100 ? 0.84 : 1.0
          const ls = row.font === 'mono' ? '0.06em' : row.sz >= 100 ? '-0.045em' : '-0.01em'

          return (
            <div key={i} style={{ overflow: 'hidden', lineHeight: lh }}>
              <div style={{
                display: 'flex',
                animation: vis ? `${anim} ${row.dur}s linear infinite` : 'none',
                width: 'max-content',
                opacity: row.op,
              }}>
                {[...Array(3)].map((_, k) => (
                  <span key={k} style={{
                    fontFamily,
                    fontSize: row.sz,
                    fontWeight: row.wt,
                    color: INK,
                    whiteSpace: 'nowrap',
                    letterSpacing: ls,
                    paddingRight: row.sz >= 100 ? '0.4em' : '2.5em',
                    ...varSettings,
                  }}>
                    {row.text}
                  </span>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ─── 6. MANIFESTO — fixed scroll-reveal, reduced height ──────────────────────
function Manifesto() {
  const ref = useRef(null)
  const p = useElementProgress(ref)

  // Normalize p to [0,1] within the sticky visible window.
  // Section is 170vh → total = 270vh.
  // r.top=0 → p≈0.37; r.top=-70vh → p≈0.63.
  // Use a slightly wider window with buffer so animations start and end cleanly.
  const lp = Math.max(0, Math.min(1, (p - 0.28) / 0.44))
  const skewBase = (lp - 0.5) * 14

  // Each line: enter at lp_start, fully up at lp_end
  const evTY  = Math.max(0, (1 - Math.min(1, Math.max(0, lp - 0.10) / 0.25)) * 120)
  const ynTY  = Math.max(0, (1 - Math.min(1, Math.max(0, lp - 0.18) / 0.27)) * 120)
  const ntTY  = Math.max(0, (1 - Math.min(1, Math.max(0, lp - 0.32) / 0.42)) * 120)

  return (
    <section ref={ref} id="manifesto" style={{ background: INK, height: '170vh', position: 'relative' }}>
      <div style={{ position: 'sticky', top: 0, height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 48px' }}>
        <div style={{ position: 'absolute', top: 64, left: 48 }}><Tag style={{ letterSpacing: '0.32em' }}>§ 04 — What we built</Tag></div>
        <div style={{ position: 'absolute', top: 64, right: 48, fontFamily: 'var(--font-mono)', fontSize: 11, color: MUTED, letterSpacing: '0.18em' }}>{String(Math.round(lp * 100)).padStart(3, '0')} / 100</div>

        <div style={{ maxWidth: 1700, margin: '0 auto', width: '100%' }}>
          <div style={{ overflow: 'hidden', lineHeight: 0.86 }}>
            <div style={{
              fontFamily: 'var(--font-display)', fontVariationSettings: "'wdth' 125, 'wght' 700", fontStretch: '125%', fontWeight: 700,
              fontSize: 'clamp(72px, 16vw, 260px)', color: CREAM, letterSpacing: '-0.05em',
              transform: `translateY(${evTY}%) skewY(${skewBase * 0.4}deg)`,
              transition: 'transform .08s linear',
            }}>EVERYTHING</div>
          </div>
          <div style={{ overflow: 'hidden', lineHeight: 0.86 }}>
            <div style={{
              fontFamily: 'var(--font-display)', fontVariationSettings: "'wdth' 125, 'wght' 700", fontStretch: '125%', fontWeight: 700,
              fontSize: 'clamp(72px, 16vw, 260px)', color: CREAM, letterSpacing: '-0.05em',
              transform: `translateY(${ynTY}%) skewY(${skewBase * -0.4}deg)`,
              transition: 'transform .08s linear',
            }}>YOU NEED.</div>
          </div>
          <div style={{ overflow: 'hidden', lineHeight: 0.86, marginLeft: '10vw', marginTop: 6 }}>
            <div style={{
              fontFamily: 'var(--font-display)', fontVariationSettings: "'wdth' 125, 'wght' 700", fontStretch: '125%', fontWeight: 700,
              fontSize: 'clamp(72px, 16vw, 260px)', color: 'transparent', WebkitTextStroke: `1.2px ${CREAM}`, letterSpacing: '-0.05em',
              transform: `translateY(${ntTY}%)`,
              transition: 'transform .08s linear',
            }}>{"NOTHING YOU DON'T."}</div>
          </div>
        </div>

        {/* Bottom feature strip */}
        <div style={{ position: 'absolute', bottom: 48, left: 48, right: 48, display: 'flex', gap: 32, justifyContent: 'space-between', opacity: Math.min(1, lp * 3), transition: 'opacity .3s' }}>
          {[
            { n: '01', l: 'AI urgency on every article' },
            { n: '02', l: 'Portfolio impact analysis' },
            { n: '03', l: 'Government trades tracker' },
            { n: '04', l: 'Real-time price alerts' },
          ].map(f => (
            <div key={f.n} style={{ flex: 1, borderTop: `1px solid ${BORDER}`, paddingTop: 14 }}>
              <Tag style={{ display: 'block', marginBottom: 8 }}>{f.n}</Tag>
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: MUTED, lineHeight: 1.5 }}>{f.l}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── 7. CONVERGENCE — physics-based drop & drag ───────────────────────────────
const PHYS_ITEMS = [
  { type: 'tag',   v: 'ACT NOW',  sx: 0.12, sy: -0.30 },
  { type: 'price', v: '+2.40%',   sx: 0.78, sy: -0.50 },
  { type: 'name',  v: 'NVIDIA',   sx: 0.30, sy: -0.20 },
  { type: 'date',  v: 'NOV·22',   sx: 0.65, sy: -0.55 },
  { type: 'big',   v: '0.3s',     sx: 0.48, sy: -0.40 },
  { type: 'tag',   v: 'WATCH',    sx: 0.82, sy: -0.28 },
  { type: 'price', v: '$192.40',  sx: 0.08, sy: -0.45 },
  { type: 'name',  v: 'APPLE',    sx: 0.58, sy: -0.18 },
]

function PhysicsConvergence() {
  const ref = useRef(null)
  const p = useElementProgress(ref)
  const containerRef = useRef(null)
  const itemRefs = useRef(Array(PHYS_ITEMS.length).fill(null))
  const bodies = useRef(null)
  const drag = useRef({ active: false, idx: -1, prevX: 0, prevY: 0, vx: 0, vy: 0 })
  const rafRef = useRef(null)
  const startedRef = useRef(false)

  const initBodies = useCallback(() => {
    const W = window.innerWidth
    const H = window.innerHeight
    bodies.current = PHYS_ITEMS.map((item) => ({
      x: item.sx * W + (Math.random() - 0.5) * 60,
      y: item.sy * H,
      vx: (Math.random() - 0.5) * 4,
      vy: Math.random() * 2 + 1,
      rot: (Math.random() - 0.5) * 24,
      vrot: (Math.random() - 0.5) * 2.5,
    }))
  }, [])

  const runPhysics = useCallback(() => {
    if (startedRef.current) return
    startedRef.current = true
    if (!bodies.current) initBodies()

    const GRAVITY = 0.30
    const FRICTION = 0.987
    const BOUNCE = 0.40
    const getFloor = () => window.innerHeight * 0.86
    const WALL_PAD = 60

    const tick = () => {
      const d = drag.current
      bodies.current.forEach((b, i) => {
        if (d.active && d.idx === i) return

        b.vy += GRAVITY
        b.vx *= FRICTION
        b.vrot *= 0.96
        b.x += b.vx
        b.y += b.vy
        b.rot += b.vrot

        const floor = getFloor()
        if (b.y > floor) {
          b.y = floor
          b.vy *= -BOUNCE
          b.vx *= 0.82
          b.vrot *= 0.45
          if (Math.abs(b.vy) < 1.2) b.vy = 0
        }
        const rwall = window.innerWidth - WALL_PAD
        if (b.x < WALL_PAD) { b.x = WALL_PAD; b.vx = Math.abs(b.vx) * 0.55 }
        if (b.x > rwall)    { b.x = rwall;    b.vx = -Math.abs(b.vx) * 0.55 }

        const el = itemRefs.current[i]
        if (el) {
          el.style.left = `${b.x}px`
          el.style.top  = `${b.y}px`
          el.style.transform = `translate(-50%, -50%) rotate(${b.rot}deg)`
        }
      })
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
  }, [initBodies])

  // Start when section enters view
  useEffect(() => {
    if (p > 0.08 && !startedRef.current) runPhysics()
  }, [p, runPhysics])

  // Stop on unmount
  useEffect(() => () => {
    startedRef.current = false
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
  }, [])

  // Drag handling
  useEffect(() => {
    const getXY = (e) => {
      const t = e.touches?.[0] ?? e
      return [t.clientX, t.clientY]
    }
    const nearest = (mx, my) => {
      let idx = -1, best = 90
      bodies.current?.forEach((b, i) => {
        const d = Math.hypot(b.x - mx, b.y - my)
        if (d < best) { best = d; idx = i }
      })
      return idx
    }
    const onDown = (e) => {
      const [mx, my] = getXY(e)
      const idx = nearest(mx, my)
      if (idx >= 0) {
        drag.current = { active: true, idx, prevX: mx, prevY: my, vx: 0, vy: 0 }
        const el = itemRefs.current[idx]
        if (el) el.style.cursor = 'grabbing'
        e.preventDefault()
      }
    }
    const onMove = (e) => {
      if (!drag.current.active) return
      const [mx, my] = getXY(e)
      const { idx, prevX, prevY } = drag.current
      const vx = (mx - prevX) * 0.75
      const vy = (my - prevY) * 0.75
      drag.current = { ...drag.current, prevX: mx, prevY: my, vx, vy }
      const b = bodies.current?.[idx]
      if (b) { b.x = mx; b.y = my; b.rot += vx * 0.12 }
      e.preventDefault()
    }
    const onUp = () => {
      if (!drag.current.active) return
      const { idx, vx, vy } = drag.current
      const b = bodies.current?.[idx]
      if (b) { b.vx = vx * 2.2; b.vy = vy * 2.2 }
      const el = itemRefs.current[idx]
      if (el) el.style.cursor = 'grab'
      drag.current.active = false
    }

    const c = containerRef.current
    c?.addEventListener('mousedown', onDown)
    c?.addEventListener('touchstart', onDown, { passive: false })
    window.addEventListener('mousemove', onMove)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchend', onUp)
    return () => {
      c?.removeEventListener('mousedown', onDown)
      c?.removeEventListener('touchstart', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchend', onUp)
    }
  }, [])

  const renderItem = (f, i) => {
    const base = {
      position: 'absolute',
      left: `${f.sx * 100}%`, top: '-10%',
      transform: 'translate(-50%, -50%)',
      cursor: 'grab', userSelect: 'none', WebkitUserSelect: 'none',
    }
    if (f.type === 'tag') return (
      <span key={i} ref={el => { itemRefs.current[i] = el }} style={{
        ...base, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.24em',
        textTransform: 'uppercase', padding: '5px 10px',
        border: '1px solid rgba(11,11,11,0.22)', color: INK, background: CREAM, whiteSpace: 'nowrap',
      }}>{f.v}</span>
    )
    if (f.type === 'price') return (
      <span key={i} ref={el => { itemRefs.current[i] = el }} style={{
        ...base, fontFamily: 'var(--font-mono)', fontSize: 22,
        color: f.v.startsWith('+') ? 'var(--moss-500)' : 'var(--clay-500)', whiteSpace: 'nowrap',
      }}>{f.v}</span>
    )
    if (f.type === 'name') return (
      <span key={i} ref={el => { itemRefs.current[i] = el }} style={{
        ...base, fontFamily: 'var(--font-display)', fontVariationSettings: "'wdth' 125, 'wght' 700",
        fontStretch: '125%', fontWeight: 700, fontSize: 'clamp(44px, 6vw, 86px)',
        color: INK, letterSpacing: '-0.05em', whiteSpace: 'nowrap',
      }}>{f.v}</span>
    )
    if (f.type === 'date') return (
      <span key={i} ref={el => { itemRefs.current[i] = el }} style={{
        ...base, fontFamily: 'var(--font-mono)', fontSize: 14,
        color: 'rgba(11,11,11,0.42)', letterSpacing: '0.14em', whiteSpace: 'nowrap',
      }}>{f.v}</span>
    )
    if (f.type === 'big') return (
      <span key={i} ref={el => { itemRefs.current[i] = el }} style={{
        ...base, fontFamily: 'var(--font-display)', fontVariationSettings: "'wdth' 125, 'wght' 700",
        fontStretch: '125%', fontWeight: 700, fontSize: 'clamp(80px, 13vw, 190px)',
        color: 'rgba(11,11,11,0.07)', letterSpacing: '-0.05em', lineHeight: 0.82, whiteSpace: 'nowrap',
      }}>{f.v}</span>
    )
    return null
  }

  return (
    <section ref={ref} style={{ background: CREAM, height: '180vh', position: 'relative' }}>
      <div style={{ position: 'sticky', top: 0, height: '100vh', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 64, left: 48 }}>
          <Tag tone="dark" style={{ letterSpacing: '0.32em' }}>§ 05 — From chaos, signal</Tag>
        </div>
        <div style={{ position: 'absolute', top: 64, right: 48, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgba(11,11,11,0.38)', letterSpacing: '0.18em' }}>
          Click · Drag · Play
        </div>

        {/* Physics canvas */}
        <div ref={containerRef} style={{ position: 'absolute', inset: 0, cursor: 'crosshair' }}>
          {PHYS_ITEMS.map((f, i) => renderItem(f, i))}
        </div>

        {/* Bottom bar */}
        <div style={{ position: 'absolute', bottom: 48, left: 48, right: 48, pointerEvents: 'none' }}>
          <Rule vis color="rgba(11,11,11,0.16)" />
          <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'flex-end' }}>
            <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 500, fontSize: 'clamp(18px, 2.2vw, 30px)', color: INK, letterSpacing: '-0.015em', lineHeight: 1.3 }}>
              Drag the fragments. Pull signal from the noise — in <span style={{ fontWeight: 700, borderBottom: '2px solid rgba(11,11,11,0.4)' }}>three seconds</span>.
            </div>
            <div style={{ textAlign: 'right' }}>
              <Tag tone="dark">Avg. processing time</Tag>
              <div style={{ fontFamily: 'var(--font-display)', fontVariationSettings: "'wdth' 125, 'wght' 700", fontStretch: '125%', fontWeight: 700, fontSize: 'clamp(48px, 6vw, 96px)', color: INK, letterSpacing: '-0.05em', lineHeight: 0.85, marginTop: 6 }}>0.3s</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── 8. CTA ───────────────────────────────────────────────────────────────────
function CtaSection({ onEnter }) {
  const ref = useRef(null)
  const p = useElementProgress(ref)
  const mouse = useMouse()

  return (
    <section ref={ref} style={{ background: INK, minHeight: '100vh', padding: '120px 48px 80px', display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 60, left: 48 }}><Tag style={{ letterSpacing: '0.32em' }}>§ 06 — Begin</Tag></div>
      <div style={{ maxWidth: 1500, margin: '0 auto', width: '100%' }}>
        <Rule vis={p > 0.1} />
        <div style={{ marginTop: 56, transform: `translate3d(${mouse.nx * 12}px, ${mouse.ny * 8}px, 0)`, transition: 'transform .8s cubic-bezier(0.16,1,0.3,1)' }}>
          {['START', 'READING', 'DIFFERENTLY.'].map((ln, i) => (
            <div key={i} style={{ overflow: 'hidden', lineHeight: 0.88, marginBottom: 4 }}>
              <div style={{
                fontFamily: 'var(--font-display)', fontVariationSettings: "'wdth' 125, 'wght' 700", fontStretch: '125%', fontWeight: 700,
                fontSize: 'clamp(60px, 12vw, 200px)', letterSpacing: '-0.05em',
                color: i === 2 ? 'transparent' : CREAM,
                WebkitTextStroke: i === 2 ? `1.2px ${CREAM}` : undefined,
                display: 'block',
                marginLeft: i === 1 ? '8vw' : i === 2 ? '4vw' : 0,
                transform: p > 0.1 ? 'translateY(0)' : 'translateY(108%)',
                transition: `transform 1.15s cubic-bezier(0.16,1,0.3,1) ${i * 90}ms`,
              }}>{ln}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 60, display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap', opacity: p > 0.2 ? 1 : 0, transition: 'opacity .9s ease .5s' }}>
          <Button variant="primary" tone="paper" icon="arrow" onClick={onEnter}>Get started free</Button>
          <Button variant="ghost" tone="ink">View pricing</Button>
        </div>
      </div>
    </section>
  )
}

// ─── 9. FOOTER ────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer style={{ background: '#070707', borderTop: `1px solid ${BORDER}`, padding: 48 }}>
      <div style={{ maxWidth: 1500, margin: '0 auto' }}>
        <div style={{ overflow: 'hidden', padding: '20px 0', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ display: 'flex', animation: 'marquee 50s linear infinite', width: 'max-content' }}>
            {[...Array(6)].map((_, i) => (
              <span key={i} style={{ fontFamily: 'var(--font-display)', fontVariationSettings: "'wdth' 125, 'wght' 700", fontStretch: '125%', fontWeight: 700, fontSize: 140, letterSpacing: '-0.05em', color: 'transparent', WebkitTextStroke: `1.2px ${CREAM}`, paddingRight: 80, whiteSpace: 'nowrap', textTransform: 'uppercase' }}>TRAVAUXUS —</span>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 32, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 40 }}>
          <div>
            <Logo size="sm" />
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'rgba(240,235,224,0.22)', marginTop: 14, maxWidth: 220, lineHeight: 1.8 }}>Market intelligence for everyone.</p>
          </div>
          <div style={{ display: 'flex', gap: 48 }}>
            {[
              { col: 'Product', links: ['Features', 'Pricing', 'Changelog'] },
              { col: 'Archive', links: ['Today', 'This week', 'Vol. 01'] },
              { col: 'Legal',   links: ['Disclaimer', 'Terms', 'Privacy'] },
            ].map(({ col, links }) => (
              <div key={col}>
                <Tag style={{ display: 'block', marginBottom: 16 }}>{col}</Tag>
                {links.map(l => <div key={l} style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'rgba(240,235,224,0.32)', marginBottom: 8 }}>{l}</div>)}
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 32, paddingTop: 22, borderTop: '1px solid rgba(240,235,224,0.06)', display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <Tag>© {new Date().getFullYear()} Travauxus</Tag>
          <Tag>For informational purposes only. Not financial advice.</Tag>
        </div>
      </div>
    </footer>
  )
}

// ─── Scroll index ─────────────────────────────────────────────────────────────
const SECTIONS = ['§ 01', '§ 02', '§ 03', '§ 04', '§ 05', '§ 06']

function ScrollIndex() {
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    let raf
    const update = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        const max = document.documentElement.scrollHeight - window.innerHeight
        setProgress(max > 0 ? window.scrollY / max : 0)
        raf = null
      })
    }
    window.addEventListener('scroll', update, { passive: true })
    update()
    return () => { window.removeEventListener('scroll', update); if (raf) cancelAnimationFrame(raf) }
  }, [])

  return (
    <div style={{
      position: 'fixed', right: 22, top: '50%', transform: 'translateY(-50%)',
      zIndex: 50, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
      mixBlendMode: 'difference', color: CREAM,
    }}>
      {SECTIONS.map((s, i) => {
        const at = progress * (SECTIONS.length - 1)
        const here = Math.abs(at - i) < 0.5
        return (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: here ? 1 : 0.4, transition: 'opacity .3s' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.18em', color: 'inherit' }}>{here ? s : ''}</span>
            <span style={{ width: here ? 22 : 8, height: 1, background: 'currentColor', transition: 'width .3s' }} />
          </div>
        )
      })}
    </div>
  )
}

// ─── Landing ─────────────────────────────────────────────────────────────────
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
          content: '';
          position: fixed; inset: 0; z-index: 9997; pointer-events: none;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.88' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
          background-size: 180px 180px; opacity: 0.033; mix-blend-mode: overlay;
        }
        @media (hover: hover) and (pointer: fine) { .trx-cursor-hidden, .trx-cursor-hidden * { cursor: none !important; } }
      `}</style>

      {!loaded && <Preloader onDone={() => setLoaded(true)} />}
      {loaded && showCursor && <Cursor />}
      <ScrollIndex />
      <Hero onEnter={onEnter} />
      <DualMarquee />
      <Statement />
      <PinnedArchive />
      <LanguageWall />
      <Manifesto />
      <PhysicsConvergence />
      <CtaSection onEnter={onEnter} />
      <Footer />
    </div>
  )
}
