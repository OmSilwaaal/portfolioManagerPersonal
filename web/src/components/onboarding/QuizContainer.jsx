import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { setPreferences, setOnboardingComplete } from '../../store/preferencesSlice'
import { useSavePreferencesMutation } from '../../api/preferencesApi'
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

export default function QuizContainer() {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const sessionId = useSelector((state) => state.preferences.sessionId)
  const [savePreferences] = useSavePreferencesMutation()

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
      // Final step — save and redirect
      setBuilding(true)
      const prefs = {
        sessionId,
        ...answers,
      }
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
    }
  }

  if (building) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex flex-col items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-[#3b82f6] border-t-transparent rounded-full animate-spin mx-auto mb-6" />
          <p className="text-white text-2xl font-semibold">Building your feed...</p>
          <p className="text-gray-400 mt-2 text-sm">Personalizing your experience</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0f0f0f] flex flex-col">
      {/* Header: Back + Progress */}
      <div className="flex items-center justify-between px-6 pt-6">
        <button
          onClick={handleBack}
          className={`text-gray-400 hover:text-white transition-colors text-sm ${current === 0 ? 'invisible' : ''}`}
        >
          &larr; Back
        </button>

        {/* Progress dots */}
        <div className="flex gap-2">
          {QUESTIONS.map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-all ${
                i === current ? 'bg-[#3b82f6] w-4' : i < current ? 'bg-[#3b82f6]/50' : 'bg-[#2a2a2a]'
              }`}
            />
          ))}
        </div>

        <div className="w-10" />
      </div>

      {/* Question area */}
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

      {/* Continue button */}
      <div className="px-6 pb-10 flex justify-center">
        <button
          onClick={handleContinue}
          disabled={!canContinue()}
          className={`px-8 py-3 rounded-lg font-medium text-base transition-all ${
            canContinue()
              ? 'bg-[#3b82f6] text-white hover:bg-[#2563eb]'
              : 'bg-[#1a1a1a] text-gray-600 cursor-not-allowed'
          }`}
        >
          {current === QUESTIONS.length - 1 ? 'Finish' : 'Continue'}
        </button>
      </div>
    </div>
  )
}
