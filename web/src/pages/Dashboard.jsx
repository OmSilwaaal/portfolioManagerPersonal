import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useGetFeedQuery } from '../api/feedApi'
import { useGetStockQuery } from '../api/stocksApi'
import MacroCalendar from '../components/MacroCalendar'

// ── Design tokens ─────────────────────────────────────────────────────────────
const INK    = '#0b0b0b'
const CREAM  = 'var(--paper)'
const MUTED  = 'rgba(240,235,224,0.36)'
const DIM    = 'rgba(240,235,224,0.18)'
const BORDER = 'rgba(240,235,224,0.07)'
const GLOW   = 'rgba(240,235,224,0.055)'

// Glass surface — used throughout
const glass = (extra = {}) => ({
  background: 'rgba(14,14,14,0.82)',
  backdropFilter: 'blur(24px)',
  WebkitBackdropFilter: 'blur(24px)',
  border: `1px solid ${BORDER}`,
  borderRadius: 12,
  boxShadow: `inset 0 1px 0 ${GLOW}, 0 24px 48px rgba(0,0,0,0.55)`,
  ...extra,
})

// ── Config ────────────────────────────────────────────────────────────────────
const WORKSPACES = [
  { id: 'morning', label: 'Morning Scan' },
  { id: 'swing',   label: 'Swing'        },
  { id: 'crypto',  label: 'Crypto'       },
  { id: 'news',    label: 'News'         },
  { id: 'paper',   label: 'Paper Trade'  },
]

const STAT_TICKERS  = ['SPY', 'QQQ', 'BTC']
const WATCH_TICKERS = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'BTC']
const TAPE_TICKERS  = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'BTC', 'ETH', 'AMZN', 'GOOGL']

const DOCK_ITEMS = [
  { id: 'paper',  label: 'Paper Trade', icon: '▶', to: '/paper-trading' },
  { id: 'alert',  label: 'Set Alert',   icon: '◉', to: '/alerts'        },
  { id: 'port',   label: 'Portfolio',   icon: '◈', to: '/portfolio'     },
  { id: 'groups', label: 'Groups',      icon: '◎', to: '/groups'        },
  { id: 'gov',    label: 'Gov Trades',  icon: '◇', to: '/gov-trades'   },
  { id: 'feed',   label: 'Full Feed',   icon: '≡', to: '/feed'          },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = (Date.now() - new Date(dateStr)) / 60000
  if (diff < 1)    return 'now'
  if (diff < 60)   return `${Math.floor(diff)}m`
  if (diff < 1440) return `${Math.floor(diff / 60)}h`
  return `${Math.floor(diff / 1440)}d`
}

function fmt(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Live clock ────────────────────────────────────────────────────────────────
function LiveClock() {
  const [t, setT] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.16em', color: DIM, fontVariantNumeric: 'tabular-nums' }}>
      {t.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
    </span>
  )
}

// ── Market open indicator ─────────────────────────────────────────────────────
function MarketStatus() {
  const now   = new Date()
  const isOpen = now.getHours() >= 9 && now.getHours() < 16 && ![0, 6].includes(now.getDay())
  const [bright, setBright] = useState(true)
  useEffect(() => {
    if (!isOpen) return
    const id = setInterval(() => setBright(b => !b), 1100)
    return () => clearInterval(id)
  }, [isOpen])
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <span style={{
        width: 7, height: 7, borderRadius: '50%', display: 'inline-block',
        background: isOpen ? 'var(--positive)' : DIM,
        boxShadow: isOpen && bright ? '0 0 10px rgba(126,169,104,0.85)' : 'none',
        transition: 'box-shadow 550ms ease',
      }} />
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', color: isOpen ? 'var(--positive)' : DIM }}>
        {isOpen ? 'OPEN' : 'CLOSED'}
      </span>
    </div>
  )
}

