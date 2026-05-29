import { useState, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useGetFeedQuery } from '../api/feedApi'
import { useGetStockQuery } from '../api/stocksApi'
import { useGetGroupsQuery } from '../api/groupsApi'
import { useAuth } from '../contexts/AuthContext'
import MacroCalendar from '../components/MacroCalendar'

// ── Tokens ─────────────────────────────────────────────────────────────────────
const CANVAS   = '#0d0d10'
const PANEL    = 'rgba(24,24,28,0.98)'
const PHDR     = 'rgba(255,255,255,0.03)'
const BD       = 'rgba(255,255,255,0.09)'
const SHADOW   = '0 20px 60px rgba(0,0,0,0.65), 0 4px 12px rgba(0,0,0,0.4)'
const C        = '#f0ebe0'
const C75      = 'rgba(240,235,224,0.75)'
const C50      = 'rgba(240,235,224,0.50)'
const C28      = 'rgba(240,235,224,0.28)'
const C12      = 'rgba(240,235,224,0.12)'
const POS      = '#34d399'
const NEG      = '#f87171'
const OCH      = '#fbbf24'
const GLS      = 'rgba(16,16,20,0.90)'
const GBD      = 'rgba(255,255,255,0.12)'
const TL       = ['#ff5f57','#febc2e','#28c840']   // traffic lights
const GAP      = 10   // px gap between panels
const EDGE     = 14   // px workspace edge padding

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = n => Number(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})
const ago = d => {
  if (!d) return ''
  const m = (Date.now()-new Date(d))/60000
  if (m<1) return 'just now'; if (m<60) return `${Math.floor(m)}m`
  if (m<1440) return `${Math.floor(m/60)}h`; return `${Math.floor(m/1440)}d`
}

// ── Snap logic ────────────────────────────────────────────────────────────────
const SNAPS = [0.25,0.33,0.5,0.67,0.75]
const snap  = v => { for (const t of SNAPS) if (Math.abs(v-t)<0.025) return t; return v }

// ── Drag hook for resizable dividers ─────────────────────────────────────────
function useDrag(ref, axis, onUpdate) {
  return useCallback(e => {
    e.preventDefault()
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    const move = ev => {
      const raw = axis==='x' ? (ev.clientX-rect.left)/rect.width : (ev.clientY-rect.top)/rect.height
      onUpdate(snap(Math.max(0.15, Math.min(0.85, raw))))
    }
    const up = () => { window.removeEventListener('mousemove',move); window.removeEventListener('mouseup',up) }
    window.addEventListener('mousemove',move); window.addEventListener('mouseup',up)
  },[ref,axis,onUpdate])
}

// ── Panel shell (macOS window style) ─────────────────────────────────────────
function Panel({ id, title, sub, onClose, children, style = {} }) {
  const [tlHov, setTlHov] = useState(false)
  return (
    <div style={{
      display:'flex', flexDirection:'column', overflow:'hidden',
      background:PANEL, borderRadius:18, border:`1px solid ${BD}`,
      boxShadow:SHADOW, ...style,
    }}>
      {/* macOS-style header */}
      <div
        style={{display:'flex',alignItems:'center',padding:'12px 16px',borderBottom:`1px solid ${BD}`,background:PHDR,flexShrink:0,gap:12,userSelect:'none'}}
        onMouseEnter={()=>setTlHov(true)} onMouseLeave={()=>setTlHov(false)}
      >
        {/* Traffic lights */}
        <div style={{display:'flex',gap:7,flexShrink:0}}>
          {TL.map((col,i)=>(
            <button
              key={col}
              onClick={i===0?()=>onClose(id):undefined}
              title={i===0?'Close':i===1?'Minimize':'Expand'}
              style={{width:12,height:12,borderRadius:'50%',background:col,border:'none',cursor:i===0?'pointer':'default',flexShrink:0,transition:'opacity 150ms',opacity:tlHov?1:0.6}}
            />
          ))}
        </div>
        <span style={{fontFamily:'var(--font-sans)',fontSize:13,fontWeight:600,letterSpacing:'-0.01em',color:C,flex:1}}>{title}</span>
        {sub && <span style={{fontFamily:'var(--font-mono)',fontSize:9,letterSpacing:'0.18em',textTransform:'uppercase',color:C28}}>{sub}</span>}
        <span style={{fontFamily:'var(--font-sans)',fontSize:12,color:C28,cursor:'default',flexShrink:0}}>⌘</span>
      </div>
      {/* Body */}
      <div style={{flex:1,minHeight:0,overflow:'hidden'}}>{children}</div>
    </div>
  )
}

