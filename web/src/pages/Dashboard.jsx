import { useState, useRef, useCallback, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useGetFeedQuery } from '../api/feedApi'
import { useGetStockQuery } from '../api/stocksApi'
import { useGetGroupsQuery } from '../api/groupsApi'
import { useAuth } from '../contexts/AuthContext'
import MacroCalendar from '../components/MacroCalendar'

// ── Tokens ────────────────────────────────────────────────────────────────────
const BG      = '#0b0b0b'
const MOD     = 'rgba(22,22,25,0.97)'
const ROOF    = 'rgba(255,255,255,0.04)'
const BD      = 'rgba(255,255,255,0.11)'
const C       = '#f0ebe0'
const C80     = 'rgba(240,235,224,0.80)'
const C55     = 'rgba(240,235,224,0.55)'
const C30     = 'rgba(240,235,224,0.30)'
const C14     = 'rgba(240,235,224,0.14)'
const POS     = '#7ea968'
const NEG     = '#d35c4a'
const OCH     = '#d6b87a'
const GLS     = 'rgba(14,14,17,0.88)'
const GBD     = 'rgba(255,255,255,0.13)'
const ACCENT  = 'linear-gradient(135deg,rgba(90,65,188,0.68),rgba(44,32,108,0.84))'
const ABD     = 'rgba(145,112,255,0.44)'

// ── Snap thresholds for dividers ──────────────────────────────────────────────
const SNAPS  = [0.25, 0.33, 0.5, 0.67, 0.75]
const SNAP_D = 0.025
const snap   = v => { for (const t of SNAPS) if (Math.abs(v - t) < SNAP_D) return t; return v }

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = n => Number(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})
const ago = d => {
  if (!d) return ''
  const m = (Date.now()-new Date(d))/60000
  if (m<1) return 'just now'; if (m<60) return `${Math.floor(m)}m`
  if (m<1440) return `${Math.floor(m/60)}h`; return `${Math.floor(m/1440)}d`
}

// ── Drag hook for dividers ────────────────────────────────────────────────────
function useDividerDrag(containerRef, axis, onUpdate) {
  return useCallback(e => {
    e.preventDefault()
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const move = ev => {
      const raw = axis === 'x'
        ? (ev.clientX - rect.left) / rect.width
        : (ev.clientY - rect.top) / rect.height
      onUpdate(snap(Math.max(0.15, Math.min(0.85, raw))))
    }
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }, [containerRef, axis, onUpdate])
}

// ── Live badge ────────────────────────────────────────────────────────────────
function LiveBadge() {
  const [on, setOn] = useState(true)
  const h = new Date().getHours()
  const open = h>=9 && h<16 && ![0,6].includes(new Date().getDay())
  useEffect(() => { if (!open) return; const id=setInterval(()=>setOn(v=>!v),900); return ()=>clearInterval(id) }, [open])
  return (
    <div style={{display:'flex',alignItems:'center',gap:6,padding:'5px 12px',borderRadius:999,background:C14,border:`1px solid ${BD}`}}>
      <span style={{width:6,height:6,borderRadius:'50%',background:open?(on?POS:'rgba(126,169,104,0.3)'):C30,transition:'background 500ms ease'}}/>
      <span style={{fontFamily:'var(--font-mono)',fontSize:10,letterSpacing:'0.18em',color:open?C80:C55}}>{open?'LIVE':'CLOSED'}</span>
    </div>
  )
}

// ── Stat ticker pill ──────────────────────────────────────────────────────────
function StatTicker({ ticker }) {
  const { data } = useGetStockQuery(ticker)
  const price = data?.price ?? null
  const ch    = data?.changePercent ?? data?.changePercent24h ?? null
  const pos   = ch !== null && ch >= 0
  return (
    <div style={{display:'flex',alignItems:'center',gap:8,padding:'4px 12px',borderRadius:999,background:C14,border:`1px solid ${BD}`,flexShrink:0}}>
      <span style={{fontFamily:'var(--font-mono)',fontSize:10,letterSpacing:'0.12em',color:C55}}>{ticker}</span>
      {price!==null && <span style={{fontFamily:'var(--font-mono)',fontSize:11,fontWeight:600,color:C}}>${fmt(price)}</span>}
      {ch!==null && <span style={{fontFamily:'var(--font-mono)',fontSize:10,color:pos?POS:NEG}}>{pos?'+':''}{ch.toFixed(2)}%</span>}
    </div>
  )
}

