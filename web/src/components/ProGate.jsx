import { useSelector } from 'react-redux'
import { Link } from 'react-router-dom'

export default function ProGate({ children, label = 'Pro feature', compact = false }) {
  const isPro = useSelector((state) => state.preferences.isPro)
  if (isPro) return <>{children}</>

  return (
    <div className="relative rounded-xl overflow-hidden">
      <div className="blur-sm pointer-events-none select-none opacity-40 rounded-xl">
        {children}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/80 to-transparent rounded-xl">
        <div className={`flex flex-col items-center gap-3 text-center ${compact ? 'p-4' : 'p-6'}`}>
          <div className="w-10 h-10 rounded-full bg-[#f59e0b]/10 border border-[#f59e0b]/20 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 4l3 12h14l3-12-6 5-4-5-4 5-6-5z"/>
              <path d="M5 20h14"/>
            </svg>
          </div>
          {!compact && (
            <div>
              <p className="text-white font-semibold text-sm">{label}</p>
              <p className="text-[#6b7280] text-xs mt-0.5">Available on MarketIQ Pro</p>
            </div>
          )}
          <Link
            to="/pricing"
            className="bg-[#f59e0b] hover:bg-[#d97706] text-[#0a0a0a] text-xs font-bold px-4 py-2 rounded-full transition-colors shadow-lg"
          >
            Upgrade to Pro
          </Link>
        </div>
      </div>
    </div>
  )
}
