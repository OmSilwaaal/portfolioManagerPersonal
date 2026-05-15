import UrgencyTag from '../UrgencyTag'
import SentimentBadge from './SentimentBadge'

function TypeIcon({ type }) {
  const icons = {
    stock: (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      </svg>
    ),
    crypto: (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M9.5 8h3a2 2 0 0 1 0 4h-3v4M9.5 8V6M12.5 8V6" />
      </svg>
    ),
    commodity: (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v18h18" /><path d="M18 9l-5 5-4-4-3 3" />
      </svg>
    ),
    'gov-trade': (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      </svg>
    ),
    macro: (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    ),
  }
  return (
    <span className="text-gray-500">
      {icons[type] || icons.macro}
    </span>
  )
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

  return (
    <div className="bg-[#141414] border border-[#2a2a2a] rounded-lg p-4 hover:border-[#3a3a3a] transition-colors">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <TypeIcon type={type} />
          {ticker && (
            <span className="text-white font-bold text-sm">{ticker}</span>
          )}
          <span className="text-xs text-gray-500 capitalize bg-[#1f1f1f] px-1.5 py-0.5 rounded">
            {type.replace('-', ' ')}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {sentiment && <SentimentBadge sentiment={sentiment} />}
          <UrgencyTag urgency={urgency || data.urgency || 'Low'} />
        </div>
      </div>

      <p className="text-gray-300 text-sm leading-relaxed mb-2 line-clamp-3">{summary}</p>

      <div className="flex items-center justify-between">
        <span className="text-[11px] text-gray-600">{formatTimestamp(timestamp)}</span>
        {data.reasoning && (
          <span className="text-[11px] text-gray-600 italic truncate max-w-[200px]">
            {data.reasoning}
          </span>
        )}
      </div>
    </div>
  )
}
