import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

const CREAM  = '#f0ebe0'
const ORANGE = '#c84b1e'
const INK    = '#0b0b0b'
const MUTED  = 'rgba(11,11,11,0.44)'
const BORDER = 'rgba(11,11,11,0.13)'

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

function NavBar({ onEnter }) {
  const scrollY = useScrollY()
  const scrolled = scrollY > 40
  return (
    <header style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      background: scrolled ? CREAM : 'transparent',
      borderBottom: scrolled ? `1px solid ${BORDER}` : '1px solid transparent',
      transition: 'background 0.35s ease, border-color 0.35s ease',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 clamp(20px,4vw,48px)', height: 56,
    }}>
      <span style={{
        fontFamily: 'var(--font-display)', fontWeight: 800,
        fontSize: 15, letterSpacing: '-0.02em', color: INK,
      }}>TRAVAUXUS</span>

      <nav style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
        {['Features', 'Timeline', 'Schools', 'About'].map(label => (
          <a key={label} href={`#${label.toLowerCase()}`} style={{
            fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 600,
            letterSpacing: '0.10em', textTransform: 'uppercase',
            color: INK, textDecoration: 'none',
            opacity: 0.6, transition: 'opacity 0.2s',
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = '1'}
          onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}
          >{label}</a>
        ))}
      </nav>

      <button onClick={onEnter} style={{
        fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 700,
        letterSpacing: '0.09em', textTransform: 'uppercase',
        padding: '8px 20px', border: `1px solid ${INK}`,
        background: 'transparent', color: INK, cursor: 'pointer',
        transition: 'background 0.2s, color 0.2s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = INK; e.currentTarget.style.color = CREAM }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = INK }}
      >Sign in →</button>
    </header>
  )
}

function Hero({ onEnter }) {
  const [rdy, setRdy] = useState(false)
  useEffect(() => { const t = setTimeout(() => setRdy(true), 80); return () => clearTimeout(t) }, [])

  return (
    <section style={{
      background: CREAM, minHeight: '100vh',
      display: 'flex', flexDirection: 'column',
      padding: '56px 0 0',
      borderBottom: `1px solid ${BORDER}`,
    }}>
      {/* Top strip */}
      <div style={{
        borderBottom: `1px solid ${BORDER}`,
        padding: '14px clamp(20px,4vw,48px)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10,
          letterSpacing: '0.22em', textTransform: 'uppercase', color: MUTED,
        }}>A free college admissions platform</span>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10,
          letterSpacing: '0.22em', textTransform: 'uppercase', color: ORANGE,
        }}>Built for students, by students</span>
      </div>

      {/* Giant heading */}
      <div style={{
        padding: '0 clamp(20px,4vw,48px)',
        flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        paddingBottom: 0,
      }}>
        <div style={{
          fontFamily: 'var(--font-display)', fontWeight: 800,
          fontSize: 'clamp(72px, 14vw, 220px)',
          letterSpacing: '-0.045em', lineHeight: 0.88,
          color: INK,
          transform: rdy ? 'translateY(0)' : 'translateY(40px)',
          opacity: rdy ? 1 : 0,
          transition: 'transform 1.1s cubic-bezier(0.16,1,0.3,1), opacity 0.9s ease',
        }}>TRAVAUXUS</div>
      </div>

      {/* Two-column info strip */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        borderTop: `1px solid ${BORDER}`,
        marginTop: 32,
      }}>
        <div style={{
          padding: '32px clamp(20px,4vw,48px)',
          borderRight: `1px solid ${BORDER}`,
        }}>
          <p style={{
            fontFamily: 'var(--font-display)', fontWeight: 700,
            fontSize: 'clamp(22px, 3.5vw, 52px)',
            letterSpacing: '-0.03em', lineHeight: 1.1,
            color: INK, margin: 0,
            opacity: rdy ? 1 : 0,
            transform: rdy ? 'none' : 'translateY(20px)',
            transition: 'opacity 0.9s ease 0.2s, transform 0.9s ease 0.2s',
          }}>
            NAVIGATING YOUR<br />COLLEGE ADMISSIONS<br />JOURNEY
          </p>
        </div>
        <div style={{
          padding: '32px clamp(20px,4vw,48px)',
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        }}>
          <p style={{
            fontFamily: 'var(--font-sans)', fontSize: 15,
            lineHeight: 1.85, color: MUTED, margin: 0, maxWidth: 380,
            opacity: rdy ? 1 : 0,
            transition: 'opacity 0.9s ease 0.35s',
          }}>
            From building your school list to submitting your final application,
            Travauxus brings together everything you need to navigate college
            admissions — completely free.
          </p>
          <button onClick={onEnter} style={{
            alignSelf: 'flex-start', marginTop: 28,
            fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 700,
            letterSpacing: '0.09em', textTransform: 'uppercase',
            padding: '14px 32px',
            background: ORANGE, color: CREAM, border: 'none',
            cursor: 'pointer',
            transition: 'opacity 0.2s, transform 0.2s',
            opacity: rdy ? 1 : 0,
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '0.85'; e.currentTarget.style.transform = 'translateY(-2px)' }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'none' }}
          >Get started free →</button>
        </div>
      </div>
    </section>
  )
}

