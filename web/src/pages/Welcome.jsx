import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import Logo from '../components/Logo'
import { useGetMyProfileQuery, useUpdateProfileMutation } from '../api/profilesApi'
import { useRedeemReferralMutation } from '../api/socialApi'
import { supabase } from '../utils/supabase/client'
import { useRecovery } from '../components/welcome/useRecovery'
import { FriendsPanel, ReferralPanel, RecoveryPanel, Btn, T, label, inputCss } from '../components/welcome/panels'

/* Post-quiz setup: a car-dashboard style set of cards with Back (bottom-left) and Next (bottom-right) keys. */

const EASE = [0.22, 1, 0.36, 1]
const USERNAME_RE = /^[a-z0-9_]{3,20}$/

const Icon = ({ d, extra }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />{extra}
  </svg>
)

const STEPS = [
  { id: 'username', title: 'Claim your @', sub: 'Your handle is how friends find you and how you appear on the leaderboard.', icon: <Icon d="M16 12a4 4 0 1 0-8 0 4 4 0 0 0 8 0zm0 0v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.6 7.2" /> },
  { id: 'friends', title: 'Find your people', sub: 'Search anyone by @username. Trading is better with someone to beat.', icon: <Icon d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" extra={<circle cx="9" cy="7" r="4" />} /> },
  { id: 'referral', title: 'Invite & earn', sub: 'Share your code. When someone joins with it, you both get free Pro.', icon: <Icon d="M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" /> },
  { id: 'recovery', title: 'Recovery phrase', sub: 'Your backup key. Shown once — keep it somewhere safe.', icon: <Icon d="M21 2l-2 2m-7.6 7.6a5.5 5.5 0 1 1-7.8 7.8 5.5 5.5 0 0 1 7.8-7.8zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3" /> },
]

/* ─── Blurred dashboard backdrop ─────────────────────────────────────────── */
function Backdrop() {
  const reduce = useReducedMotion()
  const orb = (color, size, pos, drift, dur) => (
    <motion.div
      aria-hidden
      animate={reduce ? undefined : { x: drift[0], y: drift[1], scale: [1, 1.12, 1] }}
      transition={{ duration: dur, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}
      style={{ position: 'absolute', width: size, height: size, borderRadius: '50%', background: color, filter: 'blur(90px)', opacity: 0.5, ...pos }}
    />
  )
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: 'var(--ink-950)' }}>
      {orb('radial-gradient(circle, #c9a86a 0%, transparent 70%)', 520, { top: '-14%', left: '-8%' }, [60, 40], 14)}
      {orb('radial-gradient(circle, #566838 0%, transparent 70%)', 600, { bottom: '-22%', right: '-10%' }, [-70, -30], 17)}
      {orb('radial-gradient(circle, #803e26 0%, transparent 70%)', 420, { top: '38%', left: '46%' }, [-40, 50], 19)}
      {/* faint road-grid, like a nav display */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(240,235,224,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(240,235,224,.035) 1px, transparent 1px)', backgroundSize: '56px 56px', maskImage: 'radial-gradient(ellipse at center, #000 30%, transparent 75%)', WebkitMaskImage: 'radial-gradient(ellipse at center, #000 30%, transparent 75%)' }} />
      <div style={{ position: 'absolute', inset: 0, backdropFilter: 'blur(26px)', WebkitBackdropFilter: 'blur(26px)' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,.7) 100%)' }} />
    </div>
  )
}

/* ─── Soft-key (Back / Next) ─────────────────────────────────────────────── */
function Key({ side, children, onClick, disabled, primary }) {
  const arrow = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      {side === 'left' ? <path d="M19 12H5M12 19l-7-7 7-7" /> : <path d="M5 12h14M12 5l7 7-7 7" />}
    </svg>
  )
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      whileHover={disabled ? undefined : { scale: 1.03 }}
      whileTap={disabled ? undefined : { scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 420, damping: 26 }}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, minWidth: 'clamp(110px, 20vw, 168px)', justifyContent: side === 'left' ? 'flex-start' : 'flex-end',
        padding: '0 22px', height: 58, borderRadius: 18, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.38 : 1,
        fontFamily: T.sans, fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em',
        background: primary ? T.paper : 'rgba(240,235,224,0.07)', color: primary ? '#0b0b0b' : T.paper,
        border: primary ? '1px solid transparent' : `1px solid ${T.line}`,
        boxShadow: primary ? '0 10px 34px rgba(214,184,122,.22), inset 0 -2px 0 rgba(0,0,0,.12)' : 'inset 0 1px 0 rgba(255,255,255,.05)',
      }}
    >
      {side === 'left' && arrow}{children}{side === 'right' && arrow}
    </motion.button>
  )
}

