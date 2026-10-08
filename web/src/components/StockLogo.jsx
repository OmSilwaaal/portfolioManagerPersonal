import AsciiArt from '../ascii/AsciiArt'
import { gradientFor } from '../ascii/palettes'

// A ticker badge set in ASCII: a framed monogram coloured from the ticker, so every symbol looks the same
// from row to row but is still recognisable at a glance.
function badgeLines(ticker) {
  const t = ticker.toUpperCase().replace(/[-/].*$/, '').slice(0, 4)
  const pad = 4 - t.length
  const left = Math.floor(pad / 2)
  const inner = ' '.repeat(left) + t + ' '.repeat(pad - left)
  return ['.----.', `|${inner}|`, "'----'"]
}

export default function StockLogo({ ticker, size = 36, className = '' }) {
  // 6 columns wide; scale the font so the badge fills the requested box
  const font = Math.max(5, Math.min(size / (6 * 0.6), size / (3 * 1.08)))
  return (
    <div
      className={`flex items-center justify-center flex-shrink-0 ${className}`}
      style={{ width: size, height: size }}
      title={ticker}
    >
      <AsciiArt lines={badgeLines(ticker)} palette={gradientFor(ticker)} size={font} label={ticker} />
    </div>
  )
}