// ── Row resize handle (gap between panels in a column) ────────────────────────
function RowHandle({ onMouseDown }) {
  const [hov,setHov] = useState(false)
  return (
    <div
      style={{height:GAP,flexShrink:0,cursor:'row-resize',position:'relative',display:'flex',alignItems:'center',justifyContent:'center'}}
      onMouseDown={onMouseDown} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
    >
      <motion.div
        animate={{scaleX:hov?1:0,opacity:hov?1:0}}
        transition={{duration:0.15}}
        style={{width:40,height:2,borderRadius:2,background:'rgba(255,255,255,0.35)'}}
      />
    </div>
  )
}

// ── Column resize handle (gap between left/right columns) ─────────────────────
function ColHandle({ onMouseDown }) {
  const [hov,setHov] = useState(false)
  return (
    <div
      style={{width:GAP,flexShrink:0,cursor:'col-resize',position:'relative',display:'flex',alignItems:'center',justifyContent:'center'}}
      onMouseDown={onMouseDown} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
    >
      <motion.div
        animate={{scaleY:hov?1:0,opacity:hov?1:0}}
        transition={{duration:0.15}}
        style={{width:2,height:40,borderRadius:2,background:'rgba(255,255,255,0.35)'}}
      />
    </div>
  )
}

// ── Sparkline SVG ─────────────────────────────────────────────────────────────
function Sparkline({ color=POS, path="M 0 50 C 60 50 80 18 140 22 C 200 26 210 44 260 38 C 310 32 330 12 380 6" }) {
  return (
    <svg width="100%" height="56" viewBox="0 0 380 60" preserveAspectRatio="none" style={{display:'block'}}>
      <defs>
        <linearGradient id={`sg-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={path+' L 380 60 L 0 60 Z'} fill={`url(#sg-${color.replace('#','')})`}/>
      <path d={path} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round"/>
    </svg>
  )
}

// ── MODULE CONTENTS ───────────────────────────────────────────────────────────

// Stats
function StatsContent() {
  const TICKERS = ['SPY','QQQ','AAPL','MSFT','NVDA','TSLA','BTC','ETH','AMZN','META','AMD','GOOGL']
  return (
    <div style={{display:'flex',flexWrap:'wrap',gap:8,padding:'14px',overflowY:'auto',height:'100%',alignContent:'flex-start'}}>
      {TICKERS.map(t=><StatCard key={t} ticker={t}/>)}
    </div>
  )
}
function StatCard({ ticker }) {
  const {data,isLoading} = useGetStockQuery(ticker)
  const price = data?.price??0, ch=data?.changePercent??data?.changePercent24h??0, pos=ch>=0
  return (
    <motion.div whileHover={{y:-3,scale:1.04}} transition={{type:'spring',stiffness:420,damping:26}}
      style={{padding:'12px 14px',borderRadius:12,background:'rgba(255,255,255,0.05)',border:`1px solid ${BD}`,minWidth:105,cursor:'default'}}
    >
      <div style={{fontFamily:'var(--font-mono)',fontSize:10,letterSpacing:'0.13em',color:C50,marginBottom:8}}>{ticker}</div>
      {isLoading
        ? <><div style={{height:18,width:80,background:'rgba(255,255,255,0.07)',borderRadius:4,marginBottom:6}}/><div style={{height:10,width:50,background:'rgba(255,255,255,0.05)',borderRadius:4}}/></>
        : <><div style={{fontFamily:'var(--font-display)',fontSize:15,fontWeight:700,letterSpacing:'-0.02em',color:C,marginBottom:5}}>${fmt(price)}</div>
            <div style={{fontFamily:'var(--font-mono)',fontSize:10,color:pos?POS:NEG}}>{pos?'▲':'▼'} {Math.abs(ch).toFixed(2)}%</div></>
      }
    </motion.div>
  )
}

// News
function NewsContent() {
  const {data,isLoading} = useGetFeedQuery()
  const items = data?.items||[]
  return (
    <div style={{height:'100%',overflowY:'auto',padding:'8px 10px'}}>
      {isLoading && [1,2,3,4].map(i=>(
        <div key={i} style={{padding:'14px 14px',borderRadius:14,marginBottom:6,background:'rgba(255,255,255,0.04)',border:`1px solid ${BD}`}}>
          <div style={{height:9,width:'28%',background:'rgba(255,255,255,0.07)',borderRadius:4,marginBottom:10}}/>
          <div style={{height:14,width:'82%',background:'rgba(255,255,255,0.09)',borderRadius:4,marginBottom:7}}/>
          <div style={{height:11,width:'58%',background:'rgba(255,255,255,0.05)',borderRadius:4}}/>
        </div>
      ))}
      {!isLoading && items.slice(0,16).map(item=><NewsRow key={item.id} item={item}/>)}
      {!isLoading && items.length===0 && (
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'60%'}}>
          <span style={{fontFamily:'var(--font-mono)',fontSize:10,letterSpacing:'0.16em',textTransform:'uppercase',color:C28}}>No feed data — check backend</span>
        </div>
      )}
    </div>
  )
}
function NewsRow({ item }) {
  const [hov,setHov]=useState(false)
  const urg = {high:NEG,medium:OCH,low:POS}[item.urgency?.toLowerCase()]||BD
  return (
    <motion.a href={item.url||'#'} target="_blank" rel="noopener noreferrer"
      onHoverStart={()=>setHov(true)} onHoverEnd={()=>setHov(false)}
      style={{display:'block',textDecoration:'none',padding:'13px 14px',borderRadius:14,marginBottom:6,
        background:hov?'rgba(255,255,255,0.06)':'rgba(255,255,255,0.025)',
        border:`1px solid ${hov?'rgba(255,255,255,0.12)':BD}`,transition:'background 180ms,border 180ms'}}
    >
      <div style={{display:'flex',gap:12,alignItems:'flex-start'}}>
        <span style={{width:3,minHeight:32,borderRadius:2,background:urg,opacity:0.8,flexShrink:0,alignSelf:'stretch'}}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6,flexWrap:'wrap'}}>
            <span style={{fontFamily:'var(--font-mono)',fontSize:9,letterSpacing:'0.16em',textTransform:'uppercase',color:C28}}>{item.source}</span>
            {item.ticker&&<span style={{fontFamily:'var(--font-mono)',fontSize:9,color:OCH,letterSpacing:'0.12em',fontWeight:600}}>{item.ticker}</span>}
            <span style={{fontFamily:'var(--font-mono)',fontSize:9,color:C28,marginLeft:'auto'}}>{ago(item.publishedAt)}</span>
          </div>
          <p style={{fontFamily:'var(--font-display)',fontSize:14,fontWeight:600,letterSpacing:'-0.015em',lineHeight:1.4,color:hov?C:C75,margin:'0 0 5px',transition:'color 180ms'}}>{item.headline}</p>
          {item.summary&&item.summary!=='Summary unavailable'&&(
            <p style={{fontFamily:'var(--font-sans)',fontSize:11,color:C50,lineHeight:1.6,margin:0}}>{item.summary}</p>
          )}
        </div>
      </div>
    </motion.a>
  )
}

