import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import Logo from '../components/Logo'

const SC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*-_+|;:,.<>?'

function useScramble(text, delay = 0, duration = 1600) {
  const [out, setOut] = useState('')
  useEffect(() => {
    let start = null
    let raf = null
    const tick = (ts) => {
      if (!start) start = ts
      const elapsed = ts - start - delay
      if (elapsed < 0) { raf = requestAnimationFrame(tick); return }
      const p = Math.min(elapsed / duration, 1)
      const revealed = Math.floor(p * text.length)
      setOut(text.split('').map((c, i) => {
        if (c === ' ') return ' '
        if (i < revealed) return c
        return SC[Math.floor(Math.random() * SC.length)]
      }).join(''))
      if (p < 1) raf = requestAnimationFrame(tick)
      else setOut(text)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [text, delay, duration])
  return out
}

function useInView(threshold = 0.12) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVisible(true); obs.disconnect() }
    }, { threshold })
    if (ref.current) obs.observe(ref.current)
    return () => obs.disconnect()
  }, [threshold])
  return [ref, visible]
}

function useCounter(target, visible, duration = 2200) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!visible) return
    let start = null
    const tick = (ts) => {
      if (!start) start = ts
      const p = Math.min((ts - start) / duration, 1)
      const ease = 1 - Math.pow(1 - p, 4)
      setCount(Math.round(ease * target))
      if (p < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [visible, target, duration])
  return count
}

// ── Primitive pieces ──────────────────────────────────────────────────────────

function Cross({ style, size = 18, opacity = 0.13 }) {
  return (
    <div style={{ position: 'absolute', width: size, height: size, transform: 'translate(-50%,-50%)', pointerEvents: 'none', ...style }}>
      <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '1px', background: `rgba(255,255,255,${opacity})`, transform: 'translateY(-50%)' }} />
      <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '1px', background: `rgba(255,255,255,${opacity})`, transform: 'translateX(-50%)' }} />
    </div>
  )
}

