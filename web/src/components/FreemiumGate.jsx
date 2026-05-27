import { Link } from 'react-router-dom'

export default function FreemiumGate({ isLocked, children }) {
  if (!isLocked) {
    return <>{children}</>
  }

  return (
    <div className="relative">
      <div style={{ filter: 'blur(4px)', pointerEvents: 'none', userSelect: 'none' }}>
        {children}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0f0f0f]/60 dark:bg-[#0f0f0f]/60">
        <p className="text-[#a1a1aa] text-sm mb-3">Pro feature</p>
        <Link
          to="/pricing"
          className="px-4 py-2 bg-[#f59e0b] text-[#0a0a0a] text-sm font-bold rounded-md hover:bg-[#d97706] transition-colors"
        >
          Upgrade to Pro
        </Link>
      </div>
    </div>
  )
}