// Watchlist
const WATCH_T = ['NVDA','AAPL','TSLA','MSFT','AMZN','GOOGL','META','BTC','ETH','SPY','QQQ','AMD']
function WatchContent() {
  return (
    <div style={{height:'100%',overflowY:'auto',padding:'6px 8px'}}>
      {WATCH_T.map(t=><WatchRow key={t} ticker={t}/>)}
    </div>
  )
}
function WatchRow({ ticker }) {
  const {data,isLoading} = useGetStockQuery(ticker)
  const [hov,setHov]=useState(false)
  const price=data?.price??0, ch=data?.changePercent??data?.changePercent24h??0, pos=ch>=0
  return (
    <motion.div onHoverStart={()=>setHov(true)} onHoverEnd={()=>setHov(false)}
      whileHover={{x:3}} transition={{type:'spring',stiffness:500,damping:35}}
      style={{display:'flex',alignItems:'center',padding:'10px 14px',borderRadius:12,marginBottom:4,
        background:hov?'rgba(255,255,255,0.08)':'rgba(255,255,255,0.04)',
        border:`1px solid ${hov?'rgba(255,255,255,0.12)':BD}`,cursor:'default',gap:12,transition:'background 160ms,border 160ms'}}
    >
      <span style={{fontFamily:'var(--font-mono)',fontSize:12,fontWeight:700,letterSpacing:'0.10em',color:C,width:52,flexShrink:0}}>{ticker}</span>
      <span style={{fontFamily:'var(--font-sans)',fontSize:10,color:C28,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>Drag to workspace</span>
      {isLoading
        ? <div style={{height:12,width:56,background:'rgba(255,255,255,0.07)',borderRadius:4}}/>
        : <div style={{textAlign:'right',flexShrink:0}}>
            <div style={{fontFamily:'var(--font-mono)',fontSize:12,fontWeight:600,color:C}}>{price?`$${fmt(price)}`:'—'}</div>
            <div style={{fontFamily:'var(--font-mono)',fontSize:10,color:ch!==0?(pos?POS:NEG):C28}}>{ch!==0?`${pos?'+':''}${ch.toFixed(2)}%`:'—'}</div>
          </div>
      }
    </motion.div>
  )
}

// Portfolio (with sparkline)
function PortfolioContent() {
  const [hov,setHov]=useState(false)
  return (
    <div style={{height:'100%',overflowY:'auto',padding:'16px'}}>
      <div style={{marginBottom:6}}>
        <span style={{fontFamily:'var(--font-mono)',fontSize:9,letterSpacing:'0.18em',textTransform:'uppercase',color:C28}}>Total P&amp;L</span>
      </div>
      <div style={{fontFamily:'var(--font-display)',fontSize:32,fontWeight:800,letterSpacing:'-0.04em',color:C,marginBottom:6}}>+$12.4k</div>
      <div style={{fontFamily:'var(--font-sans)',fontSize:13,color:POS,marginBottom:20,fontWeight:500}}>+18.2% this month</div>
      <div style={{borderRadius:14,overflow:'hidden',background:'rgba(52,211,153,0.06)',border:`1px solid rgba(52,211,153,0.15)`,padding:'10px 4px 4px'}}>
        <Sparkline color={POS}/>
      </div>
      <Link to="/portfolio" style={{textDecoration:'none'}}>
        <motion.div whileHover={{scale:1.02}} transition={{type:'spring',stiffness:400,damping:28}}
          style={{marginTop:14,padding:'10px 16px',borderRadius:12,background:'rgba(52,211,153,0.10)',border:`1px solid rgba(52,211,153,0.25)`,cursor:'pointer',textAlign:'center'}}>
          <span style={{fontFamily:'var(--font-sans)',fontSize:12,fontWeight:600,color:POS}}>View Full Portfolio →</span>
        </motion.div>
      </Link>
    </div>
  )
}

// Paper Trading
function PaperContent() {
  const ROWS = [
    {label:'Simulated Position: NVDA', sub:'Long · 100 shares · +12.84%', accent:true},
    {label:'Risk Exposure: Medium',    sub:'Max drawdown: 4.2%',           accent:false},
    {label:'Available Cash',           sub:'$25,000.00',                   accent:false},
  ]
  return (
    <div style={{height:'100%',overflowY:'auto',padding:'10px'}}>
      {ROWS.map(r=>(
        <motion.div key={r.label} whileHover={{x:3}} transition={{type:'spring',stiffness:500,damping:35}}
          style={{padding:'14px 16px',borderRadius:12,marginBottom:8,background:r.accent?'rgba(52,211,153,0.07)':'rgba(255,255,255,0.04)',border:`1px solid ${r.accent?'rgba(52,211,153,0.22)':BD}`,cursor:'default'}}
        >
          <div style={{fontFamily:'var(--font-sans)',fontSize:13,fontWeight:500,color:C,marginBottom:4}}>{r.label}</div>
          <div style={{fontFamily:'var(--font-mono)',fontSize:10,color:r.accent?POS:C50,letterSpacing:'0.04em'}}>{r.sub}</div>
        </motion.div>
      ))}
      <Link to="/paper-trading" style={{textDecoration:'none'}}>
        <motion.div whileHover={{y:-2}} transition={{type:'spring',stiffness:400,damping:28}}
          style={{marginTop:4,padding:'12px',borderRadius:12,background:'linear-gradient(135deg,rgba(90,65,188,0.55),rgba(44,32,108,0.70))',border:'1px solid rgba(145,112,255,0.40)',cursor:'pointer',textAlign:'center'}}>
          <span style={{fontFamily:'var(--font-sans)',fontSize:13,fontWeight:600,color:'rgba(210,190,255,0.92)'}}>Execute Simulation →</span>
        </motion.div>
      </Link>
      {/* Gradient bar at bottom */}
      <div style={{marginTop:12,height:4,borderRadius:2,background:'linear-gradient(90deg,rgba(90,65,188,0.5),rgba(52,211,153,0.5))'}}/>
    </div>
  )
}

// Macro
function MacroContent() {
  return <div style={{height:'100%',overflowY:'auto',padding:'10px 12px'}}><MacroCalendar/></div>
}

// Groups
function GroupsContent() {
  const { user } = useAuth()
  const { data: groups=[] } = useGetGroupsQuery(undefined,{skip:!user})
  return (
    <div style={{height:'100%',overflowY:'auto',padding:'10px'}}>
      {groups.length===0&&(
        <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:12,paddingTop:20}}>
          <span style={{fontFamily:'var(--font-sans)',fontSize:13,color:C50}}>No groups yet</span>
          <Link to="/groups" style={{textDecoration:'none'}}>
            <div style={{padding:'8px 18px',borderRadius:10,background:'rgba(255,255,255,0.06)',border:`1px solid ${BD}`,fontFamily:'var(--font-sans)',fontSize:12,color:C75,cursor:'pointer'}}>Browse Groups →</div>
          </Link>
        </div>
      )}
      {groups.slice(0,8).map(g=>(
        <Link key={g.id} to={`/groups/${g.id}`} style={{textDecoration:'none'}}>
          <motion.div whileHover={{x:3}} transition={{type:'spring',stiffness:500,damping:35}}
            style={{display:'flex',alignItems:'center',gap:12,padding:'10px 12px',borderRadius:12,marginBottom:6,background:'rgba(255,255,255,0.04)',border:`1px solid ${BD}`,cursor:'pointer',transition:'background 160ms'}}
            onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.08)'}
            onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,0.04)'}
          >
            <div style={{width:36,height:36,borderRadius:'50%',background:'rgba(255,255,255,0.10)',border:`1px solid ${BD}`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              <span style={{fontFamily:'var(--font-mono)',fontSize:11,fontWeight:700,color:C75}}>{(g.name||'?').slice(0,2).toUpperCase()}</span>
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontFamily:'var(--font-sans)',fontSize:13,fontWeight:500,color:C,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{g.name}</div>
              <div style={{fontFamily:'var(--font-mono)',fontSize:9,color:C28,letterSpacing:'0.08em'}}>{g.memberCount??0} members</div>
            </div>
          </motion.div>
        </Link>
      ))}
    </div>
  )
}

