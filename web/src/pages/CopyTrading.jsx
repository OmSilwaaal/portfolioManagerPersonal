import { Link } from 'react-router-dom'

export default function CopyTrading() {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <header className="flex items-center justify-between px-6 py-4 border-b border-[#1f1f1f]">
        <div>
          <h1 className="text-xl font-semibold text-white">Copy Trading</h1>
          <p className="text-sm text-[#a1a1aa]">AI-generated trade signals</p>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6 flex items-center justify-center">
        <div className="max-w-md w-full text-center">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6"
            style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
              <polyline points="16 7 22 7 22 13"/>
            </svg>
          </div>

          <h2 className="text-2xl font-bold text-white mb-3 tracking-tight">Coming Soon</h2>
          <p className="text-[#a1a1aa] text-sm leading-relaxed mb-8">
            AI-powered trade signals are in development. We're training our models on real market data to surface high-conviction ideas with entry prices, targets, and stop losses.
          </p>

          <div className="rounded-xl p-5 mb-8 text-left space-y-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <p className="text-xs text-[#6b7280] uppercase tracking-widest font-semibold mb-3">What's coming</p>
            {[
              'AI-scored trade signals updated daily',
              'Entry price, target, and stop loss for every signal',
              'Confidence scoring based on news + technicals',
              'One-click copy to Paper Trading',
            ].map((item) => (
              <div key={item} className="flex items-start gap-2.5">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 flex-shrink-0">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                <span className="text-sm text-[#a1a1aa]">{item}</span>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-[#4b5563]">
            For educational purposes only. Not financial advice.
          </p>
        </div>
      </main>
    </div>
  )
}
