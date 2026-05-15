export default function PaywallBlur({ isLocked, tier = 'pro', reason, children }) {
  if (!isLocked) return <>{children}</>

  const label = tier === 'premium' ? 'Premium' : 'Pro'

  return (
    <div className="relative">
      <div className="pointer-events-none" style={{ filter: 'blur(6px)', userSelect: 'none' }}>
        {children}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0f0f0f]/60 rounded-lg">
        <div className="text-center px-4">
          <p className="text-white font-semibold text-sm mb-1">{label} feature</p>
          {reason && <p className="text-gray-400 text-xs mb-3">{reason}</p>}
          <button className="bg-[#3b82f6] text-white text-xs font-medium px-4 py-2 rounded-lg hover:bg-[#2563eb] transition-colors">
            Upgrade to {label}
          </button>
        </div>
      </div>
    </div>
  )
}
