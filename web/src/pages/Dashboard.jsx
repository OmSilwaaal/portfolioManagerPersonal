import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useGetFeedQuery } from '../api/feedApi'
import { useGetStockQuery } from '../api/stocksApi'
import { useGetGroupsQuery } from '../api/groupsApi'
import { useAuth } from '../contexts/AuthContext'
import MacroCalendar from '../components/MacroCalendar'

// ── Tokens ────────────────────────────────────────────────────────────────────
const BG        = '#0a0a0a'
const CARD      = 'rgba(255,255,255,0.06)'
const CARD_HV   = 'rgba(255,255,255,0.10)'
const BORDER    = 'rgba(255,255,255,0.10)'
const CREAM     = '#f0ebe0'
const SOFT      = 'rgba(240,235,224,0.70)'
const MUTED     = 'rgba(240,235,224,0.42)'
const DIM       = 'rgba(240,235,224,0.22)'
const ACCENT_BG = 'linear-gradient(135deg,rgba(100,72,200,0.60) 0%,rgba(48,34,110,0.75) 100%)'
const ACCENT_BD = 'rgba(150,110,255,0.40)'

function fmt(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function timeAgo(d) {
  if (!d) return ''
  const m = (Date.now() - new Date(d)) / 60000
  if (m < 1) return 'now'
  if (m < 60) return `${Math.floor(m)}m`
  if (m < 1440) return `${Math.floor(m / 60)}h`
  return `${Math.floor(m / 1440)}d`
}

// ── Live badge ────────────────────────────────────────────────────────────────
function LiveBadge() {
  const [on, setOn] = useState(true)
  const now = new Date()
  const open = now.getHours() >= 9 && now.getHours() < 16 && ![0,6].includes(now.getDay())
  useEffect(() => {
    if (!open) return
    const id = setInterval(() => setOn(v => !v), 900)
    return () => clearInterval(id)
  }, [open])
  return (
    <div style={{ display:'flex', alignItems:'center', gap:7, padding:'6px 14px', borderRadius:999, background:CARD, border:`1px solid ${BORDER}` }}>
      <span style={{ width:7, height:7, borderRadius:'50%', background: open ? (on ? 'var(--positive)' : 'rgba(126,169,104,0.3)') : DIM, transition:'background 450ms ease' }} />
      <span style={{ fontFamily:'var(--font-mono)', fontSize:11, letterSpacing:'0.18em', color: open ? SOFT : MUTED }}>
        {open ? 'LIVE' : 'CLOSED'}
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
    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 14px', borderRadius:999, background:CARD, border:`1px solid ${BORDER}` }}>
      <span style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.14em', color:MUTED }}>{ticker}</span>
      {price !== null && <span style={{ fontFamily:'var(--font-mono)', fontSize:12, fontWeight:600, color:CREAM }}>${fmt(price)}</span>}
      {ch !== null && (
        <span style={{ fontFamily:'var(--font-mono)', fontSize:10, color: pos ? 'var(--positive)' : 'var(--negative)' }}>
          {pos ? '+':''}{ch.toFixed(2)}%
        </span>
      )}
    </div>
  )
}

// ── Workspace tab button ──────────────────────────────────────────────────────
function Tab({ label, active, onClick }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding:'7px 18px', borderRadius:10, border:'none', cursor:'pointer',
        background: active ? 'rgba(255,255,255,0.12)' : (hov ? 'rgba(255,255,255,0.06)' : 'transparent'),
        fontFamily:'var(--font-sans)', fontSize:13, fontWeight: active ? 600 : 400,
        color: active ? CREAM : SOFT,
        transition:'all 180ms ease',
        outline: active ? `1px solid ${BORDER}` : 'none',
      }}
    >
      {label}
    </button>
  )
}

