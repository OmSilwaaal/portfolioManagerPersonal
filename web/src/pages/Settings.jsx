import { useState, useEffect, useRef, useCallback } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { updateWatchlist, resetPreferences } from '../store/preferencesSlice'
import { supabase } from '../utils/supabase/client'
import { useAuth } from '../contexts/AuthContext'
import { UserAvatar } from '../components/Sidebar'
import { useGetMyProfileQuery, useUpdateProfileMutation } from '../api/profilesApi'
import { API_BASE } from '../api/baseApi'
import { getIdentity } from '../utils/identity'
import { useRecovery } from '../components/welcome/useRecovery'
import { FriendsPanel, ReferralPanel, RecoveryPanel, label as panelLabel } from '../components/welcome/panels'
import {
  useGetSmsStatusQuery,
  useSendSmsCodeMutation,
  useVerifySmsCodeMutation,
  useUpdateSmsMutation,
  useSendSmsTestMutation,
  useRemoveSmsPhoneMutation,
} from '../api/smsApi'

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

function resizeImageToDataUrl(file, maxSize = 200, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const scale = Math.min(maxSize / img.width, maxSize / img.height, 1)
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.onerror = reject
      img.src = e.target.result
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function ProfileView({ onBack }) {
  const { data: profile, isLoading, error: loadError } = useGetMyProfileQuery()
  const [updateProfile, { isLoading: saving }] = useUpdateProfileMutation()

  const [username, setUsername] = useState('')
  const [bio, setBio] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [usernameError, setUsernameError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef(null)

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
    setSaveError('')
    const clean = username.trim().toLowerCase()
    if (clean && !USERNAME_RE.test(clean)) {
      setUsernameError('3–20 chars: letters, numbers, underscores only')
      return
    }
    try {
      await updateProfile({ username: clean, bio: bio.trim(), avatar_url: avatarUrl.trim() }).unwrap()
      onBack()
    } catch (err) {
      const message = err?.data?.message ?? `Failed to save (${err?.status ?? 'network error'}).`
      if (/username/i.test(message)) setUsernameError(message)
      else setSaveError(message)
    }
  }

  const processFile = useCallback(async (file) => {
    if (!file || !file.type.startsWith('image/')) {
      setUploadError('Please drop an image file.')
      return
    }
    setUploadError('')
    try {
      const dataUrl = await resizeImageToDataUrl(file, 200, 0.7)
      setAvatarUrl(dataUrl)
    } catch {
      setUploadError('Failed to process image.')
    }
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    processFile(file)
  }, [processFile])

  const handleDragOver = (e) => { e.preventDefault(); setDragOver(true) }
  const handleDragLeave = () => setDragOver(false)
  const handleFileInput = (e) => processFile(e.target.files[0])

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

          {/* Avatar drag-and-drop */}
          <div className="flex flex-col items-center gap-3">
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={`relative w-24 h-24 rounded-2xl overflow-hidden flex items-center justify-center cursor-pointer transition-all border-2 border-dashed ${
                dragOver
                  ? 'border-white/40 bg-white/10 scale-105'
                  : 'border-[#2a2a2a] bg-[#1f1f1f] hover:border-white/20 hover:bg-[#252525]'
              }`}
              title="Click or drag & drop an image"
            >
              {avatarUrl ? (
                <>
                  <img src={avatarUrl} alt="" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none' }} />
                  <div className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="17 8 12 3 7 8"/>
                      <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center gap-1 text-[#4b5563]">
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  <span className="text-[10px] text-center leading-tight">{dragOver ? 'Drop it' : 'Photo'}</span>
                </div>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileInput} />
            <div className="w-full">
              <label className="block text-xs uppercase tracking-widest text-[#6b7280] mb-2">Or paste an image URL</label>
              <input
                type="url"
                value={avatarUrl.startsWith('data:') ? '' : avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://example.com/photo.jpg"
                className="w-full bg-[#141414] border border-[#2a2a2a] text-white placeholder-[#6b7280] text-sm rounded-xl px-4 py-3 focus:outline-none focus:border-[#3b82f6] transition-colors"
              />
              {uploadError && <p className="text-red-400 text-xs mt-1.5">{uploadError}</p>}
              {!uploadError && <p className="text-[#4b5563] text-xs mt-1.5">Drag & drop or click the photo above, or paste a URL. Resized to 200×200.</p>}
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

          {(saveError || loadError) && (
            <p className="text-red-400 text-xs text-center">
              {saveError || `Couldn't load your profile (${loadError?.status ?? 'network error'}).`}
            </p>
          )}

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

function DeleteAccountModal({ onCancel, onConfirmed }) {
  const [step, setStep] = useState(1) // 1 = warning, 2 = final confirm
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  const handleFinalDelete = async () => {
    setDeleting(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${API_BASE}/user`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.message || 'Failed to delete account.')
      }
      await supabase.auth.signOut()
      onConfirmed()
    } catch (err) {
      setError(err.message)
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}>
      <div className="bg-[#141414] border border-[#2a2a2a] rounded-2xl p-6 w-full max-w-sm">
        {step === 1 ? (
          <>
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-500/10 mb-4 mx-auto">
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <h2 className="text-white font-bold text-lg text-center mb-2">Delete your account?</h2>
            <p className="text-[#6b7280] text-sm text-center mb-6 leading-relaxed">
              This will permanently delete your account, portfolio data, and all settings. This cannot be undone.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setStep(2)}
                className="w-full py-3 rounded-xl text-sm font-semibold bg-red-500 hover:bg-red-600 text-white transition-colors"
              >
                Yes, delete my account
              </button>
              <button
                onClick={onCancel}
                className="w-full py-3 rounded-xl text-sm font-medium text-[#a1a1aa] hover:text-white hover:bg-[#1f1f1f] transition-colors"
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-white font-bold text-lg text-center mb-2">Are you absolutely sure?</h2>
            <p className="text-[#6b7280] text-sm text-center mb-6 leading-relaxed">
              There is no way back. Your account will be gone forever.
            </p>
            {error && <p className="text-red-400 text-xs text-center mb-4">{error}</p>}
            <div className="flex flex-col gap-2">
              <button
                onClick={handleFinalDelete}
                disabled={deleting}
                className="w-full py-3 rounded-xl text-sm font-semibold bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white transition-colors"
              >
                {deleting ? 'Deleting…' : 'Delete permanently'}
              </button>
              <button
                onClick={onCancel}
                disabled={deleting}
                className="w-full py-3 rounded-xl text-sm font-medium text-[#a1a1aa] hover:text-white hover:bg-[#1f1f1f] disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function AccountView({ onBack }) {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const { user } = useAuth()
  const { data: profile } = useGetMyProfileQuery()
  const [signingOut, setSigningOut] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const recovery = useRecovery()

  const { name: displayName, handle } = getIdentity(user, profile)
  const provider = user?.app_metadata?.provider ?? 'email'

  const handleSignOut = async () => {
    setSigningOut(true)
    await supabase.auth.signOut()
    dispatch(resetPreferences())
    navigate('/', { replace: true })
  }

  const handleDeleted = () => {
    dispatch(resetPreferences())
    navigate('/', { replace: true })
  }

  return (
    <>
      {showDeleteModal && (
        <DeleteAccountModal
          onCancel={() => setShowDeleteModal(false)}
          onConfirmed={handleDeleted}
        />
      )}

      <BackButton onClick={() => {
        if (recovery.pending && !window.confirm('Your recovery phrase is shown only once. Leave without saving it?')) return
        onBack()
      }} />
      <h1 className="text-xl font-bold text-white mb-6">Account</h1>

      <div className="flex flex-col items-center mb-8">
        <UserAvatar user={user} size={72} src={profile?.avatar_url} />
        <p className="text-white font-semibold text-lg mt-3">{displayName}</p>
        {handle && <p className="text-[#6b7280] text-sm mt-0.5">{handle}</p>}
        <span className="mt-2 text-xs bg-[#1f1f1f] border border-[#2a2a2a] text-[#a1a1aa] px-2.5 py-0.5 rounded-full capitalize">
          {provider === 'google' ? 'Google account' : 'Email account'}
        </span>
      </div>

      <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl divide-y divide-[#2a2a2a] mb-6">
        <Row label="Name" value={displayName} />
        <Row label="Username" value={handle ?? 'Not set'} />
        <Row label="Sign-in method" value={provider === 'google' ? 'Google OAuth' : 'Magic link'} />
      </div>

      <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-5 mb-6">
        <p style={panelLabel} className="mb-1">Recovery phrase</p>
        <p className="text-[#6b7280] text-xs mb-4">Sign in from the login page with six words if you lose access to your email.</p>
        <RecoveryPanel r={recovery} compactIntro />
      </div>

      <button
        onClick={handleSignOut}
        disabled={signingOut}
        className="w-full flex items-center justify-center gap-2 bg-[#141414] hover:bg-red-500/10 border border-[#2a2a2a] hover:border-red-500/30 text-[#a1a1aa] hover:text-red-400 text-sm font-medium py-3.5 rounded-xl transition-colors mb-3"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        {signingOut ? 'Signing out…' : 'Sign out'}
      </button>

      <button
        onClick={() => setShowDeleteModal(true)}
        className="w-full flex items-center justify-center gap-2 bg-transparent hover:bg-red-500/5 border border-transparent hover:border-red-500/20 text-[#4b5563] hover:text-red-500 text-sm font-medium py-3 rounded-xl transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
          <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
        </svg>
        Delete account
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
    if (error) console.error('Watchlist persist error:', error.message)
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

function Toggle({ on, onChange, disabled, label }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 disabled:opacity-40 ${on ? 'bg-[#10b981]' : 'bg-[#2a2a2a]'}`}
    >
      <span
        className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform"
        style={{ transform: on ? 'translateX(20px)' : 'translateX(0)' }}
      />
    </button>
  )
}

const apiError = (err, fallback) => err?.data?.message ?? fallback

function SmsCard() {
  const { data: sms, isLoading } = useGetSmsStatusQuery()
  const [sendCode, { isLoading: sending }] = useSendSmsCodeMutation()
  const [verifyCode, { isLoading: verifying }] = useVerifySmsCodeMutation()
  const [updateSms, { isLoading: updating }] = useUpdateSmsMutation()
  const [sendTest, { isLoading: testing }] = useSendSmsTestMutation()
  const [removePhone, { isLoading: removing }] = useRemoveSmsPhoneMutation()

  const [step, setStep] = useState('phone') // 'phone' | 'code'
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const requestCode = async () => {
    setError(''); setNote('')
    try {
      await sendCode({ phone }).unwrap()
      setStep('code')
      setCode('')
      setCooldown(30)
    } catch (err) {
      setError(apiError(err, "Couldn't send a code. Try again."))
    }
  }

  const submitCode = async () => {
    setError(''); setNote('')
    try {
      await verifyCode({ phone, code }).unwrap()
      setStep('phone'); setPhone(''); setCode('')
    } catch (err) {
      setError(apiError(err, 'Could not verify that code.'))
    }
  }

  const handleToggle = async (priceAlerts) => {
    setError(''); setNote('')
    try { await updateSms({ priceAlerts }).unwrap() } catch (err) { setError(apiError(err, 'Could not save that.')) }
  }

  const handleTest = async () => {
    setError(''); setNote('')
    try { await sendTest().unwrap(); setNote('Test text sent — check your phone.') }
    catch (err) { setError(apiError(err, "Couldn't send a test text.")) }
  }

  const handleRemove = async () => {
    setError(''); setNote('')
    try { await removePhone().unwrap() } catch (err) { setError(apiError(err, 'Could not remove your number.')) }
  }

  const inputCls = 'w-full bg-[#0f0f0f] border border-[#2a2a2a] text-white placeholder-[#4b5563] text-sm rounded-xl px-4 py-3 focus:outline-none focus:border-[#10b981] transition-colors'
  const primaryCls = 'bg-[#10b981] hover:bg-[#059669] disabled:opacity-40 text-white text-sm font-semibold px-5 py-3 rounded-xl transition-colors'

  return (
    <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-5 mb-4">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-[#10b981]/10 flex items-center justify-center flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-semibold">SMS alerts</p>
          <p className="text-[#6b7280] text-xs mt-0.5">Get a text the moment one of your price alerts hits — even when the app is closed.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="h-10 rounded-xl bg-[#1f1f1f] animate-pulse" />
      ) : !sms?.configured ? (
        <p className="text-[#6b7280] text-xs bg-[#1f1f1f] rounded-lg px-3 py-2.5">Text alerts are launching soon.</p>
      ) : sms.verified ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-[#0f0f0f] border border-[#2a2a2a] rounded-xl px-4 py-3">
            <div>
              <p className="text-white text-sm font-medium tabular-nums">•••• •••• {sms.phoneLast4}</p>
              <p className="text-[#10b981] text-xs mt-0.5 flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                Verified
              </p>
            </div>
            <button onClick={handleRemove} disabled={removing} className="text-[#6b7280] hover:text-red-400 text-xs font-medium transition-colors">
              {removing ? 'Removing…' : 'Remove'}
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-white text-sm">Price alerts</p>
              <p className="text-[#6b7280] text-xs mt-0.5">Text me when a target price is reached</p>
            </div>
            <Toggle on={sms.priceAlerts} onChange={handleToggle} disabled={updating} label="Price alert texts" />
          </div>

          <button onClick={handleTest} disabled={testing} className="w-full border border-[#2a2a2a] hover:border-[#3a3a3a] text-[#a1a1aa] hover:text-white text-sm font-medium py-2.5 rounded-xl transition-colors disabled:opacity-40">
            {testing ? 'Sending…' : 'Send a test text'}
          </button>
        </div>
      ) : step === 'phone' ? (
        <form onSubmit={(e) => { e.preventDefault(); requestCode() }} className="space-y-3">
          <input
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => { setPhone(e.target.value); setError('') }}
            placeholder="+1 555 123 4567"
            className={inputCls}
          />
          <button type="submit" disabled={sending || phone.replace(/\D/g, '').length < 10} className={`${primaryCls} w-full`}>
            {sending ? 'Sending code…' : 'Text me a code'}
          </button>
          <p className="text-[#4b5563] text-[11px] leading-relaxed">
            Include your country code. Message and data rates may apply. Reply STOP to any text to opt out.
          </p>
        </form>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); submitCode() }} className="space-y-3">
          <p className="text-[#a1a1aa] text-xs">Enter the code we texted to {phone}.</p>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={8}
            value={code}
            onChange={(e) => { setCode(e.target.value.replace(/\D/g, '')); setError('') }}
            placeholder="123456"
            className={`${inputCls} text-center tracking-[0.4em] text-lg font-semibold`}
          />
          <button type="submit" disabled={verifying || code.length < 4} className={`${primaryCls} w-full`}>
            {verifying ? 'Verifying…' : 'Verify'}
          </button>
          <div className="flex items-center justify-between text-xs">
            <button type="button" onClick={() => { setStep('phone'); setError('') }} className="text-[#6b7280] hover:text-white transition-colors">
              Change number
            </button>
            <button type="button" onClick={requestCode} disabled={cooldown > 0 || sending} className="text-[#10b981] disabled:text-[#4b5563] transition-colors">
              {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
            </button>
          </div>
        </form>
      )}

      {error && <p className="text-red-400 text-xs mt-3">{error}</p>}
      {note && <p className="text-[#10b981] text-xs mt-3">{note}</p>}
    </div>
  )
}