// ── Ticker tape ───────────────────────────────────────────────────────────────
function TapeChip({ ticker }) {
  const { data } = useGetStockQuery(ticker)
  const price = data?.price ?? null
  const ch    = data?.changePercent ?? data?.changePercent24h ?? null
  const pos   = ch !== null && ch >= 0
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, padding: '0 22px', flexShrink: 0 }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.20em', color: MUTED }}>{ticker}</span>
      {price !== null && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: CREAM }}>${fmt(price)}</span>}
      {ch !== null && (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.06em', color: pos ? 'var(--positive)' : 'var(--negative)' }}>
          {pos ? '+' : ''}{ch.toFixed(2)}%
        </span>
      )}
      <span style={{ color: BORDER, fontSize: 7, opacity: 0.6 }}>◆</span>
    </span>
  )
}

function TickerTape() {
  return (
    <div style={{
      borderBottom: `1px solid ${BORDER}`, overflow: 'hidden',
      height: 32, display: 'flex', alignItems: 'center',
      background: 'rgba(7,7,7,0.7)', flexShrink: 0,
    }}>
      <div style={{ display: 'flex', animation: 'marquee 40s linear infinite', whiteSpace: 'nowrap' }}>
        {[...TAPE_TICKERS, ...TAPE_TICKERS, ...TAPE_TICKERS].map((t, i) => (
          <TapeChip key={`${t}-${i}`} ticker={t} />
        ))}
      </div>
    </div>
  )
}

// ── Market stat card ──────────────────────────────────────────────────────────
function MarketStat({ ticker }) {
  const { data, isLoading } = useGetStockQuery(ticker)
  const [hov, setHov] = useState(false)
  const price = data?.price ?? 0
  const ch    = data?.changePercent ?? data?.changePercent24h ?? 0
  const pos   = ch >= 0

  if (isLoading) return (
    <div style={glass({ flex: 1, padding: '20px 24px' })}>
      <div style={{ height: 9,  width: 36,  background: 'rgba(240,235,224,0.06)', borderRadius: 2, marginBottom: 14 }} />
      <div style={{ height: 28, width: 110, background: 'rgba(240,235,224,0.08)', borderRadius: 2, marginBottom: 12 }} />
      <div style={{ height: 10, width: 60,  background: 'rgba(240,235,224,0.04)', borderRadius: 2 }} />
    </div>
  )

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        ...glass({ flex: 1, padding: '20px 24px' }),
        transform: hov ? 'translateY(-4px)' : 'none',
        boxShadow: hov
          ? `inset 0 1px 0 ${GLOW}, 0 0 0 1px rgba(240,235,224,0.06), 0 32px 64px rgba(0,0,0,0.65)`
          : `inset 0 1px 0 ${GLOW}, 0 24px 48px rgba(0,0,0,0.55)`,
        transition: 'transform 350ms cubic-bezier(0.34,1.56,0.64,1), box-shadow 400ms ease',
        cursor: 'default',
      }}
    >
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: MUTED, marginBottom: 12 }}>
        {ticker}
      </div>
      <div style={{
        fontFamily: 'var(--font-display)', fontWeight: 700,
        fontSize: 'clamp(22px,2.4vw,34px)', letterSpacing: '-0.04em', lineHeight: 1,
        color: CREAM, marginBottom: 12,
        textShadow: hov ? '0 0 40px rgba(240,235,224,0.14)' : '0 0 24px rgba(240,235,224,0.07)',
        transition: 'text-shadow 400ms ease',
      }}>
        ${fmt(price)}
      </div>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.06em',
        color: pos ? 'var(--positive)' : 'var(--negative)',
        textShadow: ch !== 0 ? (pos ? '0 0 14px rgba(126,169,104,0.55)' : '0 0 14px rgba(211,92,74,0.55)') : 'none',
      }}>
        {pos ? '▲' : '▼'} {Math.abs(ch).toFixed(2)}%
      </div>
    </div>
  )
}