/* ── Feature cards — Indoek-style grid ──────────────────────────────────── */
const FEATURES = [
  {
    n: '01', title: 'APPLICATION\nTRACKER',
    sub: 'Stay organized',
    body: 'Track deadlines, requirements, and status for every school in one clean dashboard. Never let a requirement slip through.',
  },
  {
    n: '02', title: 'ESSAY\nWORKSHOP',
    sub: 'AI-powered feedback',
    body: 'Get instant, specific feedback on your personal statement and supplementals. Strengthen your voice before you hit submit.',
  },
  {
    n: '03', title: 'SCHOOL LIST\nBUILDER',
    sub: 'Find your fit',
    body: 'Build a balanced list of reach, match, and safety schools based on your academic profile, interests, and goals.',
  },
  {
    n: '04', title: 'DEADLINE\nCALENDAR',
    sub: 'Never miss a date',
    body: 'All your deadlines in one place — Early Decision, Early Action, Regular Decision. Syncs with your calendar.',
  },
  {
    n: '05', title: 'INTERVIEW\nPREP',
    sub: 'Practice makes perfect',
    body: 'Simulate college interviews with AI-generated questions tailored to each school. Build confidence before the real thing.',
  },
  {
    n: '06', title: 'SCHOLARSHIP\nFINDER',
    sub: 'Free money',
    body: 'Discover scholarships and financial aid opportunities that match your background, achievements, and intended major.',
  },
]

