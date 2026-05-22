import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import Logo from '../components/Logo'

// ── Scramble hook ─────────────────────────────────────────────────────────────
const SC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*-_+|;:,.<>?'

function useScramble(text, delay = 0, duration = 1600) {
  const [out, setOut] = useState('')
  useEffect(() => {
    let start = null
    let raf = null
    const tick = (ts) => {
      if (!start) start = ts
      const elapsed = ts - start - delay
      if (elapsed < 0) { raf = requestAnimationFrame(tick); return }
      const p = Math.min(elapsed / duration, 1)
      const revealed = Math.floor(p * text.length)
      setOut(text.split('').map((c, i) => {
        if (c === ' ') return ' '
        if (i < revealed) return c
        return SC[Math.floor(Math.random() * SC.length)]
      }).join(''))
      if (p < 1) raf = requestAnimationFrame(tick)
      else setOut(text)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [text, delay, duration])
  return out
}

// ── Cross marker ──────────────────────────────────────────────────────────────
function Cross({ style, size = 18, opacity = 0.18 }) {
  return (
    <div style={{
      position: 'absolute',
      width: size,
      height: size,
      transform: 'translate(-50%, -50%)',
      pointerEvents: 'none',
      ...style,
    }}>
      <div style={{
        position: 'absolute', top: '50%', left: 0, right: 0,
        height: '1px',
        background: `rgba(255,255,255,${opacity})`,
        transform: 'translateY(-50%)',
      }} />
      <div style={{
        position: 'absolute', left: '50%', top: 0, bottom: 0,
        width: '1px',
        background: `rgba(255,255,255,${opacity})`,
        transform: 'translateX(-50%)',
      }} />
    </div>
  )
}

// ── Language switcher ─────────────────────────────────────────────────────────
const LANGS = [
  { code: 'en', label: 'EN' },
  { code: 'fr', label: 'FR' },
  { code: 'zh', label: '中文' },
]

const T = {
  en: {
    tagline: 'Investment intelligence platform',
    hero1: 'The market,',
    hero2: 'explained.',
    heroSub: 'Real-time intelligence in plain English.\nNo jargon. No noise. Just what matters.',
    cta: 'Get started free',
    ctaSub: 'No credit card required',
  },
  fr: {
    tagline: 'Plateforme d\'intelligence financière',
    hero1: 'Le marché,',
    hero2: 'expliqué.',
    heroSub: 'Informations en temps réel en langage simple.\nSans jargon. Sans bruit. L\'essentiel.',
    cta: 'Commencer gratuitement',
    ctaSub: 'Sans carte bancaire',
  },
  zh: {
    tagline: '投资智能平台',
    hero1: '市场，',
    hero2: '一目了然。',
    heroSub: '实时市场资讯，简单明了。\n无术语，无噪音——只有重要的内容。',
    cta: '免费开始',
    ctaSub: '无需信用卡',
  },
}

function LangSwitcher({ lang, setLang }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          background: 'transparent',
          border: '1px solid rgba(255,255,255,0.12)',
          color: 'rgba(255,255,255,0.5)',
          fontSize: '11px', fontWeight: '700', letterSpacing: '0.12em',
          fontFamily: 'inherit',
          padding: '6px 12px', borderRadius: '3px',
          cursor: 'pointer', transition: 'all 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.4)'; e.currentTarget.style.color = '#fff' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = 'rgba(255,255,255,0.5)' }}
      >
        {LANGS.find(l => l.code === lang)?.label}
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0,
          background: '#0c0c0c',
          border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: '3px', overflow: 'hidden', minWidth: '88px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
          zIndex: 100,
        }}>
          {LANGS.map(l => (
            <button key={l.code} onClick={() => { setLang(l.code); setOpen(false) }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '9px 14px',
                background: l.code === lang ? 'rgba(255,255,255,0.07)' : 'transparent',
                color: l.code === lang ? '#fff' : 'rgba(255,255,255,0.45)',
                fontSize: '11px', fontWeight: '700', letterSpacing: '0.1em',
                fontFamily: 'inherit',
                border: 'none', cursor: 'pointer', transition: 'background 0.1s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
              onMouseLeave={e => e.currentTarget.style.background = l.code === lang ? 'rgba(255,255,255,0.07)' : 'transparent'}
            >
              {l.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Landing ───────────────────────────────────────────────────────────────────
export default function Landing() {
  const [lang, setLang] = useState('en')
  const t = T[lang]
  const [scrambleKey, setScrambleKey] = useState(0)
  useEffect(() => { setScrambleKey(k => k + 1) }, [lang])

  const line1 = useScramble(t.hero1, 80, 1200)
  const line2 = useScramble(t.hero2, 500, 1500)

  // Cross positions: [left%, top%]
  const crosses = [
    ['12%', '18%'], ['50%', '18%'], ['88%', '18%'],
    ['25%', '42%'], ['75%', '42%'],
    ['12%', '68%'], ['50%', '68%'], ['88%', '68%'],
    ['35%', '85%'], ['65%', '85%'],
  ]

  return (
    <div style={{ background: '#080808', color: '#fff', minHeight: '100vh', fontFamily: "'Alphazet', 'Space Grotesk', 'Bebas Neue', 'Courier New', monospace" }}>

      {/* ── FIXED HEADER ── */}
      <header style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
        display: 'flex', alignItems: 'stretch',
        height: '52px',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        background: 'rgba(8,8,8,0.92)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}>
        {/* Logo cell */}
        <div style={{
          display: 'flex', alignItems: 'center',
          padding: '0 24px',
          borderRight: '1px solid rgba(255,255,255,0.07)',
          flexShrink: 0,
        }}>
          <Logo size="sm" />
        </div>

        {/* Tagline cell — fills middle */}
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center',
          padding: '0 24px',
          borderRight: '1px solid rgba(255,255,255,0.07)',
        }}>
          <span style={{
            fontSize: '10px', fontWeight: '700', letterSpacing: '0.18em',
            color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase',
          }}>
            {t.tagline}
          </span>
        </div>

        {/* Right cell */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '0 20px', flexShrink: 0 }}>
          <LangSwitcher lang={lang} setLang={setLang} />
          <Link
            to="/onboarding"
            style={{
              fontSize: '10px', fontWeight: '700', letterSpacing: '0.12em',
              color: '#080808', background: '#fff',
              padding: '7px 16px', borderRadius: '3px',
              textDecoration: 'none', textTransform: 'uppercase',
              transition: 'opacity 0.15s',
              fontFamily: 'inherit',
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            {t.cta}
          </Link>
        </div>
      </header>

      {/* ── HERO (full viewport, only section) ── */}
      <section style={{
        position: 'relative',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        padding: '0 48px 80px',
        overflow: 'hidden',
      }}>

        {/* Cross markers */}
        {crosses.map(([l, t_], i) => (
          <Cross key={i} style={{ left: l, top: t_ }} />
        ))}

        {/* Outer border lines — top & sides */}
        <div style={{ position: 'absolute', top: '52px', left: '48px', right: '48px', height: '1px', background: 'rgba(255,255,255,0.06)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: '52px', left: '48px', bottom: 0, width: '1px', background: 'rgba(255,255,255,0.06)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: '52px', right: '48px', bottom: 0, width: '1px', background: 'rgba(255,255,255,0.06)', pointerEvents: 'none' }} />

        {/* Main text */}
        <div style={{ position: 'relative', zIndex: 2, maxWidth: '900px' }} key={scrambleKey}>
          <h1 style={{
            fontSize: 'clamp(56px, 10vw, 130px)',
            fontWeight: '700',
            lineHeight: '0.97',
            letterSpacing: '-0.03em',
            margin: '0 0 32px 0',
            color: '#fff',
          }}>
            <span
              className="px-text"
              style={{ display: 'block' }}
            >
              {line1 || ' '}
            </span>
            <span
              className="px-text"
              style={{ display: 'block', color: 'rgba(255,255,255,0.28)' }}
            >
              {line2 || ' '}
            </span>
          </h1>

          <p
            className="px-text"
            style={{
              fontSize: 'clamp(13px, 1.5vw, 16px)',
              color: 'rgba(255,255,255,0.38)',
              lineHeight: '1.8',
              maxWidth: '380px',
              margin: '0 0 44px 0',
              whiteSpace: 'pre-line',
              letterSpacing: '0.01em',
            }}
          >
            {t.heroSub}
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <Link
              to="/onboarding"
              className="px-text"
              style={{
                display: 'inline-block',
                background: '#fff', color: '#080808',
                fontSize: '11px', fontWeight: '700',
                letterSpacing: '0.12em', textTransform: 'uppercase',
                padding: '13px 28px', borderRadius: '3px',
                textDecoration: 'none', transition: 'opacity 0.15s',
                fontFamily: 'inherit',
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >
              {t.cta}
            </Link>
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.18)', letterSpacing: '0.06em' }}>
              {t.ctaSub}
            </span>
          </div>
        </div>

        {/* Bottom right — scroll line */}
        <div style={{
          position: 'absolute', bottom: '32px', right: '60px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0',
          zIndex: 2,
        }}>
          <div style={{
            width: '1px', height: '56px',
            background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.2))',
            animation: 'drip 2.2s ease-in-out infinite',
          }} />
        </div>
      </section>

      {/* ── GLOBAL STYLES ── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');

        @font-face {
          font-family: 'Alphazet';
          src: url('/fonts/Alphazet.woff2') format('woff2'),
               url('/fonts/Alphazet.woff') format('woff');
          font-weight: normal;
          font-style: normal;
          font-display: swap;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }

        .px-text {
          transition: filter 0.06s ease;
          cursor: default;
        }
        .px-text:hover {
          filter: blur(3px) contrast(18);
        }

        @keyframes drip {
          0%   { opacity: 0; transform: scaleY(0.4) translateY(-10px); }
          50%  { opacity: 1; transform: scaleY(1) translateY(0); }
          100% { opacity: 0; transform: scaleY(0.4) translateY(10px); }
        }

        @media (max-width: 640px) {
          section { padding-left: 20px !important; padding-right: 20px !important; padding-bottom: 60px !important; }
          header > div:nth-child(2) { display: none !important; }
        }
      `}</style>
    </div>
  )
}