// ── Watchlist row ─────────────────────────────────────────────────────────────
function WatchlistRow({ ticker }) {
  const { data } = useGetStockQuery(ticker)
  const [hov, setHov] = useState(false)
  const price = data?.price ?? 0
  const ch    = data?.changePercent ?? data?.changePercent24h ?? 0
  const pos   = ch >= 0

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'grid', gridTemplateColumns: '52px 1fr 68px', alignItems: 'center',
        padding: '9px 12px', borderRadius: 8,
        background: hov ? 'rgba(240,235,224,0.045)' : 'transparent',
        border: `1px solid ${hov ? 'rgba(240,235,224,0.09)' : 'transparent'}`,
        transition: 'all 200ms ease', cursor: 'default',
      }}
    >
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', color: CREAM }}>{ticker}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'rgba(240,235,224,0.55)' }}>
        {price ? `$${fmt(price)}` : '—'}
      </span>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 10, textAlign: 'right', letterSpacing: '0.04em',
        color: pos ? 'var(--positive)' : 'var(--negative)',
        textShadow: ch !== 0 ? (pos ? '0 0 8px rgba(126,169,104,0.45)' : '0 0 8px rgba(211,92,74,0.45)') : 'none',
      }}>
        {ch !== 0 ? `${pos ? '+' : ''}${ch.toFixed(2)}%` : '—'}
      </span>
    </div>
  )
}

// ── Collapsible right panel ───────────────────────────────────────────────────
function Panel({ title, badge, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={glass()}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '13px 16px', background: 'none', border: 'none', cursor: 'pointer',
          borderBottom: open ? `1px solid ${BORDER}` : 'none',
          transition: 'border-color 300ms ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: MUTED }}>
            {title}
          </span>
          {badge && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--positive)', letterSpacing: '0.14em' }}>
              ● {badge}
            </span>
          )}
        </div>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 11, color: DIM,
          display: 'inline-block', transform: open ? 'rotate(180deg)' : 'none',
          transition: 'transform 280ms cubic-bezier(0.16,1,0.3,1)',
        }}>
          ∨
        </span>
      </button>
      <div style={{
        overflow: 'hidden',
        maxHeight: open ? 800 : 0,
        transition: 'max-height 380ms cubic-bezier(0.16,1,0.3,1)',
      }}>
        <div style={{ padding: '8px 6px 12px' }}>{children}</div>
      </div>
    </div>
  )
}