function FeaturesGrid() {
  return (
    <section id="features" style={{ background: CREAM }}>
      {/* Section header */}
      <div style={{
        padding: '48px clamp(20px,4vw,48px) 32px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
        borderBottom: `1px solid ${BORDER}`,
      }}>
        <div>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.26em',
            textTransform: 'uppercase', color: ORANGE, display: 'block', marginBottom: 10,
          }}>What's inside</span>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontWeight: 800,
            fontSize: 'clamp(32px, 5vw, 72px)',
            letterSpacing: '-0.04em', lineHeight: 0.9,
            color: INK, margin: 0,
          }}>SIX TOOLS.<br />ONE PLATFORM.</h2>
        </div>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em',
          textTransform: 'uppercase', color: MUTED,
        }}>100% free</span>
      </div>

      {/* 3-column grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {FEATURES.map((f, i) => (
          <FeatureCard key={f.n} f={f} i={i} />
        ))}
      </div>
    </section>
  )
}

function FeatureCard({ f, i }) {
  const [hov, setHov] = useState(false)
  const isRightCol = (i % 3) !== 2
  const isTopRow = i < 3
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        borderRight: isRightCol ? `1px solid ${BORDER}` : 'none',
        borderBottom: isTopRow ? `1px solid ${BORDER}` : 'none',
        padding: '36px clamp(20px,3vw,40px)',
        background: hov ? `rgba(200,75,30,0.04)` : 'transparent',
        transition: 'background 0.25s ease',
        cursor: 'default',
        display: 'flex', flexDirection: 'column', gap: 16,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.24em',
          textTransform: 'uppercase', color: ORANGE,
        }}>{f.sub}</span>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.22em',
          color: 'rgba(11,11,11,0.25)',
        }}>{f.n}</span>
      </div>
      <h3 style={{
        fontFamily: 'var(--font-display)', fontWeight: 800,
        fontSize: 'clamp(20px, 2.2vw, 34px)',
        letterSpacing: '-0.03em', lineHeight: 1.0,
        color: INK, margin: 0, whiteSpace: 'pre-line',
      }}>{f.title}</h3>
      <div style={{ height: 1, background: hov ? ORANGE : BORDER, transition: 'background 0.3s ease' }} />
      <p style={{
        fontFamily: 'var(--font-sans)', fontSize: 13, lineHeight: 1.8,
        color: MUTED, margin: 0,
      }}>{f.body}</p>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em',
        color: hov ? ORANGE : 'rgba(11,11,11,0.28)',
        transition: 'color 0.25s ease',
        marginTop: 'auto',
      }}>LEARN MORE →</span>
    </div>
  )
}

/* ── Stats strip ────────────────────────────────────────────────────────── */
const STATS = [
  { n: '2,400+', label: 'Schools tracked' },
  { n: '50K+',   label: 'Essays reviewed' },
  { n: '94%',    label: 'Users admitted to a top-choice school' },
  { n: '100%',   label: 'Free, always' },
]

function StatsStrip() {
  return (
    <section style={{
      background: ORANGE,
      display: 'grid', gridTemplateColumns: `repeat(${STATS.length}, 1fr)`,
    }}>
      {STATS.map((s, i) => (
        <div key={s.label} style={{
          padding: '36px clamp(20px,3vw,40px)',
          borderRight: i < STATS.length - 1 ? '1px solid rgba(240,235,224,0.22)' : 'none',
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          <span style={{
            fontFamily: 'var(--font-display)', fontWeight: 800,
            fontSize: 'clamp(28px, 4vw, 56px)',
            letterSpacing: '-0.04em', lineHeight: 1,
            color: CREAM,
          }}>{s.n}</span>
          <span style={{
            fontFamily: 'var(--font-sans)', fontSize: 12,
            color: 'rgba(240,235,224,0.72)', lineHeight: 1.4,
          }}>{s.label}</span>
        </div>
      ))}
    </section>
  )
}

/* ── About section ──────────────────────────────────────────────────────── */
function AboutSection() {
  const ref = useRef(null)
  const [vis, setVis] = useState(false)
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVis(true) }, { threshold: 0.15 })
    if (ref.current) obs.observe(ref.current)
    return () => obs.disconnect()
  }, [])

  return (
    <section id="about" ref={ref} style={{
      background: CREAM, borderTop: `1px solid ${BORDER}`,
    }}>
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        borderBottom: `1px solid ${BORDER}`,
      }}>
        <div style={{
          padding: '64px clamp(20px,4vw,48px)',
          borderRight: `1px solid ${BORDER}`,
        }}>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.26em',
            textTransform: 'uppercase', color: ORANGE, display: 'block', marginBottom: 20,
          }}>Our mission</span>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontWeight: 800,
            fontSize: 'clamp(28px, 4.5vw, 64px)',
            letterSpacing: '-0.04em', lineHeight: 0.92,
            color: INK, margin: 0,
            transform: vis ? 'translateY(0)' : 'translateY(30px)',
            opacity: vis ? 1 : 0,
            transition: 'transform 1s cubic-bezier(0.16,1,0.3,1), opacity 0.8s ease',
          }}>
            THE COLLEGE<br />PROCESS IS<br /><span style={{ color: ORANGE }}>COMPLEX.</span><br />WE MAKE IT<br />SIMPLE.
          </h2>
        </div>
        <div style={{
          padding: '64px clamp(20px,4vw,48px)',
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        }}>
          <p style={{
            fontFamily: 'var(--font-sans)', fontSize: 15,
            lineHeight: 1.9, color: MUTED, margin: 0,
            opacity: vis ? 1 : 0,
            transition: 'opacity 0.8s ease 0.2s',
          }}>
            Travauxus was built by a group of students who went through the
            college admissions process and wished they'd had a single, clear
            place to manage it all.
          </p>
          <p style={{
            fontFamily: 'var(--font-sans)', fontSize: 15,
            lineHeight: 1.9, color: MUTED, margin: '24px 0 0',
            opacity: vis ? 1 : 0,
            transition: 'opacity 0.8s ease 0.35s',
          }}>
            We built this so the next generation doesn't have to navigate
            spreadsheets, missed deadlines, and last-minute panic. Everything
            you need — application tracking, essay feedback, school research —
            in one place, completely free.
          </p>
          <div style={{
            marginTop: 40, paddingTop: 28, borderTop: `1px solid ${BORDER}`,
            display: 'flex', gap: 48,
            opacity: vis ? 1 : 0,
            transition: 'opacity 0.8s ease 0.5s',
          }}>
            {[
              { label: 'Founded', val: '2024' },
              { label: 'Students helped', val: '50,000+' },
              { label: 'Price', val: 'Free' },
            ].map(item => (
              <div key={item.label}>
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 9,
                  letterSpacing: '0.22em', textTransform: 'uppercase',
                  color: ORANGE, marginBottom: 4,
                }}>{item.label}</div>
                <div style={{
                  fontFamily: 'var(--font-display)', fontWeight: 700,
                  fontSize: 20, letterSpacing: '-0.025em', color: INK,
                }}>{item.val}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ── Timeline section ───────────────────────────────────────────────────── */
const TIMELINE = [
  { month: 'JUN–JUL', title: 'Build your school list', body: 'Research programs, visit campuses, and narrow down your reaches, matches, and safeties.' },
  { month: 'AUG–SEP', title: 'Start your essays', body: 'Draft your personal statement and begin school-specific supplementals with AI feedback.' },
  { month: 'OCT–NOV', title: 'Early applications', body: 'Submit Early Decision and Early Action applications. Track requirements in your dashboard.' },
  { month: 'DEC–JAN', title: 'Regular Decision', body: 'Complete remaining applications, request final transcripts, and finalize financial aid forms.' },
  { month: 'MAR–MAY', title: 'Decision season', body: 'Compare financial aid packages, attend admitted student events, and commit by May 1st.' },
]

function TimelineSection() {
  return (
    <section id="timeline" style={{ background: CREAM, borderTop: `1px solid ${BORDER}` }}>
      <div style={{
        padding: '48px clamp(20px,4vw,48px) 32px',
        borderBottom: `1px solid ${BORDER}`,
      }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.26em',
          textTransform: 'uppercase', color: ORANGE, display: 'block', marginBottom: 10,
        }}>Your roadmap</span>
        <h2 style={{
          fontFamily: 'var(--font-display)', fontWeight: 800,
          fontSize: 'clamp(32px, 5vw, 72px)',
          letterSpacing: '-0.04em', lineHeight: 0.9,
          color: INK, margin: 0,
        }}>THE ADMISSIONS<br />TIMELINE</h2>
      </div>
      <div>
        {TIMELINE.map((item, i) => (
          <TimelineRow key={item.month} item={item} i={i} last={i === TIMELINE.length - 1} />
        ))}
      </div>
    </section>
  )
}