// ── Module config ─────────────────────────────────────────────────────────────
const MOD_META = {
  stats:     {title:'Market Stats',       sub:'Live'},
  news:      {title:'Intelligence Feed',  sub:'Realtime · AI'},
  watch:     {title:'Watchlist',          sub:''},
  portfolio: {title:'Portfolio',          sub:'P&L'},
  paper:     {title:'Paper Trading',      sub:'Simulation'},
  macro:     {title:'Macro Calendar',     sub:'Events'},
  groups:    {title:'Trading Rooms',      sub:'Community'},
}
function ModContent({ id }) {
  if (id==='stats')     return <StatsContent/>
  if (id==='news')      return <NewsContent/>
  if (id==='watch')     return <WatchContent/>
  if (id==='portfolio') return <PortfolioContent/>
  if (id==='paper')     return <PaperContent/>
  if (id==='macro')     return <MacroContent/>
  if (id==='groups')    return <GroupsContent/>
  return null
}

// ── Workspace column (panels stacked with gap handles) ────────────────────────
function WorkspaceCol({ mods, colRef, rowSplit, onRowDrag, colSide, onClose }) {
  const rowDrag = useDrag(colRef, 'y', v => onRowDrag(colSide, v))
  if (mods.length === 0) return <EmptyCol/>

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',gap:0}}>
      {mods.map((id,i) => {
        const flexVal = mods.length===1 ? 1 : (i===0 ? rowSplit : 1-rowSplit)
        return (
          <div key={id} style={{display:'flex',flexDirection:'column',flex:flexVal,minHeight:120}}>
            <AnimatePresence>
              <motion.div key={id} initial={{opacity:0,scale:0.96}} animate={{opacity:1,scale:1}} exit={{opacity:0,scale:0.96}}
                transition={{duration:0.22,ease:[0.16,1,0.3,1]}} style={{flex:1,display:'flex',flexDirection:'column',minHeight:0}}
              >
                <Panel id={id} title={MOD_META[id]?.title||id} sub={MOD_META[id]?.sub||''} onClose={onClose} style={{flex:1}}>
                  <ModContent id={id}/>
                </Panel>
              </motion.div>
            </AnimatePresence>
            {i < mods.length-1 && <RowHandle onMouseDown={rowDrag}/>}
          </div>
        )
      })}
    </div>
  )
}