// ── Command bar ───────────────────────────────────────────────────────────────
const ALL_TICKERS = ['AAPL','MSFT','NVDA','TSLA','AMZN','GOOGL','META','SPY','QQQ','BTC','ETH','NFLX','AMD','INTC','JPM','GLD','TLT']

function CommandBar({ onAddModule, activeModules }) {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const results = query.length >= 1 ? ALL_TICKERS.filter(t => t.startsWith(query.toUpperCase())).slice(0,6) : []
  const SPAWN = [
    { id:'news',  label:'Feed',      icon:'◈' },
    { id:'watch', label:'Watchlist', icon:'◉' },
    { id:'stats', label:'Stats',     icon:'▲' },
    { id:'macro', label:'Macro',     icon:'◇' },
    { id:'paper', label:'Trade',     icon:'▶' },
  ]
  return (
    <div style={{position:'absolute',top:12,left:'50%',transform:'translateX(-50%)',zIndex:100,display:'flex',alignItems:'center',gap:10,padding:'8px 14px',borderRadius:18,background:GLS,border:`1px solid ${GBD}`,backdropFilter:'blur(28px)',WebkitBackdropFilter:'blur(28px)',boxShadow:'0 8px 48px rgba(0,0,0,0.6)',minWidth:640}}>
      {/* Search */}
      <div style={{position:'relative',flex:1}}>
        <span style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',fontFamily:'var(--font-mono)',fontSize:12,color:C30}}>⌕</span>
        <input
          value={query}
          onChange={e=>setQuery(e.target.value)}
          onFocus={()=>setFocused(true)}
          onBlur={()=>setTimeout(()=>setFocused(false),150)}
          placeholder="Search ticker…"
          style={{width:'100%',background:'rgba(255,255,255,0.06)',border:`1px solid ${focused?BD:'rgba(255,255,255,0.07)'}`,borderRadius:10,padding:'7px 12px 7px 30px',fontFamily:'var(--font-mono)',fontSize:12,color:C,outline:'none',transition:'border 200ms',letterSpacing:'0.06em'}}
        />
        <AnimatePresence>
          {focused && results.length > 0 && (
            <motion.div
              initial={{opacity:0,y:-6}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-6}}
              transition={{duration:0.15}}
              style={{position:'absolute',top:'calc(100% + 6px)',left:0,right:0,background:GLS,border:`1px solid ${GBD}`,borderRadius:12,overflow:'hidden',backdropFilter:'blur(28px)',WebkitBackdropFilter:'blur(28px)',boxShadow:'0 16px 48px rgba(0,0,0,0.7)'}}
            >
              {results.map(t => (
                <div key={t} onMouseDown={()=>{ setQuery(''); setFocused(false) }} style={{padding:'10px 14px',cursor:'pointer',display:'flex',alignItems:'center',gap:12,borderBottom:`1px solid rgba(255,255,255,0.05)`}}
                  onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.06)'}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}
                >
                  <span style={{fontFamily:'var(--font-mono)',fontSize:12,fontWeight:700,letterSpacing:'0.10em',color:C}}>{t}</span>
                  <TickerMini ticker={t} />
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Divider */}
      <div style={{width:1,height:20,background:BD,flexShrink:0}}/>

      {/* Spawn buttons */}
      <div style={{display:'flex',gap:4}}>
        {SPAWN.map(s=>{
          const active = activeModules.includes(s.id)
          return (
            <button key={s.id} onClick={()=>onAddModule(s.id)} title={s.label} style={{display:'flex',alignItems:'center',gap:5,padding:'5px 10px',borderRadius:8,border:`1px solid ${active?ABD:BD}`,background:active?'rgba(90,65,188,0.18)':'rgba(255,255,255,0.04)',cursor:'pointer',transition:'all 180ms',color:active?'rgba(200,180,255,0.9)':C55,fontFamily:'var(--font-mono)',fontSize:11}}>
              <span style={{fontSize:10}}>{s.icon}</span>
              <span style={{letterSpacing:'0.08em'}}>{s.label}</span>
            </button>
          )
        })}
      </div>

      <div style={{width:1,height:20,background:BD,flexShrink:0}}/>
      <LiveBadge />
    </div>
  )
}

function TickerMini({ ticker }) {
  const { data } = useGetStockQuery(ticker)
  const price = data?.price ?? null
  const ch    = data?.changePercent ?? data?.changePercent24h ?? null
  const pos   = ch !== null && ch >= 0
  if (!price) return <span style={{fontFamily:'var(--font-mono)',fontSize:10,color:C30}}>Loading…</span>
  return (
    <span style={{fontFamily:'var(--font-mono)',fontSize:10,color:pos?POS:NEG}}>${fmt(price)} ({pos?'+':''}{ch?.toFixed(2)}%)</span>
  )
}

// ── Module shell ──────────────────────────────────────────────────────────────
function ModuleShell({ id, title, sub, onClose, children }) {
  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',background:MOD,overflow:'hidden'}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',padding:'10px 16px',borderBottom:`1px solid ${BD}`,background:ROOF,flexShrink:0,gap:10}}>
        <span style={{fontFamily:'var(--font-display)',fontSize:13,fontWeight:700,letterSpacing:'-0.01em',color:C,flex:1}}>{title}</span>
        {sub && <span style={{fontFamily:'var(--font-mono)',fontSize:9,letterSpacing:'0.18em',textTransform:'uppercase',color:C30}}>{sub}</span>}
        <button
          onClick={()=>onClose(id)}
          style={{width:18,height:18,borderRadius:'50%',border:'none',background:'rgba(255,255,255,0.08)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:C30,fontSize:9,transition:'all 180ms',flexShrink:0}}
          onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,80,80,0.25)';e.currentTarget.style.color=NEG}}
          onMouseLeave={e=>{e.currentTarget.style.background='rgba(255,255,255,0.08)';e.currentTarget.style.color=C30}}
        >✕</button>
      </div>
      {/* Body */}
      <div style={{flex:1,minHeight:0,overflow:'hidden'}}>{children}</div>
    </div>
  )
}