// ── NEWS VIEW ─────────────────────────────────────────────────────────────────
function NewsRow({ item }) {
  const [hov, setHov] = useState(false)
  if (!item) return null
  const urgencyCol = { high:'var(--urgency-act)', medium:'var(--urgency-watch)', low:'var(--urgency-low)' }[item.urgency?.toLowerCase()] || BORDER
  return (
    <a
      href={item.url || '#'} target="_blank" rel="noopener noreferrer"
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display:'block', textDecoration:'none',
        padding:'16px 20px', borderRadius:12, marginBottom:6,
        background: hov ? CARD_HV : CARD,
        border:`1px solid ${hov ? 'rgba(255,255,255,0.14)' : BORDER}`,
        transition:'all 200ms ease',
      }}
    >
      <div style={{ display:'flex', gap:14, alignItems:'flex-start' }}>
        <span style={{ width:3, borderRadius:2, alignSelf:'stretch', background:urgencyCol, opacity:0.8, minHeight:36, flexShrink:0 }} />
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:7, flexWrap:'wrap' }}>
            <span style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.16em', textTransform:'uppercase', color:MUTED }}>{item.source}</span>
            {item.ticker && <span style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--ochre-300)', letterSpacing:'0.12em', fontWeight:600 }}>{item.ticker}</span>}
            <span style={{ fontFamily:'var(--font-mono)', fontSize:10, color:DIM, marginLeft:'auto' }}>{timeAgo(item.publishedAt)}</span>
          </div>
          <p style={{ fontFamily:'var(--font-display)', fontSize:15, fontWeight:600, letterSpacing:'-0.02em', lineHeight:1.4, color:CREAM, margin:'0 0 6px' }}>
            {item.headline}
          </p>
          {item.summary && item.summary !== 'Summary unavailable' && (
            <p style={{ fontFamily:'var(--font-sans)', fontSize:12, color:SOFT, lineHeight:1.65, margin:0, fontWeight:400 }}>
              {item.summary}
            </p>
          )}
        </div>
      </div>
    </a>
  )
}

function NewsSkeleton() {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      {[1,2,3,4,5].map(i => (
        <div key={i} style={{ padding:'16px 20px', borderRadius:12, background:CARD, border:`1px solid ${BORDER}` }}>
          <div style={{ height:10, width:'25%', background:'rgba(255,255,255,0.07)', borderRadius:4, marginBottom:12 }} />
          <div style={{ height:15, width:'75%', background:'rgba(255,255,255,0.09)', borderRadius:4, marginBottom:8 }} />
          <div style={{ height:12, width:'55%', background:'rgba(255,255,255,0.05)', borderRadius:4 }} />
        </div>
      ))}
    </div>
  )
}

function NewsView() {
  const { data, isLoading } = useGetFeedQuery()
  const items = data?.items || []
  return (
    <div style={{ flex:1, minHeight:0, overflowY:'auto', padding:'4px 0' }}>
      {isLoading && <NewsSkeleton />}
      {!isLoading && items.slice(0,14).map(item => <NewsRow key={item.id} item={item} />)}
      {!isLoading && items.length === 0 && (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:200 }}>
          <span style={{ fontFamily:'var(--font-mono)', fontSize:11, letterSpacing:'0.16em', textTransform:'uppercase', color:MUTED }}>No feed data — check backend</span>
        </div>
      )}
    </div>
  )
}

// ── WATCHLIST VIEW ────────────────────────────────────────────────────────────
const WATCH_TICKERS = ['AAPL','MSFT','NVDA','TSLA','AMZN','GOOGL','META','BTC','ETH','SPY','QQQ']

function WatchRow({ ticker }) {
  const { data, isLoading } = useGetStockQuery(ticker)
  const [hov, setHov] = useState(false)
  const price = data?.price ?? 0
  const ch    = data?.changePercent ?? data?.changePercent24h ?? 0
  const pos   = ch >= 0
  return (
    <Link to="/stocks" style={{ textDecoration:'none' }}>
      <div
        onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
        style={{
          display:'grid', gridTemplateColumns:'80px 1fr 90px', alignItems:'center', gap:16,
          padding:'14px 20px', borderRadius:12, marginBottom:6, cursor:'pointer',
          background: hov ? CARD_HV : CARD,
          border:`1px solid ${hov ? 'rgba(255,255,255,0.14)' : BORDER}`,
          transition:'all 180ms ease',
        }}
      >
        <span style={{ fontFamily:'var(--font-mono)', fontSize:13, fontWeight:700, letterSpacing:'0.10em', color:CREAM }}>{ticker}</span>
        <div style={{ height:1, background:'rgba(255,255,255,0.06)', borderRadius:1 }} />
        <div style={{ textAlign:'right' }}>
          {isLoading
            ? <div style={{ height:13, width:60, background:'rgba(255,255,255,0.07)', borderRadius:4, marginLeft:'auto' }} />
            : <>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:13, fontWeight:600, color:CREAM }}>{price ? `$${fmt(price)}` : '—'}</div>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color: ch !== 0 ? (pos ? 'var(--positive)' : 'var(--negative)') : DIM }}>
                  {ch !== 0 ? `${pos?'+':''}${ch.toFixed(2)}%` : '—'}
                </div>
              </>
          }
        </div>
      </div>
    </Link>
  )
}

