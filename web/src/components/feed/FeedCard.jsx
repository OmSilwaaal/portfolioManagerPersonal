import { useState, useRef, useEffect } from 'react'
import SentimentBadge from './SentimentBadge'
import ShareToGroupModal from './ShareToGroupModal'
import StockLogo from '../StockLogo'
import CommodityIcon from '../CommodityIcon'
import { safeUrl } from '../../utils/safeUrl'

const TYPE_CONFIG = {
  stock:      { label: 'Stock',     colorVar: 'var(--party-dem)',  bgStyle: { background: 'rgba(91,127,187,0.10)',  border: '1px solid rgba(91,127,187,0.22)'  } },
  crypto:     { label: 'Crypto',    colorVar: 'var(--ochre-300)',  bgStyle: { background: 'rgba(214,184,122,0.10)', border: '1px solid rgba(214,184,122,0.22)' } },
  commodity:  { label: 'Commodity', colorVar: 'var(--ochre-400)',  bgStyle: { background: 'rgba(201,168,106,0.10)', border: '1px solid rgba(201,168,106,0.22)' } },
  'gov-trade':{ label: 'Gov Trade', colorVar: 'var(--positive)',   bgStyle: { background: 'rgba(126,169,104,0.10)', border: '1px solid rgba(126,169,104,0.22)' } },
  macro:      { label: 'Macro',     colorVar: 'var(--clay-300)',   bgStyle: { background: 'rgba(194,120,90,0.10)',  border: '1px solid rgba(194,120,90,0.22)'  } },
}

const URGENCY_CONFIG = {
  'Act Now': { label: 'Act Now', dotColor: 'var(--urgency-act)',   textColor: 'var(--urgency-act)',   borderTop: { borderTop: '2px solid rgba(211,92,74,0.5)' } },
  'Watch':   { label: 'Watch',   dotColor: 'var(--urgency-watch)', textColor: 'var(--urgency-watch)', borderTop: { borderTop: '2px solid rgba(214,184,122,0.4)' } },
  'Low':     { label: null,      dotColor: '#333',                 textColor: '',                     borderTop: { borderTop: '1px solid var(--on-ink-border)' } },
}