// ── Divider (column or row) ───────────────────────────────────────────────────
function Divider({ axis, onMouseDown }) {
  const [hov, setHov] = useState(false)
  const isCol = axis==='x'
  return (
    <div
      onMouseDown={onMouseDown}
      onMouseEnter={()=>setHov(true)}
      onMouseLeave={()=>setHov(false)}
      style={{
        flexShrink:0,
        [isCol?'width':'height']:5,
        cursor:isCol?'col-resize':'row-resize',
        position:'relative',
        zIndex:10,
        userSelect:'none',
        background:'transparent',
        transition:'background 150ms',
      }}
    >
      <motion.div
        animate={{opacity: hov ? 1 : 0.35, scaleX: isCol ? 1 : undefined, scaleY: !isCol ? 1 : undefined}}
        transition={{duration:0.15}}
        style={{
          position:'absolute',
          top:0,bottom:0,left:0,right:0,
          background: hov ? 'rgba(255,255,255,0.22)' : BD,
          [isCol?'width':'height']:1,
          [isCol?'left':'top']:'50%',
          [isCol?'transform':'transform']:isCol?'translateX(-50%)':'translateY(-50%)',
        }}
      />
      {hov && (
        <motion.div
          initial={{opacity:0}} animate={{opacity:1}}
          style={{
            position:'absolute',
            [isCol?'top':'left']:'50%',
            [isCol?'left':'top']:'50%',
            transform:'translate(-50%,-50%)',
            width:isCol?4:24, height:isCol?24:4,
            background:'rgba(255,255,255,0.7)',
            borderRadius:2,
          }}
        />
      )}
    </div>
  )
}

// ── MODULE CONTENTS ───────────────────────────────────────────────────────────

