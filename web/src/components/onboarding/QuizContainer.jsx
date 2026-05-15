import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { setPreferences, setOnboardingComplete } from '../../store/preferencesSlice'
import { useSavePreferencesMutation } from '../../api/preferencesApi'
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

  const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
  const canSubmit = name.trim().length > 0 && isValidEmail(email)

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
      <div className="flex items-center gap-2 mb-12">
        <div className="w-8 h-8 bg-[#3b82f6] rounded-lg flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
          </svg>
        </div>
        <span className="font-semibold text-white text-lg tracking-tight">MarketIQ</span>
      </div>

      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-bold text-white text-center mb-2">Create your account</h1>
        <p className="text-[#6b7280] text-center mb-8 text-sm">
          No password. No credit card. Free forever.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-[#a1a1aa] mb-1.5">Your name</label>
            <input
              type="text"
              autoFocus
              placeholder="Jane Smith"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg px-4 py-3 text-white placeholder-[#3a3a3a] focus:outline-none focus:border-[#3b82f6] transition-colors text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#a1a1aa] mb-1.5">Email address</label>
            <input
              type="email"
              placeholder="jane@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg px-4 py-3 text-white placeholder-[#3a3a3a] focus:outline-none focus:border-[#3b82f6] transition-colors text-sm"
            />
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <button
            type="submit"
            disabled={!canSubmit || submitting}
            className={`w-full py-3 rounded-lg font-semibold text-sm transition-all mt-2 ${
              canSubmit && !submitting
                ? 'bg-[#3b82f6] text-white hover:bg-[#2563eb]'
                : 'bg-[#1a1a1a] text-[#3a3a3a] cursor-not-allowed'
            }`}
          >
            {submitting ? 'Sending...' : 'Continue →'}
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
  const { user } = useAuth()
  const sessionId = useSelector((state) => state.preferences.sessionId)
  const [savePreferences] = useSavePreferencesMutation()

  // -1 = sign-up, 0+ = quiz question index
  const [stage, setStage] = useState(-1)
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState({
    investorType: null,
    watchedCategories: [],
    watchlist: [],
    priorityAlerts: [],
    updateFrequency: null,
    riskTolerance: null,
  })
  const [transitioning, setTransitioning] = useState(false)
  const [building, setBuilding] = useState(false)

  // When Supabase auth fires (user clicked magic link), advance to quiz
  useEffect(() => {
    if (user && stage === -1) {
      const displayName = user.user_metadata?.display_name ?? null
      const email = user.email ?? null
      if (displayName || email) {
        dispatch(setPreferences({ displayName, email }))
      }
      setStage(0)
    }
  }, [user, stage, dispatch])

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
      const prefs = { sessionId, ...answers }
      dispatch(setPreferences({ ...prefs, onboardingComplete: true }))

      try {
        await savePreferences(prefs).unwrap()
      } catch (err) {
        console.log('Preferences save error (non-fatal):', err)
      }

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
    } else {
      setStage(-1)
    }
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
          onClick={handleBack}
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

        <div className="w-10" />
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