function TimelineRow({ item, i, last }) {
  const [hov, setHov] = useState(false)
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'grid', gridTemplateColumns: '180px 1fr 1fr',
        borderBottom: last ? 'none' : `1px solid ${BORDER}`,
        background: hov ? 'rgba(200,75,30,0.03)' : 'transparent',
        transition: 'background 0.2s ease',
      }}
    >
      <div style={{
        padding: '28px clamp(20px,3vw,40px)',
        borderRight: `1px solid ${BORDER}`,
        display: 'flex', alignItems: 'center',
      }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10,
          letterSpacing: '0.20em', textTransform: 'uppercase',
          color: hov ? ORANGE : MUTED,
          transition: 'color 0.2s ease',
        }}>{item.month}</span>
      </div>
      <div style={{
        padding: '28px clamp(20px,3vw,40px)',
        borderRight: `1px solid ${BORDER}`,
        display: 'flex', alignItems: 'center',
      }}>
        <h3 style={{
          fontFamily: 'var(--font-display)', fontWeight: 700,
          fontSize: 'clamp(16px, 2vw, 26px)',
          letterSpacing: '-0.025em', lineHeight: 1.1,
          color: INK, margin: 0,
        }}>{item.title}</h3>
      </div>
      <div style={{
        padding: '28px clamp(20px,3vw,40px)',
        display: 'flex', alignItems: 'center',
      }}>
        <p style={{
          fontFamily: 'var(--font-sans)', fontSize: 13,
          lineHeight: 1.75, color: MUTED, margin: 0,
        }}>{item.body}</p>
      </div>
    </div>
  )
}

