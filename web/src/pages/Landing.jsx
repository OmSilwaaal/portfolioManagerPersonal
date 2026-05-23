import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'

// ─── Palette ──────────────────────────────────────────────────────────────────
const INK    = '#0b0b0b'
const PAPER  = '#f0ebe0'
const MOSS   = '#74875a'
const OCHRE  = '#d6b87a'
const ACT    = '#d35c4a'
const BD     = 'rgba(240,235,224,0.08)'
const BL     = 'rgba(11,11,11,0.09)'
const MD     = 'rgba(240,235,224,0.36)'
const ML     = 'rgba(11,11,11,0.36)'

// ─── Type stacks ──────────────────────────────────────────────────────────────
const BRUT  = "'Bricolage Grotesque','Space Grotesk',system-ui,sans-serif"
const SANS  = "'Space Grotesk',system-ui,sans-serif"
const SERIF = "'Cormorant Garamond',Georgia,serif"
const MONO  = "'JetBrains Mono',monospace"

// ─── Hooks ────────────────────────────────────────────────────────────────────
function useScrollY() {
  const [y, setY] = useState(0)
  useEffect(() => {
    const h = () => setY(window.scrollY)
    window.addEventListener('scroll', h, { passive: true })
    return () => window.removeEventListener('scroll', h)
  }, [])
  return y
}

function useMouse() {
  const ref = useRef({ x: 0, y: 0 })
  const [m, setM] = useState({ x: 0, y: 0 })
  useEffect(() => {
    let raf
    const h = (e) => { ref.current = { x: (e.clientX / window.innerWidth - 0.5) * 2, y: (e.clientY / window.innerHeight - 0.5) * 2 } }
    const tick = () => { setM({ ...ref.current }); raf = requestAnimationFrame(tick) }
    window.addEventListener('mousemove', h, { passive: true })
    raf = requestAnimationFrame(tick)
    return () => { window.removeEventListener('mousemove', h); cancelAnimationFrame(raf) }
  }, [])
  return m
}

function useElementProgress(ref) {
  const [p, setP] = useState(0)
  useEffect(() => {
    const h = () => {
      if (!ref.current) return
      const rect = ref.current.getBoundingClientRect()
      const total = rect.height - window.innerHeight
      setP(Math.max(0, Math.min(1, -rect.top / total)))
    }
    window.addEventListener('scroll', h, { passive: true })
    h()
    return () => window.removeEventListener('scroll', h)
  }, [ref])
  return p
}

function useInView(threshold = 0.12) {
  const ref = useRef(null)
  const [vis, setVis] = useState(false)
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVis(true); obs.disconnect() }
    }, { threshold })
    if (ref.current) obs.observe(ref.current)
    return () => obs.disconnect()
  }, [threshold])
  return [ref, vis]
}

function useCounter(target, active, dur = 2000) {
  const [v, setV] = useState(0)
  useEffect(() => {
    if (!active) return
    let start = null
    const tick = (ts) => {
      if (!start) start = ts
      const p = Math.min((ts - start) / dur, 1)
      setV(Math.round((1 - Math.pow(1 - p, 3)) * target))
      if (p < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [active, target, dur])
  return v
}

// ─── Preloader ────────────────────────────────────────────────────────────────
function Preloader({ onDone }) {
  const [count, setCount] = useState(0)
  const [reveal, setReveal] = useState(false)
  const [exit, setExit] = useState(false)

  useEffect(() => {
    const t0 = setTimeout(() => setReveal(true), 80)
    let n = 0
    const iv = setInterval(() => {
      n += Math.floor(Math.random() * 7) + 3
      if (n >= 100) { n = 100; clearInterval(iv) }
      setCount(n)
    }, 32)
    const t1 = setTimeout(() => setExit(true), 1900)
    const t2 = setTimeout(onDone, 2500)
    return () => { clearTimeout(t0); clearTimeout(t1); clearTimeout(t2); clearInterval(iv) }
  }, [onDone])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000, background: INK,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 0,
      opacity: exit ? 0 : 1,
      transform: exit ? 'translateY(-4%)' : 'translateY(0)',
      transition: exit ? 'opacity 0.55s ease, transform 0.55s ease' : 'none',
      pointerEvents: exit ? 'none' : 'all',
    }}>
      {/* Wordmark */}
      <div style={{ overflow: 'hidden', marginBottom: 32 }}>
        <div style={{
          fontFamily: BRUT, fontWeight: 900, fontSize: 'clamp(32px,6vw,72px)',
          letterSpacing: '-0.04em', textTransform: 'uppercase', color: PAPER,
          fontVariationSettings: "'wdth' 125, 'wght' 900",
          transform: reveal ? 'translateY(0)' : 'translateY(110%)',
          transition: 'transform 0.9s cubic-bezier(0.16,1,0.3,1)',
        }}>
          TRAVAUXUS
        </div>
      </div>

      {/* Counter */}
      <div style={{
        fontFamily: MONO, fontSize: 11, letterSpacing: '0.28em',
        color: 'rgba(240,235,224,0.28)', marginBottom: 16,
        opacity: reveal ? 1 : 0, transition: 'opacity 0.4s ease 0.4s',
      }}>
        {String(count).padStart(3, '0')}
      </div>

      {/* Progress bar */}
      <div style={{ width: 120, height: 1, background: 'rgba(240,235,224,0.10)' }}>
        <div style={{
          height: '100%', background: PAPER, width: `${count}%`,
          transition: 'width 0.08s linear',
        }} />
      </div>

      {/* Tagline */}
      <div style={{
        marginTop: 28, fontFamily: SERIF, fontSize: 14, fontStyle: 'italic',
        color: 'rgba(240,235,224,0.30)', letterSpacing: '0.02em',
        opacity: reveal ? 1 : 0, transition: 'opacity 0.6s ease 0.7s',
      }}>
        The Market, Explained.
      </div>
    </div>
  )
}

