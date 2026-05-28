import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useGetFeedQuery } from '../api/feedApi'
import { useGetStockQuery } from '../api/stocksApi'
import { useGetGroupsQuery } from '../api/groupsApi'
import { useAuth } from '../contexts/AuthContext'
import MacroCalendar from '../components/MacroCalendar'

// ── Tokens ────────────────────────────────────────────────────────────────────
const BG          = '#080808'
const PANEL_BG    = 'rgba(255,255,255,0.032)'
const PANEL_BG_HV = 'rgba(255,255,255,0.056)'
const BORDER      = 'rgba(255,255,255,0.075)'
const CREAM       = 'var(--paper)'
const MUTED       = 'rgba(240,235,224,0.45)'
const DIM         = 'rgba(240,235,224,0.20)'
const ACCENT_BG   = 'linear-gradient(135deg, rgba(88,64,180,0.55) 0%, rgba(40,30,100,0.70) 100%)'
const ACCENT_BORDER = 'rgba(130,100,255,0.35)'

const r = (n) => ({ borderRadius: n })

function fmt(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = (Date.now() - new Date(dateStr)) / 60000
  if (diff < 1)    return 'now'
  if (diff < 60)   return `${Math.floor(diff)}m`
  if (diff < 1440) return `${Math.floor(diff / 60)}h`
  return `${Math.floor(diff / 1440)}d`
}

// ── Live badge ────────────────────────────────────────────────────────────────
function LiveBadge() {
  const [on, setOn] = useState(true)
  const now   = new Date()
  const isOpen = now.getHours() >= 9 && now.getHours() < 16 && ![0, 6].includes(now.getDay())

  useEffect(() => {
    if (!isOpen) return
    const id = setInterval(() => setOn(v => !v), 900)
    return () => clearInterval(id)
  }, [isOpen])

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 7,
      padding: '5px 14px', borderRadius: 999,
      background: 'rgba(255,255,255,0.07)',
      border: `1px solid ${BORDER}`,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
        background: isOpen ? (on ? 'var(--positive)' : 'rgba(126,169,104,0.35)') : DIM,
        transition: 'background 450ms ease',
      }} />
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.20em', color: MUTED }}>
        {isOpen ? 'LIVE' : 'CLOSED'}
      </span>
    </div>
  )
}

// ── Stat pill ─────────────────────────────────────────────────────────────────
function StatPill({ ticker }) {
  const { data } = useGetStockQuery(ticker)
  const price = data?.price ?? null
  const ch    = data?.changePercent ?? data?.changePercent24h ?? null
  const pos   = ch !== null && ch >= 0

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 9,
      padding: '6px 14px', borderRadius: 999,
      background: PANEL_BG, border: `1px solid ${BORDER}`,
    }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em', color: DIM }}>{ticker}</span>
      {price !== null && (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: CREAM }}>${fmt(price)}</span>
      )}
      {ch !== null && (
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10,
          color: pos ? 'var(--positive)' : 'var(--negative)',
        }}>
          {pos ? '+' : ''}{ch.toFixed(2)}%
        </span>
      )}
    </div>
  )
}

// ── News row (inside stage) ───────────────────────────────────────────────────
function NewsRow({ item }) {
  const [hov, setHov] = useState(false)
  if (!item) return null

  const urgencyCol = {
    high:   'var(--urgency-act)',
    medium: 'var(--urgency-watch)',
    low:    'var(--urgency-low)',
  }[item.urgency?.toLowerCase()] || 'transparent'

  return (
    <a
      href={item.url || '#'}
      target="_blank"
      rel="noopener noreferrer"
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'block', textDecoration: 'none',
        padding: '13px 16px', borderRadius: 10,
        background: hov ? PANEL_BG_HV : 'transparent',
        border: `1px solid ${hov ? BORDER : 'transparent'}`,
        transition: 'all 200ms ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        {/* Urgency stripe */}
        <span style={{
          width: 3, borderRadius: 2, alignSelf: 'stretch', flexShrink: 0,
          background: urgencyCol, opacity: 0.7,
          minHeight: 32,
        }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: DIM }}>
              {item.source}
            </span>
            {item.ticker && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ochre-300)', letterSpacing: '0.12em', fontWeight: 600 }}>
                {item.ticker}
              </span>
            )}
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: DIM, marginLeft: 'auto' }}>
              {timeAgo(item.publishedAt)}
            </span>
          </div>
          <p style={{
            fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 500,
            letterSpacing: '-0.01em', lineHeight: 1.45,
            color: hov ? CREAM : 'rgba(240,235,224,0.82)',
            margin: 0, transition: 'color 200ms',
          }}>
            {item.headline}
          </p>
          {item.summary && item.summary !== 'Summary unavailable' && (
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: MUTED, lineHeight: 1.6, margin: '6px 0 0', fontWeight: 400 }}>
              {item.summary}
            </p>
          )}
        </div>
      </div>
    </a>
  )
}

