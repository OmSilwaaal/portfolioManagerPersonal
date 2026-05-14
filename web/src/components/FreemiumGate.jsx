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
        <a
          href="#affiliate-placeholder"
          className="px-4 py-2 bg-[#3b82f6] text-white text-sm font-medium rounded-md hover:bg-blue-500 transition-colors"
        >
          Upgrade to Pro
        </a>
      </div>
    </div>
  )
}
