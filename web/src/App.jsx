import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import PriceAlertBanner from './components/PriceAlertBanner'
import WatchlistPersistence from './components/WatchlistPersistence'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { setPreferences, setIsPro } from './store/preferencesSlice'
import { syncSystemTheme } from './store/themeSlice'
import { hydrateCosmetics } from './store/cosmeticsSlice'
import Sidebar from './components/Sidebar'
import BottomNav from './components/BottomNav'
import { CelebrationProvider } from './components/ProfitCelebration'
import PageFallback from './components/PageFallback'

// Import API modules to register endpoints
import './api/stocksApi'
import './api/cryptoApi'
import './api/feedApi'
import './api/alertsApi'
import './api/searchApi'
import './api/notificationsApi'
import './api/explainerApi'
import './api/snaptradeApi'

// Route-level code splitting: pages load on demand
const Stocks = lazy(() => import('./pages/Stocks'))
const Crypto = lazy(() => import('./pages/Crypto'))
const CopyTrading = lazy(() => import('./pages/CopyTrading'))
const Alerts = lazy(() => import('./pages/Alerts'))
const Onboarding = lazy(() => import('./pages/Onboarding'))
const Welcome = lazy(() => import('./pages/Welcome'))
const Feed = lazy(() => import('./pages/Feed'))
const GovTrades = lazy(() => import('./pages/GovTrades'))
const Commodities = lazy(() => import('./pages/Commodities'))
const Settings = lazy(() => import('./pages/Settings'))
const PaperTrading = lazy(() => import('./pages/PaperTrading'))
const Groups = lazy(() => import('./pages/Groups'))
const GroupDetail = lazy(() => import('./pages/GroupDetail'))
const CreateGroup = lazy(() => import('./pages/CreateGroup'))
const Profile = lazy(() => import('./pages/Profile'))
const Landing = lazy(() => import('./pages/Landing'))
const Pricing = lazy(() => import('./pages/Pricing'))
const Portfolio = lazy(() => import('./pages/Portfolio'))
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'))
const Terms = lazy(() => import('./pages/Terms'))
const Disclaimer = lazy(() => import('./pages/Disclaimer'))
const ResearchDashboard = lazy(() => import('./pages/ResearchDashboard'))
// Privy (and its wallet stack) is only needed by the terminal, so it loads with that route
const TradingTerminal = lazy(async () => {
  const [{ default: Page }, { default: PrivyProviderWrapper }] = await Promise.all([
    import('./pages/TradingTerminal'),
    import('./providers/PrivyProviderWrapper'),
  ])
  return { default: () => <PrivyProviderWrapper><Page /></PrivyProviderWrapper> }
})

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--ink-900)' }}>
      <div className="w-8 h-8 border-2 border-[#3b82f6] border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function ProtectedLayout() {
  const { user, loading } = useAuth()
  const onboardingComplete = useSelector((state) => state.preferences.onboardingComplete)
  const watchlistTickers = useSelector((state) => state.watchlist.stocks).join(',')

  if (loading) return <Spinner />
  if (!user) return <Navigate to="/" replace />
  // Preferences hydrate from user metadata in an effect; wait for it so a hard reload on a deep link is not bounced to /onboarding
  if (!onboardingComplete && user.user_metadata?.onboardingComplete) return <Spinner />
  if (!onboardingComplete) return <Navigate to="/onboarding" replace />

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--ink-900)', color: 'var(--paper)' }}>
      <WatchlistPersistence />
      <PriceAlertBanner tickers={watchlistTickers} />
      <Sidebar />
      <div className="flex-1 min-w-0 md:ml-[200px] flex flex-col min-h-screen pb-16 md:pb-0">
        <Suspense fallback={<PageFallback />}>
          <Outlet />
        </Suspense>
      </div>
      <BottomNav />
    </div>
  )
}

