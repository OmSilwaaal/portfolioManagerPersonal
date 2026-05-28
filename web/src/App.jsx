import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import PriceAlertBanner from './components/PriceAlertBanner'
import WatchlistPersistence from './components/WatchlistPersistence'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { setPreferences, setIsPro } from './store/preferencesSlice'
import Sidebar from './components/Sidebar'
import BottomNav from './components/BottomNav'
import Dashboard from './pages/Dashboard'
import Stocks from './pages/Stocks'
import Crypto from './pages/Crypto'
import CopyTrading from './pages/CopyTrading'
import Alerts from './pages/Alerts'
import Onboarding from './pages/Onboarding'
import Feed from './pages/Feed'
import GovTrades from './pages/GovTrades'
import Commodities from './pages/Commodities'
import Settings from './pages/Settings'
import PaperTrading from './pages/PaperTrading'
import Groups from './pages/Groups'
import GroupDetail from './pages/GroupDetail'
import CreateGroup from './pages/CreateGroup'
import Profile from './pages/Profile'
import Landing from './pages/Landing'
import Pricing from './pages/Pricing'

// Import API modules to register endpoints
import './api/stocksApi'
import './api/cryptoApi'
import './api/feedApi'
import './api/alertsApi'
import './api/searchApi'
import './api/notificationsApi'
import './api/explainerApi'

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
      <div className="flex-1 md:ml-[200px] flex flex-col min-h-screen pb-16 md:pb-0">
        <Outlet />
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
        <Outlet />
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
        isPro: user.app_metadata?.isPro ?? false,
      }))
    }
  }, [user, dispatch])

  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<Landing />} />
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/app" element={<Navigate to="/feed" replace />} />

      {/* Protected — with sidebar */}
      <Route element={<ProtectedLayout />}>
        <Route path="/feed" element={<Feed />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/stocks" element={<Stocks />} />
        <Route path="/crypto" element={<Crypto />} />
        <Route path="/copy-trading" element={<CopyTrading />} />
        <Route path="/alerts" element={<Alerts />} />
        <Route path="/paper-trading" element={<PaperTrading />} />
        <Route path="/groups" element={<Groups />} />
        <Route path="/groups/new" element={<CreateGroup />} />
        <Route path="/groups/:id" element={<GroupDetail />} />
        <Route path="/profile/:userId" element={<Profile />} />
        <Route path="/gov-trades" element={<GovTrades />} />
        <Route path="/commodities" element={<Commodities />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/pricing" element={<Pricing />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppInner />
      </AuthProvider>
    </BrowserRouter>
  )
}
