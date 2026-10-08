import { useState, useEffect } from 'react'
import ClassicLogo from '../ClassicLogo'
import { useNavigate } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import { setPreferences, setOnboardingComplete } from '../../store/preferencesSlice'
import { supabase } from '../../utils/supabase/client'
import { useAuth } from '../../contexts/AuthContext'
import { API_BASE } from '../../api/baseApi'
import QuizQuestion from './QuizQuestion'
import WatchlistBuilder from './WatchlistBuilder'

const QUESTIONS = [
  {
    id: 'investorType',
    question: "How would you describe yourself as an investor?",
    type: 'single',
    options: [
      { label: "I'm just starting out", value: 'beginner' },
      { label: 'I invest occasionally', value: 'occasional' },
      { label: 'I invest regularly', value: 'regular' },
      { label: "I'm an active trader", value: 'active' },
    ],
  },
  {
    id: 'traderRole',
    question: 'What best describes you?',
    type: 'single',
    options: [
      { label: 'Student — learning how markets work',   value: 'student' },
      { label: 'Educator — teaching others to invest',  value: 'educator' },
      { label: 'Professional trader',                    value: 'professional' },
      { label: 'Retail investor',                        value: 'retail' },
      { label: 'Just trading for fun',                   value: 'fun' },
    ],
  },
  {
    id: 'watchedCategories',
    question: 'What do you want to track?',
    type: 'multi',
    options: [
      { label: 'US Stocks', value: 'stocks' },
      { label: 'Crypto', value: 'crypto' },
      { label: 'Commodities', value: 'commodities' },
      { label: 'Government Insider Trades', value: 'gov-trades' },
      { label: 'Forex', value: 'forex' },
      { label: 'ETFs', value: 'etf' },
      { label: 'Options Flow', value: 'options' },
    ],
  },
  {
    id: 'watchlist',
    question: 'Build your watchlist',
    type: 'watchlist',
  },
  {
    id: 'priorityAlerts',
    question: 'What updates matter most to you?',
    type: 'multi',
    options: [
      { label: 'Breaking news', value: 'breaking-news' },
      { label: 'Gov official trades', value: 'gov-trades' },
      { label: 'Volume spikes', value: 'volume-spikes' },
      { label: 'Earnings reports', value: 'earnings' },
      { label: 'Fed/macro events', value: 'macro' },
      { label: 'Price alerts', value: 'price-alerts' },
      { label: 'Analyst ratings', value: 'analyst' },
    ],
  },
  {
    id: 'updateFrequency',
    question: 'How often do you want updates?',
    type: 'single',
    options: [
      { label: 'Real-time', value: 'realtime' },
      { label: 'A few times a day', value: 'several' },
      { label: 'Daily digest', value: 'daily' },
      { label: 'Weekly summary', value: 'weekly' },
    ],
  },
  {
    id: 'riskTolerance',
    question: "What's your risk tolerance?",
    type: 'single',
    options: [
      { label: 'Conservative — I prefer safety', value: 'conservative' },
      { label: 'Moderate — balanced approach', value: 'moderate' },
      { label: 'Aggressive — I can handle volatility', value: 'aggressive' },
      { label: 'Speculative — high risk, high reward', value: 'speculative' },
    ],
  },
]

// ─── Design tokens (match Landing.jsx) ───────────────────────────────────────
const INK   = 'var(--ink-900)'
const CREAM = 'var(--paper)'
const MUTED = 'rgba(240,235,224,0.36)'
const BORDER_COLOR = 'rgba(240,235,224,0.10)'
// Same film grain the landing page uses, so the auth screen reads as the same product.
const GRAIN_URL = "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")"

const inputStyle = (focused) => ({
  width: '100%', boxSizing: 'border-box',
  background: 'rgba(240,235,224,0.04)',
  border: `1px solid ${focused ? 'rgba(240,235,224,0.40)' : BORDER_COLOR}`,
  padding: '12px 14px',
  fontFamily: 'var(--font-sans)', fontSize: 14,
  color: CREAM, outline: 'none',
  transition: 'border-color 150ms',
})

function AuthInput({ label, ...props }) {
  const [focused, setFocused] = useState(false)
  return (
    <div>
      <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: MUTED, marginBottom: 8 }}>
        {label}
      </label>
      <input
        {...props}
        style={inputStyle(focused)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </div>
  )
}

// ─── Recovery-phrase sign-in ──────────────────────────────────────────────────

