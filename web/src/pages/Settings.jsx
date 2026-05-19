import { useState, useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { updateWatchlist, resetPreferences } from '../store/preferencesSlice'
import { supabase } from '../utils/supabase/client'
import { useAuth } from '../contexts/AuthContext'
import { UserAvatar } from '../components/Sidebar'
import { useGetMyProfileQuery, useUpdateProfileMutation } from '../api/profilesApi'

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

function BackButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 text-[#a1a1aa] hover:text-white text-sm mb-6 transition-colors"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="15 18 9 12 15 6"/>
      </svg>
      Settings
    </button>
  )
}

function Row({ label, value }) {
  return (
    <div className="px-4 py-3.5 flex justify-between items-center">
      <span className="text-[#a1a1aa] text-sm">{label}</span>
      <span className="text-white text-sm font-medium">{value}</span>
    </div>
  )
}

function Card({ icon, title, subtitle, preview, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full bg-[#141414] hover:bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#3a3a3a] rounded-xl px-5 py-4 flex items-center gap-4 transition-all group text-left"
    >
      <div className="w-11 h-11 rounded-lg bg-[#1f1f1f] group-hover:bg-[#252525] flex items-center justify-center flex-shrink-0 transition-colors">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white font-semibold text-sm">{title}</p>
        {subtitle && <p className="text-[#6b7280] text-xs mt-0.5 truncate">{subtitle}</p>}
        {preview && <p className="text-[#3b82f6] text-xs mt-0.5 truncate">{preview}</p>}
      </div>
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#6b7280] group-hover:text-[#a1a1aa] flex-shrink-0 transition-colors">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
    </button>
  )
}

const USERNAME_RE = /^[a-z0-9_]{3,20}$/

function ProfileView({ onBack }) {
  const { data: profile, isLoading } = useGetMyProfileQuery()
  const [updateProfile, { isLoading: saving }] = useUpdateProfileMutation()

  const [username, setUsername] = useState('')
  const [bio, setBio] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [usernameError, setUsernameError] = useState('')

  useEffect(() => {
    if (profile) {
      setUsername(profile.username ?? '')
      setBio(profile.bio ?? '')
      setAvatarUrl(profile.avatar_url ?? '')
    }
  }, [profile])

  const handleSave = async (e) => {
    e.preventDefault()
    setUsernameError('')
    const clean = username.trim().toLowerCase()
    if (clean && !USERNAME_RE.test(clean)) {
      setUsernameError('3–20 chars: letters, numbers, underscores only')
      return
    }
    try {
      await updateProfile({ username: clean, bio: bio.trim(), avatar_url: avatarUrl.trim() }).unwrap()
      onBack()
    } catch (err) {
      setUsernameError(err?.data?.message ?? 'Failed to save.')
    }
  }

  const avatarInitials = (username || profile?.display_name || '?').charAt(0).toUpperCase()

  return (
    <>
      <BackButton onClick={onBack} />
      <h1 className="text-xl font-bold text-white mb-6">Edit Profile</h1>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
        </div>
      ) : (
        <form onSubmit={handleSave} className="flex flex-col gap-5">

          {/* Avatar preview */}
          <div className="flex flex-col items-center gap-3">
            <div className="w-20 h-20 rounded-2xl overflow-hidden flex items-center justify-center text-2xl font-bold text-white bg-[#1f1f1f] border border-[#2a2a2a]">
              {avatarUrl
                ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none' }} />
                : avatarInitials}
            </div>
            <div className="w-full">
              <label className="block text-xs uppercase tracking-widest text-[#6b7280] mb-2">Profile picture URL</label>
              <input
                type="url"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://example.com/photo.jpg"
                className="w-full bg-[#141414] border border-[#2a2a2a] text-white placeholder-[#6b7280] text-sm rounded-xl px-4 py-3 focus:outline-none focus:border-[#3b82f6] transition-colors"
              />
              <p className="text-[#4b5563] text-xs mt-1.5">Paste a link to any image. Google profile pictures work great.</p>
            </div>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-widest text-[#6b7280] mb-2">Username *</label>
            <input
              type="text"
              value={username}
              onChange={(e) => { setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '')); setUsernameError('') }}
              placeholder="your_username"
              maxLength={20}
              className="w-full bg-[#141414] border border-[#2a2a2a] text-white placeholder-[#6b7280] text-sm rounded-xl px-4 py-3 focus:outline-none focus:border-[#3b82f6] transition-colors font-mono"
            />
            {usernameError && <p className="text-red-400 text-xs mt-1.5">{usernameError}</p>}
            <p className="text-[#4b5563] text-xs mt-1.5">Required to join groups. Letters, numbers, underscores, 3–20 chars.</p>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-widest text-[#6b7280] mb-2">Bio</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value.slice(0, 200))}
              placeholder="Tell your club a bit about yourself…"
              rows={4}
              className="w-full bg-[#141414] border border-[#2a2a2a] text-white placeholder-[#6b7280] text-sm rounded-xl px-4 py-3 focus:outline-none focus:border-[#3b82f6] transition-colors resize-none"
            />
            <p className="text-[#4b5563] text-xs mt-1">{bio.length}/200</p>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full py-3 rounded-xl text-sm font-semibold bg-white text-[#0a0a0a] hover:bg-white/90 disabled:opacity-40 transition-colors"
          >
            {saving ? 'Saving…' : 'Save & finish'}
          </button>
        </form>
      )}
    </>
  )
}

