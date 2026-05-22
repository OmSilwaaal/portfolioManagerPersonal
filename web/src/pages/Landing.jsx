import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import Logo from '../components/Logo'

// ── Scramble hook ─────────────────────────────────────────────────────────────
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
        if (c === ' ') return ' '
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

// ── Fade-in on scroll ─────────────────────────────────────────────────────────
function useFadeIn(threshold = 0.12) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect() } },
      { threshold }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return [ref, visible]
}

// ── Translations ──────────────────────────────────────────────────────────────
const LANGS = [
  { code: 'en', label: 'EN' },
  { code: 'fr', label: 'FR' },
  { code: 'zh', label: '中文' },
]

const T = {
  en: {
    tagline: 'Investment intelligence platform',
    hero1: 'The market,',
    hero2: 'explained.',
    heroSub: 'Real-time intelligence in plain English.\nNo jargon. No noise. Just what matters.',
    cta: 'Get started free',
    ctaSub: 'No credit card required',
    whatInside: "What's inside",
    features: [
      { n: '01', t: 'Plain-English AI', d: 'Every stock move explained like a friend would. Ask why a stock is down — get a real answer.' },
      { n: '02', t: 'Congressional trades', d: 'Every STOCK Act disclosure surfaced instantly with AI context on why it matters.' },
      { n: '03', t: 'Paper trading', d: 'Practice with $500 virtual cash, track your returns, compete on a live leaderboard.' },
      { n: '04', t: 'Price alerts', d: 'Set a target price. Walk away. Get notified the exact moment it hits.' },
      { n: '05', t: 'Investment groups', d: 'Create a private club, share trade ideas, post theses, run polls with your members.' },
      { n: '06', t: 'Commodities & crypto', d: 'Gold, oil, wheat, BTC — all in one feed with plain-English AI context.' },
    ],
    promise: 'The stock market isn\'t just for Wall Street.',
    promiseSub: 'For too long, real-time market intelligence was locked behind Bloomberg terminals and finance degrees. Travauxus gives everyone the same information — in plain English, personalised to what you own.',
    pricingLabel: 'Simple pricing',
    free: 'Free',
    pro: 'Pro',
    freePrice: '$0',
    proPrice: '$12',
    perMonth: '/ month',
    freeDesc: 'Limited feed · Basic prices · 5 gov trades',
    proDesc: 'Unlimited feed · Full charts · All features',
    viewPricing: 'View full pricing',
    ctaFinal: 'Start understanding\nthe market today.',
    ctaFinalSub: 'Free forever. Upgrade when you\'re ready.',
    footerDisclaimer: 'Not financial advice. For educational use only.',
    copyright: '© 2026 Travauxus.',
    privacy: 'Privacy',
    support: 'Support',
  },
  fr: {
    tagline: 'Plateforme d\'intelligence financière',
    hero1: 'Le marché,',
    hero2: 'expliqué.',
    heroSub: 'Informations en temps réel en langage simple.\nSans jargon. Sans bruit. L\'essentiel.',
    cta: 'Commencer gratuitement',
    ctaSub: 'Sans carte bancaire',
    whatInside: 'Ce que contient l\'app',
    features: [
      { n: '01', t: 'IA en langage clair', d: 'Chaque mouvement expliqué simplement. Demandez pourquoi une action baisse — obtenez une vraie réponse.' },
      { n: '02', t: 'Trades du Congrès', d: 'Chaque déclaration STOCK Act remontée instantanément avec contexte IA.' },
      { n: '03', t: 'Trading fictif', d: 'Pratiquez avec 500 $ virtuels, suivez vos rendements, rivalisez sur un classement réel.' },
      { n: '04', t: 'Alertes de prix', d: 'Définissez un objectif. Partez. Soyez notifié dès qu\'il est atteint.' },
      { n: '05', t: 'Groupes d\'investissement', d: 'Créez un club privé, partagez des idées, publiez des thèses, faites des sondages.' },
      { n: '06', t: 'Matières premières & crypto', d: 'Or, pétrole, blé, BTC — tout en un avec contexte IA.' },
    ],
    promise: 'Le marché financier n\'est pas réservé à Wall Street.',
    promiseSub: 'Travauxus donne à chacun la même intelligence financière — en langage clair, personnalisée selon ce que vous détenez.',
    pricingLabel: 'Tarification simple',
    free: 'Gratuit',
    pro: 'Pro',
    freePrice: '0 $',
    proPrice: '12 $',
    perMonth: '/ mois',
    freeDesc: 'Fil limité · Prix de base · 5 trades du Congrès',
    proDesc: 'Fil illimité · Graphiques complets · Toutes les fonctionnalités',
    viewPricing: 'Voir les tarifs complets',
    ctaFinal: 'Commencez à comprendre\nle marché aujourd\'hui.',
    ctaFinalSub: 'Gratuit pour toujours. Mettez à niveau quand vous êtes prêt.',
    footerDisclaimer: 'Pas de conseil financier. À des fins éducatives uniquement.',
    copyright: '© 2026 Travauxus.',
    privacy: 'Confidentialité',
    support: 'Support',
  },
  zh: {
    tagline: '投资智能平台',
    hero1: '市场，',
    hero2: '一目了然。',
    heroSub: '实时市场资讯，简单明了。\n无术语，无噪音——只有重要的内容。',
    cta: '免费开始',
    ctaSub: '无需信用卡',
    whatInside: '功能一览',
    features: [
      { n: '01', t: 'AI 简明解释', d: '每次股价波动用简单语言解释。问为什么某只股票下跌，得到真实答案。' },
      { n: '02', t: '国会交易追踪', d: '每份 STOCK Act 披露即时呈现，附 AI 背景分析。' },
      { n: '03', t: '模拟交易', d: '用 500 美元虚拟资金练习，追踪收益，在排行榜上竞争。' },
      { n: '04', t: '价格提醒', d: '设定目标价。放松等待。价格触达时立即通知。' },
      { n: '05', t: '投资群组', d: '创建私人俱乐部，分享想法，发布交易论点，发起投票。' },
      { n: '06', t: '大宗商品与加密货币', d: '黄金、石油、小麦、比特币——一站汇聚，附 AI 解读。' },
    ],
    promise: '股市不只属于华尔街。',
    promiseSub: 'Travauxus 让每个人都能获得同样的市场智能——用简单语言呈现，根据您的持仓个性化定制。',
    pricingLabel: '简单定价',
    free: '免费',
    pro: '专业版',
    freePrice: '$0',
    proPrice: '$12',
    perMonth: '/ 月',
    freeDesc: '有限资讯流 · 基础价格 · 5条国会交易',
    proDesc: '无限资讯流 · 完整图表 · 所有功能',
    viewPricing: '查看完整定价',
    ctaFinal: '立即开始\n读懂市场。',
    ctaFinalSub: '永久免费。准备好时再升级。',
    footerDisclaimer: '非财务建议。仅供教育用途。',
    copyright: '© 2026 Travauxus.',
    privacy: '隐私政策',
    support: '支持',
  },
}

