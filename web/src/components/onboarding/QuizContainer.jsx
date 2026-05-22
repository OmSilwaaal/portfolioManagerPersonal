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
    // on success the page redirects — no need to reset loading
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
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center px-6 text-center">
        <div className="w-14 h-14 rounded-full bg-[#3b82f6]/10 border border-[#3b82f6]/30 flex items-center justify-center mb-6">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
            <polyline points="22,6 12,13 2,6"/>
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Check your email</h2>
        <p className="text-[#6b7280] text-sm max-w-xs">
          We sent a magic link to <span className="text-[#a1a1aa]">{email}</span>.
          Click it to continue — no password needed.
        </p>
        <p className="text-[#4a4a4a] text-xs mt-6">Didn't get it? Check your spam folder.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center px-6">
      <div className="mb-12">
        <Logo size="lg" />
      </div>

      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-bold text-white text-center mb-2">Create your account</h1>
        <p className="text-[#6b7280] text-center mb-8 text-sm">
          No password. No credit card. Free forever.
        </p>

        {/* Google OAuth — primary */}
        <button
          onClick={handleGoogle}
          disabled={anyLoading}
          className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-100 disabled:bg-gray-200 text-gray-900 font-semibold py-3 px-4 rounded-lg text-sm transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          {googleLoading ? 'Redirecting...' : 'Continue with Google'}
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-[#2a2a2a]" />
          <span className="text-[#4b5563] text-xs">or continue with email</span>
          <div className="flex-1 h-px bg-[#2a2a2a]" />
        </div>

        {/* Magic link — fallback */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-[#a1a1aa] mb-1.5">Your name</label>
            <input
              type="text"
              placeholder="Jane Smith"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={anyLoading}
              className="w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg px-4 py-3 text-white placeholder-[#3a3a3a] focus:outline-none focus:border-[#3b82f6] transition-colors text-sm disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#a1a1aa] mb-1.5">Email address</label>
            <input
              type="email"
              placeholder="jane@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={anyLoading}
              className="w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg px-4 py-3 text-white placeholder-[#3a3a3a] focus:outline-none focus:border-[#3b82f6] transition-colors text-sm disabled:opacity-50"
            />
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <button
            type="submit"
            disabled={!canSubmit || anyLoading}
            className={`w-full py-3 rounded-lg font-semibold text-sm transition-all ${
              canSubmit && !anyLoading
                ? 'bg-[#3b82f6] text-white hover:bg-[#2563eb]'
                : 'bg-[#1a1a1a] text-[#3a3a3a] cursor-not-allowed'
            }`}
          >
            {submitting ? 'Sending...' : 'Send magic link →'}
          </button>
        </form>

        <p className="text-[#4a4a4a] text-xs text-center mt-6">
          By continuing you agree to our{' '}
          <span className="text-[#6b7280] underline cursor-pointer">Terms</span>{' '}
          and{' '}
          <span className="text-[#6b7280] underline cursor-pointer">Privacy Policy</span>.
          <br />
          Not financial advice. For educational use only.
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