// ── Paper trading action row ──────────────────────────────────────────────────
function ActionRow({ label, to, accent = false }) {
  const [hov, setHov] = useState(false)
  return (
    <Link to={to} style={{ textDecoration: 'none' }}>
      <div
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{
          padding: '12px 16px', borderRadius: 10, cursor: 'pointer',
          background: accent
            ? (hov ? 'linear-gradient(135deg,rgba(100,75,200,0.70),rgba(50,38,120,0.80))' : ACCENT_BG)
            : (hov ? PANEL_BG_HV : PANEL_BG),
          border: `1px solid ${accent ? ACCENT_BORDER : BORDER}`,
          transition: 'all 220ms ease',
          transform: hov ? 'translateY(-1px)' : 'none',
        }}
      >
        <span style={{
          fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 500,
          color: accent ? 'rgba(200,180,255,0.92)' : (hov ? CREAM : MUTED),
          transition: 'color 200ms',
        }}>
          {label}
        </span>
      </div>
    </Link>
  )
}

// ── Group avatar cluster ──────────────────────────────────────────────────────
function GroupAvatar({ group }) {
  const [hov, setHov] = useState(false)
  const initials = (group.name || '?').slice(0, 2).toUpperCase()
  return (
    <Link to={`/groups/${group.id}`} style={{ textDecoration: 'none' }}>
      <div
        title={group.name}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{
          width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
          background: hov ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.07)',
          border: `1.5px solid ${hov ? BORDER : 'rgba(255,255,255,0.05)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 200ms ease',
          transform: hov ? 'scale(1.08)' : 'none',
          cursor: 'pointer',
        }}
      >
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: MUTED }}>
          {initials}
        </span>
      </div>
    </Link>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function Skeleton({ w, h }) {
  return <div style={{ width: w, height: h, borderRadius: 6, background: 'rgba(255,255,255,0.05)' }} />
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
const WORKSPACES = ['Morning Scan', 'Swing', 'Crypto', 'News', 'Paper Trade']

export default function Dashboard() {
  const [workspace, setWorkspace] = useState('Morning Scan')
  const { user } = useAuth()
  const { data: feedData, isLoading: feedLoading } = useGetFeedQuery()
  const { data: groups = [] } = useGetGroupsQuery(undefined, { skip: !user })
  const items = feedData?.items || []

  return (
    <div style={{
      height: '100dvh', display: 'flex', flexDirection: 'column',
      overflow: 'hidden', background: BG,
      fontFamily: 'var(--font-sans)',
    }}>

      {/* ── Title bar ── */}
      <div style={{
        height: 52, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px',
        borderBottom: `1px solid ${BORDER}`,
        background: 'rgba(255,255,255,0.018)',
      }}>
        {/* Workspace selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {WORKSPACES.map(ws => (
            <button
              key={ws}
              onClick={() => setWorkspace(ws)}
              style={{
                padding: '5px 13px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: workspace === ws ? 'rgba(255,255,255,0.09)' : 'transparent',
                fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: workspace === ws ? 500 : 400,
                color: workspace === ws ? CREAM : MUTED,
                transition: 'all 180ms ease',
              }}
              onMouseEnter={e => { if (workspace !== ws) e.currentTarget.style.color = 'rgba(240,235,224,0.65)' }}
              onMouseLeave={e => { if (workspace !== ws) e.currentTarget.style.color = MUTED }}
            >
              {ws}
            </button>
          ))}
        </div>

        {/* Center title */}
        <span style={{
          position: 'absolute', left: '50%', transform: 'translateX(-50%)',
          fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 500,
          color: MUTED, letterSpacing: '-0.01em', pointerEvents: 'none',
        }}>
          {workspace} Workspace
        </span>

        {/* Right: stats + live */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {['SPY', 'QQQ', 'BTC'].map(t => <StatPill key={t} ticker={t} />)}
          <LiveBadge />
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 12, padding: 12, overflow: 'hidden' }}>

        {/* ── Left: Market Intelligence stage ── */}
        <div style={{
          flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0,
          background: PANEL_BG, border: `1px solid ${BORDER}`, borderRadius: 16, overflow: 'hidden',
        }}>
          {/* Panel header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 20px', borderBottom: `1px solid ${BORDER}`, flexShrink: 0,
          }}>
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 600, color: CREAM, letterSpacing: '-0.02em' }}>
              Market Intelligence
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: DIM }}>
                Realtime
              </span>
              <Link
                to="/feed"
                style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: DIM, textDecoration: 'none' }}
                onMouseEnter={e => e.currentTarget.style.color = MUTED}
                onMouseLeave={e => e.currentTarget.style.color = DIM}
              >
                View all →
              </Link>
            </div>
          </div>

          {/* Feed content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
            {feedLoading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px' }}>
                {[1,2,3,4,5].map(i => (
                  <div key={i} style={{ display: 'flex', gap: 12, padding: '13px 16px' }}>
                    <Skeleton w={3} h={40} />
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <Skeleton w="30%" h={9} />
                      <Skeleton w="85%" h={13} />
                      <Skeleton w="60%" h={11} />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!feedLoading && items.slice(0, 12).map(item => (
              <NewsRow key={item.id} item={item} />
            ))}
            {!feedLoading && items.length === 0 && (
              <div style={{
                height: '100%', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 12,
                color: DIM,
              }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" opacity={0.4}>
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
                </svg>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
                  No data — check backend
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── Right column ── */}
        <div style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>

          {/* Watchlist panel */}
          <div style={{ background: PANEL_BG, border: `1px solid ${BORDER}`, borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px 10px', borderBottom: `1px solid ${BORDER}` }}>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 600, color: CREAM, letterSpacing: '-0.02em' }}>
                Watchlist
              </span>
            </div>
            <div style={{ padding: '10px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN'].map(t => (
                <WatchlistRow key={t} ticker={t} />
              ))}
            </div>
          </div>

          {/* Paper Trading panel */}
          <div style={{ background: PANEL_BG, border: `1px solid ${BORDER}`, borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px 10px', borderBottom: `1px solid ${BORDER}` }}>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 600, color: CREAM, letterSpacing: '-0.02em' }}>
                Paper Trading
              </span>
            </div>
            <div style={{ padding: '10px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <ActionRow label="Portfolio Overview"  to="/portfolio"     />
              <ActionRow label="Position Size Calc"  to="/paper-trading" />
              <ActionRow label="Risk Control"        to="/paper-trading" />
              <ActionRow label="Execute Simulation"  to="/paper-trading" accent />
            </div>
          </div>

          {/* Macro Events panel */}
          <div style={{ background: PANEL_BG, border: `1px solid ${BORDER}`, borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px 10px', borderBottom: `1px solid ${BORDER}` }}>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 600, color: CREAM, letterSpacing: '-0.02em' }}>
                Macro Events
              </span>
            </div>
            <div style={{ padding: '8px 10px 10px' }}>
              <MacroCalendar compact />
            </div>
          </div>

          {/* Groups panel */}
          {groups.length > 0 && (
            <div style={{ background: PANEL_BG, border: `1px solid ${BORDER}`, borderRadius: 16, overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px 10px', borderBottom: `1px solid ${BORDER}` }}>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 600, color: CREAM, letterSpacing: '-0.02em' }}>
                  Groups
                </span>
              </div>
              <div style={{ padding: '12px 16px', display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {groups.slice(0, 6).map(g => <GroupAvatar key={g.id} group={g} />)}
                <Link to="/groups" style={{ textDecoration: 'none' }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: '50%',
                    background: PANEL_BG, border: `1.5px dashed ${BORDER}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: DIM }}>+</span>
                  </div>
                </Link>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

// ── Watchlist row (local) ─────────────────────────────────────────────────────
function WatchlistRow({ ticker }) {
  const { data } = useGetStockQuery(ticker)
  const [hov, setHov] = useState(false)
  const price = data?.price ?? 0
  const ch    = data?.changePercent ?? data?.changePercent24h ?? 0
  const pos   = ch >= 0

  return (
    <Link to="/stocks" style={{ textDecoration: 'none' }}>
      <div
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '9px 14px', borderRadius: 10, cursor: 'pointer',
          background: hov ? PANEL_BG_HV : PANEL_BG,
          border: `1px solid ${hov ? BORDER : 'rgba(255,255,255,0.04)'}`,
          transition: 'all 180ms ease',
        }}
      >
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, letterSpacing: '0.10em', color: CREAM }}>
          {ticker}
        </span>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgba(240,235,224,0.65)' }}>
            {price ? `$${fmt(price)}` : '—'}
          </div>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 10,
            color: ch !== 0 ? (pos ? 'var(--positive)' : 'var(--negative)') : DIM,
          }}>
            {ch !== 0 ? `${pos ? '+' : ''}${ch.toFixed(2)}%` : '—'}
          </div>
        </div>
      </div>
    </Link>
  )
}