// ─── Nav ──────────────────────────────────────────────────────────────────────
function Nav() {
  const y = useScrollY()
  const past = y > 60
  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 48px', height: 60,
      background: past ? 'rgba(11,11,11,0.92)' : 'transparent',
      backdropFilter: past ? 'blur(20px)' : 'none',
      WebkitBackdropFilter: past ? 'blur(20px)' : 'none',
      borderBottom: past ? `1px solid ${BD}` : '1px solid transparent',
      transition: 'background 0.4s, border-color 0.4s',
    }}>
      <div style={{
        fontFamily: BRUT, fontWeight: 800, fontSize: 15, letterSpacing: '-0.03em',
        textTransform: 'uppercase', color: PAPER,
        fontVariationSettings: "'wdth' 110, 'wght' 800",
      }}>
        TRAVAUXUS
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <Link to="/pricing" style={{
          fontFamily: MONO, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase',
          color: MD, textDecoration: 'none', transition: 'color 0.2s',
        }}
          onMouseEnter={e => e.currentTarget.style.color = PAPER}
          onMouseLeave={e => e.currentTarget.style.color = MD}
        >
          Pricing
        </Link>
        <Link to="/onboarding" style={{
          fontFamily: MONO, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase',
          color: INK, background: PAPER, padding: '9px 20px',
          borderRadius: '2px', textDecoration: 'none', transition: 'opacity 0.2s',
        }}
          onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
        >
          Get started
        </Link>
      </div>
    </nav>
  )
}

// ─── Primitives ───────────────────────────────────────────────────────────────
function Mono({ children, dark = false, style = {} }) {
  return (
    <span style={{
      fontFamily: MONO, fontSize: 10, fontWeight: 500,
      letterSpacing: '0.22em', textTransform: 'uppercase',
      color: dark ? ML : MD, ...style,
    }}>
      {children}
    </span>
  )
}