function WatchlistView() {
  return (
    <div style={{ flex:1, minHeight:0, overflowY:'auto', padding:'4px 0' }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(340px,1fr))', gap:6 }}>
        {WATCH_TICKERS.map(t => <WatchRow key={t} ticker={t} />)}
      </div>
    </div>
  )
}

// ── PAPER TRADING VIEW ────────────────────────────────────────────────────────
function ActionCard({ label, desc, to, accent }) {
  const [hov, setHov] = useState(false)
  return (
    <Link to={to} style={{ textDecoration:'none' }}>
      <div
        onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
        style={{
          padding:'20px 24px', borderRadius:14, cursor:'pointer',
          background: accent ? (hov ? 'linear-gradient(135deg,rgba(115,85,220,0.70),rgba(55,40,120,0.82))' : ACCENT_BG) : (hov ? CARD_HV : CARD),
          border:`1px solid ${accent ? ACCENT_BD : BORDER}`,
          transition:'all 220ms ease',
          transform: hov ? 'translateY(-2px)' : 'none',
          boxShadow: hov ? '0 8px 32px rgba(0,0,0,0.4)' : 'none',
        }}
      >
        <div style={{ fontFamily:'var(--font-sans)', fontSize:15, fontWeight:600, color: accent ? 'rgba(210,190,255,0.95)' : CREAM, marginBottom:6 }}>{label}</div>
        <div style={{ fontFamily:'var(--font-sans)', fontSize:12, color: accent ? 'rgba(180,160,255,0.65)' : MUTED }}>{desc}</div>
      </div>
    </Link>
  )
}

function PaperView() {
  return (
    <div style={{ flex:1, minHeight:0, overflowY:'auto', padding:'4px 0' }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px,1fr))', gap:10 }}>
        <ActionCard label="Portfolio Overview"  desc="View your current positions and P&L"         to="/portfolio"     />
        <ActionCard label="Position Size Calc"  desc="Calculate optimal position sizes"             to="/paper-trading" />
        <ActionCard label="Risk Control"        desc="Set stop-losses and exposure limits"          to="/paper-trading" />
        <ActionCard label="Execute Simulation"  desc="Place a paper trade and track performance"   to="/paper-trading" accent />
        <ActionCard label="Trade History"       desc="Review past simulated trades"                 to="/paper-trading" />
        <ActionCard label="Set Price Alert"     desc="Get notified on price triggers"               to="/alerts"        />
      </div>
    </div>
  )
}

// ── MACRO VIEW ────────────────────────────────────────────────────────────────
function MacroView() {
  return (
    <div style={{ flex:1, minHeight:0, overflowY:'auto', padding:'4px 0' }}>
      <div style={{ maxWidth:700, padding:'8px 4px' }}>
        <MacroCalendar />
      </div>
    </div>
  )
}

// ── GROUPS VIEW ───────────────────────────────────────────────────────────────
function GroupCard({ group }) {
  const [hov, setHov] = useState(false)
  const initials = (group.name || '?').slice(0,2).toUpperCase()
  return (
    <Link to={`/groups/${group.id}`} style={{ textDecoration:'none' }}>
      <div
        onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
        style={{
          padding:'20px', borderRadius:14, cursor:'pointer',
          background: hov ? CARD_HV : CARD,
          border:`1px solid ${hov ? 'rgba(255,255,255,0.14)' : BORDER}`,
          transition:'all 180ms ease',
          transform: hov ? 'translateY(-2px)' : 'none',
        }}
      >
        <div style={{ width:44, height:44, borderRadius:'50%', background:'rgba(255,255,255,0.10)', border:`1px solid ${BORDER}`, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:12 }}>
          <span style={{ fontFamily:'var(--font-mono)', fontSize:13, fontWeight:700, color:SOFT }}>{initials}</span>
        </div>
        <div style={{ fontFamily:'var(--font-sans)', fontSize:14, fontWeight:600, color:CREAM, marginBottom:4 }}>{group.name}</div>
        {group.description && <div style={{ fontFamily:'var(--font-sans)', fontSize:12, color:MUTED, lineHeight:1.5 }}>{group.description}</div>}
        <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:DIM, marginTop:10, letterSpacing:'0.10em' }}>
          {group.memberCount ?? 0} members · {group.postCount ?? 0} posts
        </div>
      </div>
    </Link>
  )
}

