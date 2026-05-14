import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useSelector } from 'react-redux'
import Sidebar from './components/Sidebar'
import BottomNav from './components/BottomNav'
import Dashboard from './pages/Dashboard'
import Stocks from './pages/Stocks'
import Crypto from './pages/Crypto'
import CopyTrading from './pages/CopyTrading'
import Alerts from './pages/Alerts'

// Import API modules to register endpoints
import './api/stocksApi'
import './api/cryptoApi'
import './api/feedApi'
import './api/alertsApi'

function AppInner() {
  const isDark = useSelector((state) => state.theme.isDark)

  useEffect(() => {
    const html = document.documentElement
    if (isDark) {
      html.classList.add('dark')
    } else {
      html.classList.remove('dark')
    }
  }, [isDark])

  return (
    <div className={`flex min-h-screen ${isDark ? 'bg-[#0f0f0f] text-white' : 'bg-white text-[#0f0f0f]'}`}>
      <Sidebar />
      <div className="flex-1 flex flex-col min-h-screen pb-16 md:pb-0">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/stocks" element={<Stocks />} />
          <Route path="/crypto" element={<Crypto />} />
          <Route path="/copy-trading" element={<CopyTrading />} />
          <Route path="/alerts" element={<Alerts />} />
        </Routes>
      </div>
      <BottomNav />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppInner />
    </BrowserRouter>
  )
}