function AccountView({ onBack }) {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const { user } = useAuth()
  const [signingOut, setSigningOut] = useState(false)

  const meta = user?.user_metadata ?? {}
  const displayName = meta.full_name ?? meta.name ?? meta.display_name ?? null
  const email = user?.email ?? null
  const provider = user?.app_metadata?.provider ?? 'email'

  const handleSignOut = async () => {
    setSigningOut(true)
    await supabase.auth.signOut()
    dispatch(resetPreferences())
    navigate('/', { replace: true })
  }

  return (
    <>
      <BackButton onClick={onBack} />
      <h1 className="text-xl font-bold text-white mb-6">Account</h1>

      <div className="flex flex-col items-center mb-8">
        <UserAvatar user={user} size={72} />
        {displayName && <p className="text-white font-semibold text-lg mt-3">{displayName}</p>}
        {email && <p className="text-[#6b7280] text-sm mt-1">{email}</p>}
        <span className="mt-2 text-xs bg-[#1f1f1f] border border-[#2a2a2a] text-[#a1a1aa] px-2.5 py-0.5 rounded-full capitalize">
          {provider === 'google' ? 'Google account' : 'Email account'}
        </span>
      </div>

      <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl divide-y divide-[#2a2a2a] mb-6">
        <Row label="Name" value={displayName ?? 'Not set'} />
        <Row label="Email" value={email ?? 'Not set'} />
        <Row label="Sign-in method" value={provider === 'google' ? 'Google OAuth' : 'Magic link'} />
      </div>

      <button
        onClick={handleSignOut}
        disabled={signingOut}
        className="w-full flex items-center justify-center gap-2 bg-[#141414] hover:bg-red-500/10 border border-[#2a2a2a] hover:border-red-500/30 text-[#a1a1aa] hover:text-red-400 text-sm font-medium py-3.5 rounded-xl transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        {signingOut ? 'Signing out…' : 'Sign out'}
      </button>
    </>
  )
}

function InterestsView({ onBack }) {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const preferences = useSelector((state) => state.preferences)

  const handleRetakeQuiz = async () => {
    await supabase.auth.updateUser({ data: { onboardingComplete: false } })
    dispatch(resetPreferences())
    navigate('/onboarding')
  }

  return (
    <>
      <BackButton onClick={onBack} />
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-white">My Interests</h1>
        <button
          onClick={handleRetakeQuiz}
          className="text-[#3b82f6] text-sm hover:text-blue-400 transition-colors font-medium"
        >
          Retake Quiz
        </button>
      </div>

      <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl divide-y divide-[#2a2a2a] mb-6">
        <Row label="Investor type" value={INVESTOR_LABELS[preferences.investorType] ?? 'Not set'} />
        <Row label="Risk tolerance" value={RISK_LABELS[preferences.riskTolerance] ?? 'Not set'} />
        <Row label="Update frequency" value={FREQUENCY_LABELS[preferences.updateFrequency] ?? 'Not set'} />
      </div>

      <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-4 mb-4">
        <p className="text-[#a1a1aa] text-xs font-medium uppercase tracking-wide mb-3">Tracked Categories</p>
        <div className="flex flex-wrap gap-2">
          {preferences.watchedCategories?.length > 0 ? (
            preferences.watchedCategories.map((cat) => (
              <span key={cat} className="text-xs bg-[#3b82f6]/10 text-[#3b82f6] border border-[#3b82f6]/30 px-2.5 py-1 rounded-full">
                {CATEGORY_LABELS[cat] ?? cat}
              </span>
            ))
          ) : (
            <span className="text-[#6b7280] text-xs">None selected</span>
          )}
        </div>
      </div>

      <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-4">
        <p className="text-[#a1a1aa] text-xs font-medium uppercase tracking-wide mb-3">Priority Alerts</p>
        <div className="flex flex-wrap gap-2">
          {preferences.priorityAlerts?.length > 0 ? (
            preferences.priorityAlerts.map((alert) => (
              <span key={alert} className="text-xs bg-[#1f1f1f] text-[#a1a1aa] border border-[#2a2a2a] px-2.5 py-1 rounded-full">
                {ALERT_LABELS[alert] ?? alert}
              </span>
            ))
          ) : (
            <span className="text-[#6b7280] text-xs">None selected</span>
          )}
        </div>
      </div>
    </>
  )
}

function WatchlistView({ onBack }) {
  const dispatch = useDispatch()
  const preferences = useSelector((state) => state.preferences)
  const [newTicker, setNewTicker] = useState('')
  const [saving, setSaving] = useState(false)

  const persistWatchlist = async (watchlist) => {
    setSaving(true)
    const { error } = await supabase.auth.updateUser({ data: { watchlist } })
    if (error) console.log('Watchlist persist error:', error.message)
    setSaving(false)
  }

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

  return (
    <>
      <BackButton onClick={onBack} />
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-white">Watchlist</h1>
        {saving && <span className="text-[#6b7280] text-xs">Saving…</span>}
      </div>

      <form onSubmit={handleAddTicker} className="flex gap-2 mb-5">
        <input
          type="text"
          value={newTicker}
          onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
          placeholder="Add ticker (e.g. AAPL)"
          className="flex-1 bg-[#141414] border border-[#2a2a2a] text-white placeholder-[#6b7280] text-sm rounded-xl px-4 py-3 focus:outline-none focus:border-[#3b82f6] transition-colors"
        />
        <button
          type="submit"
          className="bg-[#3b82f6] hover:bg-[#2563eb] text-white text-sm font-semibold px-5 py-3 rounded-xl transition-colors"
        >
          Add
        </button>
      </form>

      {preferences.watchlist?.length > 0 ? (
        <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl divide-y divide-[#2a2a2a]">
          {preferences.watchlist.map((item) => (
            <div key={item.ticker} className="flex items-center justify-between px-4 py-3.5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#1f1f1f] flex items-center justify-center">
                  <span className="text-xs font-bold text-[#3b82f6]">{item.ticker.slice(0, 2)}</span>
                </div>
                <div>
                  <span className="text-white font-semibold text-sm">{item.ticker}</span>
                  {item.name && item.name !== item.ticker && (
                    <p className="text-[#6b7280] text-xs">{item.name}</p>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleRemoveTicker(item.ticker)}
                className="text-[#6b7280] hover:text-red-400 text-xs font-medium transition-colors px-2 py-1 rounded hover:bg-red-500/10"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center py-12 text-center">
          <div className="w-12 h-12 rounded-full bg-[#1f1f1f] flex items-center justify-center mb-3">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14"/>
            </svg>
          </div>
          <p className="text-[#6b7280] text-sm">Your watchlist is empty</p>
          <p className="text-[#4b5563] text-xs mt-1">Add tickers above to track them</p>
        </div>
      )}
    </>
  )
}

function NotificationsView({ onBack }) {
  return (
    <>
      <BackButton onClick={onBack} />
      <h1 className="text-xl font-bold text-white mb-6">Notifications</h1>

      <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl divide-y divide-[#2a2a2a] mb-4">
        {[
          { label: 'Push notifications', desc: 'Alerts on your device' },
          { label: 'Email digest', desc: 'Daily or weekly summary' },
          { label: 'SMS alerts', desc: 'Text message alerts' },
        ].map(({ label, desc }) => (
          <div key={label} className="flex items-center justify-between px-4 py-4">
            <div>
              <p className="text-white text-sm font-medium">{label}</p>
              <p className="text-[#6b7280] text-xs mt-0.5">{desc}</p>
            </div>
            <span className="text-xs bg-[#1f1f1f] border border-[#2a2a2a] text-[#6b7280] px-2.5 py-1 rounded-full">
              Soon
            </span>
          </div>
        ))}
      </div>
      <p className="text-[#6b7280] text-xs text-center">Notification features are in development.</p>
    </>
  )
}

export default function Settings() {
  const [view, setView] = useState(null)
  const { user } = useAuth()
  const preferences = useSelector((state) => state.preferences)

  const meta = user?.user_metadata ?? {}
  const displayName = meta.full_name ?? meta.name ?? meta.display_name ?? null
  const email = user?.email ?? null
  const watchlistCount = preferences.watchlist?.length ?? 0
  const investorLabel = INVESTOR_LABELS[preferences.investorType] ?? null

  if (view === 'profile') return (
    <main className="flex-1 p-5 md:p-8 max-w-lg mx-auto w-full">
      <ProfileView onBack={() => setView(null)} />
    </main>
  )
  if (view === 'account') return (
    <main className="flex-1 p-5 md:p-8 max-w-lg mx-auto w-full">
      <AccountView onBack={() => setView(null)} />
    </main>
  )
  if (view === 'interests') return (
    <main className="flex-1 p-5 md:p-8 max-w-lg mx-auto w-full">
      <InterestsView onBack={() => setView(null)} />
    </main>
  )
  if (view === 'watchlist') return (
    <main className="flex-1 p-5 md:p-8 max-w-lg mx-auto w-full">
      <WatchlistView onBack={() => setView(null)} />
    </main>
  )
  if (view === 'notifications') return (
    <main className="flex-1 p-5 md:p-8 max-w-lg mx-auto w-full">
      <NotificationsView onBack={() => setView(null)} />
    </main>
  )

  return (
    <main className="flex-1 p-5 md:p-8 max-w-lg mx-auto w-full">
      <div className="flex flex-col items-center mb-8 pt-2">
        <UserAvatar user={user} size={64} />
        {displayName && <p className="text-white font-bold text-lg mt-3">{displayName}</p>}
        {email && <p className="text-[#6b7280] text-sm mt-1">{email}</p>}
      </div>

      <div className="space-y-3">
        <Card
          onClick={() => setView('profile')}
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ec4899" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
          }
          title="Edit Profile"
          subtitle="Username, bio, and public info"
        />
        <Card
          onClick={() => setView('account')}
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
          }
          title="Account"
          subtitle={email ?? 'Manage your account'}
          preview={null}
        />
        <Card
          onClick={() => setView('interests')}
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
          }
          title="My Interests"
          subtitle="Quiz results and market preferences"
          preview={investorLabel ?? undefined}
        />
        <Card
          onClick={() => setView('watchlist')}
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
              <polyline points="16 7 22 7 22 13"/>
            </svg>
          }
          title="Watchlist"
          subtitle="Manage your tracked tickers"
          preview={watchlistCount > 0 ? `${watchlistCount} ticker${watchlistCount !== 1 ? 's' : ''} tracked` : undefined}
        />
        <Card
          onClick={() => setView('notifications')}
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
          }
          title="Notifications"
          subtitle="Push, email, and SMS alerts"
          preview="Coming soon"
        />
      </div>

      <p className="text-[#4b5563] text-xs text-center mt-10">
        Not financial advice. For educational use only.
      </p>
    </main>
  )
}