function RecoverySignIn({ onBack }) {
  const [phrase, setPhrase] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const wordCount = phrase.trim().split(/\s+/).filter(Boolean).length

  const submit = async (e) => {
    e.preventDefault()
    if (wordCount !== 6 || busy) return
    setError('')
    setBusy(true)
    try {
      const res = await fetch(`${API_BASE}/recover/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phrase }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.token_hash) throw new Error(body.message || 'That recovery phrase is not valid.')
      const { error: otpError } = await supabase.auth.verifyOtp({ token_hash: body.token_hash, type: 'magiclink' })
      if (otpError) throw new Error('Could not sign you in. Try again.')
      // AuthContext picks up the new session and routes the user into the app
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  const ready = wordCount === 6 && !busy
  return (
    <div style={{ minHeight: '100vh', background: INK, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 24px 40px', position: 'relative' }}>
      <button onClick={onBack} style={{ position: 'absolute', top: 24, left: 32, background: 'none', border: 0, cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.10em', color: MUTED }}>
        ← Back
      </button>
      <div style={{ marginBottom: 48 }}><ClassicLogo size={34} /></div>
      <form onSubmit={submit} style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontVariationSettings: "'wdth' 125, 'wght' 700", fontStretch: '125%', fontWeight: 700, fontSize: 'clamp(28px,5vw,36px)', letterSpacing: '-0.04em', lineHeight: 0.95, color: CREAM, textAlign: 'center', margin: '0 0 2px' }}>
          Use recovery phrase
        </h1>
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: MUTED, textAlign: 'center', margin: '0 0 12px', lineHeight: 1.7 }}>
          Enter the six words you saved when you set up your account.
        </p>
        <textarea
          value={phrase}
          onChange={(e) => { setPhrase(e.target.value); setError('') }}
          placeholder="word word word word word word"
          rows={3}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          disabled={busy}
          style={{ ...inputStyle(false), fontFamily: 'var(--font-mono)', resize: 'none', lineHeight: 1.7 }}
        />
        {error && <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#f87171', letterSpacing: '0.06em', margin: 0 }}>{error}</p>}
        <button
          type="submit"
          disabled={!ready}
          style={{ width: '100%', padding: '13px 16px', background: ready ? CREAM : 'rgba(240,235,224,0.06)', color: ready ? INK : 'rgba(240,235,224,0.22)', border: 'none', cursor: ready ? 'pointer' : 'not-allowed', fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em' }}
        >
          {busy ? 'Signing in…' : 'Sign in →'}
        </button>
      </form>
    </div>
  )
}

// ─── Sign-up screen ───────────────────────────────────────────────────────────

function SignUpScreen({ onNameStored }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [usePhrase, setUsePhrase] = useState(false)

  const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
  const canSubmit = name.trim().length > 0 && isValidEmail(email)
  const anyLoading = submitting || googleLoading

  const handleGoogle = async () => {
    setError('')
    setGoogleLoading(true)
    const { error: sbError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/onboarding` },
    })
    if (sbError) {
      setError(sbError.message)
      setGoogleLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!canSubmit) return
    setError('')
    setSubmitting(true)

    const { error: sbError } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        data: { display_name: name.trim() },
        emailRedirectTo: `${window.location.origin}/onboarding`,
      },
    })

    setSubmitting(false)

    if (sbError) {
      setError(sbError.message)
      return
    }

    onNameStored(name.trim(), email.trim().toLowerCase())
    setSent(true)
  }

  if (usePhrase) return <RecoverySignIn onBack={() => setUsePhrase(false)} />

  if (sent) {
    return (
      <div className="tvx-auth">
        <AuthBrandPanel />
        <div className="tvx-auth__form">
          <AuthBackLink />
          <div className="tvx-auth__col" style={{ textAlign: 'center' }}>
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" style={{ margin: '0 auto 26px', display: 'block', opacity: 0.75 }} aria-hidden="true">
              <path d="M12 2L22 12L12 22L2 12Z" stroke={CREAM} strokeWidth="0.8" strokeLinejoin="round" />
              <path d="M12 6.5L17.5 12L12 17.5L6.5 12Z" stroke={CREAM} strokeWidth="0.8" strokeLinejoin="round" />
            </svg>
            <h2 style={{ fontFamily: 'var(--font-display)', fontVariationSettings: "'wdth' 125, 'wght' 700", fontStretch: '125%', fontWeight: 700, fontSize: 'clamp(26px,4vw,32px)', letterSpacing: '-0.04em', color: CREAM, margin: '0 0 12px' }}>
              Check your email
            </h2>
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: 14, lineHeight: 1.75, color: MUTED, margin: '0 auto', maxWidth: 320 }}>
              We sent a magic link to <span style={{ color: CREAM }}>{email}</span>. Click it to continue — no password needed.
            </p>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.16em', color: 'rgba(240,235,224,0.22)', marginTop: 24 }}>
              DIDN'T GET IT? CHECK YOUR SPAM FOLDER.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="tvx-auth">
      <AuthBrandPanel />

      <div className="tvx-auth__form">
        <AuthBackLink />

        <div className="tvx-auth__col">
          {/* The wordmark only appears here on narrow screens; on desktop the
              brand panel already carries it, and two logos read as a mistake. */}
          <div className="tvx-auth__mark">
            <ClassicLogo size={30} />
          </div>

          <h1 style={{ fontFamily: 'var(--font-display)', fontVariationSettings: "'wdth' 125, 'wght' 700", fontStretch: '125%', fontWeight: 700, fontSize: 'clamp(30px,4.4vw,40px)', letterSpacing: '-0.04em', lineHeight: 0.98, color: CREAM, margin: '0 0 10px' }}>
            Create your account
          </h1>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13.5, color: MUTED, margin: '0 0 32px' }}>
            No password required. Free forever.
          </p>

          <button
            onClick={handleGoogle}
            disabled={anyLoading}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
              background: anyLoading ? 'rgba(240,235,224,0.06)' : 'rgba(240,235,224,0.08)',
              border: `1px solid ${BORDER_COLOR}`,
              padding: '13px 16px',
              fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 500,
              color: anyLoading ? MUTED : CREAM,
              cursor: anyLoading ? 'not-allowed' : 'pointer',
              transition: 'background 150ms, border-color 150ms',
              letterSpacing: '-0.01em',
            }}
            onMouseEnter={e => { if (!anyLoading) { e.currentTarget.style.background = 'rgba(240,235,224,0.12)'; e.currentTarget.style.borderColor = 'rgba(240,235,224,0.22)' } }}
            onMouseLeave={e => { e.currentTarget.style.background = anyLoading ? 'rgba(240,235,224,0.06)' : 'rgba(240,235,224,0.08)'; e.currentTarget.style.borderColor = BORDER_COLOR }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            {googleLoading ? 'Redirecting…' : 'Continue with Google'}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '22px 0' }}>
            <div style={{ flex: 1, height: 1, background: BORDER_COLOR }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(240,235,224,0.28)' }}>or email</span>
            <div style={{ flex: 1, height: 1, background: BORDER_COLOR }} />
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <AuthInput label="Your name" type="text" placeholder="Jane Smith" value={name}
              onChange={(e) => setName(e.target.value)} disabled={anyLoading} autoComplete="name" />
            <AuthInput label="Email address" type="email" placeholder="jane@example.com" value={email}
              onChange={(e) => setEmail(e.target.value)} disabled={anyLoading} autoComplete="email" />

            {error && (
              <p role="alert" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#f87171', letterSpacing: '0.06em', margin: 0 }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={!canSubmit || anyLoading}
              style={{
                width: '100%', padding: '14px 16px',
                background: canSubmit && !anyLoading ? CREAM : 'rgba(240,235,224,0.10)',
                // The old disabled colour was 0.22 alpha on a 0.06 ground, which
                // was effectively invisible — the primary action looked missing.
                color: canSubmit && !anyLoading ? INK : 'rgba(240,235,224,0.45)',
                border: `1px solid ${canSubmit && !anyLoading ? CREAM : BORDER_COLOR}`,
                cursor: canSubmit && !anyLoading ? 'pointer' : 'not-allowed',
                fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 600,
                letterSpacing: '-0.01em', transition: 'background 150ms, opacity 150ms',
              }}
              onMouseEnter={e => { if (canSubmit && !anyLoading) e.currentTarget.style.opacity = '0.88' }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
            >
              {submitting ? 'Sending…' : 'Send magic link →'}
            </button>
          </form>

          <button
            type="button"
            onClick={() => setUsePhrase(true)}
            style={{ display: 'block', margin: '22px auto 0', background: 'none', border: 0, cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.12em', color: MUTED, textDecoration: 'underline', textUnderlineOffset: 4 }}
          >
            SIGN IN WITH A RECOVERY PHRASE
          </button>

          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', color: 'rgba(240,235,224,0.26)', textAlign: 'center', marginTop: 26, lineHeight: 1.9 }}>
            BY CONTINUING YOU AGREE TO OUR{' '}
            <a href="/terms" style={{ color: MUTED, textDecoration: 'underline', textUnderlineOffset: 3 }}>TERMS</a>
            {' '}AND{' '}
            <a href="/privacy" style={{ color: MUTED, textDecoration: 'underline', textUnderlineOffset: 3 }}>PRIVACY POLICY</a>
            .{' '}NOT FINANCIAL ADVICE.
          </p>
        </div>
      </div>
    </div>
  )
}

function AuthBackLink() {
  return (
    <a
      href="/"
      style={{ position: 'absolute', top: 24, left: 'clamp(20px,6vw,56px)', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.10em', color: MUTED, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6, transition: 'color 150ms' }}
      onMouseEnter={e => { e.currentTarget.style.color = CREAM }}
      onMouseLeave={e => { e.currentTarget.style.color = MUTED }}
    >
      ← Back
    </a>
  )
}

// Candlesticks drawn in box characters: the same ink-and-monospace vocabulary as
// the terminal, so the first screen already looks like the product.
const AUTH_ASCII = [
  '                        ╷                 ╷      ',
  '              ╷    ╷   ┌┴┐      ╷    ╷   ┌┴┐  ╷  ',
  '         ╷   ┌┴┐  ┌┴┐  │ │ ╷   ┌┴┐  ┌┴┐  │ │ ┌┴┐ ',
  '    ╷   ┌┴┐  │ │  │ │  │ │┌┴┐  │ │  │ │  └┬┘ │ │ ',
  '   ┌┴┐  │ │  └┬┘  │ │  └┬┘│ │  └┬┘  │ │   ╵  └┬┘ ',
  '   │ │  └┬┘   ╵   └┬┘   ╵ └┬┘   ╵   └┬┘       ╵  ',
  '   └┬┘   ╵         ╵       ╵         ╵           ',
  '    ╵                                            ',
].join('\n')

const AUTH_FEATURES = [
  ['[##]', 'A brief built for you', 'stocks, crypto, government trades'],
  ['[>_]', 'Axiom terminal', 'live memecoin radar and paper execution'],
  ['[/\\]', 'An Elo ladder', 'every closed trade moves your rating'],
]

function AuthBrandPanel() {
  return (
    <aside className="tvx-auth__brand" aria-hidden="true">
      <div
        style={{ position: 'absolute', inset: 0, backgroundImage: GRAIN_URL, backgroundSize: '200px 200px', opacity: 0.05, pointerEvents: 'none' }}
      />
      <div style={{ position: 'relative' }}>
        <ClassicLogo size={30} />
      </div>

      <div style={{ position: 'relative', maxWidth: 420 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontVariationSettings: "'wdth' 125, 'wght' 700", fontStretch: '125%', fontWeight: 700, fontSize: 'clamp(26px,2.6vw,36px)', lineHeight: 1.02, letterSpacing: '-0.04em', color: CREAM, margin: '0 0 16px' }}>
          Learn the market<br />without losing<br />your shirt.
        </h2>
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: 14, lineHeight: 1.7, color: MUTED, margin: '0 0 34px', maxWidth: 330 }}>
          Paper trading only. No real money moves — just the habits, the data and a ladder to climb.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {AUTH_FEATURES.map(([glyph, title, detail]) => (
            <div key={title} className="tvx-auth__feature">
              <span style={{ color: 'rgba(240,235,224,0.34)' }}>{glyph}</span>
              <span><b>{title}</b> — {detail}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="tvx-auth__ascii" style={{ position: 'relative' }}>{AUTH_ASCII}</div>
    </aside>
  )
}

// ─── Main container ───────────────────────────────────────────────────────────

export default function QuizContainer() {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const { user, loading } = useAuth()

  // -1 = sign-up, 0+ = quiz question index
  const [stage, setStage] = useState(-1)
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState({
    investorType: null,
    traderRole: null,
    watchedCategories: [],
    watchlist: [],
    priorityAlerts: [],
    updateFrequency: null,
    riskTolerance: null,
  })
  const [transitioning, setTransitioning] = useState(false)
  const [building, setBuilding] = useState(false)

  // When Supabase auth fires (magic link or Google OAuth), advance to quiz
  // If already onboarded, skip straight to the app
  useEffect(() => {
    if (user && stage === -1) {
      const meta = user.user_metadata ?? {}
      if (meta.onboardingComplete) {
        navigate('/feed', { replace: true })
        return
      }
      const displayName = meta.display_name ?? meta.full_name ?? meta.name ?? null
      const email = user.email ?? null
      if (displayName || email) dispatch(setPreferences({ displayName, email }))
      setStage(0)
    }
  }, [user, stage, dispatch, navigate])

  const handleNameStored = (displayName, email) => {
    dispatch(setPreferences({ displayName, email }))
  }

  const q = QUESTIONS[current]

  const canContinue = () => {
    if (q.type === 'watchlist') return true
    const val = answers[q.id]
    if (q.type === 'single') return val !== null && val !== undefined
    if (q.type === 'multi') return Array.isArray(val) && val.length > 0
    return true
  }

  const handleAnswer = (value) => {
    setAnswers((prev) => ({ ...prev, [q.id]: value }))
  }

  const handleContinue = async () => {
    if (!canContinue()) return

    if (current < QUESTIONS.length - 1) {
      setTransitioning(true)
      setTimeout(() => {
        setCurrent((c) => c + 1)
        setTransitioning(false)
      }, 200)
    } else {
      setBuilding(true)
      dispatch(setPreferences({ ...answers, onboardingComplete: true }))

      const { error: saveError } = await supabase.auth.updateUser({
        data: { ...answers, onboardingComplete: true },
      })
      if (saveError) console.log('Preferences save error (non-fatal):', saveError.message)

      setTimeout(() => {
        dispatch(setOnboardingComplete(true))
        navigate('/welcome', { replace: true })
      }, 2000)
    }
  }

  const handleBack = () => {
    if (current > 0) {
      setTransitioning(true)
      setTimeout(() => {
        setCurrent((c) => c - 1)
        setTransitioning(false)
      }, 200)
    }
  }

  // Wait for Supabase session to resolve before rendering anything
  const spinner = <div aria-label="Loading" role="status" style={{ width: 28, height: 28, border: '2px solid var(--paper)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
  if (loading) {
    return <div style={{ minHeight: '100vh', background: INK, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{spinner}</div>
  }

  if (stage === -1) {
    return <SignUpScreen onNameStored={handleNameStored} />
  }

  if (building) {
    return (
      <div style={{ minHeight: '100vh', background: INK, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, textAlign: 'center', padding: 24 }}>
        {spinner}
        <p style={{ fontFamily: 'var(--font-display)', fontStretch: '125%', fontWeight: 800, fontSize: 26, textTransform: 'uppercase', color: CREAM, margin: 0 }}>Building your feed</p>
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: MUTED, margin: 0 }}>Personalizing your experience</p>
      </div>
    )
  }

  const total = QUESTIONS.length
  const barWidth = 24
  const filled = Math.round(((current + 1) / total) * barWidth)
  return (
    <div style={{ minHeight: '100vh', background: INK, display: 'flex', flexDirection: 'column', color: CREAM }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '22px 24px 0' }}>
        <button
          onClick={current > 0 ? handleBack : () => navigate('/')}
          style={{ background: 'none', border: 0, cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.1em', color: MUTED }}
        >
          &larr; Back
        </button>
        <div role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={current + 1} aria-label="Quiz progress" style={{ fontFamily: "'Courier Prime', 'Courier New', monospace", fontWeight: 700, fontSize: 13, whiteSpace: 'pre', color: CREAM }}>
          [{'#'.repeat(filled)}<span style={{ color: 'rgba(240,235,224,0.22)' }}>{'-'.repeat(barWidth - filled)}</span>] <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: MUTED }}>{current + 1}/{total}</span>
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgba(240,235,224,0.3)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {user?.user_metadata?.full_name ?? user?.user_metadata?.display_name ?? ''}
        </span>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', opacity: transitioning ? 0 : 1, transition: 'opacity 200ms' }}>
        {q.type === 'watchlist' ? (
          <WatchlistBuilder onUpdate={(tags) => handleAnswer(tags)} initialTags={answers.watchlist} />
        ) : (
          <QuizQuestion question={q.question} options={q.options} type={q.type} onAnswer={handleAnswer} selected={answers[q.id]} />
        )}
      </div>

      <div style={{ padding: '0 24px 36px', display: 'flex', justifyContent: 'center' }}>
        <button
          onClick={handleContinue}
          disabled={!canContinue()}
          style={{
            minWidth: 200, padding: '13px 28px', border: 'none', borderRadius: 2, fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
            background: canContinue() ? CREAM : 'rgba(240,235,224,0.06)', color: canContinue() ? 'var(--ink-900)' : 'rgba(240,235,224,0.22)', cursor: canContinue() ? 'pointer' : 'not-allowed',
          }}
        >
          {current === QUESTIONS.length - 1 ? 'Finish' : 'Continue'}
        </button>
      </div>
    </div>
  )
}
