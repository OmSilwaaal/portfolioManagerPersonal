import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createEngine } from '../landing/asciiEngine'
import { STAGES } from '../landing/content'

/* Monochrome "book page" palette */
const PAPER = '#efeee9'
const INK = '#111110'
const GREY = '#6f6f68'
const FAINT = '#a9a9a1'
const RULE = 'rgba(17,17,16,0.14)'

const DISPLAY = "'Anybody', 'Arial Narrow', sans-serif"
const MONO = "'Courier Prime', 'Courier New', monospace"

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v)
const lerp = (a, b, t) => a + (b - a) * t
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t) }

const STAGE_SCROLL_VH = 170

const GRAIN = "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")"

function loadFonts() {
  if (!document.fonts || !document.fonts.load) return Promise.resolve()
  const wanted = [
    document.fonts.load('900 120px Fraunces', 'TRAVAUX'),
    document.fonts.load('400 15px "Courier Prime"', 'M'),
    document.fonts.load('700 15px "Courier Prime"', 'M'),
    document.fonts.load('800 20px Anybody', 'A'),
  ]
  const timeout = new Promise((res) => setTimeout(res, 2500))
  return Promise.race([Promise.allSettled(wanted), timeout])
}

function Mono({ children, style, className }) {
  return (
    <span className={className} style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: GREY, ...style }}>
      {children}
    </span>
  )
}

function Button({ children, onClick, variant = 'solid' }) {
  const solid = variant === 'solid'
  return (
    <button
      onClick={onClick}
      className="tvx-btn"
      style={{
        fontFamily: DISPLAY, fontStretch: '125%', fontWeight: 800, fontSize: 13,
        letterSpacing: '0.06em', textTransform: 'uppercase',
        padding: '15px 28px', borderRadius: 0, cursor: 'pointer',
        background: solid ? INK : 'transparent', color: solid ? PAPER : INK,
        border: `1.5px solid ${INK}`,
      }}
    >
      {children}
    </button>
  )
}

function Footer() {
  const links = [
    { label: 'Disclaimer', href: '/disclaimer' },
    { label: 'Terms', href: '/terms' },
    { label: 'Privacy', href: '/privacy' },
  ]
  return (
    <footer style={{ background: PAPER, borderTop: `1.5px solid ${INK}`, position: 'relative', zIndex: 2 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 32, padding: '48px clamp(20px,4vw,56px) 40px' }}>
        <div>
          <Mono style={{ color: INK }}>Travauxus</Mono>
          <p style={{ fontFamily: MONO, fontSize: 14, lineHeight: 1.6, color: GREY, maxWidth: 300, margin: '14px 0 0' }}>
            AI news, portfolio impact, upside picks, gov trades, and crypto intel — in plain English.
          </p>
        </div>
        <div>
          <Mono>Legal</Mono>
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {links.map((l) => (
              <a key={l.label} href={l.href} className="tvx-link" style={{ fontFamily: MONO, fontSize: 14, color: INK, textDecoration: 'none', width: 'fit-content' }}>{l.label}</a>
            ))}
          </div>
        </div>
        <div>
          <Mono>Note</Mono>
          <p style={{ fontFamily: MONO, fontSize: 13, lineHeight: 1.6, color: GREY, margin: '14px 0 0' }}>
            For informational purposes only. Not financial advice.
          </p>
        </div>
      </div>
      <div style={{ overflow: 'hidden', borderTop: `1px solid ${RULE}`, padding: '0 clamp(8px,2vw,28px)' }}>
        <div aria-hidden="true" style={{ fontFamily: DISPLAY, fontStretch: '150%', fontWeight: 900, fontSize: 'clamp(40px, 10.1vw, 230px)', lineHeight: 0.92, letterSpacing: '-0.035em', color: INK, textTransform: 'uppercase', whiteSpace: 'nowrap', padding: '0.08em 0 0.02em' }}>
          Travauxus
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, padding: '14px clamp(20px,4vw,56px)', borderTop: `1px solid ${RULE}` }}>
        <Mono>© {new Date().getFullYear()} Travauxus</Mono>
        <Mono>Vol. 01</Mono>
      </div>
    </footer>
  )
}

