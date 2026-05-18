import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

/* ─── Icons ──────────────────────────────────────────────────────────────── */
function IconBuilding() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
    </svg>
  )
}
function IconBrain() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a4 4 0 0 1 4 4 4 4 0 0 1 2 7.46V18a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-4.54A4 4 0 0 1 8 6a4 4 0 0 1 4-4z"/>
      <path d="M12 6v6M9 9h6"/>
    </svg>
  )
}
function IconBell() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  )
}

/* ─── Data ───────────────────────────────────────────────────────────────── */
const features = [
  { icon: <IconBuilding />, title: 'Congressional Trades', description: 'Every STOCK Act disclosure, surfaced with AI context on committee overlap and urgency.' },
  { icon: <IconBrain />,    title: 'AI Market Summaries',  description: 'Hundreds of news items distilled into plain-English urgency-scored briefs.' },
  { icon: <IconBell />,     title: 'Price Alerts',         description: 'Set threshold alerts on any stock or crypto and get notified instantly.' },
]

const NAV_SECTIONS = [
  { id: 'section-hero',       label: 'Overview'      },
  { id: 'section-features',   label: 'Features'      },
  { id: 'section-gov-trades', label: 'Congressional' },
  { id: 'section-cta',        label: 'Get started'   },
]

/* ─── Liquid glass style ─────────────────────────────────────────────────── */
const glassStyle = {
  background: 'linear-gradient(145deg, rgba(255,255,255,0.13) 0%, rgba(255,255,255,0.05) 50%, rgba(255,255,255,0.10) 100%)',
  backdropFilter: 'blur(32px) saturate(200%)',
  WebkitBackdropFilter: 'blur(32px) saturate(200%)',
  border: '1px solid rgba(255,255,255,0.18)',
  boxShadow: [
    '0 16px 48px rgba(0,0,0,0.55)',
    'inset 0 1px 0 rgba(255,255,255,0.22)',
    'inset 0 -1px 0 rgba(255,255,255,0.06)',
    'inset 1px 0 0 rgba(255,255,255,0.10)',
  ].join(', '),
}