// Stats
function StatsContent() {
  const TICKERS = ['SPY','QQQ','AAPL','MSFT','NVDA','TSLA','BTC','ETH','AMZN','META']
  return (
    <div style={{display:'flex',flexWrap:'wrap',gap:8,padding:'14px 16px',overflowY:'auto',height:'100%',alignContent:'flex-start'}}>
      {TICKERS.map(t=><StatCard key={t} ticker={t}/>)}
    </div>
  )
}

function StatCard({ ticker }) {
  const {data,isLoading} = useGetStockQuery(ticker)
  const [hov,setHov] = useState(false)
  const price = data?.price ?? 0
  const ch    = data?.changePercent ?? data?.changePercent24h ?? 0
  const pos   = ch >= 0
  return (
    <motion.div
      onHoverStart={()=>setHov(true)} onHoverEnd={()=>setHov(false)}
      whileHover={{y:-2,scale:1.02}}
      transition={{type:'spring',stiffness:400,damping:28}}
      style={{padding:'12px 16px',borderRadius:12,background:hov?'rgba(255,255,255,0.08)':'rgba(255,255,255,0.05)',border:`1px solid ${hov?BD:'rgba(255,255,255,0.07)'}`,cursor:'default',minWidth:110}}
    >
      <div style={{fontFamily:'var(--font-mono)',fontSize:10,letterSpacing:'0.14em',color:C55,marginBottom:8}}>{ticker}</div>
      {isLoading
        ? <div style={{height:20,background:'rgba(255,255,255,0.07)',borderRadius:4,marginBottom:6}}/>
        : <>
            <div style={{fontFamily:'var(--font-display)',fontSize:16,fontWeight:700,letterSpacing:'-0.02em',color:C,marginBottom:4}}>${fmt(price)}</div>
            <div style={{fontFamily:'var(--font-mono)',fontSize:10,color:pos?POS:NEG}}>{pos?'▲':'▼'} {Math.abs(ch).toFixed(2)}%</div>
          </>
      }
    </motion.div>
  )
}

// News
function NewsContent() {
  const {data,isLoading} = useGetFeedQuery()
  const items = data?.items || []
  return (
    <div style={{height:'100%',overflowY:'auto',padding:'8px 10px'}}>
      {isLoading && [1,2,3,4].map(i=>(
        <div key={i} style={{padding:'14px 16px',borderRadius:12,marginBottom:6,background:'rgba(255,255,255,0.04)',border:`1px solid ${BD}`}}>
          <div style={{height:9,width:'28%',background:'rgba(255,255,255,0.07)',borderRadius:4,marginBottom:10}}/>
          <div style={{height:14,width:'82%',background:'rgba(255,255,255,0.09)',borderRadius:4,marginBottom:7}}/>
          <div style={{height:11,width:'60%',background:'rgba(255,255,255,0.05)',borderRadius:4}}/>
        </div>
      ))}
      {!isLoading && items.slice(0,16).map(item=><NewsRow key={item.id} item={item}/>)}
    </div>
  )
}