// ── Fade wrapper ──────────────────────────────────────────────────────────────
function Fade({ children, delay = 0 }) {
  const [ref, visible] = useFadeIn()
  return (
    <div
      ref={ref}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(24px)',
        transition: `opacity 0.8s ease ${delay}s, transform 0.8s ease ${delay}s`,
      }}
    >
      {children}
    </div>
  )
}

// ── Language switcher ─────────────────────────────────────────────────────────
function LangSwitcher({ lang, setLang }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const current = LANGS.find(l => l.code === lang)

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          background: 'transparent',
          border: '1px solid rgba(255,255,255,0.12)',
          color: 'rgba(255,255,255,0.6)',
          fontSize: '11px', fontWeight: '600', letterSpacing: '0.08em',
          padding: '6px 12px', borderRadius: '6px',
          cursor: 'pointer', transition: 'all 0.2s',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'; e.currentTarget.style.color = '#fff' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)' }}
      >
        {current.label}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
          background: '#111', border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: '8px', overflow: 'hidden', minWidth: '90px',
          boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
          zIndex: 100,
        }}>
          {LANGS.map(l => (
            <button
              key={l.code}
              onClick={() => { setLang(l.code); setOpen(false) }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '9px 14px',
                background: l.code === lang ? 'rgba(255,255,255,0.06)' : 'transparent',
                color: l.code === lang ? '#fff' : 'rgba(255,255,255,0.5)',
                fontSize: '12px', fontWeight: '500',
                border: 'none', cursor: 'pointer', transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
              onMouseLeave={e => e.currentTarget.style.background = l.code === lang ? 'rgba(255,255,255,0.06)' : 'transparent'}
            >
              {l.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Divider ───────────────────────────────────────────────────────────────────
function Divider() {
  return <div style={{ width: '100%', height: '1px', background: 'rgba(255,255,255,0.07)' }} />
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Landing() {
  const [lang, setLang] = useState('en')
  const t = T[lang]

  const line1 = useScramble(t.hero1, 100, 1200)
  const line2 = useScramble(t.hero2, 600, 1400)

  // Re-trigger scramble on lang change by using key
  const [scrambleKey, setScrambleKey] = useState(0)
  useEffect(() => { setScrambleKey(k => k + 1) }, [lang])

  return (
    <div style={{ background: '#080808', color: '#fff', minHeight: '100vh', fontFamily: 'Inter, sans-serif' }}>

      {/* ── FIXED HEADER ── */}
      <header style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        background: 'rgba(8,8,8,0.85)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}>
        {/* Logo cell — bordered box on left */}
        <div style={{
          display: 'flex', alignItems: 'center',
          padding: '14px 24px',
          borderRight: '1px solid rgba(255,255,255,0.07)',
        }}>
          <Logo size="sm" />
        </div>

        {/* Right side */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '0 24px' }}>
          <LangSwitcher lang={lang} setLang={setLang} />
          <Link
            to="/onboarding"
            style={{
              fontSize: '12px', fontWeight: '600', letterSpacing: '0.04em',
              color: '#080808', background: '#fff',
              padding: '7px 16px', borderRadius: '6px',
              textDecoration: 'none', transition: 'opacity 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            {t.cta}
          </Link>
        </div>
      </header>

      {/* ── HERO ── */}
      <section style={{
        minHeight: '100vh',
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        padding: '0 48px 80px',
        paddingTop: '80px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Tagline top-left */}
        <div style={{
          position: 'absolute', top: '96px', left: '48px',
          fontSize: '11px', fontWeight: '500', letterSpacing: '0.14em',
          color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase',
        }}>
          {t.tagline}
        </div>

        {/* Main text block */}
        <div style={{ maxWidth: '820px' }}>
          <h1 key={`h1-${scrambleKey}`} style={{
            fontSize: 'clamp(52px, 9vw, 120px)',
            fontWeight: '700',
            lineHeight: '1.0',
            letterSpacing: '-0.03em',
            margin: '0 0 24px 0',
            color: '#fff',
          }}>
            <span style={{ display: 'block' }}>{line1 || ' '}</span>
            <span style={{ display: 'block', color: 'rgba(255,255,255,0.35)' }}>{line2 || ' '}</span>
          </h1>

          <p style={{
            fontSize: 'clamp(15px, 1.8vw, 18px)',
            color: 'rgba(255,255,255,0.45)',
            lineHeight: '1.7',
            maxWidth: '420px',
            margin: '0 0 40px 0',
            whiteSpace: 'pre-line',
          }}>
            {t.heroSub}
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
            <Link
              to="/onboarding"
              style={{
                display: 'inline-block',
                background: '#fff', color: '#080808',
                fontSize: '13px', fontWeight: '700', letterSpacing: '0.02em',
                padding: '13px 28px', borderRadius: '8px',
                textDecoration: 'none', transition: 'opacity 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >
              {t.cta}
            </Link>
            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.2)' }}>{t.ctaSub}</span>
          </div>
        </div>

        {/* Scroll indicator */}
        <div style={{
          position: 'absolute', bottom: '32px', right: '48px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
        }}>
          <div style={{
            width: '1px', height: '48px',
            background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.25))',
            animation: 'scrollPulse 2s ease-in-out infinite',
          }} />
        </div>
      </section>

      <Divider />

      {/* ── FEATURES ── */}
      <section style={{ padding: '100px 48px' }}>
        <Fade>
          <p style={{
            fontSize: '11px', fontWeight: '600', letterSpacing: '0.16em',
            color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase',
            marginBottom: '64px',
          }}>
            {t.whatInside}
          </p>
        </Fade>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {t.features.map((f, i) => (
            <Fade key={`${lang}-${f.n}`} delay={i * 0.05}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '60px 1fr 1fr',
                  gap: '0 40px',
                  padding: '28px 0',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  alignItems: 'start',
                  transition: 'background 0.2s',
                  cursor: 'default',
                  borderRadius: '4px',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <span style={{ fontSize: '11px', fontWeight: '500', color: 'rgba(255,255,255,0.2)', letterSpacing: '0.08em', paddingTop: '2px' }}>
                  {f.n}
                </span>
                <span style={{ fontSize: 'clamp(15px, 1.8vw, 18px)', fontWeight: '500', color: '#fff', letterSpacing: '-0.01em' }}>
                  {f.t}
                </span>
                <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.38)', lineHeight: '1.6' }}>
                  {f.d}
                </span>
              </div>
            </Fade>
          ))}
        </div>
      </section>

      <Divider />

      {/* ── PROMISE ── */}
      <section style={{ padding: '120px 48px', maxWidth: '900px' }}>
        <Fade>
          <p style={{
            fontSize: 'clamp(28px, 4.5vw, 56px)',
            fontWeight: '600', lineHeight: '1.15',
            letterSpacing: '-0.02em',
            color: '#fff',
            marginBottom: '28px',
          }}>
            {t.promise}
          </p>
          <p style={{
            fontSize: '16px', lineHeight: '1.75',
            color: 'rgba(255,255,255,0.4)',
            maxWidth: '560px',
          }}>
            {t.promiseSub}
          </p>
        </Fade>
      </section>

      <Divider />

      {/* ── PRICING ── */}
      <section style={{ padding: '100px 48px' }}>
        <Fade>
          <p style={{
            fontSize: '11px', fontWeight: '600', letterSpacing: '0.16em',
            color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase',
            marginBottom: '56px',
          }}>
            {t.pricingLabel}
          </p>
        </Fade>

        <Fade delay={0.1}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '1px',
            background: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: '12px',
            overflow: 'hidden',
            maxWidth: '640px',
          }}>
            {/* Free */}
            <div style={{ background: '#080808', padding: '40px 36px' }}>
              <p style={{ fontSize: '11px', fontWeight: '600', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: '16px' }}>
                {t.free}
              </p>
              <p style={{ fontSize: '42px', fontWeight: '700', letterSpacing: '-0.02em', color: '#fff', lineHeight: 1, marginBottom: '8px' }}>
                {t.freePrice}
              </p>
              <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.3)', marginBottom: '32px', lineHeight: '1.6' }}>
                {t.freeDesc}
              </p>
              <Link
                to="/onboarding"
                style={{
                  display: 'inline-block', fontSize: '12px', fontWeight: '600',
                  letterSpacing: '0.04em',
                  color: 'rgba(255,255,255,0.6)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  padding: '9px 20px', borderRadius: '6px',
                  textDecoration: 'none', transition: 'all 0.2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.35)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)' }}
              >
                {t.cta}
              </Link>
            </div>

            {/* Pro */}
            <div style={{ background: '#0f0f0f', padding: '40px 36px', position: 'relative' }}>
              <p style={{ fontSize: '11px', fontWeight: '600', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', marginBottom: '16px' }}>
                {t.pro}
              </p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '8px' }}>
                <p style={{ fontSize: '42px', fontWeight: '700', letterSpacing: '-0.02em', color: '#fff', lineHeight: 1 }}>
                  {t.proPrice}
                </p>
                <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.35)' }}>{t.perMonth}</span>
              </div>
              <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.35)', marginBottom: '32px', lineHeight: '1.6' }}>
                {t.proDesc}
              </p>
              <Link
                to="/pricing"
                style={{
                  display: 'inline-block', fontSize: '12px', fontWeight: '600',
                  letterSpacing: '0.04em',
                  color: '#080808', background: '#fff',
                  padding: '9px 20px', borderRadius: '6px',
                  textDecoration: 'none', transition: 'opacity 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                {t.viewPricing}
              </Link>
            </div>
          </div>
        </Fade>
      </section>

      <Divider />

      {/* ── FINAL CTA ── */}
      <section style={{ padding: '120px 48px' }}>
        <Fade>
          <h2 style={{
            fontSize: 'clamp(36px, 6vw, 80px)',
            fontWeight: '700', lineHeight: '1.05',
            letterSpacing: '-0.03em',
            color: '#fff',
            marginBottom: '28px',
            whiteSpace: 'pre-line',
          }}>
            {t.ctaFinal}
          </h2>
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.3)', marginBottom: '40px' }}>
            {t.ctaFinalSub}
          </p>
          <Link
            to="/onboarding"
            style={{
              display: 'inline-block',
              background: '#fff', color: '#080808',
              fontSize: '13px', fontWeight: '700', letterSpacing: '0.02em',
              padding: '14px 32px', borderRadius: '8px',
              textDecoration: 'none', transition: 'opacity 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            {t.cta}
          </Link>
        </Fade>
      </section>

      <Divider />

      {/* ── FOOTER ── */}
      <footer style={{ padding: '40px 48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <Logo size="sm" />
          <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.18)', marginTop: '4px' }}>
            {t.footerDisclaimer}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <a href="#" style={{ fontSize: '12px', color: 'rgba(255,255,255,0.25)', textDecoration: 'none', transition: 'color 0.2s' }}
            onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.7)'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.25)'}>
            {t.privacy}
          </a>
          <a href="#" style={{ fontSize: '12px', color: 'rgba(255,255,255,0.25)', textDecoration: 'none', transition: 'color 0.2s' }}
            onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.7)'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.25)'}>
            {t.support}
          </a>
          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.15)' }}>{t.copyright}</span>
        </div>
      </footer>

      {/* ── KEYFRAMES ── */}
      <style>{`
        @keyframes scrollPulse {
          0%, 100% { opacity: 0.2; transform: scaleY(1); }
          50% { opacity: 0.6; transform: scaleY(1.1); }
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        @media (max-width: 640px) {
          section { padding-left: 24px !important; padding-right: 24px !important; }
          header { padding: 0 !important; }
          header > div:first-child { padding: 12px 16px !important; }
          header > div:last-child { padding: 0 16px !important; }
        }
        @media (max-width: 768px) {
          [data-feat-grid] { grid-template-columns: 40px 1fr !important; }
          [data-feat-grid] > span:last-child { display: none; }
        }
      `}</style>
    </div>
  )
}
