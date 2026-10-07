import { useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import PriceAlertBanner from './components/PriceAlertBanner'
import WatchlistPersistence from './components/WatchlistPersistence'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { setPreferences, setIsPro } from './store/preferencesSlice'
import Sidebar from './components/Sidebar'
import BottomNav from './components/BottomNav'
import Landing from './pages/Landing'

// Route-level code splitting: the router only ever renders one page, so shipping
// all of them (plus their chart/wallet deps) in the entry chunk just delays first
// paint for everyone.
const Dashboard = lazy(() => import('./pages/Dashboard'))
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
const Pricing = lazy(() => import('./pages/Pricing'))
const Portfolio = lazy(() => import('./pages/Portfolio'))
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'))
const Terms = lazy(() => import('./pages/Terms'))
const Disclaimer = lazy(() => import('./pages/Disclaimer'))
const TradingTerminal = lazy(() => import('./pages/TradingTerminal'))
// The wallet SDK is big and only the terminal uses it, so it loads with that route
// rather than on every visit to the landing page.
const PrivyProviderWrapper = lazy(() => import('./providers/PrivyProviderWrapper'))
const ResearchDashboard = lazy(() => import('./pages/ResearchDashboard'))

import { CelebrationProvider } from './components/ProfitCelebration'

// Import API modules to register endpoints
import './api/stocksApi'
import './api/cryptoApi'
import './api/feedApi'
import './api/alertsApi'
import './api/searchApi'
import './api/notificationsApi'
import './api/explainerApi'
import './api/snaptradeApi'

function Spinner() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-[#3b82f6] border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function ProtectedLayout() {
  const { user, loading } = useAuth()
  const isDark = useSelector((state) => state.theme.isDark)
  const onboardingComplete = useSelector((state) => state.preferences.onboardingComplete)
  const watchlistTickers = useSelector((state) => state.watchlist.stocks).join(',')

  if (loading) return <Spinner />
  if (!user) return <Navigate to="/" replace />
  if (!onboardingComplete) return <Navigate to="/onboarding" replace />

  return (
    <div className={`flex min-h-screen ${isDark ? 'bg-[#0f0f0f] text-white' : 'bg-white text-[#0f0f0f]'}`}>
      <WatchlistPersistence />
      <PriceAlertBanner tickers={watchlistTickers} />
      <Sidebar />
      <div className="flex-1 min-w-0 md:ml-[200px] flex flex-col min-h-screen pb-16 md:pb-0">
        <Suspense fallback={<Spinner />}><Outlet /></Suspense>
      </div>
      <BottomNav />
    </div>
  )
}

function ProtectedLayoutMinimal() {
  const { user, loading } = useAuth()
  const isDark = useSelector((state) => state.theme.isDark)
  const onboardingComplete = useSelector((state) => state.preferences.onboardingComplete)

  if (loading) return <Spinner />
  if (!user) return <Navigate to="/" replace />
  if (!onboardingComplete) return <Navigate to="/onboarding" replace />

  return (
    <div className={`flex min-h-screen ${isDark ? 'bg-[#0f0f0f] text-white' : 'bg-white text-[#0f0f0f]'}`}>
      <div className="flex-1 flex flex-col min-h-screen">
        <Suspense fallback={<Spinner />}><Outlet /></Suspense>
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
  }, [isDark])

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
    <Suspense fallback={<Spinner />}>
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
        <Route
          path="/terminal"
          element={<PrivyProviderWrapper><TradingTerminal /></PrivyProviderWrapper>}
        />
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