/* ─── Scroll-reactive light orb ─────────────────────────────────────────── */
function ScrollLight() {
  const lightRef = useRef(null)
  const posRef   = useRef({ x: 50, y: 12 })
  const targetRef = useRef({ x: 50, y: 12 })
  const rafRef   = useRef(null)

  useEffect(() => {
    const onScroll = () => {
      const maxScroll = document.body.scrollHeight - window.innerHeight
      const p = maxScroll > 0 ? window.scrollY / maxScroll : 0
      // Light descends from 12 % → 88 % as the user scrolls to the bottom
      targetRef.current.y = 12 + p * 76
    }

    const onMouse = (e) => {
      // Drifts 35 %–65 % horizontally following the cursor
      targetRef.current.x = 35 + (e.clientX / window.innerWidth) * 30
    }

    const tick = () => {
      const cur = posRef.current
      const tgt = targetRef.current
      // Smooth lerp — slow enough to feel weighted
      cur.x += (tgt.x - cur.x) * 0.035
      cur.y += (tgt.y - cur.y) * 0.035

      if (lightRef.current) {
        lightRef.current.style.background = [
          `radial-gradient(ellipse 800px 600px at ${cur.x.toFixed(2)}% ${cur.y.toFixed(2)}%,`,
          ' rgba(255,255,255,0.07) 0%,',
          ' rgba(255,255,255,0.025) 38%,',
          ' transparent 68%)',
        ].join('')
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    window.addEventListener('scroll',    onScroll, { passive: true })
    window.addEventListener('mousemove', onMouse,  { passive: true })
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      window.removeEventListener('scroll',    onScroll)
      window.removeEventListener('mousemove', onMouse)
      cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return (
    <div
      ref={lightRef}
      className="fixed inset-0 pointer-events-none"
      style={{
        zIndex: 1,
        background: 'radial-gradient(ellipse 800px 600px at 50% 12%, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.025) 38%, transparent 68%)',
      }}
    />
  )
}

/* ─── Dot sidebar nav ────────────────────────────────────────────────────── */
function SidebarNav({ active }) {
  const scrollTo = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <nav className="fixed right-5 top-1/2 -translate-y-1/2 z-50 flex flex-col items-end gap-5 select-none">
      {NAV_SECTIONS.map((s) => {
        const isActive = active === s.id
        return (
          <button
            key={s.id}
            onClick={() => scrollTo(s.id)}
            aria-label={s.label}
            className="group flex items-center gap-3"
          >
            <span className="text-[11px] tracking-widest uppercase text-white/0 group-hover:text-white/40 transition-all duration-200 whitespace-nowrap">
              {s.label}
            </span>
            <span
              className="block rounded-full transition-all duration-300 flex-shrink-0"
              style={{
                width:      isActive ? 10 : 7,
                height:     isActive ? 10 : 7,
                background: isActive ? 'rgba(255,255,255,0.9)' : 'transparent',
                border:     isActive ? '1.5px solid rgba(255,255,255,0.9)' : '1.5px solid rgba(255,255,255,0.30)',
                boxShadow:  isActive ? '0 0 10px rgba(255,255,255,0.6), 0 0 24px rgba(255,255,255,0.2)' : 'none',
              }}
            />
          </button>
        )
      })}
    </nav>
  )
}

/* ─── Logo ───────────────────────────────────────────────────────────────── */
function Logo() {
  return (
    <div className="flex items-center gap-2">
      <div className="w-7 h-7 bg-white rounded-md flex items-center justify-center flex-shrink-0">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0a0a0a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
        </svg>
      </div>
      <span className="font-semibold text-white text-base tracking-tight">MarketIQ</span>
    </div>
  )
}

/* ─── Mock trade card ────────────────────────────────────────────────────── */
function MockTradeCard() {
  return (
    <div className="rounded-2xl p-5 max-w-sm w-full relative overflow-hidden" style={glassStyle}>
      {/* Specular edges */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent pointer-events-none" />
      <div className="absolute inset-y-0 left-0 w-px bg-gradient-to-b from-white/20 via-white/10 to-transparent pointer-events-none" />

      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full flex-shrink-0 mt-0.5 bg-white/50" />
          <div>
            <span className="text-white font-semibold text-sm">Sen. Nancy Pelosi</span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-white/40 text-xs">Senate · Democrat</span>
            </div>
          </div>
        </div>
        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-white/10 text-white/70 uppercase tracking-wide border border-white/15">
          High
        </span>
      </div>
      <div className="border-t border-white/10 my-3" />
      <div className="flex items-center justify-between gap-3 mb-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold px-2 py-0.5 rounded bg-white/10 text-white/70 border border-white/15">PURCHASE</span>
          <span className="text-white font-bold">NVDA</span>
          <span className="text-white/40 text-xs truncate max-w-[100px]">NVIDIA Corp.</span>
        </div>
        <span className="text-white/70 text-sm font-medium">$1M–$5M</span>
      </div>
      <div className="flex items-center gap-2 text-xs text-white/30 mt-1">
        <span>Traded 2 days ago · Disclosed 31 days after ⚠</span>
      </div>
      <div className="border-t border-white/10 my-3" />
      <p className="text-white/45 text-xs leading-relaxed">
        High urgency: Pelosi's purchase of NVDA aligns with Senate Commerce Committee activity surrounding AI chip export policy. Pattern suggests informed positioning ahead of regulatory announcements.
      </p>
      <div className="mt-3">
        <span className="text-[10px] text-white/25 uppercase tracking-wider">STOCK Act disclosure</span>
      </div>
    </div>
  )
}

/* ─── Canvas frame-scrub section ─────────────────────────────────────────── */
const TOTAL_FRAMES = 227
const FRAME_URL = (i) => `/frames/ezgif-frame-${String(i + 1).padStart(3, '0')}.jpg`

const PHASE_LINES = [
  ['The intelligence', 'layer for markets.'],
  ['AI summaries.', 'Congressional trades.', 'Real-time signals.'],
  ['One feed.', 'Everything that matters.'],
]

function drawToCanvas(canvas, img) {
  if (!canvas || !img || !img.complete) return
  const ctx = canvas.getContext('2d')
  const cw = canvas.width, ch = canvas.height
  const iw = img.naturalWidth, ih = img.naturalHeight
  if (!iw || !ih) return
  const scale = Math.max(cw / iw, ch / ih)
  const sw = iw * scale, sh = ih * scale
  ctx.drawImage(img, (cw - sw) / 2, (ch - sh) / 2, sw, sh)
}

const MIN_PHASE_DWELL_MS = 800

function ScrollVideoSection() {
  const sectionRef         = useRef(null)
  const canvasRef          = useRef(null)
  const framesRef          = useRef([])
  const targetRef          = useRef(0)
  const currentRef         = useRef(0)
  const rafRef             = useRef(null)
  const phaseRef           = useRef(0)
  const lastPhaseChangeRef = useRef(0)
  const [phase, setPhase]       = useState(0)
  const [scrolled, setScrolled] = useState(false)
  const [ready, setReady]       = useState(false)

  const sizeCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width  = window.innerWidth
    canvas.height = window.innerHeight
    const f = framesRef.current[Math.round(currentRef.current)]
    if (f) drawToCanvas(canvas, f)
  }

  useEffect(() => {
    sizeCanvas()
    window.addEventListener('resize', sizeCanvas)
    const frames = new Array(TOTAL_FRAMES)
    framesRef.current = frames
    let firstDone = false
    for (let i = 0; i < TOTAL_FRAMES; i++) {
      const img = new Image()
      img.src = FRAME_URL(i)
      img.onload = () => {
        frames[i] = img
        if (i === 0 && !firstDone) {
          firstDone = true
          drawToCanvas(canvasRef.current, img)
          setReady(true)
        }
      }
    }
    return () => window.removeEventListener('resize', sizeCanvas)
  }, []) // eslint-disable-line

  useEffect(() => {
    let lastDrawn = -1
    const tick = () => {
      const diff = targetRef.current - currentRef.current
      if (Math.abs(diff) > 0.1) {
        currentRef.current += diff * 0.2
      } else {
        currentRef.current = targetRef.current
      }
      const idx = Math.round(currentRef.current)
      if (idx !== lastDrawn) {
        const img = framesRef.current[idx]
        if (img) drawToCanvas(canvasRef.current, img)
        lastDrawn = idx
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  useEffect(() => {
    const onScroll = () => {
      const el = sectionRef.current
      if (!el) return
      const p = Math.max(0, Math.min(1,
        -el.getBoundingClientRect().top / (el.offsetHeight - window.innerHeight)
      ))
      targetRef.current = p * (TOTAL_FRAMES - 1)
      const desired = p < 0.33 ? 0 : p < 0.67 ? 1 : 2
      if (desired !== phaseRef.current) {
        const advancing = desired > phaseRef.current
        if (!advancing || Date.now() - lastPhaseChangeRef.current >= MIN_PHASE_DWELL_MS) {
          phaseRef.current = desired
          lastPhaseChangeRef.current = Date.now()
          setPhase(desired)
        }
      }
      if (p > 0.015) setScrolled(true)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <section ref={sectionRef} style={{ height: '320vh' }} className="relative">
      <div className="sticky top-0 h-screen overflow-hidden bg-[#0a0a0a]">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ opacity: ready ? 1 : 0, transition: 'opacity 0.4s ease' }}
        />
        <div className="absolute inset-0 bg-black/45 pointer-events-none" />
        <div className="absolute top-0 inset-x-0 h-44 bg-gradient-to-b from-[#0a0a0a] to-transparent pointer-events-none" />
        <div className="absolute bottom-0 inset-x-0 h-44 bg-gradient-to-t from-[#0a0a0a] to-transparent pointer-events-none" />

        {PHASE_LINES.map((lines, i) => (
          <div
            key={i}
            className="absolute inset-0 flex items-center justify-center px-6 text-center pointer-events-none"
            style={{ opacity: i === phase ? 1 : 0, transition: 'opacity 0.7s ease' }}
          >
            <h2 className="text-5xl sm:text-6xl md:text-7xl font-bold text-white tracking-tight leading-[1.06]">
              {lines.map((line, j) => (
                <span key={j} className="block">{line}</span>
              ))}
            </h2>
          </div>
        ))}

        <div
          className="absolute bottom-20 inset-x-0 flex justify-center z-10"
          style={{ opacity: phase === 2 ? 1 : 0, transition: 'opacity 0.7s ease' }}
        >
          <Link
            to="/onboarding"
            className="bg-white hover:bg-gray-100 text-[#0a0a0a] font-bold px-8 py-4 rounded-xl text-sm tracking-wide transition-colors"
          >
            Get started
          </Link>
        </div>

        <div
          className="absolute bottom-10 inset-x-0 flex flex-col items-center gap-2 pointer-events-none"
          style={{ opacity: scrolled ? 0 : 1, transition: 'opacity 0.6s ease' }}
        >
          <span className="text-white/30 text-xs tracking-widest uppercase">Scroll</span>
          <div className="w-px h-8 bg-gradient-to-b from-white/30 to-transparent animate-pulse" />
        </div>
      </div>
    </section>
  )
}

/* ─── Main Landing ───────────────────────────────────────────────────────── */
export default function Landing() {
  const [activeSection, setActiveSection] = useState('section-hero')

  useEffect(() => {
    const observers = []
    NAV_SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id)
      if (!el) return
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setActiveSection(id) },
        { threshold: 0.3 }
      )
      obs.observe(el)
      observers.push(obs)
    })
    return () => observers.forEach((o) => o.disconnect())
  }, [])

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans">

      {/* Global scroll-reactive light — sits above background, below all content */}
      <ScrollLight />

      <SidebarNav active={activeSection} />

      {/* ── NAV ── */}
      <header className="sticky top-0 z-50 backdrop-blur-md border-b border-white/5" style={{ background: 'rgba(10,10,10,0.75)' }}>
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Logo />
          <Link
            to="/onboarding"
            className="bg-white hover:bg-gray-100 text-[#0a0a0a] text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            Get started
          </Link>
        </div>
      </header>

      {/* ── STICKY SCROLL VIDEO ── */}
      <div id="section-hero" style={{ position: 'relative', zIndex: 2 }}>
        <ScrollVideoSection />
      </div>

      {/* ── FEATURES ── */}
      <section id="section-features" className="max-w-6xl mx-auto px-6 py-20" style={{ position: 'relative', zIndex: 2 }}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="rounded-2xl p-7 relative overflow-hidden group transition-all duration-300 hover:scale-[1.02]"
              style={glassStyle}
            >
              {/* Top specular line */}
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/45 to-transparent pointer-events-none" />
              {/* Left edge catch */}
              <div className="absolute inset-y-0 left-0 w-px bg-gradient-to-b from-white/25 via-white/10 to-transparent pointer-events-none" />
              {/* Inner corner glow */}
              <div className="absolute top-0 left-0 w-24 h-24 bg-white/[0.04] rounded-br-full pointer-events-none" />

              <div className="relative">
                <div className="text-white/50 group-hover:text-white/80 mb-4 transition-colors duration-300">{feature.icon}</div>
                <h3 className="text-white font-semibold text-sm mb-2">{feature.title}</h3>
                <p className="text-white/45 text-sm leading-relaxed">{feature.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── GOV TRADES HIGHLIGHT ── */}
      <section id="section-gov-trades" className="border-y border-white/5 py-24" style={{ position: 'relative', zIndex: 2 }}>
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-col lg:flex-row items-center gap-16">
            <div className="flex-1 lg:max-w-[480px]">
              <p className="text-xs font-medium tracking-[0.2em] text-white/25 uppercase mb-5">
                STOCK Act Transparency
              </p>
              <h2 className="text-3xl sm:text-4xl font-bold text-white leading-[1.15] tracking-tight mb-5">
                Follow the money.<br />Literally.
              </h2>
              <p className="text-white/40 text-base leading-relaxed mb-8">
                Members of Congress must disclose stock trades within 45 days. MarketIQ ingests every STOCK Act filing and surfaces them with AI-generated context — so you know which committee overlaps with the traded ticker, and how urgent the signal is.
              </p>
              <Link
                to="/onboarding"
                className="inline-flex items-center gap-2 bg-white hover:bg-gray-100 text-[#0a0a0a] font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors"
              >
                Start tracking congressional trades
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                </svg>
              </Link>
            </div>
            <div className="flex-1 flex justify-center lg:justify-end w-full">
              <MockTradeCard />
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section id="section-cta" className="max-w-6xl mx-auto px-6 py-20 text-center" style={{ position: 'relative', zIndex: 2 }}>
        <h2 className="text-3xl font-bold text-white tracking-tight mb-3">
          The market doesn't wait.
        </h2>
        <p className="text-white/35 text-sm mb-8">
          Join investors who track what really moves markets.
        </p>
        <Link
          to="/onboarding"
          className="inline-block bg-white hover:bg-gray-100 text-[#0a0a0a] font-bold px-8 py-4 rounded-xl text-sm tracking-wide transition-colors"
        >
          Get started
        </Link>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-white/5 bg-[#0a0a0a]" style={{ position: 'relative', zIndex: 2 }}>
        <div className="max-w-6xl mx-auto px-6 py-10">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div>
              <Logo />
              <p className="text-xs text-white/15 mt-2">Not financial advice. For educational use only.</p>
            </div>
            <div className="flex items-center gap-6">
              <a href="#" className="text-white/25 hover:text-white/60 text-sm transition-colors">GitHub</a>
              <a href="#" className="text-white/25 hover:text-white/60 text-sm transition-colors">Privacy</a>
              <a href="#" className="text-white/25 hover:text-white/60 text-sm transition-colors">Support</a>
            </div>
          </div>
          <div className="mt-8 pt-6 border-t border-white/5 text-center">
            <p className="text-xs text-white/15">&copy; 2026 MarketIQ. Built with Claude AI.</p>
          </div>
        </div>
      </footer>

    </div>
  )
}
