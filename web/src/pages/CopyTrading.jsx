import CopyTradeCard from '../components/CopyTradeCard'
import FreemiumGate from '../components/FreemiumGate'

const STUB_TRADES = [
  {
    ticker: 'NVDA',
    direction: 'BUY',
    confidence: 84,
    reasoning:
      'NVIDIA continues to dominate the AI chip market. Strong demand from data centers and recent partnership announcements suggest continued growth.',
    entryPrice: 875.0,
    targetPrice: 960.0,
    stopLoss: 840.0,
  },
  {
    ticker: 'AAPL',
    direction: 'BUY',
    confidence: 71,
    reasoning:
      'Apple services revenue growth remains strong. The upcoming product cycle and expanding AI features could drive new upgrade cycles.',
    entryPrice: 185.5,
    targetPrice: 205.0,
    stopLoss: 178.0,
  },
  {
    ticker: 'META',
    direction: 'SELL',
    confidence: 58,
    reasoning:
      'Valuation concerns after strong run-up. Advertising market headwinds and rising capex for AI infrastructure may pressure margins short-term.',
    entryPrice: 520.0,
    targetPrice: 475.0,
    stopLoss: 540.0,
  },
]

export default function CopyTrading() {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <header className="flex items-center justify-between px-6 py-4 border-b border-[#1f1f1f] dark:border-[#1f1f1f] border-[#e5e7eb]">
        <div>
          <h1 className="text-xl font-semibold text-white dark:text-white text-[#0f0f0f]">Copy Trading</h1>
          <p className="text-sm text-[#a1a1aa]">AI-generated trade signals</p>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-screen-xl mx-auto space-y-6">
          {/* Disclaimer banner */}
          <div className="flex items-start gap-3 p-4 bg-yellow-400/10 border border-yellow-400/30 rounded-md">
            <span className="text-yellow-400 flex-shrink-0 text-base">⚠</span>
            <p className="text-sm text-yellow-400">
              <strong>Important Disclaimer:</strong> This is for educational purposes only and is
              not financial advice. Past performance does not guarantee future results. Never invest
              more than you can afford to lose.
            </p>
          </div>

          {/* Trade signals */}
          <div>
            <h2 className="text-base font-semibold text-white dark:text-white text-[#0f0f0f] mb-4">
              AI Trade Signals
              <span className="ml-2 text-xs font-normal text-[#a1a1aa]">(Simulated data)</span>
            </h2>

            <div className="space-y-4">
              {STUB_TRADES.map((trade, index) => (
                <FreemiumGate key={trade.ticker} isLocked={index >= 2}>
                  <CopyTradeCard trade={trade} />
                </FreemiumGate>
              ))}
            </div>
          </div>

          {/* How it works */}
          <div className="p-4 bg-surface dark:bg-surface bg-[#f9f9f9] border border-border-subtle dark:border-border-subtle border-[#e5e7eb] rounded-md">
            <h3 className="text-sm font-semibold text-white dark:text-white text-[#0f0f0f] mb-3">
              How This Works
            </h3>
            <div className="space-y-2 text-sm text-[#a1a1aa]">
              <p>1. Our AI analyzes news, earnings, and market data to generate trade ideas.</p>
              <p>2. Each signal includes a confidence score, entry price, target, and stop loss.</p>
              <p>3. You decide whether to act — we never execute trades on your behalf.</p>
            </div>
          </div>

          <p className="text-xs text-[#6b7280] text-center">
            For educational purposes only. Not financial advice. Trading involves significant risk.
          </p>
        </div>
      </main>
    </div>
  )
}