const cardBase = {
  background: 'var(--ink-800)',
  border: '1px solid var(--on-ink-border)',
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
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', padding: '2px 8px', borderRadius: 'var(--r-pill)', color: config.colorVar, ...config.bgStyle }}>
          {config.label}
        </span>
        {ticker && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--on-ink-text-2)' }}>{ticker}</span>}
        {sentiment && <SentimentBadge sentiment={sentiment} />}
      </div>
      {urgConf.label && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, flexShrink: 0, color: urgConf.textColor }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: urgConf.dotColor, flexShrink: 0, display: 'inline-block' }} />
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
      style={{ ...cardBase, borderRadius: 'var(--r-md)', position: 'relative', overflow: 'hidden', ...urgConf.borderTop }}
    >
      {/* Red left accent bar */}
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: 'rgba(211,92,74,0.6)', borderRadius: 'var(--r-md) 0 0 var(--r-md)' }} />

      <div style={{ paddingLeft: 4 }}>
        {image && (
          <div style={{ overflow: 'hidden', height: 160 }}>
            <img src={image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.75) contrast(1.05)' }} onError={(e) => { e.target.parentElement.style.display = 'none' }} />
          </div>
        )}
        <div style={{ padding: '16px 16px 8px' }}>
          <MetaRow config={config} ticker={ticker} sentiment={sentiment} urgConf={urgConf} />
        </div>
        <div style={{ padding: '0 16px 14px' }}>
          {url ? (
            <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>
              <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 17, fontWeight: 700, lineHeight: 1.3, color: 'var(--paper)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{data.headline}</h2>
            </a>
          ) : (
            <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 17, fontWeight: 700, lineHeight: 1.3, color: 'var(--paper)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{data.headline}</h2>
          )}
          {data.summary && <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13, lineHeight: 1.55, color: 'var(--on-ink-text-2)', marginTop: 8, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{data.summary}</p>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderTop: '1px solid var(--on-ink-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {data.source && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--on-ink-text-3)' }}>{data.source}</span>}
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--on-ink-text-4)' }}>{formatTimestamp(timestamp)}</span>
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
      style={{ ...cardBase, borderRadius: 'var(--r-md)', position: 'relative', overflow: 'hidden', ...urgConf.borderTop }}
    >
      <div>
        <div style={{ overflow: 'hidden', height: 130, position: 'relative' }}>
          <img
            src={image}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.7)' }}
            onError={(e) => { e.target.parentElement.style.display = 'none' }}
          />
          {/* Dark overlay for text readability */}
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.4)' }} />
          {/* Badge overlaid on image */}
          <div style={{ position: 'absolute', bottom: 10, left: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', padding: '2px 8px', borderRadius: 'var(--r-pill)', color: config.colorVar, ...config.bgStyle }}>{config.label}</span>
            {ticker && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(240,235,224,0.6)' }}>{ticker}</span>}
          </div>
        </div>
        <div style={{ padding: '12px 16px 8px' }}>
          {url ? (
            <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>
              <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 15, fontWeight: 700, lineHeight: 1.35, color: 'var(--paper)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{data.headline}</h2>
            </a>
          ) : (
            <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 15, fontWeight: 700, lineHeight: 1.35, color: 'var(--paper)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{data.headline}</h2>
          )}
          {data.summary && <p style={{ fontFamily: 'var(--font-sans)', fontSize: 12, lineHeight: 1.55, color: 'var(--on-ink-text-3)', marginTop: 6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{data.summary}</p>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderTop: '1px solid var(--on-ink-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {sentiment && <SentimentBadge sentiment={sentiment} />}
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--on-ink-text-4)' }}>{formatTimestamp(timestamp)}</span>
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
      style={{ ...cardBase, borderRadius: 'var(--r-md)', position: 'relative', overflow: 'hidden', ...urgConf.borderTop }}
    >
      <div>
        <div style={{ padding: '16px 16px 8px' }}>
          <MetaRow config={config} ticker={ticker} sentiment={sentiment} urgConf={urgConf} />
        </div>
        <div style={{ padding: '0 16px 14px', display: 'flex', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {url ? (
              <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>
                <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 600, lineHeight: 1.35, color: 'var(--paper)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{data.headline}</h2>
              </a>
            ) : (
              <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 600, lineHeight: 1.35, color: 'var(--paper)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{data.headline}</h2>
            )}
          </div>
          <div style={{ width: 64, height: 64, borderRadius: 'var(--r-sm)', overflow: 'hidden', flexShrink: 0 }}>
            <img src={image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.target.parentElement.style.display = 'none' }} />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderTop: '1px solid var(--on-ink-border)' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--on-ink-text-4)' }}>{formatTimestamp(timestamp)}</span>
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
      style={{ ...cardBase, borderRadius: 'var(--r-md)', position: 'relative', overflow: 'hidden', ...urgConf.borderTop }}
    >
      <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        {ticker ? (
          <TickerIcon type={type} ticker={ticker} sector={data.sector} size={30} />
        ) : (
          <div style={{ width: 3, height: 40, borderRadius: 2, flexShrink: 0, background: 'var(--on-ink-2)' }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', color: config.colorVar }}>{config.label}</span>
            {ticker && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--on-ink-text-3)' }}>{ticker}</span>}
          </div>
          {url ? (
            <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>
              <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 500, lineHeight: 1.4, color: 'var(--on-ink-text-2)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{data.headline}</p>
            </a>
          ) : (
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 500, lineHeight: 1.4, color: 'var(--on-ink-text-2)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{data.headline}</p>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            {sentiment && <SentimentBadge sentiment={sentiment} />}
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--on-ink-text-4)' }}>{formatTimestamp(timestamp)}</span>
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
    <article style={{ ...cardBase, borderRadius: 'var(--r-md)', position: 'relative', overflow: 'hidden', ...urgConf.borderTop }}>
      <div>
        <div style={{ padding: '16px 16px 8px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          {ticker && <TickerIcon type={type} ticker={ticker} sector={data.sector} size={32} style={{ marginTop: 2, flexShrink: 0 }} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <MetaRow config={config} ticker={ticker || ''} sentiment={sentiment} urgConf={urgConf} />
          </div>
        </div>
        <div style={{ padding: '0 16px 14px' }}>
          {url ? (
            <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>
              <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 15, fontWeight: 600, lineHeight: 1.35, color: 'var(--paper)', marginBottom: 6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{data.headline}</h2>
            </a>
          ) : (
            <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 15, fontWeight: 600, lineHeight: 1.35, color: 'var(--paper)', marginBottom: 6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{data.headline}</h2>
          )}
          {data.summary && <p style={{ fontFamily: 'var(--font-sans)', fontSize: 12, lineHeight: 1.55, color: 'var(--on-ink-text-3)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{data.summary}</p>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderTop: '1px solid var(--on-ink-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {data.source && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--on-ink-text-3)' }}>{data.source}</span>}
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--on-ink-text-4)' }}>{formatTimestamp(timestamp)}</span>
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
  const url       = safeUrl(data.url)
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
