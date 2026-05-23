import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import Logo from '../components/Logo'

// ─── Palette ──────────────────────────────────────────────────────────────────
const DARK   = '#0b0b0b'
const CREAM  = '#f0ebe0'
const GOLD   = '#c9a86a'
const MUTED  = 'rgba(240,235,224,0.36)'
const BORDER = 'rgba(240,235,224,0.09)'

// ─── Hooks ────────────────────────────────────────────────────────────────────
function useInView(threshold = 0.1) {
  const ref = useRef(null)
  const [vis, setVis] = useState(false)
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVis(true); obs.disconnect() }
    }, { threshold })
    if (ref.current) obs.observe(ref.current)
    return () => obs.disconnect()
  }, [threshold])
  return [ref, vis]
}

function useCounter(target, visible, dur = 2400) {
  const [v, setV] = useState(0)
  useEffect(() => {
    if (!visible) return
    let s = null
    const tick = ts => {
      if (!s) s = ts
      const p = Math.min((ts - s) / dur, 1)
      setV(Math.round((1 - Math.pow(1 - p, 4)) * target))
      if (p < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [visible, target, dur])
  return v
}

// ─── Cursor ───────────────────────────────────────────────────────────────────
function Cursor() {
  const dot  = useRef(null)
  const ring = useRef(null)
  const pos  = useRef({ x: -300, y: -300 })
  const rp   = useRef({ x: -300, y: -300 })
  const sc   = useRef(1)
  const tsc  = useRef(1)

  useEffect(() => {
    const mv = e => { pos.current = { x: e.clientX, y: e.clientY } }
    const ov = e => { if (e.target.closest('a,button')) tsc.current = 2.6 }
    const ou = e => { if (e.target.closest('a,button')) tsc.current = 1 }
    document.addEventListener('mousemove', mv)
    document.addEventListener('mouseover', ov)
    document.addEventListener('mouseout',  ou)
    let raf
    const loop = () => {
      rp.current.x += (pos.current.x - rp.current.x) * 0.09
      rp.current.y += (pos.current.y - rp.current.y) * 0.09
      sc.current    += (tsc.current - sc.current) * 0.12
      if (dot.current)  dot.current.style.transform  = `translate(${pos.current.x-3}px,${pos.current.y-3}px)`
      if (ring.current) ring.current.style.transform = `translate(${rp.current.x-20}px,${rp.current.y-20}px) scale(${sc.current})`
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => { document.removeEventListener('mousemove',mv); document.removeEventListener('mouseover',ov); document.removeEventListener('mouseout',ou); cancelAnimationFrame(raf) }
  }, [])

  return <>
    <div ref={dot}  style={{ position:'fixed',top:0,left:0,zIndex:9999,pointerEvents:'none',width:6,height:6,borderRadius:'50%',background:CREAM,mixBlendMode:'difference' }} />
    <div ref={ring} style={{ position:'fixed',top:0,left:0,zIndex:9998,pointerEvents:'none',width:40,height:40,borderRadius:'50%',border:`1px solid ${CREAM}`,mixBlendMode:'difference' }} />
  </>
}

// ─── Preloader ────────────────────────────────────────────────────────────────
function Preloader({ onDone }) {
  const [out, setOut] = useState(false)
  useEffect(() => {
    const t1 = setTimeout(() => setOut(true), 1000)
    const t2 = setTimeout(onDone, 1650)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [onDone])

  return (
    <div style={{ position:'fixed',inset:0,zIndex:10000,background:DARK,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:'24px',opacity:out?0:1,transition:'opacity 0.6s ease',pointerEvents:out?'none':'all' }}>
      <div style={{ width:'1px',height:'60px',background:`linear-gradient(to bottom,transparent,${MUTED})`,animation:'preload-line 1s ease forwards' }} />
      <span style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:'10px',fontWeight:500,letterSpacing:'0.3em',textTransform:'uppercase',color:MUTED }}>Loading</span>
    </div>
  )
}

// ─── Primitives ───────────────────────────────────────────────────────────────

// Clip reveal: children slide up from hidden overflow
function Clip({ children, vis, delay=0, style }) {
  return (
    <div style={{ overflow:'hidden', ...style }}>
      <div style={{ transform:vis?'translateY(0)':'translateY(108%)', transition:`transform 1.05s cubic-bezier(0.16,1,0.3,1) ${delay}ms` }}>
        {children}
      </div>
    </div>
  )
}

// Horizontal rule that draws from left to right
function Rule({ vis, delay=0, color=BORDER }) {
  return <div style={{ height:'1px',background:color,transformOrigin:'left',transform:vis?'scaleX(1)':'scaleX(0)',transition:`transform 1.5s cubic-bezier(0.16,1,0.3,1) ${delay}ms` }} />
}

// Tiny allcaps mono label
function Tag({ children, dark=false, style }) {
  return <span style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:'10px',fontWeight:500,letterSpacing:'0.24em',textTransform:'uppercase',color:dark?'rgba(11,11,11,0.38)':MUTED,...style }}>{children}</span>
}

// ─── Nav ──────────────────────────────────────────────────────────────────────
function Nav() {
  const [past, setPast] = useState(false)
  useEffect(() => {
    const h = () => setPast(window.scrollY > 60)
    window.addEventListener('scroll', h, { passive:true })
    return () => window.removeEventListener('scroll', h)
  }, [])

  return (
    <nav style={{ position:'fixed',top:0,left:0,right:0,zIndex:100,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 48px',height:'58px',background:past?'rgba(11,11,11,0.94)':'transparent',backdropFilter:past?'blur(24px)':'none',WebkitBackdropFilter:past?'blur(24px)':'none',borderBottom:past?`1px solid ${BORDER}`:'1px solid transparent',transition:'all 0.5s ease' }}>
      <Logo size="sm" />
      <div style={{ display:'flex',alignItems:'center',gap:'28px' }}>
        <Link to="/pricing" style={{ fontFamily:"'Syne',sans-serif",fontSize:'11px',fontWeight:600,letterSpacing:'0.1em',textTransform:'uppercase',color:MUTED,textDecoration:'none',transition:'color 0.2s' }} onMouseEnter={e=>e.currentTarget.style.color=CREAM} onMouseLeave={e=>e.currentTarget.style.color=MUTED}>Pricing</Link>
        <Link to="/onboarding" style={{ fontFamily:"'Syne',sans-serif",fontSize:'11px',fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase',color:DARK,background:CREAM,padding:'9px 22px',borderRadius:'2px',textDecoration:'none',transition:'opacity 0.2s' }} onMouseEnter={e=>e.currentTarget.style.opacity='0.8'} onMouseLeave={e=>e.currentTarget.style.opacity='1'}>Get started</Link>
      </div>
    </nav>
  )
}

// ─── Hero ─────────────────────────────────────────────────────────────────────
function Hero() {
  const [rdy, setRdy] = useState(false)
  useEffect(() => { const t = setTimeout(() => setRdy(true), 300); return () => clearTimeout(t) }, [])

  const line = (text, delay, outline=false, indent='0px') => (
    <div style={{ overflow:'hidden', lineHeight:'0.9', marginLeft:indent }}>
      <div style={{ fontFamily:"'Cormorant Garamond',Georgia,serif", fontSize:'clamp(76px,13.5vw,196px)', fontWeight:300, fontStyle:'italic', letterSpacing:'-0.04em', color:outline?'transparent':CREAM, WebkitTextStroke:outline?`1px ${CREAM}`:undefined, transform:rdy?'translateY(0)':'translateY(108%)', transition:`transform 1.15s cubic-bezier(0.16,1,0.3,1) ${delay}ms` }}>
        {text}
      </div>
    </div>
  )

  return (
    <section style={{ position:'relative',height:'100vh',background:DARK,display:'flex',flexDirection:'column',justifyContent:'flex-end',padding:'0 48px 68px',overflow:'hidden' }}>
      {/* top-right corner labels */}
      <div style={{ position:'absolute',top:76,right:48,display:'flex',alignItems:'center',gap:16,opacity:rdy?1:0,transition:'opacity 0.8s ease 900ms' }}>
        <Tag>Market Intelligence</Tag>
        <div style={{ width:28,height:1,background:BORDER }} />
        <Tag>Est. 2026</Tag>
      </div>

      {/* The three display lines */}
      <div style={{ position:'relative',zIndex:2,marginBottom:2 }}>
        {line('The', 0)}
        {line('Market,', 80, false, '7vw')}

        {/* Animated divider */}
        <div style={{ height:1,background:BORDER,margin:'22px 0',transformOrigin:'left',transform:rdy?'scaleX(1)':'scaleX(0)',transition:'transform 1.4s cubic-bezier(0.16,1,0.3,1) 280ms' }} />

        {line('Explained.', 160, true, '16vw')}
      </div>

      {/* Bottom row */}
      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-end',marginTop:48,flexWrap:'wrap',gap:24,position:'relative',zIndex:2 }}>
        <p style={{ fontFamily:"'Syne',sans-serif",fontSize:'clamp(12px,1.3vw,15px)',lineHeight:1.9,color:MUTED,maxWidth:310,opacity:rdy?1:0,transform:rdy?'none':'translateY(16px)',transition:'opacity 0.9s ease 700ms, transform 0.9s ease 700ms' }}>
          Real-time market intelligence<br/>in plain English. No jargon.
        </p>
        <div style={{ opacity:rdy?1:0,transition:'opacity 0.9s ease 800ms' }}>
          <Link to="/onboarding" style={{ display:'inline-flex',alignItems:'center',gap:12,fontFamily:"'Syne',sans-serif",fontSize:'11px',fontWeight:700,letterSpacing:'0.09em',textTransform:'uppercase',color:DARK,background:CREAM,padding:'14px 30px',borderRadius:'2px',textDecoration:'none',transition:'opacity 0.2s,transform 0.2s' }} onMouseEnter={e=>{e.currentTarget.style.opacity='0.82';e.currentTarget.style.transform='translateY(-2px)'}} onMouseLeave={e=>{e.currentTarget.style.opacity='1';e.currentTarget.style.transform='translateY(0)'}}>
            Get started free
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </Link>
        </div>
      </div>

      {/* Scroll drip */}
      <div style={{ position:'absolute',bottom:32,right:52,opacity:rdy?1:0,transition:'opacity 1s ease 1000ms' }}>
        <div style={{ display:'flex',flexDirection:'column',alignItems:'center',gap:8 }}>
          <Tag>Scroll</Tag>
          <div style={{ width:1,height:48,background:`linear-gradient(to bottom,transparent,${MUTED})`,animation:'drip 2.4s ease-in-out infinite' }} />
        </div>
      </div>
    </section>
  )
}

// ─── Marquee ──────────────────────────────────────────────────────────────────
function Ticker() {
  const words = ['Real-time intelligence','AI-powered','Portfolio impact','Market signals','Plain English','Act with confidence','No jargon','Urgency scoring']
  const all = [...words,...words,...words]
  return (
    <div style={{ background:CREAM,overflow:'hidden',padding:'13px 0' }}>
      <div style={{ display:'flex',animation:'marquee 32s linear infinite',width:'max-content' }}>
        {all.map((w,i) => (
          <span key={i} style={{ fontFamily:"'Syne',sans-serif",fontSize:'11px',fontWeight:600,letterSpacing:'0.2em',textTransform:'uppercase',color:'rgba(11,11,11,0.3)',whiteSpace:'nowrap',padding:'0 26px' }}>
            {w}<span style={{ marginLeft:26,opacity:0.2 }}>×</span>
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── Intro (cream) ────────────────────────────────────────────────────────────
function Intro() {
  const [ref, vis] = useInView(0.08)
  return (
    <section ref={ref} style={{ background:CREAM,padding:'110px 48px 100px' }}>
      <div style={{ maxWidth:1360,margin:'0 auto' }}>
        <div style={{ display:'grid',gridTemplateColumns:'220px 1fr',gap:80,alignItems:'start' }}>
          {/* Left */}
          <div style={{ paddingTop:10 }}>
            <Rule vis={vis} color="rgba(11,11,11,0.14)" />
            <div style={{ marginTop:18 }}><Tag dark>What we built</Tag></div>
          </div>
          {/* Right: editorial statement */}
          <div>
            {['We built the intelligence','layer the market never had.'].map((ln,i) => (
              <Clip key={i} vis={vis} delay={i*90} style={{ lineHeight:'1.02', marginBottom:2 }}>
                <span style={{ fontFamily:"'Cormorant Garamond',Georgia,serif",fontSize:'clamp(30px,4.8vw,70px)',fontWeight:400,letterSpacing:'-0.028em',color:DARK,fontStyle:i===1?'italic':'normal' }}>{ln}</span>
              </Clip>
            ))}
            <div style={{ marginTop:44,opacity:vis?1:0,transition:'opacity 0.9s ease 250ms' }}>
              <p style={{ fontFamily:"'Syne',sans-serif",fontSize:15,lineHeight:1.9,color:'rgba(11,11,11,0.48)',maxWidth:460 }}>
                Real-time market events, scored for urgency by Claude AI, explained in plain English — and mapped directly to your portfolio.
              </p>
            </div>
          </div>
        </div>

        {/* Pillar strip */}
        <div style={{ marginTop:80,display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:1,background:'rgba(11,11,11,0.1)' }}>
          {[
            { n:'01', h:'Real-time feed',    b:'Live news, urgency-scored' },
            { n:'02', h:'AI summaries',      b:'Two sentences. Plain English.' },
            { n:'03', h:'Portfolio impact',  b:'Your holdings. Your risks.' },
          ].map((it,i) => (
            <div key={it.n} style={{ background:CREAM,padding:'36px 30px',opacity:vis?1:0,transform:vis?'none':'translateY(18px)',transition:`opacity 0.9s ease ${300+i*100}ms,transform 0.9s ease ${300+i*100}ms` }}>
              <Tag dark style={{ display:'block',marginBottom:18 }}>{it.n}</Tag>
              <div style={{ fontFamily:"'Syne',sans-serif",fontSize:19,fontWeight:600,letterSpacing:'-0.02em',color:DARK,marginBottom:8 }}>{it.h}</div>
              <div style={{ fontFamily:"'Syne',sans-serif",fontSize:13,color:'rgba(11,11,11,0.38)' }}>{it.b}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Features (dark, full-width rows) ─────────────────────────────────────────
function FeatRow({ n, title, body, flip=false, vis, delay=0 }) {
  const [hov, setHov] = useState(false)
  return (
    <div onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)} style={{ padding:'56px 0',borderBottom:`1px solid ${BORDER}`,background:hov?'rgba(240,235,224,0.025)':'transparent',transition:'background 0.4s' }}>
      <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:48,alignItems:'center',direction:flip?'rtl':'ltr' }}>
        <div style={{ direction:'ltr' }}>
          <div style={{ overflow:'hidden',marginBottom:14 }}>
            <div style={{ transform:vis?'translateY(0)':'translateY(110%)',transition:`transform 1s cubic-bezier(0.16,1,0.3,1) ${delay}ms` }}>
              <Tag style={{ color:hov?GOLD:MUTED }}>{n}</Tag>
            </div>
          </div>
          <div style={{ overflow:'hidden' }}>
            <div style={{ fontFamily:"'Cormorant Garamond',Georgia,serif",fontSize:'clamp(30px,4vw,60px)',fontWeight:300,fontStyle:'italic',letterSpacing:'-0.03em',color:CREAM,lineHeight:'1.0',transform:vis?'translateY(0)':'translateY(110%)',transition:`transform 1s cubic-bezier(0.16,1,0.3,1) ${delay+55}ms` }}>
              {title}
            </div>
          </div>
        </div>
        <div style={{ direction:'ltr' }}>
          <p style={{ fontFamily:"'Syne',sans-serif",fontSize:15,lineHeight:1.85,color:MUTED,maxWidth:380,opacity:vis?1:0,transition:`opacity 0.9s ease ${delay+200}ms` }}>{body}</p>
          {/* Gold accent grows on hover */}
          <div style={{ marginTop:24,height:1,background:GOLD,maxWidth:100,transformOrigin:'left',transform:hov?'scaleX(1)':'scaleX(0)',transition:'transform 0.55s cubic-bezier(0.16,1,0.3,1)' }} />
        </div>
      </div>
    </div>
  )
}

function Features() {
  const [ref, vis] = useInView(0.04)
  const rows = [
    { n:'01/', title:'Real-time feed',     body:'Live news scored for urgency. Know in seconds whether to act — or completely ignore.',           flip:false },
    { n:'02/', title:'AI summaries',       body:'Every event explained in two sentences. Claude AI translates finance into plain language.',       flip:true  },
    { n:'03/', title:'Portfolio impact',   body:'Tell us what you hold. We tell you exactly what each event means for your specific positions.',   flip:false },
  ]
  return (
    <section ref={ref} style={{ background:DARK,padding:'80px 48px 0' }}>
      <div style={{ maxWidth:1360,margin:'0 auto' }}>
        <div style={{ borderTop:`1px solid ${BORDER}`,paddingTop:72,marginBottom:0 }}>
          <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:56 }}>
            <Clip vis={vis} style={{ display:'inline-block' }}>
              <span style={{ fontFamily:"'Cormorant Garamond',Georgia,serif",fontSize:'clamp(28px,4vw,58px)',fontWeight:300,fontStyle:'italic',letterSpacing:'-0.03em',color:CREAM }}>Intelligence.</span>
            </Clip>
            <Tag>3 pillars</Tag>
          </div>
          <Rule vis={vis} />
        </div>
        {rows.map((r,i) => <FeatRow key={r.n} {...r} vis={vis} delay={i*110} />)}
        <div style={{ height:80 }} />
      </div>
    </section>
  )
}

// ─── Stats (cream) ────────────────────────────────────────────────────────────
function Stats() {
  const [ref, vis] = useInView(0.1)
  const n = useCounter(92, vis)
  return (
    <section ref={ref} style={{ background:CREAM,padding:'100px 48px' }}>
      <div style={{ maxWidth:1360,margin:'0 auto' }}>
        <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:80,alignItems:'center' }}>
          {/* Giant number */}
          <div>
            <div style={{ overflow:'hidden' }}>
              <div style={{ fontFamily:"'Cormorant Garamond',Georgia,serif",fontSize:'clamp(110px,17vw,230px)',fontWeight:300,color:DARK,lineHeight:'0.85',letterSpacing:'-0.05em',transform:vis?'translateY(0)':'translateY(25%)',transition:'transform 1.3s cubic-bezier(0.16,1,0.3,1)' }}>
                {n}<span style={{ fontSize:'0.33em',fontStyle:'italic',color:'rgba(11,11,11,0.4)' }}>%</span>
              </div>
            </div>
            <p style={{ fontFamily:"'Syne',sans-serif",fontSize:14,color:'rgba(11,11,11,0.4)',maxWidth:260,lineHeight:1.75,marginTop:18,opacity:vis?1:0,transition:'opacity 0.9s ease 300ms' }}>
              of users say they understand more in less time
            </p>
          </div>
          {/* Supporting stats */}
          <div>
            <Rule vis={vis} color="rgba(11,11,11,0.14)" />
            <div style={{ marginTop:40,display:'flex',flexDirection:'column',gap:44 }}>
              {[
                { v:'3 min',  l:'Average time to understand any major market event' },
                { v:'60%',   l:'Of retail investors miss critical signals without tools' },
                { v:'$0',    l:'Cost to get started — no credit card required' },
              ].map((s,i) => (
                <div key={i} style={{ opacity:vis?1:0,transform:vis?'none':'translateY(18px)',transition:`opacity 0.85s ease ${180+i*140}ms,transform 0.85s ease ${180+i*140}ms` }}>
                  <div style={{ fontFamily:"'Cormorant Garamond',Georgia,serif",fontSize:'clamp(26px,3.2vw,48px)',fontWeight:300,fontStyle:'italic',letterSpacing:'-0.03em',color:DARK,marginBottom:6 }}>{s.v}</div>
                  <div style={{ fontFamily:"'Syne',sans-serif",fontSize:13,color:'rgba(11,11,11,0.38)',lineHeight:1.65 }}>{s.l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── Platform (dark, floating UI mocks) ───────────────────────────────────────
function MockShell({ children, style, delay='0s' }) {
  return (
    <div style={{ background:'rgba(240,235,224,0.04)',border:'1px solid rgba(240,235,224,0.09)',borderRadius:'3px',padding:22,boxShadow:'0 36px 72px rgba(0,0,0,0.65)',animation:`float 8s ease-in-out ${delay} infinite`,...style }}>
      {children}
    </div>
  )
}

function Platform() {
  const [ref, vis] = useInView(0.07)
  return (
    <section ref={ref} style={{ background:DARK,padding:'100px 48px',overflow:'hidden' }}>
      <div style={{ maxWidth:1360,margin:'0 auto' }}>
        <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:80,alignItems:'center' }}>

          {/* Artful card composition */}
          <div style={{ position:'relative',height:480 }}>
            {/* News card — top left */}
            <div style={{ position:'absolute',top:0,left:0,opacity:vis?1:0,transform:vis?'none':'translateY(40px)',transition:'opacity 0.9s ease 0.15s,transform 0.9s ease 0.15s' }}>
              <MockShell style={{ width:260 }} delay="0s">
                <div style={{ display:'flex',gap:8,alignItems:'center',marginBottom:14 }}>
                  <div style={{ width:6,height:6,borderRadius:'50%',background:'#ef4444',flexShrink:0 }} />
                  <Tag style={{ color:'#ef4444' }}>Act Now</Tag>
                </div>
                {[86,70,52].map((w,i) => <div key={i} style={{ height:8,background:`rgba(240,235,224,${0.07-i*0.015})`,borderRadius:2,marginBottom:6,width:`${w}%` }} />)}
                <div style={{ marginTop:14,paddingTop:12,borderTop:`1px solid ${BORDER}`,display:'flex',justifyContent:'space-between' }}>
                  <Tag>2 min ago</Tag><Tag>AAPL</Tag>
                </div>
              </MockShell>
            </div>

            {/* Chart card — top right */}
            <div style={{ position:'absolute',top:60,right:0,opacity:vis?1:0,transform:vis?'none':'translateY(40px)',transition:'opacity 0.9s ease 0.3s,transform 0.9s ease 0.3s' }}>
              <MockShell style={{ width:248 }} delay="1.8s">
                <div style={{ display:'flex',justifyContent:'space-between',marginBottom:16 }}>
                  <div>
                    <Tag style={{ display:'block',marginBottom:4 }}>AAPL</Tag>
                    <div style={{ fontFamily:"'Syne',sans-serif",fontSize:20,fontWeight:600,color:CREAM,letterSpacing:'-0.025em' }}>$192.40</div>
                  </div>
                  <span style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:12,color:'#4ade80',fontWeight:500,marginTop:4 }}>+2.4%</span>
                </div>
                <svg width="200" height="50" viewBox="0 0 200 50">
                  <path d="M0,42 L28,34 L56,39 L84,20 L112,26 L140,11 L168,18 L200,5" fill="none" stroke="rgba(74,222,128,0.55)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </MockShell>
            </div>

            {/* Impact card — bottom center */}
            <div style={{ position:'absolute',bottom:0,left:56,opacity:vis?1:0,transform:vis?'none':'translateY(40px)',transition:'opacity 0.9s ease 0.46s,transform 0.9s ease 0.46s' }}>
              <MockShell style={{ width:240 }} delay="3.5s">
                <Tag style={{ display:'block',marginBottom:16 }}>Portfolio Impact</Tag>
                {[
                  { t:'AAPL',c:'#facc15',l:'Watch',  p:72 },
                  { t:'BTC', c:'#4ade80',l:'Low',    p:28 },
                  { t:'NVDA',c:'#ef4444',l:'Act Now',p:91 },
                ].map(r => (
                  <div key={r.t} style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10 }}>
                    <span style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:12,color:'rgba(240,235,224,0.5)' }}>{r.t}</span>
                    <div style={{ display:'flex',alignItems:'center',gap:8 }}>
                      <div style={{ width:44,height:2,background:'rgba(240,235,224,0.08)',borderRadius:1,overflow:'hidden' }}>
                        <div style={{ width:`${r.p}%`,height:'100%',background:r.c }} />
                      </div>
                      <span style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:9,color:r.c,fontWeight:500,width:46 }}>{r.l}</span>
                    </div>
                  </div>
                ))}
              </MockShell>
            </div>
          </div>

          {/* Text side */}
          <div>
            <Rule vis={vis} />
            <div style={{ marginTop:40 }}>
              <Clip vis={vis} delay={100} style={{ lineHeight:'1.02',marginBottom:2 }}>
                <span style={{ fontFamily:"'Cormorant Garamond',Georgia,serif",fontSize:'clamp(28px,4vw,58px)',fontWeight:300,fontStyle:'italic',letterSpacing:'-0.03em',color:CREAM }}>Everything you need.</span>
              </Clip>
              <Clip vis={vis} delay={190} style={{ lineHeight:'1.02' }}>
                <span style={{ fontFamily:"'Cormorant Garamond',Georgia,serif",fontSize:'clamp(28px,4vw,58px)',fontWeight:300,letterSpacing:'-0.03em',color:'transparent',WebkitTextStroke:`1px ${CREAM}` }}>Nothing you don't.</span>
              </Clip>
            </div>
            <p style={{ fontFamily:"'Syne',sans-serif",fontSize:14,color:MUTED,lineHeight:1.9,maxWidth:360,marginTop:32,opacity:vis?1:0,transition:'opacity 0.8s ease 0.38s' }}>
              Institutional-grade analysis, built for retail investors. No Bloomberg Terminal required.
            </p>
            <div style={{ marginTop:32,display:'flex',flexDirection:'column',gap:13 }}>
              {['AI urgency scoring on every article','Portfolio impact analysis','Government trades tracker','Real-time price alerts'].map((f,i) => (
                <div key={i} style={{ display:'flex',gap:12,alignItems:'center',opacity:vis?1:0,transition:`opacity 0.75s ease ${0.46+i*0.07}s` }}>
                  <div style={{ width:3,height:3,borderRadius:'50%',background:GOLD,flexShrink:0 }} />
                  <span style={{ fontFamily:"'Syne',sans-serif",fontSize:13,color:MUTED }}>{f}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── How (cream) ──────────────────────────────────────────────────────────────
function How() {
  const [ref, vis] = useInView(0.08)
  const steps = [
    { n:'01', h:'Build your watchlist',  b:'Add the stocks, crypto, and sectors you care about.' },
    { n:'02', h:'Get AI analysis',       b:'Every relevant event summarized and scored: Low, Watch, or Act Now.' },
    { n:'03', h:'Act with confidence',   b:'See how each event impacts your holdings — before the crowd does.' },
  ]
  return (
    <section ref={ref} style={{ background:CREAM,padding:'100px 48px' }}>
      <div style={{ maxWidth:1360,margin:'0 auto' }}>
        <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-end',marginBottom:72,flexWrap:'wrap',gap:20 }}>
          <Clip vis={vis} style={{ display:'inline-block' }}>
            <span style={{ fontFamily:"'Cormorant Garamond',Georgia,serif",fontSize:'clamp(30px,5vw,72px)',fontWeight:300,fontStyle:'italic',letterSpacing:'-0.03em',color:DARK }}>How it works.</span>
          </Clip>
          <Tag dark>Three steps</Tag>
        </div>
        <Rule vis={vis} color="rgba(11,11,11,0.12)" />
        <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:1,background:'rgba(11,11,11,0.1)',marginTop:1 }}>
          {steps.map((s,i) => (
            <div key={s.n} style={{ background:CREAM,padding:'40px 32px',opacity:vis?1:0,transform:vis?'none':'translateY(22px)',transition:`opacity 0.9s ease ${i*110}ms,transform 0.9s ease ${i*110}ms` }}>
              <Tag dark style={{ display:'block',marginBottom:28 }}>{s.n}</Tag>
              <div style={{ fontFamily:"'Syne',sans-serif",fontSize:'clamp(17px,1.9vw,24px)',fontWeight:600,letterSpacing:'-0.022em',color:DARK,lineHeight:1.15,marginBottom:14 }}>{s.h}</div>
              <div style={{ fontFamily:"'Syne',sans-serif",fontSize:14,color:'rgba(11,11,11,0.42)',lineHeight:1.82 }}>{s.b}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── CTA (dark, full-height) ──────────────────────────────────────────────────
function Cta() {
  const [ref, vis] = useInView(0.1)
  return (
    <section ref={ref} style={{ background:DARK,minHeight:'80vh',display:'flex',flexDirection:'column',justifyContent:'center',padding:'100px 48px' }}>
      <div style={{ maxWidth:1360,margin:'0 auto',width:'100%' }}>
        <Rule vis={vis} />
        <div style={{ marginTop:60 }}>
          {['Start reading', 'the market', 'differently.'].map((ln,i) => (
            <Clip key={i} vis={vis} delay={i*90} style={{ lineHeight:'0.93',marginBottom:4 }}>
              <span style={{ fontFamily:"'Cormorant Garamond',Georgia,serif",fontSize:'clamp(54px,9.5vw,148px)',fontWeight:300,fontStyle:i<2?'italic':'normal',letterSpacing:'-0.04em',color:i===2?'transparent':CREAM,WebkitTextStroke:i===2?`1px ${CREAM}`:undefined,display:'block' }}>{ln}</span>
            </Clip>
          ))}
        </div>
        <div style={{ marginTop:60,display:'flex',gap:24,alignItems:'center',flexWrap:'wrap',opacity:vis?1:0,transition:'opacity 0.9s ease 0.5s' }}>
          <Link to="/onboarding" style={{ display:'inline-flex',alignItems:'center',gap:12,fontFamily:"'Syne',sans-serif",fontSize:'11px',fontWeight:700,letterSpacing:'0.09em',textTransform:'uppercase',color:DARK,background:CREAM,padding:'16px 38px',borderRadius:'2px',textDecoration:'none',transition:'opacity 0.2s,transform 0.2s' }} onMouseEnter={e=>{e.currentTarget.style.opacity='0.8';e.currentTarget.style.transform='translateY(-2px)'}} onMouseLeave={e=>{e.currentTarget.style.opacity='1';e.currentTarget.style.transform='translateY(0)'}}>
            Get started free
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </Link>
          <Link to="/pricing" style={{ fontFamily:"'Syne',sans-serif",fontSize:'11px',fontWeight:600,letterSpacing:'0.09em',textTransform:'uppercase',color:MUTED,textDecoration:'none',borderBottom:`1px solid rgba(240,235,224,0.18)`,paddingBottom:2,transition:'color 0.2s,border-color 0.2s' }} onMouseEnter={e=>{e.currentTarget.style.color=CREAM;e.currentTarget.style.borderColor='rgba(240,235,224,0.5)'}} onMouseLeave={e=>{e.currentTarget.style.color=MUTED;e.currentTarget.style.borderColor='rgba(240,235,224,0.18)'}}>
            View pricing
          </Link>
        </div>
      </div>
    </section>
  )
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer style={{ background:'#070707',borderTop:`1px solid ${BORDER}`,padding:'48px' }}>
      <div style={{ maxWidth:1360,margin:'0 auto',display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:40 }}>
        <div>
          <Logo size="sm" />
          <p style={{ fontFamily:"'Syne',sans-serif",fontSize:12,color:'rgba(240,235,224,0.2)',marginTop:14,maxWidth:220,lineHeight:1.8 }}>Market intelligence for everyone.</p>
        </div>
        <div style={{ display:'flex',gap:48,flexWrap:'wrap' }}>
          {[
            { col:'Product', links:[{n:'Features',to:'/onboarding'},{n:'Pricing',to:'/pricing'}] },
            { col:'Legal',   links:[{n:'Disclaimer',to:'#'}] },
          ].map(({ col, links }) => (
            <div key={col}>
              <Tag style={{ display:'block',marginBottom:18 }}>{col}</Tag>
              {links.map(l => (
                <Link key={l.n} to={l.to} style={{ display:'block',fontFamily:"'Syne',sans-serif",fontSize:13,color:'rgba(240,235,224,0.3)',textDecoration:'none',marginBottom:10,transition:'color 0.2s' }} onMouseEnter={e=>e.currentTarget.style.color=CREAM} onMouseLeave={e=>e.currentTarget.style.color='rgba(240,235,224,0.3)'}>{l.n}</Link>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div style={{ maxWidth:1360,margin:'32px auto 0',paddingTop:24,borderTop:`1px solid rgba(240,235,224,0.05)`,display:'flex',justifyContent:'space-between',flexWrap:'wrap',gap:10 }}>
        <Tag>© {new Date().getFullYear()} Market Intelligence</Tag>
        <Tag>For informational purposes only. Not financial advice.</Tag>
      </div>
    </footer>
  )
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function Landing() {
  const [ready, setReady] = useState(false)

  return (
    <div style={{ background:DARK, overflowX:'hidden' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400;1,600&family=Syne:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
        @font-face{font-family:'Alphazet';src:url('/fonts/Alphazet.woff2') format('woff2'),url('/fonts/Alphazet.woff') format('woff');font-display:swap;}
        *{box-sizing:border-box;margin:0;padding:0;}
        html{scroll-behavior:smooth;}

        /* Grain texture */
        body::before{content:'';position:fixed;inset:0;z-index:9997;pointer-events:none;
          background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.88' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
          background-size:180px 180px;opacity:0.033;mix-blend-mode:overlay;}

        @keyframes marquee{from{transform:translateX(0)}to{transform:translateX(-33.333%)}}
        @keyframes drip{0%{opacity:0;transform:scaleY(0.3) translateY(-14px)}55%{opacity:1;transform:scaleY(1) translateY(0)}100%{opacity:0;transform:scaleY(0.3) translateY(14px)}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
        @keyframes preload-line{from{transform:scaleY(0);opacity:0}to{transform:scaleY(1);opacity:1}}

        /* Hide system cursor on desktop */
        @media(min-width:769px){html{cursor:none;}}

        /* Mobile */
        @media(max-width:640px){
          nav{padding:0 20px!important;}
          .hero{padding:0 20px 56px!important;}
          section{padding-left:20px!important;padding-right:20px!important;}
          .intro-grid{grid-template-columns:1fr!important;}
          .pillars,.how-grid{grid-template-columns:1fr!important;}
          .plat-grid{grid-template-columns:1fr!important;}
          .stats-grid{grid-template-columns:1fr!important;}
          .mock-scene{display:none!important;}
        }
      `}</style>

      {!ready && <Preloader onDone={() => setReady(true)} />}
      {ready && <Cursor />}

      <Nav />
      <div className="hero"><Hero /></div>
      <Ticker />
      <div className="intro-grid-wrap"><Intro /></div>
      <Features />
      <div className="stats-grid-wrap"><Stats /></div>
      <Platform />
      <How />
      <Cta />
      <Footer />
    </div>
  )
}
