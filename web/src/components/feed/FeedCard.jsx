import { useState } from 'react'
import SentimentBadge from './SentimentBadge'
import ShareToGroupModal from './ShareToGroupModal'

const TYPE_CONFIG = {
  stock:     { label: 'Stock',     color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/20' },
  crypto:    { label: 'Crypto',    color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
  commodity: { label: 'Commodity', color: 'text-amber-400',  bg: 'bg-amber-500/10 border-amber-500/20' },
  'gov-trade':{ label: 'Gov Trade',color: 'text-emerald-400',bg: 'bg-emerald-500/10 border-emerald-500/20' },
  macro:     { label: 'Macro',     color: 'text-rose-400',   bg: 'bg-rose-500/10 border-rose-500/20' },
}

const URGENCY_CONFIG = {
  'Act Now': {
    label: 'Act Now',
    dot: 'bg-red-500',
    text: 'text-red-400',
    border: 'border-t-red-500/40',
    boxShadow: '0 0 60px rgba(239,68,68,0.22), 0 8px 32px rgba(0,0,0,0.45)',
    ambient: 'radial-gradient(ellipse at 50% 0%, rgba(239,68,68,0.10) 0%, transparent 70%)',
  },
  'Watch': {
    label: 'Watch',
    dot: 'bg-amber-400',
    text: 'text-amber-400',
    border: 'border-t-amber-400/30',
    boxShadow: '0 0 40px rgba(251,191,36,0.14), 0 8px 32px rgba(0,0,0,0.40)',
    ambient: 'radial-gradient(ellipse at 50% 0%, rgba(251,191,36,0.08) 0%, transparent 70%)',
  },
  'Low': {
    label: null,
    dot: 'bg-[#333]',
    text: '',
    border: 'border-t-transparent',
    boxShadow: '0 4px 24px rgba(0,0,0,0.30)',
    ambient: null,
  },
}

function formatTimestamp(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ts
  const diffMins = Math.floor((Date.now() - d.getTime()) / 60000)
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHrs = Math.floor(diffMins / 60)
  if (diffHrs < 24) return `${diffHrs}h ago`
  return `${Math.floor(diffHrs / 24)}d ago`
}

export default function FeedCard({ type, data, urgency }) {
  const [shareOpen, setShareOpen] = useState(false)

  const headline = data.headline || data.commodity || data.assetName || ''
  const summary  = data.summary || ''
  const ticker   = data.ticker || data.symbol || ''
  const sentiment = data.sentiment || null
  const timestamp = data.timestamp || data.publishedAt || data.disclosureDate || ''
  const level = urgency || data.urgency || 'Low'
  const url   = data.url || null

  const config  = TYPE_CONFIG[type] || TYPE_CONFIG.macro
  const urgConf = URGENCY_CONFIG[level] || URGENCY_CONFIG['Low']

  const glassStyle = {
    background: 'linear-gradient(145deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.02) 100%)',
    backdropFilter: 'blur(20px) saturate(160%)',
    WebkitBackdropFilter: 'blur(20px) saturate(160%)',
    border: '1px solid rgba(255,255,255,0.09)',
    boxShadow: urgConf.boxShadow,
  }

  return (
    <>
      <article
        className={`relative overflow-hidden rounded-2xl border-t-2 ${urgConf.border} transition-all`}
        style={glassStyle}
      >
        {/* Ambient light overlay */}
        {urgConf.ambient && (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              background: urgConf.ambient,
              pointerEvents: 'none',
              zIndex: 0,
            }}
          />
        )}

        {/* Content above ambient */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          {/* Meta row */}
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <div className="flex items-center gap-2">
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${config.color} ${config.bg}`}>
                {config.label}
              </span>
              {ticker && (
                <span className="text-white/70 font-bold text-xs tracking-widest">{ticker}</span>
              )}
              {sentiment && <SentimentBadge sentiment={sentiment} />}
            </div>
            {urgConf.label && (
              <span className={`flex items-center gap-1 text-[11px] font-semibold ${urgConf.text}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${urgConf.dot} animate-pulse`} />
                {urgConf.label}
              </span>
            )}
          </div>

          {/* Content */}
          <div className="px-5 pb-4">
            {url ? (
              <a href={url} target="_blank" rel="noopener noreferrer" className="block group">
                <h2 className="text-white font-semibold text-[15px] leading-snug mb-2 group-hover:text-white/80 transition-colors line-clamp-2">
                  {headline}
                </h2>
              </a>
            ) : (
              <h2 className="text-white font-semibold text-[15px] leading-snug mb-2 line-clamp-2">{headline}</h2>
            )}
            {summary && (
              <p className="text-[#9ca3af] text-sm leading-relaxed line-clamp-3">{summary}</p>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-3 border-t border-white/5">
            <span className="text-[#4b5563] text-xs">{formatTimestamp(timestamp)}</span>
            <button
              onClick={() => setShareOpen(true)}
              className="flex items-center gap-1.5 text-[#6b7280] hover:text-white transition-colors text-xs font-medium px-2.5 py-1 rounded-lg hover:bg-white/5"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                <polyline points="16 6 12 2 8 6"/>
                <line x1="12" y1="2" x2="12" y2="15"/>
              </svg>
              Share to group
            </button>
          </div>
        </div>
      </article>

      {shareOpen && (
        <ShareToGroupModal article={data} onClose={() => setShareOpen(false)} />
      )}
    </>
  )
}