function NewsRow({ item }) {
  const [hov,setHov] = useState(false)
  const urgColor = {high:NEG,medium:OCH,low:POS}[item.urgency?.toLowerCase()] || BD
  return (
    <motion.a
      href={item.url||'#'} target="_blank" rel="noopener noreferrer"
      onHoverStart={()=>setHov(true)} onHoverEnd={()=>setHov(false)}
      style={{display:'block',textDecoration:'none',padding:'13px 16px',borderRadius:12,marginBottom:6,background:hov?'rgba(255,255,255,0.06)':'rgba(255,255,255,0.025)',border:`1px solid ${hov?BD:'rgba(255,255,255,0.06)'}`,transition:'background 180ms,border 180ms'}}
    >
      <div style={{display:'flex',gap:12,alignItems:'flex-start'}}>
        <span style={{width:3,minHeight:34,borderRadius:2,background:urgColor,opacity:0.75,flexShrink:0,alignSelf:'stretch'}}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6,flexWrap:'wrap'}}>
            <span style={{fontFamily:'var(--font-mono)',fontSize:9,letterSpacing:'0.16em',textTransform:'uppercase',color:C30}}>{item.source}</span>
            {item.ticker && <span style={{fontFamily:'var(--font-mono)',fontSize:9,color:OCH,letterSpacing:'0.12em',fontWeight:600}}>{item.ticker}</span>}
            <span style={{fontFamily:'var(--font-mono)',fontSize:9,color:C30,marginLeft:'auto'}}>{ago(item.publishedAt)}</span>
          </div>
          <p style={{fontFamily:'var(--font-display)',fontSize:14,fontWeight:600,letterSpacing:'-0.015em',lineHeight:1.4,color:hov?C:C80,margin:'0 0 6px',transition:'color 180ms'}}>{item.headline}</p>
          {item.summary && item.summary!=='Summary unavailable' && (
            <p style={{fontFamily:'var(--font-sans)',fontSize:12,color:C55,lineHeight:1.65,margin:0}}>{item.summary}</p>
          )}
        </div>
      </div>
    </motion.a>
  )
}

// Watchlist
const WATCH_T = ['AAPL','MSFT','NVDA','TSLA','AMZN','GOOGL','META','BTC','ETH','SPY','QQQ','AMD']
function WatchContent() {
  return (
    <div style={{height:'100%',overflowY:'auto',padding:'8px 10px'}}>
      {WATCH_T.map(t=><WatchRow key={t} ticker={t}/>)}
    </div>
  )
}
function WatchRow({ ticker }) {
  const {data,isLoading} = useGetStockQuery(ticker)
  const [hov,setHov] = useState(false)
  const price = data?.price ?? 0
  const ch    = data?.changePercent ?? data?.changePercent24h ?? 0
  const pos   = ch >= 0
  return (
    <motion.div
      onHoverStart={()=>setHov(true)} onHoverEnd={()=>setHov(false)}
      whileHover={{x:2}} transition={{type:'spring',stiffness:500,damping:35}}
      style={{display:'flex',alignItems:'center',padding:'10px 14px',borderRadius:10,marginBottom:4,background:hov?'rgba(255,255,255,0.07)':'rgba(255,255,255,0.035)',border:`1px solid ${hov?BD:'rgba(255,255,255,0.06)'}`,cursor:'default',gap:12,transition:'background 160ms,border 160ms'}}
    >
      <span style={{fontFamily:'var(--font-mono)',fontSize:12,fontWeight:700,letterSpacing:'0.10em',color:C,width:52,flexShrink:0}}>{ticker}</span>
      <div style={{flex:1,height:1,background:'rgba(255,255,255,0.06)',borderRadius:1}}/>
      {isLoading
        ? <div style={{height:12,width:60,background:'rgba(255,255,255,0.07)',borderRadius:4}}/>
        : <div style={{textAlign:'right',flexShrink:0}}>
            <div style={{fontFamily:'var(--font-mono)',fontSize:12,fontWeight:600,color:C}}>{price?`$${fmt(price)}`:'—'}</div>
            <div style={{fontFamily:'var(--font-mono)',fontSize:10,color:ch!==0?(pos?POS:NEG):C30}}>{ch!==0?`${pos?'+':''}${ch.toFixed(2)}%`:'—'}</div>
          </div>
      }
    </motion.div>
  )
}

// Macro
function MacroContent() {
  return (
    <div style={{height:'100%',overflowY:'auto',padding:'10px 14px'}}>
      <MacroCalendar />
    </div>
  )
}