function NotificationsView({ onBack }) {
  return (
    <>
      <BackButton onClick={onBack} />
      <h1 className="text-xl font-bold text-white mb-6">Notifications</h1>

      <SmsCard />

      <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl divide-y divide-[#2a2a2a]">
        {[
          { label: 'Push notifications', desc: 'Alerts on your device' },
          { label: 'Email digest', desc: 'Daily or weekly summary' },
        ].map(({ label, desc }) => (
          <div key={label} className="flex items-center justify-between px-4 py-4">
            <div>
              <p className="text-white text-sm font-medium">{label}</p>
              <p className="text-[#6b7280] text-xs mt-0.5">{desc}</p>
            </div>
            <span className="text-xs bg-[#1f1f1f] border border-[#2a2a2a] text-[#6b7280] px-2.5 py-1 rounded-full">Soon</span>
          </div>
        ))}
      </div>
    </>
  )
}

function FriendsView({ onBack }) {
  return (
    <>
      <BackButton onClick={onBack} />
      <h1 className="text-xl font-bold text-white mb-1">Friends</h1>
      <p className="text-[#6b7280] text-sm mb-6">Find anyone on Travauxus by their @username.</p>
      <FriendsPanel />
    </>
  )
}

function InviteView({ onBack }) {
  return (
    <>
      <BackButton onClick={onBack} />
      <h1 className="text-xl font-bold text-white mb-1">Invite &amp; Pro</h1>
      <p className="text-[#6b7280] text-sm mb-6">Share your code — you both get free Pro when they join.</p>
      <ReferralPanel />
    </>
  )
}

export default function Settings() {
  const [view, setView] = useState(null)
  const { user } = useAuth()
  const { data: profile } = useGetMyProfileQuery()
  const preferences = useSelector((state) => state.preferences)

  const { name: displayName, handle } = getIdentity(user, profile)
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
  if (view === 'friends') return (
    <main className="flex-1 p-5 md:p-8 max-w-lg mx-auto w-full">
      <FriendsView onBack={() => setView(null)} />
    </main>
  )
  if (view === 'invite') return (
    <main className="flex-1 p-5 md:p-8 max-w-lg mx-auto w-full">
      <InviteView onBack={() => setView(null)} />
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
        <UserAvatar user={user} size={64} src={profile?.avatar_url} />
        <p className="text-white font-bold text-lg mt-3">{displayName}</p>
        {handle && <p className="text-[#6b7280] text-sm mt-0.5">{handle}</p>}
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
          subtitle={handle ?? 'Manage your account'}
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
          onClick={() => setView('friends')}
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          }
          title="Friends"
          subtitle="Search by @username and add friends"
        />
        <Card
          onClick={() => setView('invite')}
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d6b87a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
            </svg>
          }
          title="Invite & Pro"
          subtitle="Your referral code — free Pro for you both"
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
          subtitle="Text alerts for your price targets"
        />
      </div>

      <p className="text-[#4b5563] text-xs text-center mt-10">
        Not financial advice. For educational use only.
      </p>
    </main>
  )
}