function ProtectedLayoutMinimal() {
  const { user, loading } = useAuth()
  const onboardingComplete = useSelector((state) => state.preferences.onboardingComplete)

  if (loading) return <Spinner />
  if (!user) return <Navigate to="/" replace />
  // Preferences hydrate from user metadata in an effect; wait for it so a hard reload on a deep link is not bounced to /onboarding
  if (!onboardingComplete && user.user_metadata?.onboardingComplete) return <Spinner />
  if (!onboardingComplete) return <Navigate to="/onboarding" replace />

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--ink-900)', color: 'var(--paper)' }}>
      <div className="flex-1 flex flex-col min-h-screen">
        <Suspense fallback={<PageFallback />}>
          <Outlet />
        </Suspense>
      </div>
    </div>
  )
}

function AppInner() {
  const isDark = useSelector((state) => state.theme.isDark)
  const { user } = useAuth()
  const dispatch = useDispatch()

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', isDark ? '#0b0b0b' : '#efeee9')
  }, [isDark])

  // follow the OS when the theme mode is "system"
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => dispatch(syncSystemTheme())
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [dispatch])

  // Remember an invite code from a shared link (?ref=CODE) so it survives the sign-up round trip
  useEffect(() => {
    try {
      const ref = new URLSearchParams(window.location.search).get('ref')
      if (ref && /^[A-Za-z0-9-]{6,12}$/.test(ref)) localStorage.setItem('travauxus_ref', ref.toUpperCase())
    } catch { /* storage unavailable */ }
  }, [])

  // Hydrate preferences from Supabase metadata on every login
  useEffect(() => {
    if (!user) return
    const meta = user.user_metadata ?? {}
    if (meta.cosmetics) dispatch(hydrateCosmetics(meta.cosmetics))
    if (meta.onboardingComplete) {
      dispatch(setPreferences({
        displayName: meta.display_name ?? null,
        investorType: meta.investorType ?? null,
        riskTolerance: meta.riskTolerance ?? null,
        updateFrequency: meta.updateFrequency ?? null,
        watchedCategories: meta.watchedCategories ?? [],
        priorityAlerts: meta.priorityAlerts ?? [],
        watchlist: meta.watchlist ?? [],
        onboardingComplete: true,
        // Pro = paid subscription, or an unexpired referral reward
        isPro: Boolean(user.app_metadata?.isPro) || Date.parse(user.app_metadata?.referralProUntil ?? '') > Date.now(),
      }))
    }
  }, [user, dispatch])

  return (
    <Suspense fallback={<PageFallback fullScreen />}>
    <Routes>
      {/* Public */}
      <Route path="/" element={<Landing />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/disclaimer" element={<Disclaimer />} />
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/app" element={<Navigate to="/feed" replace />} />
      <Route path="/dashboard" element={<Navigate to="/feed" replace />} />

      {/* Protected — no sidebar */}
      <Route element={<ProtectedLayoutMinimal />}>
        <Route path="/welcome" element={<Welcome />} />
      </Route>

      {/* Protected — with sidebar */}
      <Route element={<ProtectedLayout />}>
        <Route path="/feed" element={<Feed />} />
        <Route path="/stocks" element={<Stocks />} />
        <Route path="/crypto" element={<Crypto />} />
        <Route path="/copy-trading" element={<CopyTrading />} />
        <Route path="/alerts" element={<Alerts />} />
        <Route path="/paper-trading" element={<PaperTrading />} />
        <Route path="/groups" element={<Groups />} />
        <Route path="/groups/new" element={<CreateGroup />} />
        <Route path="/groups/:id" element={<GroupDetail />} />
        <Route path="/profile/:userId" element={<Profile />} />
        <Route path="/portfolio" element={<Portfolio />} />
        <Route path="/gov-trades" element={<GovTrades />} />
        <Route path="/commodities" element={<Commodities />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/terminal" element={<TradingTerminal />} />
        <Route path="/research" element={<ResearchDashboard />} />
      </Route>
    </Routes>
    </Suspense>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CelebrationProvider>
          <AppInner />
        </CelebrationProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