// Paper trading
function PaperContent() {
  const ACTIONS = [
    {label:'Portfolio Overview', desc:'Track P&L and open positions',     to:'/portfolio',     accent:false},
    {label:'Position Size Calc', desc:'Calculate optimal size per trade', to:'/paper-trading', accent:false},
    {label:'Risk Control',       desc:'Set stops and exposure limits',     to:'/paper-trading', accent:false},
    {label:'Execute Simulation', desc:'Place and simulate a trade now',    to:'/paper-trading', accent:true },
    {label:'Trade History',      desc:'Review past simulated trades',      to:'/paper-trading', accent:false},
    {label:'Set Price Alert',    desc:'Trigger on price movement',         to:'/alerts',        accent:false},
  ]
  return (
    <div style={{height:'100%',overflowY:'auto',padding:'10px 10px'}}>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:8}}>
        {ACTIONS.map(a=><PaperCard key={a.label} {...a}/>)}
      </div>
    </div>
  )
}
function PaperCard({label,desc,to,accent}) {
  const [hov,setHov] = useState(false)
  return (
    <Link to={to} style={{textDecoration:'none'}}>
      <motion.div
        onHoverStart={()=>setHov(true)} onHoverEnd={()=>setHov(false)}
        whileHover={{y:-3,scale:1.02}} transition={{type:'spring',stiffness:380,damping:26}}
        style={{padding:'18px 18px',borderRadius:14,background:accent?(hov?'linear-gradient(135deg,rgba(105,78,200,0.72),rgba(52,37,115,0.86))':ACCENT):(hov?'rgba(255,255,255,0.09)':'rgba(255,255,255,0.05)'),border:`1px solid ${accent?ABD:BD}`,cursor:'pointer',boxShadow:hov?'0 8px 32px rgba(0,0,0,0.4)':'none',transition:'background 200ms,box-shadow 200ms'}}
      >
        <div style={{fontFamily:'var(--font-sans)',fontSize:14,fontWeight:600,color:accent?'rgba(210,190,255,0.94)':C,marginBottom:6}}>{label}</div>
        <div style={{fontFamily:'var(--font-sans)',fontSize:11,color:accent?'rgba(180,160,255,0.62)':C55,lineHeight:1.5}}>{desc}</div>
      </motion.div>
    </Link>
  )
}

// ── Bottom dock ───────────────────────────────────────────────────────────────
const DOCK_ITEMS = [
  {id:'stats', label:'Stats',     icon:'▲'},
  {id:'news',  label:'Feed',      icon:'◈'},
  {id:'watch', label:'Watchlist', icon:'◉'},
  {id:'macro', label:'Macro',     icon:'◇'},
  {id:'paper', label:'Trade',     icon:'▶'},
  {id:'govtrades', label:'Gov',  icon:'⊕', to:'/gov-trades'},
  {id:'groups',    label:'Groups',icon:'◎', to:'/groups'},
  {id:'alerts',    label:'Alerts',icon:'◬', to:'/alerts'},
  {id:'settings',  label:'⚙',     icon:'⚙', to:'/settings'},
]

function DockItem({ item, active, onToggle }) {
  const [hov,setHov] = useState(false)
  const isNav = !!item.to
  const content = (
    <motion.div
      onHoverStart={()=>setHov(true)} onHoverEnd={()=>setHov(false)}
      whileHover={{y:-8,scale:1.18}} transition={{type:'spring',stiffness:420,damping:22}}
      style={{display:'flex',flexDirection:'column',alignItems:'center',gap:5,padding:'8px 14px',borderRadius:12,cursor:'pointer',background:active?'rgba(90,65,188,0.22)':(hov?'rgba(255,255,255,0.09)':'transparent'),border:`1px solid ${active?ABD:(hov?BD:'transparent')}`,transition:'background 180ms,border 180ms',flexShrink:0}}
      onClick={isNav ? undefined : ()=>onToggle(item.id)}
    >
      <span style={{fontFamily:'var(--font-mono)',fontSize:16,color:active?'rgba(200,180,255,0.9)':(hov?C:C55),transition:'color 180ms'}}>{item.icon}</span>
      <span style={{fontFamily:'var(--font-mono)',fontSize:9,letterSpacing:'0.16em',textTransform:'uppercase',color:active?'rgba(175,155,255,0.75)':(hov?C55:C30),transition:'color 180ms',whiteSpace:'nowrap'}}>{item.label}</span>
    </motion.div>
  )
  if (isNav) return <Link to={item.to} style={{textDecoration:'none'}}>{content}</Link>
  return content
}

