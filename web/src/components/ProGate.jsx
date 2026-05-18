import { useSelector } from 'react-redux'
import { Link } from 'react-router-dom'

export default function ProGate({ children, label = 'Pro feature', compact = false }) {
  const isPro = useSelector((state) => state.preferences.isPro)
  if (isPro) return <>{children}</>

  return (
    <div className="relative rounded-xl overflow-hidden">
      <div className="blur-sm pointer-events-none select-none opacity-30 rounded-xl">
        {children}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl"
        style={{ background: 'linear-gradient(to top, rgba(10,10,10,0.97) 40%, rgba(10,10,10,0.6) 100%)' }}
      >
        <div className={`flex flex-col items-center gap-3 text-center ${compact ? 'p-4' : 'p-6'}`}>
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          {!compact && (
            <div>
              <p className="text-white font-semibold text-sm">{label}</p>
              <p className="text-white/35 text-xs mt-0.5">Available on MarketIQ Pro</p>
            </div>
          )}
          <Link
            to="/pricing"
            className="bg-white hover:bg-gray-100 text-[#0a0a0a] text-xs font-bold px-5 py-2 rounded-full transition-colors"
          >
            Upgrade to Pro
          </Link>
        </div>
      </div>
    </div>
  )
}