/* ── CTA section ────────────────────────────────────────────────────────── */
function CtaSection({ onEnter }) {
  const ref = useRef(null)
  const [vis, setVis] = useState(false)
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVis(true) }, { threshold: 0.2 })
    if (ref.current) obs.observe(ref.current)
    return () => obs.disconnect()
  }, [])

  return (
    <section ref={ref} style={{
      background: INK, minHeight: '60vh',
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
      padding: '80px clamp(20px,4vw,48px)',
    }}>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.26em',
        textTransform: 'uppercase', color: ORANGE,
        display: 'block', marginBottom: 24,
        opacity: vis ? 1 : 0, transition: 'opacity 0.7s ease',
      }}>Begin your journey</span>

      {['START YOUR', 'APPLICATION', 'TODAY.'].map((ln, i) => (
        <div key={ln} style={{ overflow: 'hidden', lineHeight: 0.88 }}>
          <div style={{
            fontFamily: 'var(--font-display)', fontWeight: 800,
            fontSize: 'clamp(52px, 10vw, 160px)',
            letterSpacing: '-0.05em', lineHeight: 0.9,
            color: i === 2 ? 'transparent' : CREAM,
            WebkitTextStroke: i === 2 ? `1.2px ${CREAM}` : undefined,
            marginLeft: i === 1 ? '6vw' : i === 2 ? '3vw' : 0,
            transform: vis ? 'translateY(0)' : 'translateY(110%)',
            transition: `transform 1.1s cubic-bezier(0.16,1,0.3,1) ${i * 80}ms`,
          }}>{ln}</div>
        </div>
      ))}

      <div style={{
        marginTop: 48, display: 'flex', gap: 20, alignItems: 'center',
        opacity: vis ? 1 : 0, transition: 'opacity 0.8s ease 0.4s',
      }}>
        <button onClick={onEnter} style={{
          fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 700,
          letterSpacing: '0.09em', textTransform: 'uppercase',
          padding: '14px 36px', background: ORANGE, color: CREAM, border: 'none',
          cursor: 'pointer', transition: 'opacity 0.2s, transform 0.2s',
        }}
        onMouseEnter={e => { e.currentTarget.style.opacity = '0.85'; e.currentTarget.style.transform = 'translateY(-2px)' }}
        onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'none' }}
        >Create free account →</button>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10,
          letterSpacing: '0.18em', textTransform: 'uppercase',
          color: 'rgba(240,235,224,0.36)',
        }}>No credit card required</span>
      </div>
    </section>
  )
}

