import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { AuthProvider, useAuth } from './contexts/AuthContext'
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
import Landing from './pages/Landing'

// Import API modules to register endpoints
import './api/stocksApi'
import './api/cryptoApi'
import './api/feedApi'
import './api/alertsApi'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-[#3b82f6] border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (!user) return <Navigate to="/" replace />
  return children
}

function AppInner() {
  const isDark = useSelector((state) => state.theme.isDark)
  const onboardingComplete = useSelector((state) => state.preferences.onboardingComplete)

  useEffect(() => {
    const html = document.documentElement
    if (isDark) {
      html.classList.add('dark')
    } else {
      html.classList.remove('dark')
    }
  }, [isDark])

  return (
    <Routes>
      {/* Public marketing page */}
      <Route path="/" element={<Landing />} />

      {/* Onboarding — no Sidebar or BottomNav, auth handled inside */}
      <Route path="/onboarding" element={<Onboarding />} />

      {/* /app redirect: after magic link lands, send to right place */}
      <Route
        path="/app"
        element={
          <ProtectedRoute>
            {onboardingComplete ? <Navigate to="/feed" replace /> : <Navigate to="/onboarding" replace />}
          </ProtectedRoute>
        }
      />

      {/* Protected app layout */}
      <Route
        path="*"
        element={
          <ProtectedRoute>
            <div className={`flex min-h-screen ${isDark ? 'bg-[#0f0f0f] text-white' : 'bg-white text-[#0f0f0f]'}`}>
              <Sidebar />
              <div className="flex-1 flex flex-col min-h-screen pb-16 md:pb-0">
                <Routes>
                  <Route path="/feed" element={<Feed />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/stocks" element={<Stocks />} />
                  <Route path="/crypto" element={<Crypto />} />
                  <Route path="/copy-trading" element={<CopyTrading />} />
                  <Route path="/alerts" element={<Alerts />} />
                  <Route path="/gov-trades" element={<GovTrades />} />
                  <Route path="/commodities" element={<Commodities />} />
                  <Route path="/settings" element={<Settings />} />
                </Routes>
              </div>
              <BottomNav />
            </div>
          </ProtectedRoute>
        }
      />
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
