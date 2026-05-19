import { useState } from 'react'

// Primary: FMP public logo CDN (no API key needed for images)
// Fallback: ticker initials with colored background
const FMP_BASE = 'https://financialmodelingprep.com/image-stock'

// Hashed color from ticker string so each fallback is consistently colored
function tickerColor(ticker) {
  const PALETTE = [
    '#3b82f6','#8b5cf6','#ec4899','#f59e0b','#10b981',
    '#06b6d4','#f97316','#6366f1','#14b8a6','#a855f7',
  ]
  let h = 0
  for (let i = 0; i < ticker.length; i++) h = (h * 31 + ticker.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}

export default function StockLogo({ ticker, size = 36, className = '' }) {
  const [errored, setErrored] = useState(false)
  const src = `${FMP_BASE}/${ticker.toUpperCase()}.png`
  const bg = tickerColor(ticker)
  const initials = ticker.slice(0, 2).toUpperCase()

  if (errored) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl font-bold text-white flex-shrink-0 ${className}`}
        style={{ width: size, height: size, background: bg, fontSize: size * 0.36 }}
      >
        {initials}
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={ticker}
      width={size}
      height={size}
      className={`rounded-xl object-contain bg-white flex-shrink-0 ${className}`}
      style={{ width: size, height: size, padding: size * 0.08 }}
      onError={() => setErrored(true)}
    />
  )
}