export default function Landing() {
  const navigate = useNavigate()
  const onEnter = () => navigate('/onboarding')

  const scrollerRef = useRef(null)
  const canvasRef = useRef(null)
  const diamondRef = useRef(null)
  const diamondSvgRef = useRef(null)
  const pathARef = useRef(null)
  const pathBRef = useRef(null)
  const wordRef = useRef(null)
  const chromeRef = useRef(null)
  const ctaRef = useRef(null)
  const railRef = useRef([])
  const engineRef = useRef(null)
  const stageRef = useRef(0)

  const [ready, setReady] = useState(false)
  const [stage, setStage] = useState(0)
  const [introDone, setIntroDone] = useState(false)

  const seen = (() => { try { return sessionStorage.getItem('tvx_intro2') === '1' } catch { return false } })()
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // paper background behind the whole document while this page is mounted
  useEffect(() => {
    const prevBody = document.body.style.background
    const prevHtml = document.documentElement.style.background
    document.body.style.background = PAPER
    document.documentElement.style.background = PAPER
    return () => {
      document.body.style.background = prevBody
      document.documentElement.style.background = prevHtml
      document.body.style.overflow = ''
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    loadFonts().then(() => { if (!cancelled) setReady(true) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!ready) return undefined
    const canvas = canvasRef.current
    const scroller = scrollerRef.current
    if (!canvas || !scroller) return undefined

    const skip = seen || reduced
    if (!skip) { document.body.style.overflow = 'hidden'; window.scrollTo(0, 0) }

    const getProgress = () => {
      const total = scroller.offsetHeight - window.innerHeight
      if (total <= 0) return 0
      return clamp(-scroller.getBoundingClientRect().top / total)
    }

    const engine = createEngine({
      canvas,
      reduced,
      skipIntro: skip,
      getProgress,
      onIntroDone: () => {
        document.body.style.overflow = ''
        try { sessionStorage.setItem('tvx_intro2', '1') } catch { /* storage unavailable */ }
        setIntroDone(true)
      },
      onFrame: ({ s, intro, geom, W, H, stages }) => {
        // logo: centre of screen -> beside the wordmark -> nav
        const hero = geom.hero
        const nav = geom.nav
        let x = hero.x, y = hero.y, size = hero.size
        if (intro.active) {
          const m = intro.move
          const big = Math.min(150, Math.min(W, H) * 0.3)
          x = lerp(W / 2 - big / 2, hero.x, m)
          y = lerp(H / 2 - big / 2, hero.y, m)
          size = lerp(big, hero.size, m)
        }
        const k = easeInOut(clamp(s / 0.45))
        x = lerp(x, nav.x, k); y = lerp(y, nav.y, k); size = lerp(size, nav.size, k)

        const d = diamondRef.current
        if (d) {
          d.style.transform = `translate3d(${x}px, ${y}px, 0)`
          d.style.width = d.style.height = `${size}px`
          d.style.opacity = '1'
        }
        const sw = (1.9 / size) * 24
        ;[pathARef.current, pathBRef.current].forEach((el) => { if (el) el.style.strokeWidth = sw })
        const draw = intro.active ? intro.draw : 1
        if (pathARef.current) pathARef.current.style.strokeDashoffset = String(1 - draw)
        if (pathBRef.current) pathBRef.current.style.strokeDashoffset = String(1 - clamp(draw * 1.25 - 0.25))

        const w = wordRef.current
        if (w) {
          w.style.transform = `translate3d(${nav.x + nav.size + 10}px, ${nav.y + 1}px, 0)`
          w.style.opacity = String(smooth(0.35, 0.6, s))
        }

        const cta = ctaRef.current
        if (cta) {
          const a = smooth(stages - 1.75, stages - 1.1, s)
          cta.style.opacity = String(a)
          cta.style.pointerEvents = a > 0.6 ? 'auto' : 'none'
          cta.style.transform = `translateY(${(1 - a) * 14}px)`
        }

        railRef.current.forEach((el, i) => {
          if (!el) return
          const near = 1 - clamp(Math.abs(s - i))
          el.style.width = `${10 + near * 16}px`
          el.style.opacity = String(0.35 + near * 0.65)
        })

        const idx = Math.round(clamp(s, 0, stages - 1))
        if (!intro.active && idx !== stageRef.current) { stageRef.current = idx; setStage(idx) }
      },
    })
    engineRef.current = engine
    return () => { engine.destroy(); engineRef.current = null; document.body.style.overflow = '' }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  const skipIntro = () => { if (engineRef.current && !introDone) engineRef.current.skipIntro() }

  const goTo = (i) => {
    const sc = scrollerRef.current
    if (!sc) return
    const total = sc.offsetHeight - window.innerHeight
    const top = sc.getBoundingClientRect().top + window.scrollY
    window.scrollTo({ top: top + (i / (STAGES.length - 1)) * total, behavior: 'smooth' })
  }

  const chromeVisible = introDone || seen || reduced
  const stageNo = String(stage + 1).padStart(2, '0')
  const stageTotal = String(STAGES.length).padStart(2, '0')

  return (
    <div style={{ background: PAPER, color: INK, overflowX: 'clip', minHeight: '100vh' }} onClick={skipIntro}>
      <style>{`
        .tvx-panel { height: 100vh; }
        @supports (height: 100svh) { .tvx-panel { height: 100svh; } }
        .tvx-btn { transition: background .18s, color .18s, transform .18s; }
        .tvx-btn:hover { transform: translate(-2px,-2px); box-shadow: 4px 4px 0 ${INK}; }
        .tvx-btn:active { transform: none; box-shadow: none; }
        .tvx-btn:focus-visible, .tvx-rail:focus-visible, .tvx-link:focus-visible { outline: 2px solid ${INK}; outline-offset: 3px; }
        .tvx-link { background: linear-gradient(${INK}, ${INK}) 0 100% / 0 1px no-repeat; transition: background-size .25s; }
        .tvx-link:hover { background-size: 100% 1px; }
        .tvx-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
        @media (max-width: 640px) { .tvx-meta-mid { display: none !important; } .tvx-rail-wrap { display: none !important; } }
      `}</style>

      {/* Accessible text equivalent of the canvas */}
      <div className="tvx-sr">
        <h1>Travauxus — the market, explained.</h1>
        {STAGES.filter((s) => s.kind === 'text').flatMap((s) => s.blocks).map((b) => (
          <section key={b.h}><h2>{b.h}</h2><p>{b.p}</p></section>
        ))}
      </div>

      <div ref={scrollerRef} style={{ height: `calc(100vh + ${(STAGES.length - 1) * STAGE_SCROLL_VH}vh)`, position: 'relative' }}>
        <div className="tvx-panel" style={{ position: 'sticky', top: 0, overflow: 'hidden', background: PAPER }}>
          <canvas ref={canvasRef} aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', opacity: ready ? 1 : 0 }} />

          {/* book chrome: running head, folio, hairlines */}
          <div ref={chromeRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: chromeVisible ? 1 : 0, transition: 'opacity .8s ease' }}>
            <div style={{ position: 'absolute', left: 0, right: 0, top: 56, height: 1, background: RULE }} />
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 40, height: 1, background: RULE }} />
            <div style={{ position: 'absolute', left: 'clamp(20px,4vw,56px)', right: 'clamp(20px,4vw,56px)', bottom: 0, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Mono style={{ fontSize: 10 }}>Travauxus · Vol. 01</Mono>
              <Mono className="tvx-meta-mid" style={{ fontSize: 10 }}>— {stageNo} / {stageTotal} —</Mono>
              <Mono style={{ fontSize: 10, color: INK }}>{STAGES[stage].label}</Mono>
            </div>
          </div>

          {/* logo — one element that travels from the cover to the nav */}
          <div ref={diamondRef} style={{ position: 'absolute', left: 0, top: 0, width: 80, height: 80, zIndex: 4, willChange: 'transform', opacity: 0 }}>
            <svg ref={diamondSvgRef} viewBox="0 0 24 24" fill="none" width="100%" height="100%" style={{ display: 'block', overflow: 'visible' }} aria-hidden="true">
              <path ref={pathARef} d="M12 2L22 12L12 22L2 12Z" pathLength="1" stroke={INK} strokeWidth="1.5" strokeLinejoin="miter" strokeDasharray="1 1" strokeDashoffset="1" />
              <path ref={pathBRef} d="M12 6.5L17.5 12L12 17.5L6.5 12Z" pathLength="1" stroke={INK} strokeWidth="1.5" strokeLinejoin="miter" strokeDasharray="1 1" strokeDashoffset="1" />
            </svg>
          </div>
          <div ref={wordRef} style={{ position: 'absolute', left: 0, top: 0, zIndex: 4, opacity: 0, fontFamily: DISPLAY, fontStretch: '125%', fontWeight: 800, fontSize: 15, letterSpacing: '0.02em', textTransform: 'uppercase', color: INK, lineHeight: '22px', pointerEvents: 'none' }}>
            Travauxus
          </div>

          {/* nav */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 56, zIndex: 6, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 clamp(20px,4vw,56px)', opacity: chromeVisible ? 1 : 0, transition: 'opacity .8s ease .15s', pointerEvents: chromeVisible ? 'auto' : 'none' }}>
            <button
              onClick={(e) => { e.stopPropagation(); onEnter() }}
              className="tvx-btn"
              style={{ fontFamily: DISPLAY, fontStretch: '125%', fontWeight: 800, fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '9px 18px', background: 'transparent', color: INK, border: `1.5px solid ${INK}`, borderRadius: 0, cursor: 'pointer' }}
            >
              Sign in →
            </button>
          </div>

          {/* progress rail */}
          <div className="tvx-rail-wrap" style={{ position: 'absolute', right: 'clamp(12px,2vw,28px)', top: '50%', transform: 'translateY(-50%)', zIndex: 6, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, opacity: chromeVisible ? 1 : 0, transition: 'opacity .8s ease .3s' }}>
            {STAGES.map((s, i) => (
              <button
                key={s.id}
                className="tvx-rail"
                aria-label={`Go to ${s.label}`}
                onClick={(e) => { e.stopPropagation(); goTo(i) }}
                style={{ background: 'transparent', border: 0, padding: '6px 0', cursor: 'pointer', display: 'flex', justifyContent: 'flex-end' }}
              >
                <span ref={(el) => { railRef.current[i] = el }} style={{ display: 'block', height: 2, width: 10, background: INK, opacity: 0.35 }} />
              </button>
            ))}
          </div>

          {/* closing call to action */}
          <div ref={ctaRef} style={{ position: 'absolute', left: 0, right: 0, bottom: 'clamp(70px, 13vh, 130px)', zIndex: 6, display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap', opacity: 0, pointerEvents: 'none' }}>
            <Button onClick={onEnter}>Get started free →</Button>
          </div>

          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5, backgroundImage: GRAIN, backgroundSize: '200px 200px', opacity: 0.07, mixBlendMode: 'multiply' }} />
        </div>
      </div>

      <Footer />
    </div>
  )
}