function EmptyCol() {
  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:10,opacity:0.4}}>
      <div style={{width:40,height:40,borderRadius:12,border:`1.5px dashed ${BD}`,display:'flex',alignItems:'center',justifyContent:'center'}}>
        <span style={{fontFamily:'var(--font-sans)',fontSize:20,color:C28}}>+</span>
      </div>
      <span style={{fontFamily:'var(--font-mono)',fontSize:10,letterSpacing:'0.14em',textTransform:'uppercase',color:C28}}>Empty panel</span>
    </div>
  )
}

// ── Command bar / top bar ─────────────────────────────────────────────────────
const ALL_TICKERS = ['AAPL','MSFT','NVDA','TSLA','AMZN','GOOGL','META','SPY','QQQ','BTC','ETH','AMD','NFLX','JPM','GLD','TLT','INTC']
const SPAWNABLE = [
  {id:'portfolio', label:'Portfolio', icon:'◈'},
  {id:'news',      label:'Feed',      icon:'◉'},
  {id:'watch',     label:'Watchlist', icon:'▤'},
  {id:'stats',     label:'Stats',     icon:'▲'},
  {id:'macro',     label:'Macro',     icon:'◇'},
  {id:'paper',     label:'Trading',   icon:'▶'},
  {id:'groups',    label:'Rooms',     icon:'◎'},
]

