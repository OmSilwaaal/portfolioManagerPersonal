import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../utils/supabase/client'

/* Hands-on tour that runs once after the quiz and account setup. Each lesson spotlights a real sidebar item: the user clicks it,
   lands on the page, and gets a short explanation of what is there before the next lesson. Replayable from Settings. */

const LESSONS = [
  { id: 'feed', path: '/feed', title: 'Your Feed', nav: 'Click Feed.',
    body: 'Your personalised brief and the news that matters to your watchlist. The Feed entry in the sidebar opens filters for stocks, crypto, government trades, commodities and macro. The animated shape above the brief changes with the filter you pick.' },
  { id: 'portfolio', path: '/portfolio', title: 'Portfolio', nav: 'Now click Portfolio.',
    body: 'Everything you hold in one place: your paper positions, cash and how they are doing. Import real holdings here too if you want to track them.' },
  { id: 'terminal', path: '/terminal', title: 'Axiom Terminal', nav: 'Open the Axiom Terminal.',
    body: 'This is where you trade. Buy and sell stocks and Solana memecoins with paper money. Every position you close, in profit or at a loss, moves your Elo.' },
  { id: 'friends', path: '/friends', title: 'Friends', nav: 'Click Friends.',
    body: 'Search anyone by @username, send a request, and message them once they accept. You can share a ticker straight into a chat with the $ button. A dot appears on Friends when you have a new message or request.' },
  { id: 'leaderboard', path: '/leaderboard', title: 'Leaderboard', nav: 'Click Leaderboard.',
    body: 'The top traders ranked by Elo, total PnL, win rate, best trade and more. Your own standing is at the top. Pro members choose which calling card shows next to their name here; everyone can pick a solid name colour.' },
  { id: 'clans', path: '/clans', title: 'Clans', nav: 'Click Clans.',
    body: 'Join a clan (one at a time) and its [TAG] shows before your name. The clan PnL adds up every member\'s trades since they joined. Pro members can found a new clan.' },
  { id: 'elos', path: '/elos', title: 'Elos', nav: 'Click Elos.',
    body: 'How ratings work and every rank from Rekt to Legend, each with its own calling card. Wins raise your Elo, losses rank you down. Your Elo shows next to your name everywhere.' },
  { id: 'settings', path: '/settings', title: 'Settings', nav: 'Last one: click Settings.',
    body: 'Your profile, theme, notifications and invite code. Open Calling Cards to see every card, how to unlock it and where to equip it. That is the tour. Go make some trades.' },
]

const KEY = (id) => `tvx_tour_${id}`
const STEP_KEY = 'tvx_tour_step'
const isDone = (user) => {
  if (user?.user_metadata?.tourDone) return true
  try { return localStorage.getItem(KEY(user?.id)) === 'done' } catch { return false }
}

export function restartTour(userId) {
  try { localStorage.removeItem(KEY(userId)); sessionStorage.setItem(STEP_KEY, '0') } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event('tvx:restart-tour'))
}

function useTarget(selector, active) {
  const [rect, setRect] = useState(null)
  useLayoutEffect(() => {
    if (!active) { setRect(null); return undefined }
    const read = () => {
      const el = document.querySelector(selector)
      if (!el || el.offsetParent === null) { setRect(null); return }
      const r = el.getBoundingClientRect()
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    }
    read()
    const t = setInterval(read, 400) // sidebar can scroll or collapse
    window.addEventListener('resize', read)
    return () => { clearInterval(t); window.removeEventListener('resize', read) }
  }, [selector, active])
  return rect
}

const CARD = {
  position: 'fixed', zIndex: 1000, width: 'min(340px, calc(100vw - 24px))', background: 'var(--ink-800)', color: 'var(--paper)',
  border: '1px solid var(--paper)', borderRadius: 2, padding: 16, boxShadow: '0 12px 32px rgba(0,0,0,0.5)', fontFamily: 'var(--font-sans)',
}

