import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  useGetFriendsQuery,
  useLazySearchUsersQuery,
  useRequestFriendMutation,
  useAcceptFriendMutation,
  useRemoveFriendMutation,
  useGetMyReferralQuery,
  useRedeemReferralMutation,
} from '../../api/socialApi'
import { initialsOf } from '../../utils/identity'
import { supabase } from '../../utils/supabase/client'

/* Shared building blocks for the welcome flow and Settings. Styled with the site's ink/paper tokens. */

export const T = {
  paper: 'var(--paper)',
  muted: 'rgba(240,235,224,0.46)',
  faint: 'rgba(240,235,224,0.24)',
  line: 'rgba(240,235,224,0.10)',
  fill: 'rgba(240,235,224,0.045)',
  accent: 'var(--ochre-300)',
  good: '#9eb98a',
  bad: '#f08a7a',
  mono: 'var(--font-mono)',
  sans: 'var(--font-sans)',
  display: 'var(--font-display)',
}

export const label = { fontFamily: T.mono, fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: T.muted }

export const inputCss = {
  width: '100%', boxSizing: 'border-box', background: 'rgba(0,0,0,0.28)', border: `1px solid ${T.line}`,
  borderRadius: 12, padding: '14px 16px', fontFamily: T.sans, fontSize: 15, color: T.paper, outline: 'none',
}

export function Btn({ children, onClick, disabled, kind = 'ghost', style, ...rest }) {
  const base = {
    border: `1px solid ${T.line}`, borderRadius: 10, padding: '9px 14px', fontFamily: T.sans, fontSize: 13, fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1, transition: 'background 160ms, transform 160ms',
    background: T.fill, color: T.paper, whiteSpace: 'nowrap',
  }
  if (kind === 'solid') Object.assign(base, { background: T.paper, color: '#0b0b0b', border: '1px solid transparent' })
  return (
    <motion.button whileTap={disabled ? undefined : { scale: 0.96 }} onClick={onClick} disabled={disabled} style={{ ...base, ...style }} {...rest}>
      {children}
    </motion.button>
  )
}

export function Avatar({ name, src, size = 38 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: 'rgba(240,235,224,0.09)', border: `1px solid ${T.line}`, color: T.paper, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.34, fontWeight: 600, overflow: 'hidden', flexShrink: 0 }}>
      {src ? <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} referrerPolicy="no-referrer" /> : initialsOf(name)}
    </div>
  )
}

function copyText(text) {
  try { return navigator.clipboard.writeText(text) } catch { return Promise.reject() }
}

/* ─── Friends ───────────────────────────────────────────────────────────── */

function PersonRow({ person, children }) {
  const name = person.displayName ?? (person.username ? `@${person.username}` : 'Trader')
  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: T.fill, border: `1px solid ${T.line}`, borderRadius: 14 }}>
      <Avatar name={name} src={person.avatarUrl} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: T.paper, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</p>
        {person.username && <p style={{ margin: 0, fontFamily: T.mono, fontSize: 11, color: T.muted }}>@{person.username}</p>}
      </div>
      {children}
    </motion.div>
  )
}

