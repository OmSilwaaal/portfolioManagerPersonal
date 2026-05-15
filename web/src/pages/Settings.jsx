import { useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { updateWatchlist, resetPreferences } from '../store/preferencesSlice'
import { useUpdatePreferencesMutation } from '../api/preferencesApi'

const CATEGORY_LABELS = {
  stocks: 'US Stocks',
  crypto: 'Crypto',
  commodities: 'Commodities',
  'gov-trades': 'Gov Insider Trades',
  forex: 'Forex',
  etf: 'ETFs',
  options: 'Options Flow',
}

const ALERT_LABELS = {
  'breaking-news': 'Breaking news',
  'gov-trades': 'Gov official trades',
  'volume-spikes': 'Volume spikes',
  earnings: 'Earnings reports',
  macro: 'Fed/macro events',
  'price-alerts': 'Price alerts',
  analyst: 'Analyst ratings',
}

const INVESTOR_LABELS = {
  beginner: 'Just starting out',
  occasional: 'Occasional investor',
  regular: 'Regular investor',
  active: 'Active trader',
}

const RISK_LABELS = {
  conservative: 'Conservative',
  moderate: 'Moderate',
  aggressive: 'Aggressive',
  speculative: 'Speculative',
}

const FREQUENCY_LABELS = {
  realtime: 'Real-time',
  several: 'A few times a day',
  daily: 'Daily digest',
  weekly: 'Weekly summary',
}

export default function Settings() {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const preferences = useSelector((state) => state.preferences)
  const [updatePreferences] = useUpdatePreferencesMutation()

  const [newTicker, setNewTicker] = useState('')
  const [saving, setSaving] = useState(false)

  const handleAddTicker = (e) => {
    e.preventDefault()
    const ticker = newTicker.trim().toUpperCase()
    if (!ticker) return
    const exists = preferences.watchlist.some((w) => w.ticker === ticker)
    if (!exists) {
      const updated = [...preferences.watchlist, { ticker, assetType: 'stock', name: ticker }]
      dispatch(updateWatchlist(updated))
      persistWatchlist(updated)
    }
    setNewTicker('')
  }

  const handleRemoveTicker = (ticker) => {
    const updated = preferences.watchlist.filter((w) => w.ticker !== ticker)
    dispatch(updateWatchlist(updated))
    persistWatchlist(updated)
  }

  const persistWatchlist = async (watchlist) => {
    if (!preferences.sessionId) return
    setSaving(true)
    try {
      await updatePreferences({ sessionId: preferences.sessionId, watchlist }).unwrap()
    } catch (err) {
      console.log('Watchlist persist error:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleRetakeQuiz = () => {
    dispatch(resetPreferences())
    navigate('/onboarding')
  }

  return (
    <main className="flex-1 p-5 md:p-8 max-w-2xl mx-auto w-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-gray-400 text-sm mt-1">Manage your preferences</p>
      </div>

      {/* Section 1: My Interests */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-white">My Interests</h2>
          <button
            onClick={handleRetakeQuiz}
            className="text-[#3b82f6] text-sm hover:text-blue-400 transition-colors"
          >
            Retake Quiz
          </button>
        </div>

        <div className="bg-[#141414] border border-[#2a2a2a] rounded-lg divide-y divide-[#2a2a2a]">
          <div className="px-4 py-3 flex justify-between items-center">
            <span className="text-gray-400 text-sm">Investor type</span>
            <span className="text-white text-sm">
              {INVESTOR_LABELS[preferences.investorType] || 'Not set'}
            </span>
          </div>
          <div className="px-4 py-3 flex justify-between items-center">
            <span className="text-gray-400 text-sm">Risk tolerance</span>
            <span className="text-white text-sm">
              {RISK_LABELS[preferences.riskTolerance] || 'Not set'}
            </span>
          </div>
          <div className="px-4 py-3 flex justify-between items-center">
            <span className="text-gray-400 text-sm">Update frequency</span>
            <span className="text-white text-sm">
              {FREQUENCY_LABELS[preferences.updateFrequency] || 'Not set'}
            </span>
          </div>
          <div className="px-4 py-3">
            <p className="text-gray-400 text-sm mb-2">Tracked categories</p>
            <div className="flex flex-wrap gap-1.5">
              {preferences.watchedCategories && preferences.watchedCategories.length > 0 ? (
                preferences.watchedCategories.map((cat) => (
                  <span
                    key={cat}
                    className="text-xs bg-[#3b82f6]/10 text-[#3b82f6] border border-[#3b82f6]/30 px-2 py-0.5 rounded"
                  >
                    {CATEGORY_LABELS[cat] || cat}
                  </span>
                ))
              ) : (
                <span className="text-gray-600 text-xs">None selected</span>
              )}
            </div>
          </div>
          <div className="px-4 py-3">
            <p className="text-gray-400 text-sm mb-2">Priority alerts</p>
            <div className="flex flex-wrap gap-1.5">
              {preferences.priorityAlerts && preferences.priorityAlerts.length > 0 ? (
                preferences.priorityAlerts.map((alert) => (
                  <span
                    key={alert}
                    className="text-xs bg-[#1f1f1f] text-gray-300 border border-[#2a2a2a] px-2 py-0.5 rounded"
                  >
                    {ALERT_LABELS[alert] || alert}
                  </span>
                ))
              ) : (
                <span className="text-gray-600 text-xs">None selected</span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: Watchlist */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-white">Watchlist</h2>
          {saving && <span className="text-gray-500 text-xs">Saving...</span>}
        </div>

        <form onSubmit={handleAddTicker} className="flex gap-2 mb-4">
          <input
            type="text"
            value={newTicker}
            onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
            placeholder="Add ticker (e.g. AAPL)"
            className="flex-1 bg-[#1a1a1a] border border-[#2a2a2a] text-white placeholder-gray-600 text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-[#3b82f6]"
          />
          <button
            type="submit"
            className="bg-[#3b82f6] text-white text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-[#2563eb] transition-colors"
          >
            Add
          </button>
        </form>

        {preferences.watchlist && preferences.watchlist.length > 0 ? (
          <div className="bg-[#141414] border border-[#2a2a2a] rounded-lg divide-y divide-[#2a2a2a]">
            {preferences.watchlist.map((item) => (
              <div key={item.ticker} className="flex items-center justify-between px-4 py-3">
                <div>
                  <span className="text-white font-semibold text-sm">{item.ticker}</span>
                  {item.name && item.name !== item.ticker && (
                    <span className="text-gray-400 text-xs ml-2">{item.name}</span>
                  )}
                  <span className="ml-2 text-[10px] text-gray-600 capitalize">{item.assetType}</span>
                </div>
                <button
                  onClick={() => handleRemoveTicker(item.ticker)}
                  className="text-gray-600 hover:text-red-400 text-sm transition-colors"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-600 text-sm text-center py-6">
            Your watchlist is empty. Add tickers above.
          </p>
        )}
      </section>

      {/* Section 3: Notification Preferences (display only) */}
      <section>
        <h2 className="text-base font-semibold text-white mb-4">Notification Preferences</h2>
        <div className="bg-[#141414] border border-[#2a2a2a] rounded-lg divide-y divide-[#2a2a2a]">
          {[
            { label: 'Push notifications', value: 'Coming soon' },
            { label: 'Email digest', value: 'Coming soon' },
            { label: 'SMS alerts', value: 'Coming soon' },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between px-4 py-3">
              <span className="text-gray-400 text-sm">{label}</span>
              <span className="text-gray-600 text-xs">{value}</span>
            </div>
          ))}
        </div>
        <p className="text-gray-600 text-xs mt-3">
          Notification features are in development and will be available soon.
        </p>
      </section>
    </main>
  )
}