function TopBar({ onToggle, activeModules }) {
  const [q,setQ]=useState(''), [focused,setFocused]=useState(false), [showModules,setShowModules]=useState(false)
  const results = q.length>=1 ? ALL_TICKERS.filter(t=>t.startsWith(q.toUpperCase())).slice(0,6) : []

  return (
    <div style={{height:64,flexShrink:0,display:'flex',alignItems:'center',padding:'0 24px',gap:20,borderBottom:`1px solid rgba(255,255,255,0.07)`,background:'rgba(13,13,16,0.95)',backdropFilter:'blur(24px)',WebkitBackdropFilter:'blur(24px)',zIndex:10,position:'relative'}}>
      {/* Search */}
      <div style={{flex:1,maxWidth:600,position:'relative'}}>
        <span style={{position:'absolute',left:14,top:'50%',transform:'translateY(-50%)',fontFamily:'var(--font-sans)',fontSize:16,color:C28,pointerEvents:'none'}}>⌕</span>
        <input
          value={q} onChange={e=>setQ(e.target.value)}
          onFocus={()=>setFocused(true)} onBlur={()=>setTimeout(()=>setFocused(false),180)}
          placeholder="Search ticker and drag into workspace..."
          style={{width:'100%',background:'rgba(255,255,255,0.07)',border:`1px solid ${focused?'rgba(255,255,255,0.20)':BD}`,borderRadius:12,padding:'9px 14px 9px 38px',fontFamily:'var(--font-mono)',fontSize:12,color:C,outline:'none',transition:'border 200ms',letterSpacing:'0.04em'}}
        />
        <AnimatePresence>
          {focused && results.length>0 && (
            <motion.div initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:0.15}}
              style={{position:'absolute',top:'calc(100% + 8px)',left:0,right:0,background:GLS,border:`1px solid ${GBD}`,borderRadius:14,overflow:'hidden',backdropFilter:'blur(28px)',WebkitBackdropFilter:'blur(28px)',boxShadow:'0 20px 60px rgba(0,0,0,0.7)',zIndex:200}}
            >
              {results.map(t=>(
                <div key={t} onMouseDown={()=>{setQ('');setFocused(false)}}
                  style={{padding:'11px 16px',cursor:'pointer',display:'flex',alignItems:'center',gap:14,borderBottom:`1px solid rgba(255,255,255,0.05)`}}
                  onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.07)'}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}
                >
                  <span style={{fontFamily:'var(--font-mono)',fontSize:13,fontWeight:700,letterSpacing:'0.10em',color:C}}>{t}</span>
                  <TickerPeek ticker={t}/>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Add Module */}
      <div style={{position:'relative',flexShrink:0}}>
        <motion.button
          onClick={()=>setShowModules(v=>!v)}
          whileHover={{scale:1.04}} whileTap={{scale:0.97}} transition={{type:'spring',stiffness:400,damping:26}}
          style={{display:'flex',alignItems:'center',gap:8,padding:'9px 18px',borderRadius:12,background:'rgba(52,140,180,0.25)',border:'1px solid rgba(52,180,220,0.35)',cursor:'pointer',fontFamily:'var(--font-sans)',fontSize:13,fontWeight:600,color:'rgba(140,220,255,0.90)'}}
        >
          <span style={{fontSize:16,lineHeight:1}}>+</span> Add Module
        </motion.button>
        <AnimatePresence>
          {showModules && (
            <motion.div initial={{opacity:0,y:-8,scale:0.96}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:-8,scale:0.96}} transition={{duration:0.18,ease:[0.16,1,0.3,1]}}
              style={{position:'absolute',top:'calc(100% + 10px)',right:0,background:GLS,border:`1px solid ${GBD}`,borderRadius:16,padding:8,backdropFilter:'blur(28px)',WebkitBackdropFilter:'blur(28px)',boxShadow:'0 20px 60px rgba(0,0,0,0.7)',zIndex:200,minWidth:180}}
            >
              {SPAWNABLE.map(s=>{
                const active=activeModules.includes(s.id)
                return (
                  <div key={s.id} onClick={()=>{onToggle(s.id);setShowModules(false)}}
                    style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',borderRadius:10,cursor:'pointer',background:active?'rgba(90,65,188,0.20)':'transparent',color:active?'rgba(200,180,255,0.90)':C75,transition:'background 160ms,color 160ms',marginBottom:2}}
                    onMouseEnter={e=>{if(!active){e.currentTarget.style.background='rgba(255,255,255,0.07)';e.currentTarget.style.color=C}}}
                    onMouseLeave={e=>{if(!active){e.currentTarget.style.background='transparent';e.currentTarget.style.color=C75}}}
                  >
                    <span style={{fontFamily:'var(--font-mono)',fontSize:12}}>{s.icon}</span>
                    <span style={{fontFamily:'var(--font-sans)',fontSize:13,fontWeight:500}}>{s.label}</span>
                    {active&&<span style={{marginLeft:'auto',fontFamily:'var(--font-mono)',fontSize:9,color:'rgba(145,112,255,0.8)'}}>✓</span>}
                  </div>
                )
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Live */}
      <LiveBadge/>
    </div>
  )
}

function TickerPeek({ ticker }) {
  const {data}=useGetStockQuery(ticker)
  const price=data?.price??null, ch=data?.changePercent??data?.changePercent24h??null, pos=ch!==null&&ch>=0
  if (!price) return <span style={{fontFamily:'var(--font-mono)',fontSize:10,color:C28}}>…</span>
  return <span style={{fontFamily:'var(--font-mono)',fontSize:10,color:pos?POS:NEG}}>${fmt(price)} {pos?'+':''}{ch?.toFixed(2)}%</span>
}

function LiveBadge() {
  const [on,setOn]=useState(true)
  const h=new Date().getHours(), open=h>=9&&h<16&&![0,6].includes(new Date().getDay())
  // eslint-disable-next-line
  useState(()=>{ if(!open) return; const id=setInterval(()=>setOn(v=>!v),900); return ()=>clearInterval(id) })
  return (
    <div style={{display:'flex',alignItems:'center',gap:7,padding:'6px 13px',borderRadius:999,background:C12,border:`1px solid ${BD}`,flexShrink:0}}>
      <span style={{width:6,height:6,borderRadius:'50%',background:open?(on?POS:'rgba(52,211,153,0.3)'):C28,transition:'background 500ms ease'}}/>
      <span style={{fontFamily:'var(--font-mono)',fontSize:10,letterSpacing:'0.18em',color:open?C75:C50}}>{open?'LIVE':'CLOSED'}</span>
    </div>
  )
}

// ── Bottom dock ───────────────────────────────────────────────────────────────
const DOCK = [
  {id:'portfolio', label:'Portfolio', icon:'◈'},
  {id:'news',      label:'Feed',      icon:'◉'},
  {id:'watch',     label:'Watchlist', icon:'▤'},
  {id:'stats',     label:'Stats',     icon:'▲'},
  {id:'paper',     label:'Trading',   icon:'▶'},
  {id:'macro',     label:'Macro',     icon:'◇'},
  {id:'groups',    label:'Rooms',     icon:'◎'},
  {id:'-',         label:'Alerts',    icon:'◬', to:'/alerts'},
  {id:'-s',        label:'Settings',  icon:'⚙', to:'/settings'},
]

function DockBtn({ item, active, onToggle }) {
  const [hov,setHov]=useState(false)
  const isNav=!!item.to
  const inner = (
    <motion.div onHoverStart={()=>setHov(true)} onHoverEnd={()=>setHov(false)}
      whileHover={{y:-10,scale:1.22}} transition={{type:'spring',stiffness:420,damping:22}}
      onClick={isNav?undefined:()=>onToggle(item.id)}
      style={{display:'flex',flexDirection:'column',alignItems:'center',gap:5,padding:'8px 14px',borderRadius:14,cursor:'pointer',
        background:active?'rgba(90,65,188,0.25)':(hov?'rgba(255,255,255,0.10)':'transparent'),
        border:`1px solid ${active?'rgba(145,112,255,0.42)':(hov?BD:'transparent')}`,
        transition:'background 180ms,border 180ms',flexShrink:0}}
    >
      <span style={{fontFamily:'var(--font-mono)',fontSize:17,color:active?'rgba(200,180,255,0.90)':(hov?C:C50),transition:'color 180ms'}}>{item.icon}</span>
      <span style={{fontFamily:'var(--font-mono)',fontSize:8,letterSpacing:'0.18em',textTransform:'uppercase',color:active?'rgba(175,155,255,0.75)':(hov?C50:C28),transition:'color 180ms',whiteSpace:'nowrap'}}>{item.label}</span>
    </motion.div>
  )
  if (isNav) return <Link to={item.to} style={{textDecoration:'none'}}>{inner}</Link>
  return inner
}

function BottomDock({ activeModules, onToggle }) {
  return (
    <div style={{position:'absolute',bottom:14,left:'50%',transform:'translateX(-50%)',zIndex:50,display:'flex',alignItems:'center',gap:2,padding:'7px 14px',borderRadius:24,background:GLS,border:`1px solid ${GBD}`,backdropFilter:'blur(28px)',WebkitBackdropFilter:'blur(28px)',boxShadow:'0 -4px 40px rgba(0,0,0,0.5)'}}>
      {DOCK.map(item=><DockBtn key={item.id} item={item} active={activeModules.includes(item.id)} onToggle={onToggle}/>)}
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [colSplit, setColSplit]   = useState(0.60)
  const [leftMods,  setLeftMods]  = useState(['portfolio','news'])
  const [rightMods, setRightMods] = useState(['watch','paper'])
  const [leftRow,   setLeftRow]   = useState(0.38)
  const [rightRow,  setRightRow]  = useState(0.50)
  const wsRef = useRef(null)

  const activeModules = [...leftMods, ...rightMods]

  const colDrag  = useDrag(wsRef,'x', setColSplit)
  const rowDrag  = useCallback((side,v) => side==='left'?setLeftRow(v):setRightRow(v), [])

  const toggleModule = useCallback(id => {
    setLeftMods(prev => {
      if (prev.includes(id)) return prev.filter(m=>m!==id)
      return prev
    })
    setRightMods(prev => {
      if (prev.includes(id)) { return prev.filter(m=>m!==id) }
      // add to shorter column
      const ll = leftMods.filter(m=>m!==id).length
      const rl = prev.length
      if (ll <= rl) { setLeftMods(lp => lp.includes(id)?lp:[...lp.filter(m=>m!==id),id]); return prev }
      return [...prev, id]
    })
  }, [leftMods])

  const closeModule = useCallback(id => {
    setLeftMods(prev=>prev.filter(m=>m!==id))
    setRightMods(prev=>prev.filter(m=>m!==id))
  }, [])

  return (
    <div style={{position:'fixed',inset:0,zIndex:200,background:CANVAS,display:'flex',flexDirection:'column',overflow:'hidden',fontFamily:'var(--font-sans)'}}>

      {/* ── Cinematic background ── */}
      <div style={{position:'absolute',inset:0,pointerEvents:'none',zIndex:0}}>
        <div style={{position:'absolute',inset:0,backgroundImage:`radial-gradient(circle,rgba(255,255,255,0.035) 1px,transparent 1px)`,backgroundSize:'26px 26px',opacity:0.7}}/>
        <div style={{position:'absolute',top:'-20%',left:'15%',width:'55%',height:'65%',background:'radial-gradient(ellipse,rgba(70,50,170,0.08) 0%,transparent 70%)',pointerEvents:'none'}}/>
        <div style={{position:'absolute',bottom:'-15%',right:'10%',width:'50%',height:'60%',background:'radial-gradient(ellipse,rgba(30,120,90,0.06) 0%,transparent 70%)',pointerEvents:'none'}}/>
      </div>

      {/* ── Top bar ── */}
      <TopBar onToggle={toggleModule} activeModules={activeModules}/>

      {/* ── Workspace ── */}
      <div ref={wsRef} style={{position:'relative',zIndex:1,flex:1,display:'flex',padding:`${EDGE}px`,gap:0,overflow:'hidden',minHeight:0}}>
        {/* Left column */}
        <div style={{width:`calc(${colSplit*100}% - ${GAP/2}px)`,display:'flex',flexDirection:'column',minWidth:0}}>
          <WorkspaceCol mods={leftMods} colRef={wsRef} rowSplit={leftRow} onRowDrag={rowDrag} colSide="left" onClose={closeModule}/>
        </div>

        {/* Column handle */}
        <ColHandle onMouseDown={colDrag}/>

        {/* Right column */}
        <div style={{flex:1,display:'flex',flexDirection:'column',minWidth:0}}>
          <WorkspaceCol mods={rightMods} colRef={wsRef} rowSplit={rightRow} onRowDrag={rowDrag} colSide="right" onClose={closeModule}/>
        </div>
      </div>

      {/* ── Bottom dock ── */}
      <BottomDock activeModules={activeModules} onToggle={toggleModule}/>
    </div>
  )
}