function GroupsView() {
  const { user } = useAuth()
  const { data: groups = [], isLoading } = useGetGroupsQuery(undefined, { skip: !user })
  return (
    <div style={{ flex:1, minHeight:0, overflowY:'auto', padding:'4px 0' }}>
      {isLoading && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))', gap:10 }}>
          {[1,2,3].map(i => <div key={i} style={{ height:140, borderRadius:14, background:CARD, border:`1px solid ${BORDER}` }} />)}
        </div>
      )}
      {!isLoading && groups.length === 0 && (
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16, height:240 }}>
          <span style={{ fontFamily:'var(--font-sans)', fontSize:15, color:MUTED }}>You haven't joined any groups yet.</span>
          <Link to="/groups" style={{ textDecoration:'none' }}>
            <div style={{ padding:'10px 24px', borderRadius:10, background:CARD, border:`1px solid ${BORDER}`, fontFamily:'var(--font-sans)', fontSize:13, color:CREAM, cursor:'pointer' }}>
              Browse Groups →
            </div>
          </Link>
        </div>
      )}
      {!isLoading && groups.length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))', gap:10 }}>
          {groups.map(g => <GroupCard key={g.id} group={g} />)}
          <Link to="/groups" style={{ textDecoration:'none' }}>
            <div style={{
              padding:'20px', borderRadius:14, border:`1.5px dashed ${BORDER}`,
              display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8, height:'100%', minHeight:120,
              cursor:'pointer', transition:'background 200ms',
            }}
            onMouseEnter={e => e.currentTarget.style.background = CARD}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ fontSize:22, color:DIM }}>+</span>
              <span style={{ fontFamily:'var(--font-sans)', fontSize:13, color:MUTED }}>Find Groups</span>
            </div>
          </Link>
        </div>
      )}
    </div>
  )
}

// ── WORKSPACE CONFIG ──────────────────────────────────────────────────────────
const WORKSPACES = [
  { id:'feed',   label:'Morning Scan',  view: <NewsView />      },
  { id:'watch',  label:'Watchlist',     view: <WatchlistView /> },
  { id:'paper',  label:'Paper Trading', view: <PaperView />     },
  { id:'macro',  label:'Macro Events',  view: <MacroView />     },
  { id:'groups', label:'Groups',        view: <GroupsView />    },
]

// ── Dashboard ─────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [ws, setWs] = useState('feed')
  const active = WORKSPACES.find(w => w.id === ws) || WORKSPACES[0]

  return (
    <div style={{ height:'100dvh', display:'flex', flexDirection:'column', overflow:'hidden', background:BG }}>

      {/* ── Title bar ── */}
      <div style={{
        height:56, flexShrink:0,
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'0 20px', borderBottom:`1px solid ${BORDER}`,
        background:'rgba(255,255,255,0.025)',
      }}>
        {/* Workspace tabs */}
        <div style={{ display:'flex', alignItems:'center', gap:2 }}>
          {WORKSPACES.map(w => (
            <Tab key={w.id} label={w.label} active={ws === w.id} onClick={() => setWs(w.id)} />
          ))}
        </div>

        {/* Right: market stats */}
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {['SPY','QQQ','BTC'].map(t => <StatPill key={t} ticker={t} />)}
          <LiveBadge />
        </div>
      </div>

      {/* ── Canvas ── */}
      <div style={{
        flex:1, minHeight:0, margin:12,
        background:'rgba(255,255,255,0.04)',
        border:`1px solid ${BORDER}`,
        borderRadius:18, overflow:'hidden',
        display:'flex', flexDirection:'column',
      }}>
        {/* Canvas header */}
        <div style={{
          padding:'16px 24px', borderBottom:`1px solid ${BORDER}`,
          display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0,
          background:'rgba(255,255,255,0.025)',
        }}>
          <span style={{ fontFamily:'var(--font-display)', fontSize:18, fontWeight:700, letterSpacing:'-0.03em', color:CREAM }}>
            {active.label}
          </span>
          <span style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.18em', textTransform:'uppercase', color:DIM }}>
            {active.id === 'feed' ? 'Realtime · AI-curated' :
             active.id === 'watch' ? 'Live prices' :
             active.id === 'paper' ? 'Paper trading' :
             active.id === 'macro' ? 'Upcoming events' : 'Community'}
          </span>
        </div>

        {/* Canvas body */}
        <div style={{ flex:1, minHeight:0, display:'flex', flexDirection:'column', padding:'12px 16px', overflow:'hidden' }}>
          {active.view}
        </div>
      </div>

    </div>
  )
}