export function FriendsPanel({ showLists = true }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [searched, setSearched] = useState(false)
  const [search, { isFetching }] = useLazySearchUsersQuery()
  const [request] = useRequestFriendMutation()
  const [accept] = useAcceptFriendMutation()
  const [remove] = useRemoveFriendMutation()
  const { data: lists } = useGetFriendsQuery()
  const [relOverride, setRelOverride] = useState({})
  const timer = useRef()

  useEffect(() => {
    const term = q.trim().replace(/^@/, '')
    clearTimeout(timer.current)
    if (term.length < 2) { setResults([]); setSearched(false); return }
    timer.current = setTimeout(async () => {
      const res = await search(term, true)
      setResults(res.data?.users ?? [])
      setSearched(true)
    }, 280)
    return () => clearTimeout(timer.current)
  }, [q, search])

  const setRel = (id, rel) => setRelOverride((o) => ({ ...o, [id]: rel }))
  const relOf = (u) => relOverride[u.userId] ?? u.relationship

  const act = async (u) => {
    const rel = relOf(u)
    if (rel === 'none') { const r = await request(u.userId).unwrap().catch(() => null); if (r) setRel(u.userId, r.relationship) }
    else if (rel === 'incoming') { const r = await accept(u.userId).unwrap().catch(() => null); if (r) setRel(u.userId, 'friends') }
    else if (rel === 'outgoing') { await remove(u.userId).unwrap().catch(() => null); setRel(u.userId, 'none') }
  }
  const labelFor = { none: 'Add', incoming: 'Accept', outgoing: 'Requested', friends: 'Friends ✓' }

  const incoming = lists?.incoming ?? []
  const friends = lists?.friends ?? []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: T.muted, fontFamily: T.mono }}>@</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value.replace(/[^a-zA-Z0-9_@]/g, '').slice(0, 21))}
          placeholder="Search by username"
          autoComplete="off"
          spellCheck={false}
          style={{ ...inputCss, paddingLeft: 34 }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
        <AnimatePresence initial={false}>
          {results.map((u) => (
            <PersonRow key={u.userId} person={u}>
              <Btn kind={relOf(u) === 'none' || relOf(u) === 'incoming' ? 'solid' : 'ghost'} disabled={relOf(u) === 'friends'} onClick={() => act(u)}>
                {labelFor[relOf(u)]}
              </Btn>
            </PersonRow>
          ))}
        </AnimatePresence>
        {searched && !isFetching && results.length === 0 && (
          <p style={{ margin: '4px 2px', fontSize: 13, color: T.muted }}>No one found with that username.</p>
        )}
        {!searched && !q && <p style={{ margin: '4px 2px', fontSize: 13, color: T.muted }}>Everyone on Travauxus is searchable by their @username.</p>}
      </div>

      {showLists && incoming.length > 0 && (
        <div>
          <p style={{ ...label, margin: '6px 0 8px' }}>Requests · {incoming.length}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {incoming.map((p) => (
              <PersonRow key={p.userId} person={p}>
                <Btn kind="solid" onClick={() => accept(p.userId)}>Accept</Btn>
                <Btn onClick={() => remove(p.userId)}>Decline</Btn>
              </PersonRow>
            ))}
          </div>
        </div>
      )}
      {showLists && friends.length > 0 && (
        <div>
          <p style={{ ...label, margin: '6px 0 8px' }}>Your friends · {friends.length}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {friends.map((p) => (
              <PersonRow key={p.userId} person={p}>
                <Btn onClick={() => remove(p.userId)}>Remove</Btn>
              </PersonRow>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Referral ──────────────────────────────────────────────────────────── */

export function ReferralPanel({ redeemed }) {
  const { data } = useGetMyReferralQuery()
  const [redeem, { isLoading }] = useRedeemReferralMutation()
  const [input, setInput] = useState(() => { try { return localStorage.getItem('travauxus_ref') ?? '' } catch { return '' } })
  const [msg, setMsg] = useState(redeemed ? { ok: true, text: redeemed } : null)
  const [copied, setCopied] = useState('')

  const code = data?.code
  const link = code ? `${window.location.origin}/onboarding?ref=${code}` : ''
  const days = data?.rewardDays ?? 7

  const flash = (what) => { setCopied(what); setTimeout(() => setCopied(''), 1600) }
  const copy = (text, what) => copyText(text).then(() => flash(what)).catch(() => setMsg({ ok: false, text: 'Copy failed — select and copy manually.' }))

  const apply = async () => {
    setMsg(null)
    try {
      const res = await redeem(input).unwrap()
      try { localStorage.removeItem('travauxus_ref') } catch { /* ignore */ }
      setMsg({ ok: true, text: `Code applied — ${res.days} days of Pro unlocked.` })
      supabase.auth.refreshSession() // pulls the new Pro expiry into the session so the app unlocks immediately
    } catch (err) {
      setMsg({ ok: false, text: err?.data?.message ?? 'Could not apply that code.' })
    }
  }

  const share = async () => {
    const text = `Join me on Travauxus — we both get ${days} days of Pro. Code: ${code}`
    if (navigator.share) { try { await navigator.share({ text, url: link }); return } catch { return } }
    copy(`${text} ${link}`, 'link')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ background: T.fill, border: `1px solid ${T.line}`, borderRadius: 18, padding: '18px 18px 16px' }}>
        <p style={{ ...label, margin: '0 0 10px' }}>Your invite code</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: T.mono, fontSize: 'clamp(26px,5vw,34px)', fontWeight: 600, letterSpacing: '0.18em', color: T.accent }}>
            {code ?? '·······'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <Btn kind="solid" disabled={!code} onClick={() => copy(code, 'code')}>{copied === 'code' ? 'Copied ✓' : 'Copy code'}</Btn>
          <Btn disabled={!code} onClick={() => copy(link, 'link')}>{copied === 'link' ? 'Link copied ✓' : 'Copy link'}</Btn>
          <Btn disabled={!code} onClick={share}>Share</Btn>
        </div>
        <p style={{ margin: '14px 0 0', fontSize: 13, color: T.muted, lineHeight: 1.6 }}>
          When a friend signs up with your code, you both get <span style={{ color: T.paper }}>{days} days of Pro</span> free.
          {data && ` ${data.referralCount} joined so far.`}
        </p>
      </div>

      <div>
        <p style={{ ...label, margin: '0 0 8px' }}>Have a code?</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12))}
            placeholder="ENTER CODE"
            style={{ ...inputCss, fontFamily: T.mono, letterSpacing: '0.18em', textTransform: 'uppercase' }}
            onKeyDown={(e) => e.key === 'Enter' && input.length >= 6 && apply()}
          />
          <Btn kind="solid" disabled={isLoading || input.length < 6 || msg?.ok} onClick={apply}>{isLoading ? '…' : 'Apply'}</Btn>
        </div>
        <AnimatePresence>
          {msg && (
            <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ margin: '10px 2px 0', fontSize: 13, color: msg.ok ? T.good : T.bad }}>
              {msg.text}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

/* ─── Recovery phrase ───────────────────────────────────────────────────── */

export function RecoveryPanel({ r, compactIntro = false }) {
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState(false)
  const [confirmReplace, setConfirmReplace] = useState(false)

  useEffect(() => { if (!r.words) setRevealed(false) }, [r.words])

  const warn = {
    background: 'rgba(240,138,122,0.08)', border: '1px solid rgba(240,138,122,0.28)', borderRadius: 14,
    padding: '12px 14px', fontSize: 13, lineHeight: 1.6, color: 'rgba(240,235,224,0.82)',
  }

  if (r.loading) return <div style={{ height: 120, borderRadius: 14, background: T.fill }} />
  if (!r.available) return <p style={{ color: T.muted, fontSize: 14 }}>Recovery phrases will be available soon.</p>

  // Already has one and nothing on screen: it can't be shown again
  if (!r.words && r.hasPhrase) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ ...warn, background: T.fill, border: `1px solid ${T.line}` }}>
          <strong style={{ color: T.paper }}>Your recovery phrase is set.</strong> For your security it can only be shown once, so we can&apos;t display it again.
          If you lost it, generate a new one — the old phrase stops working immediately.
        </div>
        {confirmReplace ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn kind="solid" disabled={r.creating} onClick={async () => { if (await r.generate({ replace: true })) setConfirmReplace(false) }}>
              {r.creating ? 'Generating…' : 'Yes, replace it'}
            </Btn>
            <Btn onClick={() => setConfirmReplace(false)}>Cancel</Btn>
          </div>
        ) : (
          <div><Btn onClick={() => setConfirmReplace(true)}>Generate a new phrase</Btn></div>
        )}
        {r.error && <p style={{ color: T.bad, fontSize: 13, margin: 0 }}>{r.error}</p>}
      </div>
    )
  }

  if (!r.words) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!compactIntro && (
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: T.muted }}>
            Six words that sign you in if you ever lose access to your email — right from the login page. No password needed.
          </p>
        )}
        <div style={warn}>
          <strong style={{ color: T.paper }}>You&apos;ll only see this once.</strong> Make sure nobody is looking at your screen, and have somewhere safe to write it down.
        </div>
        <div><Btn kind="solid" disabled={r.creating} onClick={() => r.generate()}>{r.creating ? 'Generating…' : 'Generate my phrase'}</Btn></div>
        {r.error && <p style={{ color: T.bad, fontSize: 13, margin: 0 }}>{r.error}</p>}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ position: 'relative' }}>
        <div
          aria-hidden={!revealed}
          style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8,
            filter: revealed ? 'blur(0)' : 'blur(11px)', transition: 'filter 420ms cubic-bezier(.22,1,.36,1)',
            userSelect: revealed ? 'text' : 'none', pointerEvents: revealed ? 'auto' : 'none',
          }}
        >
          {r.words.map((w, i) => (
            <div key={i} style={{ background: T.fill, border: `1px solid ${T.line}`, borderRadius: 12, padding: '11px 12px', display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontFamily: T.mono, fontSize: 10, color: T.faint }}>{i + 1}</span>
              <span style={{ fontFamily: T.mono, fontSize: 'clamp(13px,2.4vw,16px)', color: T.paper, fontWeight: 500 }}>{w}</span>
            </div>
          ))}
        </div>
        <AnimatePresence>
          {!revealed && (
            <motion.button
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setRevealed(true)}
              style={{ position: 'absolute', inset: 0, background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <span style={{ background: T.paper, color: '#0b0b0b', borderRadius: 999, padding: '10px 18px', fontSize: 13, fontWeight: 600, display: 'inline-flex', gap: 8, alignItems: 'center', boxShadow: '0 8px 30px rgba(0,0,0,.45)' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                Tap to reveal
              </span>
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {revealed && <Btn onClick={() => setRevealed(false)}>Hide</Btn>}
        <Btn disabled={!revealed} onClick={() => copyText(r.words.join(' ')).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600) }).catch(() => {})}>
          {copied ? 'Copied ✓' : 'Copy'}
        </Btn>
      </div>

      <div style={warn}>
        <strong style={{ color: T.paper }}>This is the only time it will be shown.</strong> Anyone with these words can sign in to your account, and we can&apos;t recover them for you.
        Write them down in order and keep them offline. If you close this screen before saving them, they&apos;re gone.
      </div>

      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: 14, color: T.paper, lineHeight: 1.5 }}>
        <input type="checkbox" checked={r.saved} onChange={(e) => r.setSaved(e.target.checked)} style={{ marginTop: 3, width: 16, height: 16, accentColor: '#d6b87a' }} />
        I&apos;ve saved my recovery phrase somewhere safe.
      </label>
    </div>
  )
}