function Line({ children, vis, delay = 0, style = {} }) {
  return (
    <div style={{ overflow: 'hidden', ...style }}>
      <div style={{
        transform: vis ? 'translateY(0)' : 'translateY(110%)',
        transition: `transform 1.1s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
      }}>
        {children}
      </div>
    </div>
  )
}

// ─── FloatingTicker ───────────────────────────────────────────────────────────
function FloatingTicker({ items, top, right, direction = 1, opacity = 0.18 }) {
  const all = [...items, ...items, ...items]
  return (
    <div style={{
      position: 'absolute', top, right: right ?? undefined, left: right === undefined ? 0 : undefined,
      width: '100%', overflow: 'hidden', opacity, pointerEvents: 'none',
    }}>
      <div style={{
        display: 'flex', width: 'max-content',
        animation: direction > 0 ? 'tkDrift 40s linear infinite' : 'tkDriftRev 40s linear infinite',
      }}>
        {all.map((item, i) => (
          <span key={i} style={{
            fontFamily: MONO, fontSize: 10, letterSpacing: '0.18em',
            color: PAPER, whiteSpace: 'nowrap', padding: '0 18px',
          }}>
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── Hero ─────────────────────────────────────────────────────────────────────
function Hero() {
  const [rdy, setRdy] = useState(false)
  const mouse = useMouse()
  useEffect(() => { const t = setTimeout(() => setRdy(true), 200); return () => clearTimeout(t) }, [])

  const px = (d) => mouse.x * d
  const py = (d) => mouse.y * d

  return (
    <section style={{
      position: 'relative', height: '100vh', background: INK,
      display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
      padding: '0 48px 72px', overflow: 'hidden',
    }}>
      {/* Ticker overlays */}
      <FloatingTicker items={['AAPL +2.4%', 'NVDA −1.1%', 'BTC +0.8%', 'SPY +0.3%', 'TSLA −2.6%', 'MSFT +1.2%']} top="22%" opacity={0.1} />
      <FloatingTicker items={['ACT NOW', 'WATCH', 'LOW RISK', 'ACT NOW', 'WATCH', 'LOW RISK']} top="72%" direction={-1} opacity={0.07} />

      {/* Top-right label */}
      <div style={{
        position: 'absolute', top: 80, right: 48,
        display: 'flex', alignItems: 'center', gap: 14,
        opacity: rdy ? 1 : 0, transition: 'opacity 0.8s ease 0.8s',
      }}>
        <Mono>AI-Powered</Mono>
        <div style={{ width: 24, height: 1, background: BD }} />
        <Mono>Est. 2026</Mono>
      </div>

      {/* Headline: THE / MARKET, / EXPLAINED. */}
      <div style={{ position: 'relative', zIndex: 2 }}>
        {/* Line 1: THE */}
        <div style={{ overflow: 'hidden', lineHeight: '0.88' }}>
          <div style={{
            fontFamily: BRUT, fontWeight: 900, color: PAPER,
            fontSize: 'clamp(78px,14vw,206px)',
            letterSpacing: '-0.05em',
            fontVariationSettings: "'wdth' 125, 'wght' 900",
            transform: rdy
              ? `translateY(0) translate(${px(-8)}px,${py(-4)}px)`
              : 'translateY(110%)',
            transition: rdy
              ? `transform 1.15s cubic-bezier(0.16,1,0.3,1) 0ms`
              : `transform 1.15s cubic-bezier(0.16,1,0.3,1) 0ms`,
          }}>
            THE
          </div>
        </div>

        {/* Line 2: MARKET, */}
        <div style={{ overflow: 'hidden', lineHeight: '0.88', marginLeft: '7vw' }}>
          <div style={{
            fontFamily: BRUT, fontWeight: 900, color: PAPER,
            fontSize: 'clamp(78px,14vw,206px)',
            letterSpacing: '-0.05em',
            fontVariationSettings: "'wdth' 125, 'wght' 900",
            transform: rdy
              ? `translateY(0) translate(${px(-5)}px,${py(-3)}px)`
              : 'translateY(110%)',
            transition: 'transform 1.15s cubic-bezier(0.16,1,0.3,1) 80ms',
          }}>
            MARKET,
          </div>
        </div>

        {/* Divider */}
        <div style={{
          height: 1, background: BD, margin: '20px 0',
          transformOrigin: 'left',
          transform: rdy ? 'scaleX(1)' : 'scaleX(0)',
          transition: 'transform 1.5s cubic-bezier(0.16,1,0.3,1) 220ms',
        }} />

        {/* Line 3: EXPLAINED. — italic Cormorant, outline */}
        <div style={{ overflow: 'hidden', lineHeight: '0.92', marginLeft: '16vw' }}>
          <div style={{
            fontFamily: SERIF,
            fontStyle: 'italic', fontWeight: 300,
            color: 'transparent',
            WebkitTextStroke: `1px ${PAPER}`,
            fontSize: 'clamp(78px,14vw,206px)',
            letterSpacing: '-0.04em',
            transform: rdy
              ? `translateY(0) translate(${px(-3)}px,${py(-2)}px)`
              : 'translateY(110%)',
            transition: 'transform 1.15s cubic-bezier(0.16,1,0.3,1) 160ms',
          }}>
            Explained.
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
        marginTop: 44, flexWrap: 'wrap', gap: 24, position: 'relative', zIndex: 2,
      }}>
        <p style={{
          fontFamily: SANS, fontSize: 'clamp(12px,1.2vw,14px)', lineHeight: 1.9,
          color: MD, maxWidth: 300,
          opacity: rdy ? 1 : 0, transform: rdy ? 'none' : 'translateY(12px)',
          transition: 'opacity 0.9s ease 700ms, transform 0.9s ease 700ms',
        }}>
          Real-time market intelligence<br />in plain English. No jargon.
        </p>
        <div style={{ opacity: rdy ? 1 : 0, transition: 'opacity 0.9s ease 850ms' }}>
          <Link to="/onboarding" style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            fontFamily: MONO, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase',
            color: INK, background: PAPER, padding: '14px 28px',
            borderRadius: '2px', textDecoration: 'none', transition: 'opacity 0.2s, transform 0.2s',
          }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '0.82'; e.currentTarget.style.transform = 'translateY(-2px)' }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'translateY(0)' }}
          >
            Get started free
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>

      {/* Scroll indicator */}
      <div style={{
        position: 'absolute', bottom: 36, right: 52,
        opacity: rdy ? 1 : 0, transition: 'opacity 1s ease 1100ms',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <Mono>Scroll</Mono>
          <div style={{
            width: 1, height: 44,
            background: `linear-gradient(to bottom, transparent, ${MD})`,
            animation: 'dripAnim 2.4s ease-in-out infinite',
          }} />
        </div>
      </div>
    </section>
  )
}

// ─── DualMarquee ─────────────────────────────────────────────────────────────
function DualMarquee() {
  const rowA = ['Real-time intelligence', 'Urgency scoring', 'Portfolio impact', 'Act with confidence', 'No jargon', 'Plain English']
  const rowB = ['AI-powered', 'Market signals', 'Retail investors', 'Know before the crowd', 'Free to start', 'Institutional grade']
  const triple = (arr) => [...arr, ...arr, ...arr]

  return (
    <div style={{ background: PAPER, borderTop: `1px solid ${BL}`, borderBottom: `1px solid ${BL}`, overflow: 'hidden' }}>
      {/* Row A → left */}
      <div style={{ padding: '10px 0', borderBottom: `1px solid ${BL}` }}>
        <div style={{ display: 'flex', width: 'max-content', animation: 'marqueeL 36s linear infinite' }}>
          {triple(rowA).map((w, i) => (
            <span key={i} style={{
              fontFamily: MONO, fontSize: 10, fontWeight: 500, letterSpacing: '0.22em',
              textTransform: 'uppercase', color: 'rgba(11,11,11,0.28)', whiteSpace: 'nowrap', padding: '0 22px',
            }}>
              {w}<span style={{ marginLeft: 22, opacity: 0.2 }}>×</span>
            </span>
          ))}
        </div>
      </div>
      {/* Row B ← right */}
      <div style={{ padding: '10px 0' }}>
        <div style={{ display: 'flex', width: 'max-content', animation: 'marqueeR 36s linear infinite' }}>
          {triple(rowB).map((w, i) => (
            <span key={i} style={{
              fontFamily: SANS, fontSize: 11, fontWeight: 600, letterSpacing: '0.08em',
              textTransform: 'uppercase', color: 'rgba(11,11,11,0.22)', whiteSpace: 'nowrap', padding: '0 22px',
            }}>
              {w}<span style={{ marginLeft: 22, opacity: 0.18 }}>—</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Statement (word-by-word scroll reveal) ───────────────────────────────────
const STMT_WORDS = 'We built the intelligence layer the market never had. Real-time. Scored for urgency. In plain English. Mapped to your portfolio.'.split(' ')

function Statement() {
  const containerRef = useRef(null)
  const progress = useElementProgress(containerRef)

  return (
    <div ref={containerRef} style={{ height: '260vh', position: 'relative', background: INK }}>
      <div style={{
        position: 'sticky', top: 0, height: '100vh',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '0 clamp(24px,6vw,96px)',
      }}>
        <div style={{
          fontFamily: BRUT, fontWeight: 800,
          fontSize: 'clamp(28px,4.2vw,58px)',
          lineHeight: 1.2, letterSpacing: '-0.03em',
          fontVariationSettings: "'wdth' 110, 'wght' 800",
          maxWidth: 900,
        }}>
          {STMT_WORDS.map((word, i) => {
            const threshold = i / STMT_WORDS.length
            const lit = progress > threshold * 0.9
            return (
              <span key={i} style={{
                color: lit ? PAPER : 'rgba(240,235,224,0.10)',
                transition: 'color 0.35s ease',
                marginRight: '0.28em',
                display: 'inline-block',
              }}>
                {word}
              </span>
            )
          })}
        </div>

        {/* Side label */}
        <div style={{
          position: 'absolute', right: 48, bottom: 48,
          opacity: progress > 0.05 ? 1 : 0, transition: 'opacity 0.4s ease',
        }}>
          <Mono>Our manifesto</Mono>
        </div>
      </div>
    </div>
  )
}

// ─── PinnedArchive (horizontal scroll) ────────────────────────────────────────
const ARCHIVE_CARDS = [
  { urgency: 'Act Now', color: ACT, ticker: 'NVDA', headline: 'Fed signals rate hold; growth stocks surge', time: '2m ago' },
  { urgency: 'Watch', color: OCHRE, ticker: 'AAPL', headline: 'Earnings beat on services revenue, hardware soft', time: '18m ago' },
  { urgency: 'Act Now', color: ACT, ticker: 'SPY', headline: 'CPI print below expectations — risk-on', time: '1h ago' },
  { urgency: 'Low', color: MOSS, ticker: 'BTC', headline: 'Exchange outflows at 6-month high — accumulation signal', time: '2h ago' },
  { urgency: 'Watch', color: OCHRE, ticker: 'TSLA', headline: 'Production guidance raised despite margin compression', time: '3h ago' },
]

function ArchiveCard({ card, vis, delay }) {
  return (
    <div style={{
      flexShrink: 0, width: 'clamp(280px,30vw,360px)',
      background: 'rgba(240,235,224,0.04)', border: `1px solid ${BD}`,
      borderTop: `2px solid ${card.color}`,
      borderRadius: '2px', padding: '28px 24px',
      opacity: vis ? 1 : 0,
      transform: vis ? 'translateY(0)' : 'translateY(24px)',
      transition: `opacity 0.7s ease ${delay}ms, transform 0.7s ease ${delay}ms`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <div style={{ width: 5, height: 5, borderRadius: '50%', background: card.color, flexShrink: 0 }} />
        <Mono style={{ color: card.color, letterSpacing: '0.2em' }}>{card.urgency}</Mono>
        <div style={{ flex: 1 }} />
        <Mono style={{ color: 'rgba(240,235,224,0.22)' }}>{card.time}</Mono>
      </div>
      <div style={{
        fontFamily: BRUT, fontWeight: 700, fontSize: 15, lineHeight: 1.4,
        letterSpacing: '-0.02em', color: PAPER, marginBottom: 20,
        fontVariationSettings: "'wdth' 100, 'wght' 700",
      }}>
        {card.headline}
      </div>
      <div style={{
        fontFamily: MONO, fontSize: 11, fontWeight: 500,
        letterSpacing: '0.16em', color: 'rgba(240,235,224,0.35)',
      }}>
        {card.ticker}
      </div>
    </div>
  )
}

function PinnedArchive() {
  const containerRef = useRef(null)
  const progress = useElementProgress(containerRef)
  const [ref, vis] = useInView(0.05)

  // Track width: enough to scroll through all cards
  const totalCards = ARCHIVE_CARDS.length
  const gapVw = 3
  const offset = progress * (totalCards - 1) * (30 + gapVw)

  return (
    <div ref={containerRef} style={{ height: '320vh', position: 'relative', background: INK }}>
      <div ref={ref} style={{ position: 'sticky', top: 0, height: '100vh', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{
          position: 'absolute', top: 60, left: 'clamp(24px,5vw,72px)',
          display: 'flex', alignItems: 'center', gap: 24,
          opacity: vis ? 1 : 0, transition: 'opacity 0.7s ease',
        }}>
          <div style={{ height: 1, width: 32, background: BD }} />
          <Mono>Live intelligence</Mono>
        </div>

        {/* Section label */}
        <div style={{
          position: 'absolute', top: 56, right: 'clamp(24px,5vw,72px)',
          opacity: vis ? 1 : 0, transition: 'opacity 0.7s ease 0.2s',
        }}>
          <span style={{
            fontFamily: BRUT, fontWeight: 900, fontSize: 11, letterSpacing: '0.14em',
            textTransform: 'uppercase', color: 'rgba(240,235,224,0.15)',
            fontVariationSettings: "'wdth' 130, 'wght' 900",
          }}>
            {String(Math.round(progress * 100)).padStart(2, '0')} / 100
          </span>
        </div>

        {/* Cards track */}
        <div style={{
          position: 'absolute', left: 'clamp(24px,5vw,72px)', top: '50%',
          transform: 'translateY(-50%)',
          display: 'flex', gap: `${gapVw}vw`, alignItems: 'stretch',
          transition: 'none',
          translate: `${-offset}vw 0`,
          willChange: 'translate',
        }}>
          {ARCHIVE_CARDS.map((card, i) => (
            <ArchiveCard key={i} card={card} vis={vis} delay={i * 80} />
          ))}
        </div>

        {/* Bottom: scroll hint */}
        <div style={{
          position: 'absolute', bottom: 44, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', alignItems: 'center', gap: 10,
          opacity: progress < 0.05 ? 0.6 : 0, transition: 'opacity 0.5s ease',
        }}>
          <div style={{ width: 20, height: 1, background: BD }} />
          <Mono>Scroll to explore</Mono>
          <div style={{ width: 20, height: 1, background: BD }} />
        </div>

        {/* Progress dots */}
        <div style={{
          position: 'absolute', bottom: 44, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', gap: 8, alignItems: 'center',
          opacity: progress > 0.05 ? 0.6 : 0, transition: 'opacity 0.4s ease',
        }}>
          {ARCHIVE_CARDS.map((_, i) => {
            const activeIdx = Math.round(progress * (ARCHIVE_CARDS.length - 1))
            return (
              <div key={i} style={{
                width: activeIdx === i ? 20 : 4, height: 4,
                background: activeIdx === i ? PAPER : 'rgba(240,235,224,0.22)',
                borderRadius: '2px', transition: 'width 0.3s ease, background 0.3s ease',
              }} />
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Numbers ──────────────────────────────────────────────────────────────────
const STATS = [
  { n: 92, suffix: '%', label: 'of users understand market events in under 3 minutes' },
  { n: 60, suffix: '%', label: 'of retail investors miss critical signals without tools' },
  { n: 0,  suffix: '$', label: 'cost to get started — no credit card required', prefix: '$' },
]

function StatItem({ n, suffix, label, prefix, vis, delay }) {
  const v = useCounter(n, vis, 2200)
  return (
    <div style={{
      opacity: vis ? 1 : 0, transform: vis ? 'none' : 'translateY(20px)',
      transition: `opacity 0.9s ease ${delay}ms, transform 0.9s ease ${delay}ms`,
      paddingTop: 32, borderTop: `1px solid ${BL}`,
    }}>
      <div style={{
        fontFamily: BRUT, fontWeight: 900, letterSpacing: '-0.05em',
        fontSize: 'clamp(52px,8vw,110px)', lineHeight: 0.9, color: INK,
        fontVariationSettings: "'wdth' 125, 'wght' 900",
      }}>
        {prefix ?? ''}{v}<span style={{ fontSize: '0.35em', fontStyle: 'italic', fontFamily: SERIF, color: ML }}>{suffix}</span>
      </div>
      <p style={{
        fontFamily: SANS, fontSize: 13, color: ML, lineHeight: 1.75,
        maxWidth: 260, marginTop: 14,
      }}>
        {label}
      </p>
    </div>
  )
}

function Numbers() {
  const [ref, vis] = useInView(0.1)
  return (
    <section ref={ref} style={{ background: PAPER, padding: 'clamp(72px,10vw,120px) clamp(24px,5vw,72px)' }}>
      <div style={{ maxWidth: 1360, margin: '0 auto' }}>
        <div style={{ marginBottom: 64 }}>
          <Line vis={vis} style={{ display: 'inline-block' }}>
            <span style={{
              fontFamily: BRUT, fontWeight: 900,
              fontSize: 'clamp(32px,5.5vw,72px)',
              letterSpacing: '-0.04em', color: INK,
              fontVariationSettings: "'wdth' 120, 'wght' 900",
            }}>
              Numbers don't lie.
            </span>
          </Line>
        </div>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px,1fr))', gap: 'clamp(32px,5vw,64px)',
        }}>
          {STATS.map((s, i) => <StatItem key={i} {...s} vis={vis} delay={i * 120} />)}
        </div>
      </div>
    </section>
  )
}

// ─── Manifesto (200vh pinned, text skews) ────────────────────────────────────
const MANIFESTO_LINES = [
  'The market speaks',
  'every second.',
  'Most people',
  'never hear it.',
]

function Manifesto() {
  const containerRef = useRef(null)
  const progress = useElementProgress(containerRef)
  const skew = (progress - 0.5) * -6
  const scale = 0.92 + progress * 0.08

  return (
    <div ref={containerRef} style={{ height: '200vh', position: 'relative', background: INK }}>
      <div style={{
        position: 'sticky', top: 0, height: '100vh',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '0 clamp(24px,5vw,72px)', overflow: 'hidden',
      }}>
        <div style={{ transform: `skewX(${skew}deg) scale(${scale})`, transition: 'transform 0.05s linear' }}>
          {MANIFESTO_LINES.map((line, i) => (
            <div key={i} style={{
              fontFamily: BRUT, fontWeight: 900,
              fontSize: 'clamp(36px,7vw,96px)',
              letterSpacing: '-0.04em', lineHeight: 0.95,
              color: i % 2 === 0 ? PAPER : 'transparent',
              WebkitTextStroke: i % 2 !== 0 ? `1px ${PAPER}` : undefined,
              fontVariationSettings: `'wdth' ${100 + i * 8}, 'wght' 900`,
              opacity: 0.15 + (progress * 0.85),
              transition: 'opacity 0.1s linear',
            }}>
              {line}
            </div>
          ))}
        </div>

        {/* Corner label */}
        <div style={{ position: 'absolute', top: 48, right: 48 }}>
          <Mono>Travauxus</Mono>
        </div>

        {/* Bottom rule that draws */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: 1, background: BD,
          transformOrigin: 'left',
          transform: `scaleX(${progress})`,
        }} />
      </div>
    </div>
  )
}

// ─── Convergence (scatter → grid) ────────────────────────────────────────────
const CONV_FRAGMENTS = [
  { label: 'Real-time', sub: 'Feed' },
  { label: 'AI-powered', sub: 'Summaries' },
  { label: 'Portfolio', sub: 'Impact' },
  { label: 'Urgency', sub: 'Scoring' },
  { label: 'Gov trades', sub: 'Tracker' },
  { label: 'Plain', sub: 'English' },
]

function Convergence() {
  const containerRef = useRef(null)
  const progress = useElementProgress(containerRef)

  const scattered = [
    { x: -28, y: -18, r: -12 },
    { x: 22, y: -26, r: 8 },
    { x: -18, y: 14, r: -6 },
    { x: 30, y: 18, r: 10 },
    { x: -24, y: 4, r: -8 },
    { x: 20, y: -8, r: 6 },
  ]

  const ease = 1 - Math.pow(1 - progress, 3)

  return (
    <div ref={containerRef} style={{ height: '180vh', position: 'relative', background: PAPER }}>
      <div style={{
        position: 'sticky', top: 0, height: '100vh',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '0 clamp(24px,5vw,72px)', overflow: 'hidden',
        gap: 48,
      }}>
        {/* Header */}
        <div style={{
          textAlign: 'center', opacity: ease > 0.1 ? 1 : 0,
          transition: 'opacity 0.4s ease',
        }}>
          <Mono dark>Everything in one place</Mono>
        </div>

        {/* Fragments grid */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3,1fr)',
          gap: 'clamp(12px,2vw,24px)', width: '100%', maxWidth: 800,
        }}>
          {CONV_FRAGMENTS.map((frag, i) => {
            const s = scattered[i]
            const tx = s.x * (1 - ease)
            const ty = s.y * (1 - ease)
            const rot = s.r * (1 - ease)
            const op = 0.2 + ease * 0.8
            return (
              <div key={i} style={{
                transform: `translate(${tx}px, ${ty}px) rotate(${rot}deg)`,
                opacity: op,
                transition: 'none',
                background: INK, borderRadius: '2px', padding: '20px 18px',
                border: `1px solid rgba(11,11,11,${0.08 + ease * 0.12})`,
                borderTop: `2px solid ${INK}`,
              }}>
                <div style={{
                  fontFamily: BRUT, fontWeight: 800, fontSize: 15,
                  letterSpacing: '-0.025em', color: PAPER, marginBottom: 4,
                  fontVariationSettings: "'wdth' 110, 'wght' 800",
                }}>
                  {frag.label}
                </div>
                <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.2em', color: 'rgba(240,235,224,0.35)' }}>
                  {frag.sub.toUpperCase()}
                </div>
              </div>
            )
          })}
        </div>

        {/* Progress */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: ease }}>
          <div style={{ width: 80, height: 1, background: BL }}>
            <div style={{ width: `${ease * 100}%`, height: '100%', background: INK, transition: 'none' }} />
          </div>
          <Mono dark>{Math.round(ease * 100)}%</Mono>
        </div>
      </div>
    </div>
  )
}

// ─── CtaSection ───────────────────────────────────────────────────────────────
function CtaSection() {
  const [ref, vis] = useInView(0.1)
  return (
    <section ref={ref} style={{
      background: INK, minHeight: '80vh',
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
      padding: 'clamp(80px,10vw,120px) clamp(24px,5vw,72px)',
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', width: '100%' }}>
        <div style={{
          height: 1, background: BD,
          transformOrigin: 'left',
          transform: vis ? 'scaleX(1)' : 'scaleX(0)',
          transition: 'transform 1.5s cubic-bezier(0.16,1,0.3,1)',
          marginBottom: 64,
        }} />

        <div>
          {[
            { text: 'Start reading', fill: true },
            { text: 'the market', fill: true },
            { text: 'differently.', fill: false },
          ].map(({ text, fill }, i) => (
            <Line key={i} vis={vis} delay={i * 85} style={{ lineHeight: '0.92', marginBottom: 4 }}>
              <span style={{
                fontFamily: BRUT, fontWeight: 900,
                fontSize: 'clamp(44px,9vw,140px)',
                letterSpacing: '-0.04em',
                fontVariationSettings: "'wdth' 125, 'wght' 900",
                color: fill ? PAPER : 'transparent',
                WebkitTextStroke: !fill ? `1px ${PAPER}` : undefined,
                display: 'block',
              }}>
                {text}
              </span>
            </Line>
          ))}
        </div>

        <div style={{
          marginTop: 60, display: 'flex', gap: 20, alignItems: 'center',
          flexWrap: 'wrap',
          opacity: vis ? 1 : 0, transition: 'opacity 0.9s ease 0.5s',
        }}>
          <Link to="/onboarding" style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            fontFamily: MONO, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase',
            color: INK, background: PAPER, padding: '16px 36px',
            borderRadius: '2px', textDecoration: 'none', transition: 'opacity 0.2s, transform 0.2s',
          }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '0.82'; e.currentTarget.style.transform = 'translateY(-2px)' }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'translateY(0)' }}
          >
            Get started free
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
          <Link to="/pricing" style={{
            fontFamily: MONO, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase',
            color: MD, textDecoration: 'none',
            borderBottom: '1px solid rgba(240,235,224,0.18)', paddingBottom: 2,
            transition: 'color 0.2s, border-color 0.2s',
          }}
            onMouseEnter={e => { e.currentTarget.style.color = PAPER; e.currentTarget.style.borderColor = 'rgba(240,235,224,0.5)' }}
            onMouseLeave={e => { e.currentTarget.style.color = MD; e.currentTarget.style.borderColor = 'rgba(240,235,224,0.18)' }}
          >
            View pricing
          </Link>
        </div>
      </div>
    </section>
  )
}

// ─── Footer ───────────────────────────────────────────────────────────────────
const WORDMARK_ITEMS = ['TRAVAUXUS', 'The Market, Explained.', 'TRAVAUXUS', 'The Market, Explained.', 'TRAVAUXUS', 'The Market, Explained.']

function Footer() {
  return (
    <footer style={{ background: '#070707', borderTop: `1px solid ${BD}` }}>
      {/* Wordmark marquee */}
      <div style={{ padding: '28px 0', borderBottom: `1px solid ${BD}`, overflow: 'hidden' }}>
        <div style={{ display: 'flex', width: 'max-content', animation: 'marqueeL 24s linear infinite' }}>
          {[...WORDMARK_ITEMS, ...WORDMARK_ITEMS].map((w, i) => (
            <span key={i} style={{
              fontFamily: i % 2 === 0 ? BRUT : SERIF,
              fontWeight: i % 2 === 0 ? 900 : 300,
              fontStyle: i % 2 !== 0 ? 'italic' : 'normal',
              fontSize: i % 2 === 0 ? 32 : 22,
              letterSpacing: i % 2 === 0 ? '-0.04em' : '0.01em',
              fontVariationSettings: i % 2 === 0 ? "'wdth' 125, 'wght' 900" : undefined,
              color: i % 2 === 0 ? 'rgba(240,235,224,0.12)' : 'rgba(240,235,224,0.06)',
              whiteSpace: 'nowrap', padding: '0 28px',
            }}>
              {w}
            </span>
          ))}
        </div>
      </div>

      {/* Footer content */}
      <div style={{ padding: '48px clamp(24px,5vw,72px)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 40 }}>
        <div>
          <div style={{
            fontFamily: BRUT, fontWeight: 900, fontSize: 16, letterSpacing: '-0.03em',
            textTransform: 'uppercase', color: PAPER, marginBottom: 12,
            fontVariationSettings: "'wdth' 110, 'wght' 900",
          }}>
            TRAVAUXUS
          </div>
          <p style={{ fontFamily: SANS, fontSize: 12, color: 'rgba(240,235,224,0.2)', maxWidth: 200, lineHeight: 1.8 }}>
            Market intelligence for everyone.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 48, flexWrap: 'wrap' }}>
          {[
            { col: 'Product', links: [{ n: 'Features', to: '/onboarding' }, { n: 'Pricing', to: '/pricing' }] },
            { col: 'Legal', links: [{ n: 'Disclaimer', to: '#' }] },
          ].map(({ col, links }) => (
            <div key={col}>
              <Mono style={{ display: 'block', marginBottom: 16 }}>{col}</Mono>
              {links.map(l => (
                <Link key={l.n} to={l.to} style={{
                  display: 'block', fontFamily: SANS, fontSize: 13,
                  color: 'rgba(240,235,224,0.28)', textDecoration: 'none', marginBottom: 10,
                  transition: 'color 0.2s',
                }}
                  onMouseEnter={e => e.currentTarget.style.color = PAPER}
                  onMouseLeave={e => e.currentTarget.style.color = 'rgba(240,235,224,0.28)'}
                >
                  {l.n}
                </Link>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div style={{
        margin: '0 clamp(24px,5vw,72px)', paddingTop: 24, paddingBottom: 32,
        borderTop: `1px solid rgba(240,235,224,0.05)`,
        display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
      }}>
        <Mono>© {new Date().getFullYear()} Travauxus</Mono>
        <Mono>For informational purposes only. Not financial advice.</Mono>
      </div>
    </footer>
  )
}

// ─── ScrollIndex (right-rail progress indicator) ─────────────────────────────
const SECTIONS = ['Hero', 'Archive', 'Statement', 'Numbers', 'Manifesto', 'Convergence', 'CTA']

function ScrollIndex() {
  const y = useScrollY()
  const [active, setActive] = useState(0)

  useEffect(() => {
    const h = window.innerHeight
    const total = document.documentElement.scrollHeight - h
    const pct = total > 0 ? y / total : 0
    setActive(Math.min(SECTIONS.length - 1, Math.floor(pct * SECTIONS.length)))
  }, [y])

  return (
    <div style={{
      position: 'fixed', right: 20, top: '50%', transform: 'translateY(-50%)',
      zIndex: 150, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end',
    }}>
      {SECTIONS.map((s, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontFamily: MONO, fontSize: 8, letterSpacing: '0.18em', textTransform: 'uppercase',
            color: active === i ? 'rgba(240,235,224,0.55)' : 'transparent',
            transition: 'color 0.3s ease',
            whiteSpace: 'nowrap',
          }}>
            {s}
          </span>
          <div style={{
            width: active === i ? 16 : 4,
            height: 4,
            background: active === i ? PAPER : 'rgba(240,235,224,0.18)',
            borderRadius: '2px',
            transition: 'width 0.3s ease, background 0.3s ease',
          }} />
        </div>
      ))}
    </div>
  )
}

// ─── Landing ──────────────────────────────────────────────────────────────────
export default function Landing() {
  const [ready, setReady] = useState(false)

  return (
    <div style={{ background: INK, overflowX: 'hidden' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,200..800&family=Space+Grotesk:wght@300;400;500;600;700&family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400;1,600&family=JetBrains+Mono:wght@400;500&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }

        body::before {
          content: '';
          position: fixed; inset: 0; z-index: 9997; pointer-events: none;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.88' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
          background-size: 180px 180px; opacity: 0.033; mix-blend-mode: overlay;
        }

        @keyframes marqueeL { from { transform: translateX(0) } to { transform: translateX(-50%) } }
        @keyframes marqueeR { from { transform: translateX(-50%) } to { transform: translateX(0) } }
        @keyframes tkDrift  { from { transform: translateX(0) } to { transform: translateX(-33.333%) } }
        @keyframes tkDriftRev { from { transform: translateX(-33.333%) } to { transform: translateX(0) } }
        @keyframes dripAnim {
          0%   { opacity: 0; transform: scaleY(0.3) translateY(-12px); }
          55%  { opacity: 1; transform: scaleY(1) translateY(0); }
          100% { opacity: 0; transform: scaleY(0.3) translateY(12px); }
        }

        @media (max-width: 640px) {
          nav { padding: 0 20px !important; }
        }
      `}</style>

      {!ready && <Preloader onDone={() => setReady(true)} />}
      {ready && <ScrollIndex />}

      <Nav />
      <Hero />
      <DualMarquee />
      <Statement />
      <PinnedArchive />
      <Numbers />
      <Manifesto />
      <Convergence />
      <CtaSection />
      <Footer />
    </div>
  )
}
