export default function CopyTradeCard({ trade }) {
  const {
    ticker = 'AAPL',
    direction = 'BUY',
    confidence = 72,
    reasoning = 'Strong earnings momentum and positive analyst revisions suggest continued upside.',
    entryPrice = 185.50,
    targetPrice = 205.00,
    stopLoss = 178.00,
  } = trade || {}

  const confidenceColor =
    confidence >= 75 ? 'bg-green-500' : confidence >= 50 ? 'bg-yellow-400' : 'bg-red-500'

  return (
    <div className="p-4 bg-surface dark:bg-surface bg-[#f9f9f9] border border-border-subtle dark:border-border-subtle border-[#e5e7eb] rounded-md shadow-[0_1px_3px_rgba(0,0,0,0.3)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-white dark:text-white text-[#0f0f0f] font-semibold text-lg">
            {ticker}
          </span>
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded ${
              direction === 'BUY'
                ? 'text-green-400 bg-green-400/10'
                : 'text-red-500 bg-red-500/10'
            }`}
          >
            {direction}
          </span>
        </div>
        <span className="text-xs text-[#a1a1aa] pro-badge">
          <span className="text-[#3b82f6] font-medium">PRO</span>
        </span>
      </div>

      {/* Confidence meter */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-[#a1a1aa]">Confidence</span>
          <span className="text-xs font-medium text-white dark:text-white text-[#0f0f0f]">
            {confidence}%
          </span>
        </div>
        <div className="h-1.5 bg-[#1f1f1f] rounded-full overflow-hidden">
          <div
            className={`h-full ${confidenceColor} rounded-full transition-all`}
            style={{ width: `${confidence}%` }}
          />
        </div>
      </div>

      {/* Price targets */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div>
          <p className="text-xs text-[#a1a1aa] mb-0.5">Entry</p>
          <p className="text-sm font-medium text-white dark:text-white text-[#0f0f0f]">
            ${entryPrice.toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-xs text-[#a1a1aa] mb-0.5">Target</p>
          <p className="text-sm font-medium text-green-400">${targetPrice.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs text-[#a1a1aa] mb-0.5">Stop Loss</p>
          <p className="text-sm font-medium text-red-500">${stopLoss.toFixed(2)}</p>
        </div>
      </div>

      {/* Reasoning */}
      <p className="text-sm text-[#a1a1aa] leading-relaxed mb-3">{reasoning}</p>

      {/* Disclaimer */}
      <p className="text-xs text-[#6b7280] border-t border-[#1f1f1f] dark:border-[#1f1f1f] border-[#e5e7eb] pt-2">
        For educational purposes only. Not financial advice.
      </p>
    </div>
  )
}
