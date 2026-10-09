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
import GuidedTour from './components/GuidedTour'
import DataLossNotice from './components/DataLossNotice'
import RouteProgress from './components/RouteProgress'
import { registerRoute, warmRoutesWhenIdle } from './routePrefetch'

// Import API modules to register endpoints
import './api/stocksApi'
import './api/cryptoApi'
import './api/feedApi'
import './api/alertsApi'
import './api/searchApi'
import './api/notificationsApi'
import './api/explainerApi'
import './api/snaptradeApi'

// Route-level code splitting: pages load on demand, and routePrefetch warms them before the click
const lazyRoute = (path, importer) => lazy(registerRoute(path, importer))

const Stocks = lazyRoute('/stocks', () => import('./pages/Stocks'))
const Crypto = lazyRoute('/crypto', () => import('./pages/Crypto'))
const CopyTrading = lazyRoute('/copy-trading', () => import('./pages/CopyTrading'))
const Alerts = lazyRoute('/alerts', () => import('./pages/Alerts'))
const Onboarding = lazyRoute('/onboarding', () => import('./pages/Onboarding'))
const Welcome = lazyRoute('/welcome', () => import('./pages/Welcome'))
const Feed = lazyRoute('/feed', () => import('./pages/Feed'))
const GovTrades = lazyRoute('/gov-trades', () => import('./pages/GovTrades'))
const Commodities = lazyRoute('/commodities', () => import('./pages/Commodities'))
const Settings = lazyRoute('/settings', () => import('./pages/Settings'))
const PaperTrading = lazyRoute('/paper-trading', () => import('./pages/PaperTrading'))
const Clans = lazyRoute('/clans', () => import('./pages/Clans'))
const ClanDetail = lazyRoute('/clans/:id', () => import('./pages/ClanDetail'))
const Elos = lazyRoute('/elos', () => import('./pages/Elos'))
const Profile = lazyRoute('/profile/:userId', () => import('./pages/Profile'))
const Friends = lazyRoute('/friends', () => import('./pages/Friends'))
const Leaderboard = lazyRoute('/leaderboard', () => import('./pages/Leaderboard'))
const Landing = lazyRoute('/', () => import('./pages/Landing'))
const Pricing = lazyRoute('/pricing', () => import('./pages/Pricing'))
const Portfolio = lazyRoute('/portfolio', () => import('./pages/Portfolio'))
const PrivacyPolicy = lazyRoute('/privacy', () => import('./pages/PrivacyPolicy'))
const Terms = lazyRoute('/terms', () => import('./pages/Terms'))
const Disclaimer = lazyRoute('/disclaimer', () => import('./pages/Disclaimer'))
const ResearchDashboard = lazyRoute('/research', () => import('./pages/ResearchDashboard'))
// Privy (and its wallet stack) is only needed by the terminal, so it loads with that route
const TradingTerminal = lazyRoute('/terminal', async () => {
  const [{ default: Page }, { default: PrivyProviderWrapper }] = await Promise.all([
    import('./pages/TradingTerminal'),
    import('./providers/PrivyProviderWrapper'),
  ])
  return { default: () => <PrivyProviderWrapper><Page /></PrivyProviderWrapper> }
})

// Second paths onto pages already registered above, so their links prefetch too
registerRoute('/u/:username', () => import('./pages/Profile'))
registerRoute('/friends/:userId', () => import('./pages/Friends'))

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

  // Once the signed-in shell is up, spend idle time pulling down the pages reachable from it
  const inShell = Boolean(user) && onboardingComplete
  useEffect(() => { if (inShell) warmRoutesWhenIdle() }, [inShell])

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
      <GuidedTour />
      <DataLossNotice />
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
    <>
    <RouteProgress />
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
        <Route path="/clans" element={<Clans />} />
        <Route path="/clans/:id" element={<ClanDetail />} />
        <Route path="/elos" element={<Elos />} />
        <Route path="/groups/*" element={<Navigate to="/clans" replace />} />
        <Route path="/profile/:userId" element={<Profile />} />
        <Route path="/u/:username" element={<Profile />} />
        <Route path="/friends" element={<Friends />} />
        <Route path="/friends/:userId" element={<Friends />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/winners" element={<Navigate to="/leaderboard" replace />} />
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
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true }}>
      <AuthProvider>
        <CelebrationProvider>
          <AppInner />
        </CelebrationProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