// ── News item (cinematic card) ────────────────────────────────────────────────
function NewsItem({ item }) {
  const [expanded, setExpanded] = useState(false)
  const [hov, setHov] = useState(false)
  if (!item) return null

  const urgencyCol = {
    high:   'var(--urgency-act)',
    medium: 'var(--urgency-watch)',
    low:    'var(--urgency-low)',
  }[item.urgency?.toLowerCase()] || DIM

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: '14px 16px', borderRadius: 8, marginBottom: 6,
        background: hov ? 'rgba(240,235,224,0.035)' : 'rgba(240,235,224,0.015)',
        border: `1px solid ${hov ? 'rgba(240,235,224,0.10)' : 'rgba(240,235,224,0.04)'}`,
        boxShadow: hov ? '0 8px 32px rgba(0,0,0,0.3)' : 'none',
        transition: 'all 250ms ease',
      }}
    >
      {/* Meta strip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: DIM }}>
          {item.source}
        </span>
        <span style={{ color: BORDER, fontSize: 7 }}>◆</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: DIM }}>{timeAgo(item.publishedAt)}</span>
        {item.ticker && (
          <>
            <span style={{ color: BORDER, fontSize: 7 }}>◆</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ochre-300)', letterSpacing: '0.14em', fontWeight: 600 }}>
              {item.ticker}
            </span>
          </>
        )}
        {item.urgency && (
          <div style={{
            marginLeft: 'auto', padding: '2px 8px', borderRadius: 4,
            background: `${urgencyCol}18`, border: `1px solid ${urgencyCol}38`,
            fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.18em',
            textTransform: 'uppercase', color: urgencyCol,
          }}>
            {item.urgency}
          </div>
        )}
      </div>

      {/* Headline */}
      <a
        href={item.url || '#'} target="_blank" rel="noopener noreferrer"
        style={{
          display: 'block', fontFamily: 'var(--font-display)', fontWeight: 600,
          fontSize: 14, letterSpacing: '-0.02em', lineHeight: 1.4,
          color: hov ? 'rgba(240,235,224,0.78)' : CREAM,
          textDecoration: 'none', marginBottom: item.summary ? 8 : 0,
          transition: 'color 200ms ease',
        }}
      >
        {item.headline}
      </a>

      {/* Summary */}
      {item.summary && item.summary !== 'Summary unavailable' && (
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: MUTED, lineHeight: 1.65, margin: '0 0 8px', fontWeight: 400 }}>
          {item.summary}
        </p>
      )}

      {/* Expand toggle */}
      <button
        onClick={() => setExpanded(v => !v)}
        style={{
          fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em',
          textTransform: 'uppercase', color: 'var(--moss-200)',
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
        }}
      >
        {expanded ? '↑ Less' : '↓ What does this mean?'}
      </button>

      {/* Expanded reasoning */}
      {expanded && item.reasoning && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${BORDER}` }}>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: MUTED, lineHeight: 1.7, margin: '0 0 6px' }}>
            <span style={{ color: CREAM, fontWeight: 600 }}>Analysis · </span>
            {item.reasoning}
          </p>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.16em', textTransform: 'uppercase', color: DIM }}>
            AI-generated · Not financial advice
          </span>
        </div>
      )}
    </div>
  )
}

// ── Feed skeleton ─────────────────────────────────────────────────────────────
function FeedSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} style={{
          padding: '14px 16px', borderRadius: 8,
          background: 'rgba(240,235,224,0.015)',
          border: '1px solid rgba(240,235,224,0.04)',
        }}>
          <div style={{ height: 9,  width: '30%', background: 'rgba(240,235,224,0.06)', borderRadius: 2, marginBottom: 12 }} />
          <div style={{ height: 14, width: '80%', background: 'rgba(240,235,224,0.08)', borderRadius: 2, marginBottom: 6 }} />
          <div style={{ height: 14, width: '60%', background: 'rgba(240,235,224,0.05)', borderRadius: 2 }} />
        </div>
      ))}
    </div>
  )
}

// ── Bottom command dock ───────────────────────────────────────────────────────
function DockItem({ item }) {
  const [hov, setHov] = useState(false)
  return (
    <Link to={item.to} style={{ textDecoration: 'none' }}>
      <div
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
          padding: '7px 18px', borderRadius: 10,
          background: hov ? 'rgba(240,235,224,0.07)' : 'transparent',
          border: `1px solid ${hov ? 'rgba(240,235,224,0.13)' : 'transparent'}`,
          boxShadow: hov ? '0 0 24px rgba(240,235,224,0.04)' : 'none',
          transform: hov ? 'translateY(-5px) scale(1.06)' : 'none',
          transition: 'all 320ms cubic-bezier(0.34,1.56,0.64,1)',
          cursor: 'pointer',
        }}
      >
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 15, color: hov ? CREAM : MUTED, transition: 'color 200ms ease' }}>
          {item.icon}
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: hov ? MUTED : DIM, whiteSpace: 'nowrap', transition: 'color 200ms ease' }}>
          {item.label}
        </span>
      </div>
    </Link>
  )
}

function BottomDock() {
  return (
    <div style={{
      flexShrink: 0, borderTop: `1px solid ${BORDER}`,
      background: 'rgba(7,7,7,0.88)',
      backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
      padding: '8px 24px',
      display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 4,
    }}>
      {DOCK_ITEMS.map(item => <DockItem key={item.id} item={item} />)}
    </div>
  )
}

// ── Workspace tab bar ─────────────────────────────────────────────────────────
function WorkspaceBar({ active, onSwitch }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      height: 48, padding: '0 20px', flexShrink: 0,
      borderBottom: `1px solid ${BORDER}`,
      background: 'rgba(7,7,7,0.75)',
      backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
    }}>
      {/* Workspace tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {WORKSPACES.map(ws => (
          <button
            key={ws.id}
            onClick={() => onSwitch(ws.id)}
            style={{
              position: 'relative', padding: '7px 14px',
              background: active === ws.id ? 'rgba(240,235,224,0.07)' : 'transparent',
              border: `1px solid ${active === ws.id ? 'rgba(240,235,224,0.10)' : 'transparent'}`,
              borderRadius: 7, cursor: 'pointer',
              fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em',
              color: active === ws.id ? CREAM : MUTED,
              transition: 'all 200ms ease',
            }}
          >
            {ws.label}
            {active === ws.id && (
              <span style={{
                position: 'absolute', bottom: -1, left: '18%', right: '18%', height: 1,
                background: 'linear-gradient(90deg, transparent, rgba(240,235,224,0.75), transparent)',
                boxShadow: '0 0 8px rgba(240,235,224,0.5)',
              }} />
            )}
          </button>
        ))}
      </div>

      {/* Status strip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <MarketStatus />
        <span style={{ width: 1, height: 14, background: BORDER, display: 'inline-block' }} />
        <LiveClock />
      </div>
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [workspace, setWorkspace] = useState('morning')
  const { data: feedData, isLoading: feedLoading, isError: feedError } = useGetFeedQuery()
  const items = feedData?.items || []

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0,
      background: `radial-gradient(ellipse 120% 55% at 50% 0%, rgba(240,235,224,0.024) 0%, transparent 65%), ${INK}`,
    }}>

      <WorkspaceBar active={workspace} onSwitch={setWorkspace} />
      <TickerTape />

      {/* Main body — left canvas + right utility stack */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>

        {/* ── Studio canvas ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Market stat strip */}
          <div style={{ display: 'flex', gap: 12 }}>
            {STAT_TICKERS.map(t => <MarketStat key={t} ticker={t} />)}
          </div>

          {/* Intelligence feed */}
          <div style={glass({ flex: 1 })}>
            <div style={{
              padding: '14px 18px', borderBottom: `1px solid ${BORDER}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: MUTED }}>
                  Intelligence Feed
                </span>
                {items.length > 0 && (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: DIM, letterSpacing: '0.12em' }}>
                    {Math.min(items.length, 10)} items
                  </span>
                )}
              </div>
              <Link
                to="/feed"
                style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: DIM, textDecoration: 'none' }}
                onMouseEnter={e => e.currentTarget.style.color = MUTED}
                onMouseLeave={e => e.currentTarget.style.color = DIM}
              >
                View all →
              </Link>
            </div>
            <div style={{ padding: '12px' }}>
              {feedLoading && <FeedSkeleton />}
              {feedError && (
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: DIM, padding: '12px 6px', margin: 0 }}>
                  — Feed unavailable. Check backend connection.
                </p>
              )}
              {!feedLoading && !feedError && items.slice(0, 10).map(item => (
                <NewsItem key={item.id} item={item} />
              ))}
            </div>
          </div>

        </div>

        {/* ── Right utility stack ── */}
        <div style={{
          width: 296, flexShrink: 0,
          borderLeft: `1px solid ${BORDER}`,
          overflowY: 'auto',
          padding: '16px 14px',
          display: 'flex', flexDirection: 'column', gap: 12,
          background: 'rgba(7,7,7,0.55)',
          backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        }}>
          <Panel title="Watchlist" badge="LIVE">
            {WATCH_TICKERS.map(t => <WatchlistRow key={t} ticker={t} />)}
          </Panel>
          <Panel title="Macro Events" defaultOpen={false}>
            <MacroCalendar compact />
          </Panel>
        </div>

      </div>

      <BottomDock />
    </div>
  )
}