/* ── Footer ─────────────────────────────────────────────────────────────── */
function Footer() {
  return (
    <footer style={{ background: '#070707', borderTop: '1px solid rgba(240,235,224,0.07)' }}>
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr',
        borderBottom: '1px solid rgba(240,235,224,0.07)',
      }}>
        <div style={{ padding: '48px clamp(20px,3vw,40px)', borderRight: '1px solid rgba(240,235,224,0.07)', gridColumn: 'span 1' }}>
          <span style={{
            fontFamily: 'var(--font-display)', fontWeight: 800,
            fontSize: 18, letterSpacing: '-0.02em', color: CREAM,
            display: 'block', marginBottom: 16,
          }}>TRAVAUXUS</span>
          <p style={{
            fontFamily: 'var(--font-sans)', fontSize: 12,
            color: 'rgba(240,235,224,0.30)', lineHeight: 1.8, margin: 0,
            maxWidth: 200,
          }}>A free college admissions platform built by students, for students.</p>
        </div>
        {[
          { col: 'Platform', links: ['Application Tracker', 'Essay Workshop', 'School List Builder', 'Deadline Calendar'] },
          { col: 'Resources', links: ['Admissions Guide', 'Essay Examples', 'School Profiles', 'FAQ'] },
          { col: 'Legal',     links: ['Privacy Policy', 'Terms of Use', 'Disclaimer'] },
        ].map(({ col, links }) => (
          <div key={col} style={{ padding: '48px clamp(20px,3vw,40px)', borderRight: '1px solid rgba(240,235,224,0.07)' }}>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.26em',
              textTransform: 'uppercase', color: ORANGE,
              display: 'block', marginBottom: 16,
            }}>{col}</span>
            {links.map(label => (
              <div key={label} style={{
                fontFamily: 'var(--font-sans)', fontSize: 13,
                color: 'rgba(240,235,224,0.28)', marginBottom: 10,
                cursor: 'pointer', transition: 'color 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.color = 'rgba(240,235,224,0.7)'}
              onMouseLeave={e => e.currentTarget.style.color = 'rgba(240,235,224,0.28)'}
              >{label}</div>
            ))}
          </div>
        ))}
      </div>
      <div style={{
        padding: '20px clamp(20px,4vw,48px)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.20em',
          textTransform: 'uppercase', color: 'rgba(240,235,224,0.22)',
        }}>© {new Date().getFullYear()} Travauxus — Not affiliated with any college or university</span>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.20em',
          textTransform: 'uppercase', color: 'rgba(240,235,224,0.22)',
        }}>For informational purposes only</span>
      </div>
    </footer>
  )
}

export default function Landing() {
  const navigate = useNavigate()
  const onEnter = () => navigate('/onboarding')

  return (
    <div style={{ background: CREAM, overflowX: 'clip' }}>
      <style>{`
        @media (max-width: 768px) {
          .trv-feat-grid { grid-template-columns: 1fr !important; }
          .trv-stats-strip { grid-template-columns: 1fr 1fr !important; }
          .trv-timeline-row { grid-template-columns: 1fr !important; }
          .trv-about-grid { grid-template-columns: 1fr !important; }
          .trv-hero-grid { grid-template-columns: 1fr !important; }
          .trv-footer-grid { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 480px) {
          .trv-stats-strip { grid-template-columns: 1fr !important; }
          .trv-footer-grid { grid-template-columns: 1fr !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
      <NavBar onEnter={onEnter} />
      <Hero onEnter={onEnter} />
      <FeaturesGrid />
      <StatsStrip />
      <AboutSection />
      <TimelineSection />
      <CtaSection onEnter={onEnter} />
      <Footer />
    </div>
  )
}