/* ─── Page ───────────────────────────────────────────────────────────────── */
export default function Welcome() {
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const { data: profile } = useGetMyProfileQuery()
  const [updateProfile] = useUpdateProfileMutation()
  const [redeem] = useRedeemReferralMutation()
  const recovery = useRecovery()

  const [[step, dir], setNav] = useState([0, 1])
  const [username, setUsername] = useState('')
  const [usernameTouched, setUsernameTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [leave, setLeave] = useState(null) // pending navigation target while the unsaved-phrase warning is open
  const [refNote, setRefNote] = useState(null)

  useEffect(() => { if (profile?.username && !usernameTouched) setUsername(profile.username) }, [profile, usernameTouched])

  // A code captured from an invite link (?ref=) is applied automatically as soon as the account exists
  useEffect(() => {
    let code = null
    try { code = localStorage.getItem('travauxus_ref') } catch { /* ignore */ }
    if (!code) return
    redeem(code).unwrap()
      .then((res) => {
        try { localStorage.removeItem('travauxus_ref') } catch { /* ignore */ }
        setRefNote(`Invite code applied — ${res.days} days of Pro unlocked.`)
        supabase.auth.refreshSession()
      })
      .catch(() => { /* leave it prefilled in the card so the user can see why / retry */ })
  }, [redeem])

  const usernameValid = USERNAME_RE.test(username)
  const last = step === STEPS.length - 1
  const cur = STEPS[step]

  const move = (to) => setNav([to, to > step ? 1 : -1])

  // Every exit from the recovery card goes through here so an unsaved phrase can't be lost by accident
  const goTo = (to) => {
    if (to === step) return
    if (step === 3 && recovery.pending) { setLeave(to); return }
    if (step === 3 && recovery.saved) recovery.clear() // saved → wipe it from memory for good
    move(to)
  }

  const finish = () => navigate('/feed', { replace: true })

  const next = async () => {
    setError('')
    if (step === 0 && username !== profile?.username) {
      setSaving(true)
      try { await updateProfile({ username }).unwrap() }
      catch (err) { setError(err?.data?.message ?? 'Could not save that username.'); setSaving(false); return }
      setSaving(false)
    }
    if (last) {
      if (recovery.pending) { setLeave('finish'); return }
      finish(); return
    }
    goTo(step + 1)
  }

  const nextDisabled = saving || (step === 0 && !usernameValid)
  const nextLabel = saving ? 'Saving…' : last ? (recovery.words || recovery.hasPhrase ? 'Enter Travauxus' : 'Skip for now') : 'Next'

  const variants = useMemo(() => ({
    enter: (d) => ({ opacity: 0, x: reduce ? 0 : d * 56, scale: reduce ? 1 : 0.985, filter: reduce ? 'none' : 'blur(10px)' }),
    center: { opacity: 1, x: 0, scale: 1, filter: reduce ? 'none' : 'blur(0px)' },
    exit: (d) => ({ opacity: 0, x: reduce ? 0 : d * -56, scale: reduce ? 1 : 0.985, filter: reduce ? 'none' : 'blur(10px)' }),
  }), [reduce])

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, color: T.paper, fontFamily: T.sans }}>
      <Backdrop />

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7, ease: EASE }}
        style={{
          position: 'relative', width: 'min(980px, 100%)', height: 'min(680px, calc(100dvh - 32px))', display: 'flex', flexDirection: 'column',
          background: 'linear-gradient(160deg, rgba(34,33,29,.62), rgba(14,14,13,.72))', border: `1px solid ${T.line}`, borderRadius: 30,
          backdropFilter: 'blur(34px) saturate(140%)', WebkitBackdropFilter: 'blur(34px) saturate(140%)',
          boxShadow: '0 40px 120px rgba(0,0,0,.65), inset 0 1px 0 rgba(255,255,255,.07)', overflow: 'hidden',
        }}
      >
        {/* Top bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 26px 0' }}>
          <Logo size="sm" />
          <span style={label}>Setup · {String(step + 1).padStart(2, '0')} / {String(STEPS.length).padStart(2, '0')}</span>
        </div>

        <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 22, padding: '18px 26px 0' }}>
          {/* Rail */}
          <nav className="welcome-rail" style={{ width: 210, flexShrink: 0, flexDirection: 'column', gap: 8, paddingTop: 6 }}>
            {STEPS.map((s, i) => {
              const active = i === step
              const done = i < step
              return (
                <button
                  key={s.id}
                  onClick={() => goTo(i)}
                  disabled={i > step}
                  style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', padding: '13px 14px', borderRadius: 16, border: '1px solid transparent', background: 'transparent', color: active ? T.paper : T.muted, cursor: 'pointer', fontFamily: T.sans, fontSize: 14, fontWeight: 600 }}
                >
                  {active && (
                    <motion.span layoutId="rail-pill" transition={{ type: 'spring', stiffness: 380, damping: 34 }} style={{ position: 'absolute', inset: 0, borderRadius: 16, background: 'rgba(240,235,224,0.09)', border: `1px solid ${T.line}` }} />
                  )}
                  <span style={{ position: 'relative', display: 'flex', width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', background: active ? T.accent : 'rgba(240,235,224,0.06)', color: active ? '#0b0b0b' : done ? T.good : T.muted, transition: 'background 300ms, color 300ms' }}>
                    {done ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg> : s.icon}
                  </span>
                  <span style={{ position: 'relative' }}>{s.title}</span>
                </button>
              )
            })}
          </nav>

          {/* Card stage */}
          <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
            <AnimatePresence initial={false} custom={dir}>
              <motion.section
                key={cur.id}
                custom={dir}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: reduce ? 0.2 : 0.6, ease: EASE }}
                style={{ position: 'absolute', inset: 0, overflowY: 'auto', paddingRight: 4, paddingBottom: 12 }}
              >
                <h1 style={{ fontFamily: T.display, fontVariationSettings: "'wdth' 125, 'wght' 700", fontWeight: 700, fontSize: 'clamp(26px, 4.4vw, 38px)', letterSpacing: '-0.04em', lineHeight: 1, margin: '6px 0 10px' }}>
                  {cur.title}
                </h1>
                <p style={{ margin: '0 0 22px', fontSize: 14, lineHeight: 1.65, color: T.muted, maxWidth: 520 }}>{cur.sub}</p>

                {cur.id === 'username' && (
                  <div style={{ maxWidth: 440 }}>
                    <p style={{ ...label, margin: '0 0 8px' }}>Username</p>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: T.muted, fontFamily: T.mono, fontSize: 16 }}>@</span>
                      <input
                        autoFocus
                        value={username}
                        onChange={(e) => { setUsernameTouched(true); setError(''); setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20)) }}
                        onKeyDown={(e) => e.key === 'Enter' && !nextDisabled && next()}
                        placeholder="yourname"
                        autoComplete="off"
                        spellCheck={false}
                        style={{ ...inputCss, paddingLeft: 36, fontFamily: T.mono, fontSize: 17 }}
                      />
                    </div>
                    <p style={{ margin: '10px 2px 0', fontSize: 12.5, color: error ? T.bad : username && !usernameValid ? T.accent : T.muted }}>
                      {error || '3–20 characters: letters, numbers and underscores.'}
                    </p>
                  </div>
                )}
                {cur.id === 'friends' && <FriendsPanel />}
                {cur.id === 'referral' && <ReferralPanel redeemed={refNote} />}
                {cur.id === 'recovery' && <RecoveryPanel r={recovery} />}
              </motion.section>
            </AnimatePresence>
          </div>
        </div>

        {/* Bottom keys */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '16px 22px 22px' }}>
          <Key side="left" onClick={() => goTo(step - 1)} disabled={step === 0}>Back</Key>
          <div style={{ display: 'flex', gap: 7 }} aria-hidden>
            {STEPS.map((s, i) => (
              <motion.span key={s.id} animate={{ width: i === step ? 26 : 7, background: i === step ? '#d6b87a' : i < step ? 'rgba(158,185,138,.7)' : 'rgba(240,235,224,.18)' }} transition={{ duration: 0.4, ease: EASE }} style={{ height: 7, borderRadius: 4 }} />
            ))}
          </div>
          <Key side="right" primary onClick={next} disabled={nextDisabled}>{nextLabel}</Key>
        </div>

        {/* Unsaved-phrase warning */}
        <AnimatePresence>
          {leave !== null && (
            <motion.div
              role="alertdialog" aria-modal="true" aria-labelledby="leave-title"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
              style={{ position: 'absolute', inset: 0, zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(5,5,5,.6)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }}
            >
              <motion.div initial={{ y: 18, scale: 0.96 }} animate={{ y: 0, scale: 1 }} exit={{ y: 10, scale: 0.98 }} transition={{ duration: 0.4, ease: EASE }}
                style={{ maxWidth: 420, background: 'rgba(24,23,20,.92)', border: '1px solid rgba(240,138,122,.35)', borderRadius: 22, padding: 26 }}>
                <h2 id="leave-title" style={{ fontFamily: T.display, fontVariationSettings: "'wdth' 125, 'wght' 700", fontSize: 24, letterSpacing: '-0.03em', margin: '0 0 10px' }}>Leave without saving?</h2>
                <p style={{ margin: '0 0 20px', fontSize: 14, lineHeight: 1.65, color: T.muted }}>
                  Your recovery phrase is shown <strong style={{ color: T.paper }}>only once</strong>. If you leave now you won&apos;t be able to see it again — you&apos;d have to generate a new one from Settings.
                </p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <Btn onClick={() => { recovery.clear(); const t = leave; setLeave(null); t === 'finish' ? finish() : move(t) }}>Leave anyway</Btn>
                  <Btn kind="solid" onClick={() => setLeave(null)}>Go back &amp; save it</Btn>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <style>{`
        .welcome-rail { display: none; }
        @media (min-width: 760px) { .welcome-rail { display: flex; } }
      `}</style>
    </div>
  )
}
