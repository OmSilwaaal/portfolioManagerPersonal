import { useState, useRef, useEffect } from 'react'
import SentimentBadge from './SentimentBadge'
import ShareToGroupModal from './ShareToGroupModal'
import StockLogo from '../StockLogo'
import CommodityIcon from '../CommodityIcon'

const TYPE_CONFIG = {
  stock:      { label: 'Stock',     color: 'text-blue-400',    bg: 'bg-blue-500/10 border-blue-500/20',    accent: 'rgba(59,130,246,0.15)' },
  crypto:     { label: 'Crypto',    color: 'text-purple-400',  bg: 'bg-purple-500/10 border-purple-500/20', accent: 'rgba(168,85,247,0.15)' },
  commodity:  { label: 'Commodity', color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/20',  accent: 'rgba(245,158,11,0.15)' },
  'gov-trade':{ label: 'Gov Trade', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', accent: 'rgba(52,211,153,0.15)' },
  macro:      { label: 'Macro',     color: 'text-rose-400',    bg: 'bg-rose-500/10 border-rose-500/20',    accent: 'rgba(244,63,94,0.15)' },
}

const URGENCY_CONFIG = {
  'Act Now': {
    label: 'Act Now', dot: 'bg-red-500', text: 'text-red-400', borderTop: 'border-t-2 border-t-red-500/50',
  },
  'Watch': {
    label: 'Watch', dot: 'bg-yellow-400', text: 'text-yellow-400', borderTop: 'border-t-2 border-t-yellow-400/40',
  },
  'Low': {
    label: null, dot: 'bg-[#333]', text: '', borderTop: 'border-t border-t-[#1f1f1f]',
  },
}

const cardBase = {
  background: '#111',
  border: '1px solid #1f1f1f',
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

// Deterministic card variant from item id/index so it doesn't shift on re-renders
function getVariant(seed, hasImage, urgency) {
  if (urgency === 'Act Now') return 'featured'
  if (hasImage) return seed % 3 === 0 ? 'hero' : 'thumb'
  return seed % 4 === 2 ? 'compact' : 'standard'
}

function ThreeDotMenu({ url, onShare }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center justify-center w-7 h-7 rounded-lg text-white/25 hover:text-white/60 hover:bg-white/8 transition-all"
        aria-label="More options"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
        </svg>
      </button>
      {open && (
        <div
          className="absolute right-0 bottom-9 z-30 flex flex-col rounded-xl overflow-hidden"
          style={{ background: '#1c1c1e', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', minWidth: 160 }}
        >
          <button
            onClick={() => { onShare(); setOpen(false) }}
            className="flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-white/70 hover:bg-white/8 hover:text-white transition-colors text-left"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            Share to group
          </button>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-white/70 hover:bg-white/8 hover:text-white transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
              Open article
            </a>
          )}
          {url && (
            <button
              onClick={() => { navigator.clipboard?.writeText(url); setOpen(false) }}
              className="flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-white/70 hover:bg-white/8 hover:text-white transition-colors text-left"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
              Copy link
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// Renders the right logo type based on feed item type + ticker
function TickerIcon({ type, ticker, sector, size = 32 }) {
  if (!ticker) return null
  if (type === 'commodity') return <CommodityIcon symbol={ticker} sector={sector || 'Other'} size={size} />
  if (type === 'stock' || type === 'stocks' || type === 'crypto') return <StockLogo ticker={ticker} size={size} />
  return null
}

// ── Card variants ──────────────────────────────────────────────────────────────

function MetaRow({ config, ticker, sentiment, urgConf }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${config.color} ${config.bg}`}>
          {config.label}
        </span>
        {ticker && <span className="text-white/50 font-bold text-[11px] tracking-widest">{ticker}</span>}
        {sentiment && <SentimentBadge sentiment={sentiment} />}
      </div>
      {urgConf.label && (
        <span className={`flex items-center gap-1 text-[11px] font-semibold flex-shrink-0 ${urgConf.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${urgConf.dot} animate-pulse`} />
          {urgConf.label}
        </span>
      )}
    </div>
  )
}

// FEATURED — Act Now: large text, full-width image banner if available, colored side bar
function FeaturedCard({ data, config, urgConf, image, url, ticker, sentiment, timestamp, onShare }) {
  return (
    <article
      className={`relative overflow-hidden rounded-2xl ${urgConf.borderTop}`}
      style={cardBase}
    >
      {/* Red left accent bar */}
      <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-2xl bg-red-500/60" />

      <div className="pl-4">
        {image && (
          <div className="overflow-hidden" style={{ height: 160 }}>
            <img
              src={image}
              alt=""
              className="w-full h-full object-cover"
              style={{ filter: 'brightness(0.75) contrast(1.05)' }}
              onError={(e) => { e.target.parentElement.style.display = 'none' }}
            />
          </div>
        )}
        <div className="px-4 pt-4 pb-2">
          <MetaRow config={config} ticker={ticker} sentiment={sentiment} urgConf={urgConf} />
        </div>
        <div className="px-4 pb-3">
          {url ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className="block group">
              <h2 className="text-white font-bold text-[17px] leading-snug group-hover:text-white/80 transition-colors line-clamp-3">{data.headline}</h2>
            </a>
          ) : (
            <h2 className="text-white font-bold text-[17px] leading-snug line-clamp-3">{data.headline}</h2>
          )}
          {data.summary && <p className="text-white/50 text-sm leading-relaxed mt-2 line-clamp-3">{data.summary}</p>}
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
          <div className="flex items-center gap-2">
            {data.source && <span className="text-[11px] font-medium text-white/30">{data.source}</span>}
            <span className="text-[11px] text-white/20">{formatTimestamp(timestamp)}</span>
          </div>
          <ThreeDotMenu url={url} onShare={onShare} />
        </div>
      </div>
    </article>
  )
}

// HERO — has image, large layout with image at top
function HeroCard({ data, config, urgConf, image, url, ticker, sentiment, timestamp, onShare }) {
  return (
    <article
      className={`relative overflow-hidden rounded-2xl ${urgConf.borderTop}`}
      style={cardBase}
    >
      <div>
        <div className="overflow-hidden" style={{ height: 130 }}>
          <img
            src={image}
            alt=""
            className="w-full h-full object-cover"
            style={{ filter: 'brightness(0.7)' }}
            onError={(e) => { e.target.parentElement.style.display = 'none' }}
          />
          {/* Dark overlay for text readability */}
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.4)' }} />
          {/* Badge overlaid on image */}
          <div className="absolute bottom-3 left-4 flex items-center gap-2">
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${config.color} ${config.bg}`}>{config.label}</span>
            {ticker && <span className="text-white/60 font-bold text-[11px] tracking-widest">{ticker}</span>}
          </div>
        </div>
        <div className="px-4 pt-3 pb-2">
          {url ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className="block group">
              <h2 className="text-white font-bold text-[15px] leading-snug group-hover:text-white/80 transition-colors line-clamp-2">{data.headline}</h2>
            </a>
          ) : (
            <h2 className="text-white font-bold text-[15px] leading-snug line-clamp-2">{data.headline}</h2>
          )}
          {data.summary && <p className="text-white/45 text-sm leading-relaxed mt-1.5 line-clamp-2">{data.summary}</p>}
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
          <div className="flex items-center gap-2">
            {sentiment && <SentimentBadge sentiment={sentiment} />}
            <span className="text-[11px] text-white/25">{formatTimestamp(timestamp)}</span>
          </div>
          <ThreeDotMenu url={url} onShare={onShare} />
        </div>
      </div>
    </article>
  )
}

// THUMB — has image, thumbnail on right side
function ThumbCard({ data, config, urgConf, image, url, ticker, sentiment, timestamp, onShare }) {
  return (
    <article
      className={`relative overflow-hidden rounded-2xl ${urgConf.borderTop}`}
      style={cardBase}
    >
      <div>
        <div className="px-4 pt-4 pb-2">
          <MetaRow config={config} ticker={ticker} sentiment={sentiment} urgConf={urgConf} />
        </div>
        <div className="px-4 pb-3 flex gap-3">
          <div className="flex-1 min-w-0">
            {url ? (
              <a href={url} target="_blank" rel="noopener noreferrer" className="block group">
                <h2 className="text-white font-semibold text-[14px] leading-snug group-hover:text-white/80 transition-colors line-clamp-3">{data.headline}</h2>
              </a>
            ) : (
              <h2 className="text-white font-semibold text-[14px] leading-snug line-clamp-3">{data.headline}</h2>
            )}
          </div>
          <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0">
            <img
              src={image}
              alt=""
              className="w-full h-full object-cover"
              onError={(e) => { e.target.parentElement.style.display = 'none' }}
            />
          </div>
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
          <span className="text-[11px] text-white/25">{formatTimestamp(timestamp)}</span>
          <ThreeDotMenu url={url} onShare={onShare} />
        </div>
      </div>
    </article>
  )
}

// COMPACT — no image, no summary, just headline
function CompactCard({ data, config, urgConf, url, ticker, sentiment, timestamp, onShare, type }) {
  return (
    <article
      className={`relative overflow-hidden rounded-xl ${urgConf.borderTop}`}
      style={cardBase}
    >
      <div className="px-4 py-3.5 flex items-center gap-3">
        {/* Ticker logo or color accent */}
        {ticker ? (
          <TickerIcon type={type} ticker={ticker} sector={data.sector} size={30} />
        ) : (
          <div className="w-1 h-10 rounded-full flex-shrink-0 bg-[#1f1f1f]" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <span className={`text-[10px] font-bold uppercase tracking-wider ${config.color}`}>{config.label}</span>
            {ticker && <span className="text-white/35 text-[10px] font-bold tracking-widest">{ticker}</span>}
          </div>
          {url ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className="block group">
              <p className="text-white/80 font-medium text-[13px] leading-snug group-hover:text-white transition-colors line-clamp-2">{data.headline}</p>
            </a>
          ) : (
            <p className="text-white/80 font-medium text-[13px] leading-snug line-clamp-2">{data.headline}</p>
          )}
          <div className="flex items-center gap-2 mt-1">
            {sentiment && <SentimentBadge sentiment={sentiment} />}
            <span className="text-[10px] text-white/20">{formatTimestamp(timestamp)}</span>
          </div>
        </div>
        <ThreeDotMenu url={url} onShare={onShare} />
      </div>
    </article>
  )
}

// STANDARD — no image, headline + summary
function StandardCard({ data, config, urgConf, url, ticker, sentiment, timestamp, onShare, type }) {
  return (
    <article
      className={`relative overflow-hidden rounded-2xl ${urgConf.borderTop}`}
      style={cardBase}
    >
      <div>
        <div className="px-4 pt-4 pb-2 flex items-start gap-3">
          {ticker && <TickerIcon type={type} ticker={ticker} sector={data.sector} size={32} className="mt-0.5 flex-shrink-0" />}
          <div className="flex-1 min-w-0">
            <MetaRow config={config} ticker={ticker || ''} sentiment={sentiment} urgConf={urgConf} />
          </div>
        </div>
        <div className="px-4 pb-3">
          {url ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className="block group">
              <h2 className="text-white font-semibold text-[15px] leading-snug mb-1.5 group-hover:text-white/80 transition-colors line-clamp-2">{data.headline}</h2>
            </a>
          ) : (
            <h2 className="text-white font-semibold text-[15px] leading-snug mb-1.5 line-clamp-2">{data.headline}</h2>
          )}
          {data.summary && <p className="text-white/45 text-sm leading-relaxed line-clamp-3">{data.summary}</p>}
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
          <div className="flex items-center gap-2">
            {data.source && <span className="text-[11px] font-medium text-white/25">{data.source}</span>}
            <span className="text-[11px] text-white/20">{formatTimestamp(timestamp)}</span>
          </div>
          <ThreeDotMenu url={url} onShare={onShare} />
        </div>
      </div>
    </article>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export default function FeedCard({ type, data, urgency, index = 0 }) {
  const [shareOpen, setShareOpen] = useState(false)

  const ticker    = data.ticker || data.symbol || ''
  const sentiment = data.sentiment || null
  const timestamp = data.timestamp || data.publishedAt || data.disclosureDate || ''
  const level     = urgency || data.urgency || 'Low'
  const url       = data.url || null
  const image     = data.image_url || null

  const config  = TYPE_CONFIG[type] || TYPE_CONFIG.macro
  const urgConf = URGENCY_CONFIG[level] || URGENCY_CONFIG['Low']

  const seed    = index + (typeof data.id === 'string' ? data.id.charCodeAt(0) : 0)
  const variant = getVariant(seed, !!image, level)

  const props = { data, config, urgConf, image, url, ticker, sentiment, timestamp, type, onShare: () => setShareOpen(true) }

  return (
    <>
      {variant === 'featured'  && <FeaturedCard {...props} />}
      {variant === 'hero'      && <HeroCard {...props} />}
      {variant === 'thumb'     && <ThumbCard {...props} />}
      {variant === 'compact'   && <CompactCard {...props} />}
      {variant === 'standard'  && <StandardCard {...props} />}

      {shareOpen && <ShareToGroupModal article={data} onClose={() => setShareOpen(false)} />}
    </>
  )
}