export default function GuidedTour() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [step, setStep] = useState(() => {
    try { return Math.min(LESSONS.length - 1, parseInt(sessionStorage.getItem(STEP_KEY) || '0', 10) || 0) } catch { return 0 }
  })
  const [active, setActive] = useState(() => !!user && !isDone(user))
  const [arrived, setArrived] = useState(false) // on the lesson's page: show the explanation

  const lesson = LESSONS[step]
  const total = LESSONS.length

  useEffect(() => {
    const on = () => { setStep(0); setArrived(false); setActive(true) }
    window.addEventListener('tvx:restart-tour', on)
    return () => window.removeEventListener('tvx:restart-tour', on)
  }, [])
  useEffect(() => { if (user && !isDone(user)) setActive(true) }, [user])

  // Landing on the lesson's page, however the user got there, turns the spotlight into the explanation
  useEffect(() => {
    if (active && pathname === lesson.path) setArrived(true)
  }, [active, pathname, lesson.path])

  const finish = useCallback(() => {
    setActive(false)
    try { localStorage.setItem(KEY(user?.id), 'done'); sessionStorage.removeItem(STEP_KEY) } catch { /* ignore */ }
    supabase.auth.updateUser({ data: { tourDone: true } }).catch(() => { /* local flag still applies */ })
  }, [user])

  useEffect(() => {
    if (!active) return undefined
    const onKey = (e) => { if (e.key === 'Escape') finish() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, finish])

  const advance = () => {
    if (step >= total - 1) { finish(); return }
    const n = step + 1
    setStep(n); setArrived(false)
    try { sessionStorage.setItem(STEP_KEY, String(n)) } catch { /* ignore */ }
  }

  const rect = useTarget(`[data-tour="${lesson.id}"]`, active && !arrived)
  const bar = useMemo(() => { const on = Math.round(((step + (arrived ? 1 : 0.5)) / total) * 16); return '#'.repeat(on) + '-'.repeat(16 - on) }, [step, arrived, total])

  if (!active || !user) return null

  const head = (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <span aria-label={`Lesson ${step + 1} of ${total}`} style={{ fontFamily: "'Courier Prime', 'Courier New', monospace", fontWeight: 700, fontSize: 12, whiteSpace: 'pre', color: 'var(--on-ink-text-3)' }}>[{bar}] {step + 1}/{total}</span>
      <button onClick={finish} style={{ background: 'none', border: 0, cursor: 'pointer', fontSize: 11, fontWeight: 700, color: 'var(--on-ink-text-3)', textDecoration: 'underline', textUnderlineOffset: 3 }}>Skip tour</button>
    </div>
  )

  // Phase 2: explanation of the page they landed on
  if (arrived) {
    return (
      <aside role="dialog" aria-label={`Tour: ${lesson.title}`} style={{ ...CARD, right: 12, bottom: 12 }} className="max-md:!bottom-[76px]">
        {head}
        <h2 style={{ fontFamily: 'var(--font-display)', fontStretch: '125%', fontWeight: 800, fontSize: 18, textTransform: 'uppercase', margin: '0 0 8px' }}>{lesson.title}</h2>
        <p style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--on-ink-text-2)', margin: '0 0 14px' }}>{lesson.body}</p>
        <button className="t-btn t-btn-primary px-4 py-2" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.1em' }} onClick={advance} autoFocus>
          {step >= total - 1 ? 'Finish tour' : 'Next lesson'}
        </button>
      </aside>
    )
  }

  // Phase 1: spotlight the real sidebar item and wait for the click
  const pad = 4
  const place = rect
    ? { top: Math.max(12, rect.top - 6), left: rect.left + rect.width + 16 }
    : { right: 12, bottom: 12 }
  return (
    <>
      {rect && (
        <div aria-hidden="true" style={{ position: 'fixed', zIndex: 999, pointerEvents: 'none', top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2, borderRadius: 2, boxShadow: '0 0 0 9999px rgba(0,0,0,0.66)', outline: '2px solid var(--paper)', animation: 'tvx-tour-pulse 1.4s ease-out infinite' }} />
      )}
      <aside role="dialog" aria-label={`Tour: ${lesson.title}`} style={{ ...CARD, ...place }}>
        {head}
        <h2 style={{ fontFamily: 'var(--font-display)', fontStretch: '125%', fontWeight: 800, fontSize: 18, textTransform: 'uppercase', margin: '0 0 6px' }}>{lesson.title}</h2>
        <p style={{ fontSize: 14, fontWeight: 700, margin: '0 0 12px' }}>{rect ? `${lesson.nav} It is highlighted in the sidebar.` : lesson.nav}</p>
        {!rect && (
          <button className="t-btn t-btn-primary px-4 py-2" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.1em' }} onClick={() => navigate(lesson.path)}>Take me there</button>
        )}
      </aside>
      <style>{'@keyframes tvx-tour-pulse { 0% { outline-offset: 0; } 100% { outline-offset: 8px; outline-color: transparent; } }'}</style>
    </>
  )
}