function CustomCursor() {
  const pos = useRef({ x: -200, y: -200 })
  const dot = useRef(null)
  const ring = useRef(null)
  const rp = useRef({ x: -200, y: -200 })

  useEffect(() => {
    const onMove = (e) => {
      pos.current = { x: e.clientX, y: e.clientY }
      if (dot.current) dot.current.style.transform = `translate(${e.clientX - 2}px,${e.clientY - 2}px)`
    }
    document.addEventListener('mousemove', onMove)
    let raf
    const loop = () => {
      rp.current.x += (pos.current.x - rp.current.x) * 0.09
      rp.current.y += (pos.current.y - rp.current.y) * 0.09
      if (ring.current) ring.current.style.transform = `translate(${rp.current.x - 16}px,${rp.current.y - 16}px)`
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => { document.removeEventListener('mousemove', onMove); cancelAnimationFrame(raf) }
  }, [])

  return (
    <>
      <div ref={dot} style={{ position: 'fixed', top: 0, left: 0, zIndex: 9999, pointerEvents: 'none', width: '4px', height: '4px', borderRadius: '50%', background: '#fff', mixBlendMode: 'difference' }} />
      <div ref={ring} style={{ position: 'fixed', top: 0, left: 0, zIndex: 9998, pointerEvents: 'none', width: '32px', height: '32px', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.45)', mixBlendMode: 'difference' }} />
    </>
  )
}

// ── Language ──────────────────────────────────────────────────────────────────

const LANGS = [{ code: 'en', label: 'EN' }, { code: 'fr', label: 'FR' }, { code: 'zh', label: '中文' }]

const T = {
  en: {
    tagline: 'Investment intelligence platform',
    hero1: 'The market,', hero2: 'explained.',
    heroSub: 'Real-time intelligence in plain English.\nNo jargon. No noise. Just what matters.',
    cta: 'Get started free', ctaSub: 'No credit card required',
    featLabel: 'What we built',
    featTitle: 'Intelligence\nthat actually helps.',
    features: [
      { n: '01', title: 'Real-time feed', body: 'Live news scored by urgency. Know in seconds whether to act — or ignore completely.' },
      { n: '02', title: 'AI summaries', body: 'Every event explained in two sentences. Claude AI translates finance into plain language.' },
      { n: '03', title: 'Portfolio impact', body: 'Tell us what you hold. We tell you what each event means for your specific positions.' },
    ],
    platformLabel: 'The platform',
    platformTitle: 'Everything you need.\nNothing you don\'t.',
    platformBody: 'Built for retail investors who want institutional-grade analysis without the Bloomberg Terminal price tag.',
    platformFeatures: ['AI urgency scoring on every article', 'Portfolio impact analysis', 'Government trades tracker', 'Real-time price alerts'],
    statsLabel: 'By the numbers',
    stats: [
      { value: 92, suffix: '%', label: 'of users say they understand more in less time' },
      { value: 3, suffix: 'min', label: 'average time to understand any major market event' },
      { value: 60, suffix: '%', label: 'of retail investors miss critical signals without tools' },
    ],
    howLabel: 'How it works',
    how: [
      { n: '1', title: 'Build your watchlist', body: 'Add the stocks, crypto, and sectors you care about.' },
      { n: '2', title: 'Get AI analysis', body: 'Every relevant event is summarized and scored: Low, Watch, or Act Now.' },
      { n: '3', title: 'Act with confidence', body: 'See exactly how each news event might impact your holdings — before the crowd.' },
    ],
    ctaTitle: 'Start reading the market\ndifferently.',
    ctaBtn: 'Get started free',
    viewPricing: 'View pricing →',
    footerTagline: 'Market intelligence for everyone.',
    footerDisc: 'For informational purposes only. Not financial advice.',
  },
  fr: {
    tagline: "Plateforme d'intelligence financière",
    hero1: 'Le marché,', hero2: 'expliqué.',
    heroSub: 'Informations en temps réel en langage simple.\nSans jargon. Sans bruit. L\'essentiel.',
    cta: 'Commencer gratuitement', ctaSub: 'Sans carte bancaire',
    featLabel: 'Ce que nous avons construit',
    featTitle: 'Une intelligence\nqui aide vraiment.',
    features: [
      { n: '01', title: 'Fil en temps réel', body: 'Actualités scorées par urgence. Sachez en secondes s\'il faut agir — ou ignorer.' },
      { n: '02', title: 'Résumés IA', body: 'Chaque événement expliqué en deux phrases. Claude AI traduit la finance en langage simple.' },
      { n: '03', title: 'Impact portefeuille', body: 'Dites-nous ce que vous détenez. Nous vous disons ce que chaque événement signifie.' },
    ],
    platformLabel: 'La plateforme',
    platformTitle: 'Tout ce qu\'il faut.\nRien de superflu.',
    platformBody: 'Conçu pour les investisseurs retail qui veulent une analyse de niveau institutionnel sans le prix d\'un terminal Bloomberg.',
    platformFeatures: ['Score d\'urgence IA sur chaque article', 'Analyse d\'impact portefeuille', 'Suivi des trades gouvernementaux', 'Alertes de prix en temps réel'],
    statsLabel: 'En chiffres',
    stats: [
      { value: 92, suffix: '%', label: 'des utilisateurs comprennent plus en moins de temps' },
      { value: 3, suffix: 'min', label: 'temps moyen pour comprendre un événement majeur' },
      { value: 60, suffix: '%', label: 'des investisseurs retail ratent des signaux critiques' },
    ],
    howLabel: 'Comment ça marche',
    how: [
      { n: '1', title: 'Construisez votre liste', body: 'Ajoutez les actions, crypto et secteurs qui vous intéressent.' },
      { n: '2', title: 'Obtenez l\'analyse IA', body: 'Chaque événement est résumé et scoré : Bas, Surveiller, ou Agir Maintenant.' },
      { n: '3', title: 'Agissez en confiance', body: 'Voyez exactement comment chaque actualité peut impacter vos positions.' },
    ],
    ctaTitle: 'Commencez à lire\nle marché autrement.',
    ctaBtn: 'Commencer gratuitement',
    viewPricing: 'Voir les tarifs →',
    footerTagline: 'Intelligence de marché pour tous.',
    footerDisc: 'À titre informatif uniquement. Pas de conseil financier.',
  },
  zh: {
    tagline: '投资智能平台',
    hero1: '市场，', hero2: '一目了然。',
    heroSub: '实时市场资讯，简单明了。\n无术语，无噪音——只有重要的内容。',
    cta: '免费开始', ctaSub: '无需信用卡',
    featLabel: '我们构建的',
    featTitle: '真正有帮助\n的智能。',
    features: [
      { n: '01', title: '实时资讯流', body: '按紧急程度评分的实时新闻。几秒钟内了解是否需要采取行动。' },
      { n: '02', title: 'AI 摘要', body: '每个事件用两句话解释。Claude AI 将金融术语转化为简单语言。' },
      { n: '03', title: '投资组合影响', body: '告诉我们您持有什么，我们告诉您每个事件对您具体持仓意味着什么。' },
    ],
    platformLabel: '平台特性',
    platformTitle: '一切所需。\n没有多余。',
    platformBody: '为散户投资者打造，提供机构级分析，无需彭博终端的高昂价格。',
    platformFeatures: ['每篇文章的AI紧急程度评分', '投资组合影响分析', '政府交易追踪器', '实时价格提醒'],
    statsLabel: '数据说话',
    stats: [
      { value: 92, suffix: '%', label: '的用户表示用更少时间理解更多内容' },
      { value: 3, suffix: '分', label: '理解任何重大市场事件的平均时间' },
      { value: 60, suffix: '%', label: '的散户在没有工具的情况下错过关键信号' },
    ],
    howLabel: '如何使用',
    how: [
      { n: '1', title: '建立观察列表', body: '添加您关心的股票、加密货币和行业。' },
      { n: '2', title: '获取 AI 分析', body: '每个相关事件都会被摘要和评分：低、关注或立即行动。' },
      { n: '3', title: '自信地行动', body: '在人群之前，看到每条新闻事件对您持仓的确切影响。' },
    ],
    ctaTitle: '开始以不同方式\n读懂市场。',
    ctaBtn: '免费开始',
    viewPricing: '查看定价 →',
    footerTagline: '人人可用的市场智能。',
    footerDisc: '仅供参考，不构成投资建议。',
  },
}

function LangSwitcher({ lang, setLang }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.5)', fontSize: '11px', fontWeight: '700', letterSpacing: '0.12em', fontFamily: 'inherit', padding: '6px 12px', borderRadius: '2px', cursor: 'pointer', transition: 'all 0.2s' }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.4)'; e.currentTarget.style.color = '#fff' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = 'rgba(255,255,255,0.5)' }}>
        {LANGS.find(l => l.code === lang)?.label}
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, background: '#0c0c0c', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '2px', overflow: 'hidden', minWidth: '88px', boxShadow: '0 20px 60px rgba(0,0,0,0.8)', zIndex: 100 }}>
          {LANGS.map(l => (
            <button key={l.code} onClick={() => { setLang(l.code); setOpen(false) }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', background: l.code === lang ? 'rgba(255,255,255,0.07)' : 'transparent', color: l.code === lang ? '#fff' : 'rgba(255,255,255,0.45)', fontSize: '11px', fontWeight: '700', letterSpacing: '0.1em', fontFamily: 'inherit', border: 'none', cursor: 'pointer', transition: 'background 0.1s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
              onMouseLeave={e => e.currentTarget.style.background = l.code === lang ? 'rgba(255,255,255,0.07)' : 'transparent'}>
              {l.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Marquee ───────────────────────────────────────────────────────────────────

function Marquee() {
  const items = ['Real-time intelligence', 'AI-powered analysis', 'Portfolio impact', 'Market signals', 'No jargon', 'Plain English', 'Act with confidence', 'Urgency scoring']
  const doubled = [...items, ...items, ...items]
  return (
    <div style={{ overflow: 'hidden', borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '13px 0', background: '#060606' }}>
      <div style={{ display: 'flex', animation: 'marquee 36s linear infinite', width: 'max-content' }}>
        {doubled.map((item, i) => (
          <span key={i} style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.18)', whiteSpace: 'nowrap', padding: '0 28px' }}>
            {item}<span style={{ marginLeft: '28px', color: 'rgba(255,255,255,0.07)' }}>·</span>
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({ label, visible, delay = 0 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '64px', opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(16px)', transition: `opacity 0.7s ease ${delay}ms, transform 0.7s ease ${delay}ms` }}>
      <div style={{ width: '20px', height: '1px', background: 'rgba(255,255,255,0.2)' }} />
      <span style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '0.22em', color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase' }}>{label}</span>
    </div>
  )
}

// ── Feature card ──────────────────────────────────────────────────────────────

function FeatureCard({ n, title, body, delay = 0 }) {
  const [ref, visible] = useInView(0.05)
  const [hovered, setHovered] = useState(false)
  return (
    <div ref={ref}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(40px)',
        transition: `opacity 0.85s ease ${delay}ms, transform 0.85s ease ${delay}ms, background 0.3s`,
        padding: '40px 36px', border: '1px solid rgba(255,255,255,0.06)',
        background: hovered ? '#0e0e0e' : '#090909',
        position: 'relative', overflow: 'hidden',
      }}>
      <span style={{ display: 'block', fontSize: '10px', fontWeight: '700', letterSpacing: '0.22em', color: 'rgba(255,255,255,0.18)', marginBottom: '36px', textTransform: 'uppercase' }}>{n}</span>
      <h3 style={{ fontSize: 'clamp(20px, 2.2vw, 28px)', fontWeight: '700', letterSpacing: '-0.025em', marginBottom: '14px', color: '#fff', lineHeight: '1.1' }}>{title}</h3>
      <p style={{ fontSize: '14px', lineHeight: '1.8', color: 'rgba(255,255,255,0.36)', maxWidth: '280px' }}>{body}</p>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '1px', background: `rgba(255,255,255,${hovered ? 0.12 : 0})`, transition: 'background 0.3s' }} />
    </div>
  )
}

// ── Mock UI cards ─────────────────────────────────────────────────────────────

function MockNewsCard({ delay = '0s' }) {
  return (
    <div style={{ background: '#111', border: '1px solid rgba(255,255,255,0.09)', borderRadius: '3px', padding: '22px', width: '260px', boxShadow: '0 40px 80px rgba(0,0,0,0.7)', animation: `floatA 6s ease-in-out ${delay} infinite` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '16px' }}>
        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ef4444' }} />
        <span style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '0.15em', color: '#ef4444', textTransform: 'uppercase' }}>Act Now</span>
      </div>
      {[85, 70, 52].map((w, i) => (
        <div key={i} style={{ height: '9px', background: `rgba(255,255,255,${0.07 - i * 0.015})`, borderRadius: '2px', marginBottom: '7px', width: `${w}%` }} />
      ))}
      <div style={{ marginTop: '18px', paddingTop: '14px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)' }}>2 min ago</span>
        <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)' }}>AAPL</span>
      </div>
    </div>
  )
}

function MockChartCard({ delay = '1s' }) {
  const pts = [30, 45, 38, 62, 54, 72, 66, 82]
  const max = Math.max(...pts), min = Math.min(...pts)
  const W = 200, H = 56
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${(i / (pts.length - 1)) * W},${(1 - (p - min) / (max - min)) * H}`).join(' ')
  return (
    <div style={{ background: '#111', border: '1px solid rgba(255,255,255,0.09)', borderRadius: '3px', padding: '22px', width: '240px', boxShadow: '0 40px 80px rgba(0,0,0,0.7)', animation: `floatB 7s ease-in-out ${delay} infinite` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
        <div>
          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.28)', letterSpacing: '0.1em', display: 'block', marginBottom: '4px' }}>AAPL</span>
          <span style={{ fontSize: '20px', fontWeight: '700', color: '#fff', letterSpacing: '-0.025em' }}>$192.40</span>
        </div>
        <span style={{ fontSize: '11px', color: '#4ade80', fontWeight: '700', marginTop: '4px' }}>+2.4%</span>
      </div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible', display: 'block' }}>
        <path d={path} fill="none" stroke="rgba(74,222,128,0.55)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    </div>
  )
}

function MockImpactCard({ delay = '2s' }) {
  const rows = [
    { label: 'AAPL', color: '#facc15', tag: 'Watch', pct: 72 },
    { label: 'BTC',  color: '#4ade80', tag: 'Low',   pct: 28 },
    { label: 'NVDA', color: '#ef4444', tag: 'Act Now', pct: 91 },
  ]
  return (
    <div style={{ background: '#111', border: '1px solid rgba(255,255,255,0.09)', borderRadius: '3px', padding: '22px', width: '230px', boxShadow: '0 40px 80px rgba(0,0,0,0.7)', animation: `floatA 8s ease-in-out ${delay} infinite` }}>
      <span style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '0.2em', color: 'rgba(255,255,255,0.22)', textTransform: 'uppercase', display: 'block', marginBottom: '18px' }}>Portfolio Impact</span>
      {rows.map(r => (
        <div key={r.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <span style={{ fontSize: '12px', fontWeight: '600', color: 'rgba(255,255,255,0.55)' }}>{r.label}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '44px', height: '3px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ width: `${r.pct}%`, height: '100%', background: r.color, borderRadius: '2px' }} />
            </div>
            <span style={{ fontSize: '9px', color: r.color, fontWeight: '700', letterSpacing: '0.06em', minWidth: '40px', textAlign: 'right' }}>{r.tag}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Stat block ────────────────────────────────────────────────────────────────

function StatBlock({ value, suffix, label, visible, delay = 0 }) {
  const count = useCounter(value, visible)
  return (
    <div style={{ opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(28px)', transition: `opacity 0.9s ease ${delay}ms, transform 0.9s ease ${delay}ms` }}>
      <div style={{ fontSize: 'clamp(52px, 6.5vw, 88px)', fontWeight: '700', letterSpacing: '-0.04em', lineHeight: '1', color: '#fff', fontFamily: "'Playfair Display', Georgia, serif" }}>
        {count}<span style={{ fontSize: '0.42em', color: 'rgba(255,255,255,0.3)', marginLeft: '2px' }}>{suffix}</span>
      </div>
      <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.32)', marginTop: '14px', maxWidth: '210px', lineHeight: '1.65' }}>{label}</p>
    </div>
  )
}

// ── Step ──────────────────────────────────────────────────────────────────────

function Step({ n, title, body, visible, delay = 0 }) {
  return (
    <div style={{ opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(30px)', transition: `opacity 0.9s ease ${delay}ms, transform 0.9s ease ${delay}ms`, paddingTop: '28px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
      <span style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '0.22em', color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', display: 'block', marginBottom: '20px' }}>Step {n}</span>
      <h3 style={{ fontSize: 'clamp(18px, 1.8vw, 24px)', fontWeight: '700', letterSpacing: '-0.025em', color: '#fff', lineHeight: '1.15', marginBottom: '14px' }}>{title}</h3>
      <p style={{ fontSize: '14px', lineHeight: '1.8', color: 'rgba(255,255,255,0.36)' }}>{body}</p>
    </div>
  )
}

// ── Landing ───────────────────────────────────────────────────────────────────

export default function Landing() {
  const [lang, setLang] = useState('en')
  const t = T[lang]
  const [key, setKey] = useState(0)
  useEffect(() => { setKey(k => k + 1) }, [lang])

  const line1 = useScramble(t.hero1, 80, 1200)
  const line2 = useScramble(t.hero2, 520, 1500)

  const [featRef, featVis] = useInView(0.05)
  const [platRef, platVis] = useInView(0.08)
  const [statsRef, statsVis] = useInView(0.1)
  const [howRef, howVis] = useInView(0.08)
  const [ctaRef, ctaVis] = useInView(0.15)

  const crosses = [
    ['12%','18%'],['50%','18%'],['88%','18%'],
    ['25%','44%'],['75%','44%'],
    ['12%','70%'],['50%','70%'],['88%','70%'],
    ['35%','86%'],['65%','86%'],
  ]

  return (
    <div style={{ background: '#080808', color: '#fff', minHeight: '100vh', fontFamily: "'Space Grotesk', 'Inter', sans-serif", overflowX: 'hidden' }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Playfair+Display:wght@400;500;700&display=swap');
        @font-face { font-family:'Alphazet'; src:url('/fonts/Alphazet.woff2') format('woff2'),url('/fonts/Alphazet.woff') format('woff'); font-display:swap; }
        *{box-sizing:border-box;margin:0;padding:0;}
        html{scroll-behavior:smooth;}

        /* Grain */
        body::before{content:'';position:fixed;inset:0;z-index:9997;pointer-events:none;
          background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.88' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
          background-size:180px 180px;opacity:0.03;mix-blend-mode:overlay;}

        @keyframes marquee{from{transform:translateX(0)}to{transform:translateX(-33.333%)}}
        @keyframes drip{0%{opacity:0;transform:scaleY(0.3) translateY(-12px)}50%{opacity:1;transform:scaleY(1) translateY(0)}100%{opacity:0;transform:scaleY(0.3) translateY(12px)}}
        @keyframes floatA{0%,100%{transform:translateY(0) rotate(0deg)}40%{transform:translateY(-14px) rotate(0.4deg)}70%{transform:translateY(-7px) rotate(-0.2deg)}}
        @keyframes floatB{0%,100%{transform:translateY(0) rotate(0deg)}35%{transform:translateY(-10px) rotate(-0.3deg)}65%{transform:translateY(-16px) rotate(0.3deg)}}

        .px-text{transition:filter 0.06s ease;cursor:default;}
        .px-text:hover{filter:blur(3px) contrast(18);}

        @media(max-width:768px){
          .cursor-dot,.cursor-ring{display:none!important;}
        }
        @media(max-width:640px){
          .hero-section{padding:0 20px 64px!important;}
          .hdr-tagline{display:none!important;}
          .feat-grid{grid-template-columns:1fr!important;}
          .plat-grid{grid-template-columns:1fr!important;}
          .stats-row{flex-direction:column!important;gap:52px!important;}
          .stats-col{padding:0!important;border:none!important;}
          .how-grid{grid-template-columns:1fr!important;}
          .mock-cards{display:none!important;}
          .sec-pad{padding:72px 20px!important;}
        }
      `}</style>

      {/* Cursor */}
      <CustomCursor />

      {/* ── HEADER ── */}
      <header style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50, display: 'flex', alignItems: 'stretch', height: '52px', borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(8,8,8,0.93)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 24px', borderRight: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
          <Logo size="sm" />
        </div>
        <div className="hdr-tagline" style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 24px', borderRight: '1px solid rgba(255,255,255,0.07)' }}>
          <span style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '0.2em', color: 'rgba(255,255,255,0.18)', textTransform: 'uppercase' }}>{t.tagline}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '0 20px', flexShrink: 0 }}>
          <LangSwitcher lang={lang} setLang={setLang} />
          <Link to="/onboarding" style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '0.12em', color: '#080808', background: '#f5f0e6', padding: '7px 16px', borderRadius: '2px', textDecoration: 'none', textTransform: 'uppercase', transition: 'opacity 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
            {t.cta}
          </Link>
        </div>
      </header>

      {/* ── HERO ── */}
      <section className="hero-section" style={{ position: 'relative', height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '0 48px 84px', overflow: 'hidden' }}>
        {crosses.map(([l, top], i) => <Cross key={i} style={{ left: l, top }} />)}
        <div style={{ position: 'absolute', top: '52px', left: '48px', right: '48px', height: '1px', background: 'rgba(255,255,255,0.05)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: '52px', left: '48px', bottom: 0, width: '1px', background: 'rgba(255,255,255,0.05)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: '52px', right: '48px', bottom: 0, width: '1px', background: 'rgba(255,255,255,0.05)', pointerEvents: 'none' }} />

        {/* Vertical label */}
        <div style={{ position: 'absolute', top: '88px', right: '68px', zIndex: 2 }}>
          <span style={{ fontSize: '9px', fontWeight: '700', letterSpacing: '0.28em', color: 'rgba(255,255,255,0.14)', textTransform: 'uppercase', writingMode: 'vertical-rl', transform: 'rotate(180deg)', display: 'block' }}>Market Intelligence</span>
        </div>

        <div style={{ position: 'relative', zIndex: 2, maxWidth: '1020px' }} key={key}>
          <h1 style={{ fontSize: 'clamp(54px, 10vw, 140px)', fontWeight: '700', lineHeight: '0.94', letterSpacing: '-0.03em', margin: '0 0 36px', color: '#fff' }}>
            <span className="px-text" style={{ display: 'block' }}>{line1 || ' '}</span>
            <span className="px-text" style={{ display: 'block', color: 'rgba(255,255,255,0.2)' }}>{line2 || ' '}</span>
          </h1>
          <p className="px-text" style={{ fontSize: 'clamp(13px, 1.4vw, 16px)', color: 'rgba(255,255,255,0.34)', lineHeight: '1.9', maxWidth: '340px', margin: '0 0 48px', whiteSpace: 'pre-line', letterSpacing: '0.01em' }}>{t.heroSub}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap' }}>
            <Link to="/onboarding" style={{ display: 'inline-block', background: '#f5f0e6', color: '#080808', fontSize: '11px', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '14px 34px', borderRadius: '2px', textDecoration: 'none', transition: 'opacity 0.15s, transform 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '0.82'; e.currentTarget.style.transform = 'translateY(-2px)' }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'translateY(0)' }}>
              {t.cta}
            </Link>
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.14)', letterSpacing: '0.08em' }}>{t.ctaSub}</span>
          </div>
        </div>

        <div style={{ position: 'absolute', bottom: '36px', right: '60px', zIndex: 2 }}>
          <div style={{ width: '1px', height: '56px', background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.18))', animation: 'drip 2.4s ease-in-out infinite' }} />
        </div>
      </section>

      {/* ── MARQUEE ── */}
      <Marquee />

      {/* ── FEATURES ── */}
      <section className="sec-pad" ref={featRef} style={{ padding: '120px 48px' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          <SectionLabel label={t.featLabel} visible={featVis} />
          <h2 style={{ fontSize: 'clamp(34px, 5.5vw, 80px)', fontWeight: '700', letterSpacing: '-0.035em', lineHeight: '1.0', color: '#fff', whiteSpace: 'pre-line', marginBottom: '80px', maxWidth: '680px', opacity: featVis ? 1 : 0, transform: featVis ? 'none' : 'translateY(32px)', transition: 'opacity 0.85s ease 0.1s, transform 0.85s ease 0.1s' }}>
            {t.featTitle}
          </h2>
          <div className="feat-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1px', background: 'rgba(255,255,255,0.06)' }}>
            {t.features.map((f, i) => <FeatureCard key={f.n} n={f.n} title={f.title} body={f.body} delay={i * 110} />)}
          </div>
        </div>
      </section>

      {/* ── PLATFORM SHOWCASE ── */}
      <section className="sec-pad" ref={platRef} style={{ padding: '110px 48px', background: '#060606', borderTop: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          <div className="plat-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '80px', alignItems: 'center' }}>
            {/* Text */}
            <div>
              <SectionLabel label={t.platformLabel} visible={platVis} />
              <h2 style={{ fontSize: 'clamp(28px, 3.8vw, 56px)', fontWeight: '700', letterSpacing: '-0.03em', lineHeight: '1.08', color: '#fff', whiteSpace: 'pre-line', marginBottom: '24px', opacity: platVis ? 1 : 0, transform: platVis ? 'none' : 'translateY(30px)', transition: 'opacity 0.85s ease 0.1s, transform 0.85s ease 0.1s' }}>
                {t.platformTitle}
              </h2>
              <p style={{ fontSize: '15px', lineHeight: '1.85', color: 'rgba(255,255,255,0.34)', maxWidth: '360px', marginBottom: '40px', opacity: platVis ? 1 : 0, transition: 'opacity 0.8s ease 0.2s' }}>
                {t.platformBody}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {t.platformFeatures.map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', opacity: platVis ? 1 : 0, transition: `opacity 0.75s ease ${0.25 + i * 0.07}s` }}>
                    <div style={{ width: '3px', height: '3px', borderRadius: '50%', background: 'rgba(255,255,255,0.28)', flexShrink: 0 }} />
                    <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.42)', letterSpacing: '0.01em' }}>{f}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* Mock cards */}
            <div className="mock-cards" style={{ position: 'relative', height: '440px' }}>
              <div style={{ position: 'absolute', top: '10px', left: '20px', opacity: platVis ? 1 : 0, transition: 'opacity 0.8s ease 0.3s' }}>
                <MockNewsCard delay="0s" />
              </div>
              <div style={{ position: 'absolute', top: '50px', right: '0px', opacity: platVis ? 1 : 0, transition: 'opacity 0.8s ease 0.45s' }}>
                <MockChartCard delay="1.2s" />
              </div>
              <div style={{ position: 'absolute', bottom: '10px', left: '60px', opacity: platVis ? 1 : 0, transition: 'opacity 0.8s ease 0.6s' }}>
                <MockImpactCard delay="2.5s" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS ── */}
      <section className="sec-pad" ref={statsRef} style={{ padding: '120px 48px' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          <SectionLabel label={t.statsLabel} visible={statsVis} />
          <div className="stats-row" style={{ display: 'flex', gap: '0' }}>
            {t.stats.map((s, i) => (
              <div key={i} className="stats-col" style={{ flex: 1, paddingRight: '48px', paddingLeft: i > 0 ? '48px' : 0, borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.07)' : 'none' }}>
                <StatBlock value={s.value} suffix={s.suffix} label={s.label} visible={statsVis} delay={i * 120} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="sec-pad" ref={howRef} style={{ padding: '120px 48px', background: '#060606', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          <SectionLabel label={t.howLabel} visible={howVis} />
          <div className="how-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '52px' }}>
            {t.how.map((step, i) => <Step key={i} n={step.n} title={step.title} body={step.body} visible={howVis} delay={i * 140} />)}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="sec-pad" ref={ctaRef} style={{ padding: '150px 48px', textAlign: 'center' }}>
        <div style={{ maxWidth: '860px', margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(34px, 6vw, 92px)', fontWeight: '400', letterSpacing: '-0.04em', lineHeight: '1.0', color: '#fff', whiteSpace: 'pre-line', marginBottom: '52px', fontFamily: "'Playfair Display', Georgia, serif", opacity: ctaVis ? 1 : 0, transform: ctaVis ? 'none' : 'translateY(40px)', transition: 'opacity 1s ease, transform 1s ease' }}>
            {t.ctaTitle}
          </h2>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '20px', flexWrap: 'wrap', opacity: ctaVis ? 1 : 0, transform: ctaVis ? 'none' : 'translateY(20px)', transition: 'opacity 0.9s ease 0.2s, transform 0.9s ease 0.2s' }}>
            <Link to="/onboarding" style={{ display: 'inline-block', background: '#f5f0e6', color: '#080808', fontSize: '11px', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '16px 42px', borderRadius: '2px', textDecoration: 'none', transition: 'opacity 0.15s, transform 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '0.82'; e.currentTarget.style.transform = 'translateY(-2px)' }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'translateY(0)' }}>
              {t.ctaBtn}
            </Link>
            <Link to="/pricing" style={{ display: 'inline-block', color: 'rgba(255,255,255,0.32)', fontSize: '11px', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '16px 20px', textDecoration: 'none', borderBottom: '1px solid rgba(255,255,255,0.14)', transition: 'color 0.2s, border-color 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.4)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.32)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)' }}>
              {t.viewPricing}
            </Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.07)', padding: '52px 48px', background: '#050505' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '40px' }}>
          <div>
            <Logo size="sm" />
            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.18)', marginTop: '16px', maxWidth: '240px', lineHeight: '1.75' }}>{t.footerTagline}</p>
          </div>
          <div style={{ display: 'flex', gap: '56px', flexWrap: 'wrap' }}>
            {[
              { col: 'Product', links: [{ name: 'Features', to: '/onboarding' }, { name: 'Pricing', to: '/pricing' }] },
              { col: 'Legal', links: [{ name: 'Disclaimer', to: '#' }] },
            ].map(({ col, links }) => (
              <div key={col}>
                <span style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '0.22em', color: 'rgba(255,255,255,0.18)', textTransform: 'uppercase', display: 'block', marginBottom: '18px' }}>{col}</span>
                {links.map(l => (
                  <Link key={l.name} to={l.to} style={{ display: 'block', fontSize: '13px', color: 'rgba(255,255,255,0.32)', textDecoration: 'none', marginBottom: '10px', transition: 'color 0.2s' }}
                    onMouseEnter={e => e.currentTarget.style.color = '#fff'}
                    onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.32)'}>
                    {l.name}
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div style={{ maxWidth: '1400px', margin: '36px auto 0', paddingTop: '28px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.1)', letterSpacing: '0.06em' }}>© {new Date().getFullYear()} Market Intelligence</span>
          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.1)', maxWidth: '480px', lineHeight: '1.6', textAlign: 'right' }}>{t.footerDisc}</span>
        </div>
      </footer>
    </div>
  )
}
