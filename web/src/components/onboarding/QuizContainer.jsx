import { useState, useEffect } from 'react'
import Logo from '../Logo'
import { useNavigate } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import { setPreferences, setOnboardingComplete } from '../../store/preferencesSlice'
import { supabase } from '../../utils/supabase/client'
import { useAuth } from '../../contexts/AuthContext'
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
const INK   = '#0b0b0b'
const CREAM = 'var(--paper)'
const MUTED = 'rgba(240,235,224,0.36)'
const BORDER_COLOR = 'rgba(240,235,224,0.10)'

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

// ─── Sign-up screen ───────────────────────────────────────────────────────────

function SignUpScreen({ onNameStored }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

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

  if (sent) {
    return (
      <div style={{ minHeight: '100vh', background: INK, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 24px', textAlign: 'center' }}>
        {/* Diamond icon */}
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style={{ marginBottom: 28, opacity: 0.7 }}>
          <path d="M12 2L22 12L12 22L2 12Z" stroke={CREAM} strokeWidth="0.8" strokeLinejoin="round" />
          <path d="M12 6.5L17.5 12L12 17.5L6.5 12Z" stroke={CREAM} strokeWidth="0.8" strokeLinejoin="round" />
        </svg>
        <h2 style={{ fontFamily: 'var(--font-display)', fontVariationSettings: "'wdth' 125, 'wght' 700", fontStretch: '125%', fontWeight: 700, fontSize: 28, letterSpacing: '-0.04em', color: CREAM, margin: '0 0 12px' }}>
          Check your email
        </h2>
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: 14, lineHeight: 1.8, color: MUTED, maxWidth: 300, margin: '0 0 8px' }}>
          We sent a magic link to{' '}
          <span style={{ color: CREAM }}>{email}</span>.{' '}
          Click it to continue — no password needed.
        </p>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.16em', color: 'rgba(240,235,224,0.22)', marginTop: 20 }}>
          DIDN'T GET IT? CHECK YOUR SPAM FOLDER.
        </p>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: INK, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 24px 40px', position: 'relative' }}>
      {/* Back link */}
      <a
        href="/"
        style={{ position: 'absolute', top: 24, left: 32, fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.10em', color: MUTED, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6, transition: 'color 150ms' }}
        onMouseEnter={e => e.currentTarget.style.color = CREAM}
        onMouseLeave={e => e.currentTarget.style.color = MUTED}
      >
        ← Back
      </a>

      {/* Logo */}
      <div style={{ marginBottom: 48 }}>
        <Logo size="lg" />
      </div>

      <div style={{ width: '100%', maxWidth: 360 }}>
        {/* Heading */}
        <h1 style={{ fontFamily: 'var(--font-display)', fontVariationSettings: "'wdth' 125, 'wght' 700", fontStretch: '125%', fontWeight: 700, fontSize: 'clamp(28px,5vw,36px)', letterSpacing: '-0.04em', lineHeight: 0.95, color: CREAM, textAlign: 'center', margin: '0 0 10px' }}>
          Create your account
        </h1>
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: MUTED, textAlign: 'center', margin: '0 0 36px' }}>
          No password. No credit card. Free forever.
        </p>

        {/* Google OAuth */}
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
          onMouseEnter={e => { if (!anyLoading) e.currentTarget.style.background = 'rgba(240,235,224,0.12)'; e.currentTarget.style.borderColor = 'rgba(240,235,224,0.22)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(240,235,224,0.08)'; e.currentTarget.style.borderColor = BORDER_COLOR }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          {googleLoading ? 'Redirecting…' : 'Continue with Google'}
        </button>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '24px 0' }}>
          <div style={{ flex: 1, height: 1, background: BORDER_COLOR }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(240,235,224,0.22)' }}>or email</span>
          <div style={{ flex: 1, height: 1, background: BORDER_COLOR }} />
        </div>

        {/* Magic link form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <AuthInput
            label="Your name"
            type="text"
            placeholder="Jane Smith"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={anyLoading}
            autoComplete="name"
          />
          <AuthInput
            label="Email address"
            type="email"
            placeholder="jane@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={anyLoading}
            autoComplete="email"
          />

          {error && (
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#f87171', letterSpacing: '0.06em', margin: 0 }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit || anyLoading}
            style={{
              width: '100%', padding: '13px 16px',
              background: canSubmit && !anyLoading ? CREAM : 'rgba(240,235,224,0.06)',
              color: canSubmit && !anyLoading ? INK : 'rgba(240,235,224,0.22)',
              border: 'none', cursor: canSubmit && !anyLoading ? 'pointer' : 'not-allowed',
              fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 600,
              letterSpacing: '-0.01em', transition: 'background 150ms, opacity 150ms',
            }}
            onMouseEnter={e => { if (canSubmit && !anyLoading) e.currentTarget.style.opacity = '0.88' }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
          >
            {submitting ? 'Sending…' : 'Send magic link →'}
          </button>
        </form>

        {/* Legal footer */}
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', color: 'rgba(240,235,224,0.22)', textAlign: 'center', marginTop: 28, lineHeight: 1.9 }}>
          BY CONTINUING YOU AGREE TO OUR{' '}
          <a href="/privacy" style={{ color: MUTED, textDecoration: 'underline', textUnderlineOffset: 3 }}>
            PRIVACY POLICY
          </a>
          .{' '}NOT FINANCIAL ADVICE.
        </p>
      </div>
    </div>
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
        navigate('/feed')
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
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#3b82f6] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (stage === -1) {
    return <SignUpScreen onNameStored={handleNameStored} />
  }

  if (building) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-[#3b82f6] border-t-transparent rounded-full animate-spin mx-auto mb-6" />
          <p className="text-white text-2xl font-semibold">Building your feed...</p>
          <p className="text-[#6b7280] mt-2 text-sm">Personalizing your experience</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <div className="flex items-center justify-between px-6 pt-6">
        <button
          onClick={current > 0 ? handleBack : () => navigate('/')}
          className="text-[#6b7280] hover:text-white transition-colors text-sm"
        >
          ← Back
        </button>

        <div className="flex gap-2">
          {QUESTIONS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === current ? 'bg-[#3b82f6] w-6' : i < current ? 'bg-[#3b82f6]/40 w-3' : 'bg-[#1f1f1f] w-3'
              }`}
            />
          ))}
        </div>

        <span className="text-[#4b5563] text-xs truncate max-w-[120px]">
          {user?.email ?? ''}
        </span>
      </div>

      <div
        className={`flex-1 flex flex-col items-center justify-center px-6 transition-opacity duration-200 ${
          transitioning ? 'opacity-0' : 'opacity-100'
        }`}
      >
        {q.type === 'watchlist' ? (
          <WatchlistBuilder
            onUpdate={(tags) => handleAnswer(tags)}
            initialTags={answers.watchlist}
          />
        ) : (
          <QuizQuestion
            question={q.question}
            options={q.options}
            type={q.type}
            onAnswer={handleAnswer}
            selected={answers[q.id]}
          />
        )}
      </div>

      <div className="px-6 pb-10 flex justify-center">
        <button
          onClick={handleContinue}
          disabled={!canContinue()}
          className={`px-8 py-3 rounded-lg font-medium text-base transition-all ${
            canContinue()
              ? 'bg-[#3b82f6] text-white hover:bg-[#2563eb]'
              : 'bg-[#1a1a1a] text-[#3a3a3a] cursor-not-allowed'
          }`}
        >
          {current === QUESTIONS.length - 1 ? 'Finish' : 'Continue'}
        </button>
      </div>
    </div>
  )
}