function BottomDock({ activeModules, onToggle }) {
  return (
    <div style={{position:'absolute',bottom:16,left:'50%',transform:'translateX(-50%)',zIndex:50,display:'flex',alignItems:'center',gap:2,padding:'6px 14px',borderRadius:22,background:GLS,border:`1px solid ${GBD}`,backdropFilter:'blur(28px)',WebkitBackdropFilter:'blur(28px)',boxShadow:'0 -4px 40px rgba(0,0,0,0.55)'}}>
      {DOCK_ITEMS.map(item=>(
        <DockItem key={item.id} item={item} active={activeModules.includes(item.id)} onToggle={onToggle}/>
      ))}
    </div>
  )
}

// ── Module content resolver ───────────────────────────────────────────────────
const MODULE_META = {
  stats: { title:'Market Stats', sub:'Live prices' },
  news:  { title:'Intelligence Feed', sub:'Realtime · AI' },
  watch: { title:'Watchlist', sub:'Live' },
  macro: { title:'Macro Calendar', sub:'Upcoming events' },
  paper: { title:'Paper Trading', sub:'Simulation' },
}
function ModuleContent({ id }) {
  if (id==='stats') return <StatsContent/>
  if (id==='news')  return <NewsContent/>
  if (id==='watch') return <WatchContent/>
  if (id==='macro') return <MacroContent/>
  if (id==='paper') return <PaperContent/>
  return null
}

// ── Column (with row dividers) ────────────────────────────────────────────────
function WorkspaceColumn({ modules, containerRef, colSide, rowSplits, onRowDrag, onClose }) {
  const dragRow = useDividerDrag(containerRef, 'y', (v)=>onRowDrag(colSide, v))

  const getSizes = () => {
    if (modules.length <= 1) return modules.map(()=>'100%')
    if (modules.length === 2) return [`${rowSplits*100}%`, `${(1-rowSplits)*100}%`]
    const third = 1/3
    return [`${third*100}%`, `${third*100}%`, `${third*100}%`]
  }
  const sizes = getSizes()

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',overflow:'hidden'}}>
      {modules.map((id,i)=>(
        <div key={id} style={{height:sizes[i],minHeight:'100px',display:'flex',flexDirection:'column',overflow:'hidden'}}>
          <AnimatePresence>
            <motion.div
              key={id}
              initial={{opacity:0,scale:0.97}} animate={{opacity:1,scale:1}} exit={{opacity:0,scale:0.97}}
              transition={{duration:0.2,ease:[0.16,1,0.3,1]}}
              style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}
            >
              <ModuleShell id={id} title={MODULE_META[id]?.title||id} sub={MODULE_META[id]?.sub} onClose={onClose}>
                <ModuleContent id={id}/>
              </ModuleShell>
            </motion.div>
          </AnimatePresence>
          {i < modules.length-1 && <Divider axis="y" onMouseDown={dragRow}/>}
        </div>
      ))}
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
const DEFAULT_LEFT  = ['stats','news']
const DEFAULT_RIGHT = ['watch','macro']

