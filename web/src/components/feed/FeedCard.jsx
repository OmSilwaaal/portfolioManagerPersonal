import SentimentBadge from './SentimentBadge'

const TYPE_CONFIG = {
  stock: {
    label: 'Stock',
    color: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      </svg>
    ),
  },
  crypto: {
    label: 'Crypto',
    color: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M9.5 8h3a2 2 0 0 1 0 4h-3v4M9.5 8V6M12.5 8V6" />
      </svg>
    ),
  },
  commodity: {
    label: 'Commodity',
    color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v18h18" /><path d="M18 9l-5 5-4-4-3 3" />
      </svg>
    ),
  },
  'gov-trade': {
    label: 'Gov Trade',
    color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      </svg>
    ),
  },
  macro: {
    label: 'Macro',
    color: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    ),
  },
}

const URGENCY_ACCENT = {
  High: 'bg-red-500',
  Medium: 'bg-amber-400',
  Low: 'bg-[#2a2a2a]',
}

function formatTimestamp(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ts
  const diffMs = Date.now() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHrs = Math.floor(diffMins / 60)
  if (diffHrs < 24) return `${diffHrs}h ago`
  return `${Math.floor(diffHrs / 24)}d ago`
}

export default function FeedCard({ type, data, urgency }) {
  const summary = data.summary || data.headline || data.commodity || data.assetName || ''
  const ticker = data.ticker || data.symbol || ''
  const sentiment = data.sentiment || null
  const timestamp = data.timestamp || data.publishedAt || data.disclosureDate || ''
  const level = urgency || data.urgency || 'Low'

  const config = TYPE_CONFIG[type] || TYPE_CONFIG.macro
  const accentBar = URGENCY_ACCENT[level] || URGENCY_ACCENT.Low

  return (
    <div className="relative bg-[#141414] border border-[#2a2a2a] rounded-xl overflow-hidden hover:border-[#3a3a3a] hover:bg-[#161616] transition-all group">
      {/* Left urgency accent bar */}
      <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${accentBar}`} />

      <div className="pl-4 pr-4 pt-3.5 pb-3">
        {/* Top row: type badge + ticker + time */}
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${config.color}`}>
              {config.icon}
              {config.label}
            </span>
            {ticker && (
              <span className="text-white font-bold text-sm tracking-wide">{ticker}</span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {sentiment && <SentimentBadge sentiment={sentiment} />}
            <span className="text-[11px] text-[#6b7280]">{formatTimestamp(timestamp)}</span>
          </div>
        </div>

        {/* Summary text */}
        <p className="text-[#d1d5db] text-sm leading-relaxed line-clamp-3">{summary}</p>
      </div>
    </div>
  )
}