export default function Dashboard() {
  const [colSplit, setColSplit]     = useState(0.65)
  const [leftMods,  setLeftMods]    = useState(DEFAULT_LEFT)
  const [rightMods, setRightMods]   = useState(DEFAULT_RIGHT)
  const [leftRow,   setLeftRow]     = useState(0.22)   // top module height fraction
  const [rightRow,  setRightRow]    = useState(0.52)
  const workspaceRef = useRef(null)

  const activeModules = [...leftMods, ...rightMods]

  const colDrag = useDividerDrag(workspaceRef, 'x', setColSplit)
  const rowDrag = useCallback((side, v) => {
    if (side==='left')  setLeftRow(v)
    if (side==='right') setRightRow(v)
  }, [])

  const toggleModule = useCallback(id => {
    setLeftMods(prev => {
      if (prev.includes(id)) return prev.filter(m=>m!==id)
      return prev
    })
    setRightMods(prev => {
      if (prev.includes(id)) return prev.filter(m=>m!==id)
      // add to shorter column
      const leftLen  = leftMods.length
      const rightLen = prev.length
      if (leftLen <= rightLen) { setLeftMods(lp => [...lp, id]); return prev }
      return [...prev, id]
    })
  }, [leftMods])

  const closeModule = useCallback(id => {
    setLeftMods(prev => prev.filter(m=>m!==id))
    setRightMods(prev => prev.filter(m=>m!==id))
  }, [])

  return (
    <div style={{position:'fixed',inset:0,zIndex:200,background:BG,display:'flex',flexDirection:'column',overflow:'hidden',fontFamily:'var(--font-sans)'}}>

      {/* ── Cinematic background ── */}
      <div style={{position:'absolute',inset:0,pointerEvents:'none',zIndex:0}}>
        {/* Dot grid */}
        <div style={{position:'absolute',inset:0,backgroundImage:'radial-gradient(circle,rgba(255,255,255,0.04) 1px,transparent 1px)',backgroundSize:'28px 28px'}}/>
        {/* Ambient glows */}
        <div style={{position:'absolute',top:'-15%',left:'20%',width:'50%',height:'60%',background:'radial-gradient(ellipse,rgba(80,55,180,0.07) 0%,transparent 70%)',pointerEvents:'none'}}/>
        <div style={{position:'absolute',bottom:'-10%',right:'15%',width:'45%',height:'55%',background:'radial-gradient(ellipse,rgba(40,130,100,0.05) 0%,transparent 70%)',pointerEvents:'none'}}/>
      </div>

      {/* ── Command bar ── */}
      <CommandBar onAddModule={toggleModule} activeModules={activeModules} />

      {/* ── Workspace ── */}
      <div
        ref={workspaceRef}
        style={{position:'relative',zIndex:1,flex:1,display:'flex',marginTop:68,marginBottom:88,overflow:'hidden'}}
      >
        {/* Left column */}
        <div style={{width:`${colSplit*100}%`,height:'100%',display:'flex',flexDirection:'column',overflow:'hidden',borderRight:`1px solid ${BD}`}}>
          {leftMods.length > 0
            ? <WorkspaceColumn modules={leftMods} containerRef={workspaceRef} colSide="left" rowSplits={leftRow} onRowDrag={rowDrag} onClose={closeModule}/>
            : <EmptyColumn onAdd={id=>{setLeftMods([id]);setRightMods(p=>p.filter(m=>m!==id))}} />
          }
        </div>

        {/* Column divider */}
        <Divider axis="x" onMouseDown={colDrag}/>

        {/* Right column */}
        <div style={{flex:1,height:'100%',display:'flex',flexDirection:'column',overflow:'hidden'}}>
          {rightMods.length > 0
            ? <WorkspaceColumn modules={rightMods} containerRef={workspaceRef} colSide="right" rowSplits={rightRow} onRowDrag={rowDrag} onClose={closeModule}/>
            : <EmptyColumn onAdd={id=>{setRightMods([id]);setLeftMods(p=>p.filter(m=>m!==id))}} />
          }
        </div>
      </div>

      {/* ── Bottom dock ── */}
      <BottomDock activeModules={activeModules} onToggle={toggleModule}/>
    </div>
  )
}

function EmptyColumn({ onAdd }) {
  const OPTS = ['stats','news','watch','macro','paper']
  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:16}}>
      <p style={{fontFamily:'var(--font-mono)',fontSize:11,letterSpacing:'0.16em',textTransform:'uppercase',color:C30,margin:0}}>Empty panel</p>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'center'}}>
        {OPTS.map(id=>(
          <button key={id} onClick={()=>onAdd(id)} style={{padding:'7px 14px',borderRadius:8,border:`1px solid ${BD}`,background:'rgba(255,255,255,0.04)',cursor:'pointer',fontFamily:'var(--font-mono)',fontSize:11,color:C55,transition:'all 160ms'}}
            onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,0.09)';e.currentTarget.style.color=C}}
            onMouseLeave={e=>{e.currentTarget.style.background='rgba(255,255,255,0.04)';e.currentTarget.style.color=C55}}
          >
            {MODULE_META[id]?.title || id}
          </button>
        ))}
      </div>
    </div>
  )
}
