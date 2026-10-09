import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { useAuth } from '../contexts/AuthContext'
import {
  useGetConversationsQuery, useGetThreadQuery, useSendMessageMutation, useMarkThreadReadMutation,
  useGetFriendsQuery, useAcceptFriendMutation, useRemoveFriendMutation,
} from '../api/socialApi'
import { setSelectedTicker } from '../store/watchlistSlice'
import StockLogo from '../components/StockLogo'
import { FriendsPanel } from '../components/welcome/panels'
import PlayerName from '../components/PlayerName'
import FriendProfile from '../components/friends/FriendProfile'
import CoinPreview from '../components/friends/CoinPreview'
import Callouts from '../components/friends/Callouts'
import { useGetLeaderboardQuery } from '../api/eloApi'

const BORDER = 'var(--on-ink-border)'

/**
 * An empty friends list has one real obstacle: you do not know anyone's
 * @username yet. So rather than only naming the + Add button, this shows who is
 * actually climbing right now, straight from the live leaderboard, with a route
 * into each profile.
 */
function EmptyFriends() {
  const board = useGetLeaderboardQuery({ sort: 'elo', range: 'all', limit: 5 })
  // Seeded board entries carry no userId, so the standing is still worth showing
  // but must not become a link to a profile that does not exist.
  const rows = board.data?.rows ?? []

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ ...MONO, fontSize: 13, color: 'var(--on-ink-text-3)', margin: 0, lineHeight: 1.5 }}>
        No friends yet. Use <b>+ Add</b> to find people by @username, then message them and swap tickers.
      </p>

      {rows.length > 0 && (
        <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 14 }}>
          <p style={{ ...MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--on-ink-text-3)', margin: '0 0 10px' }}>
            Climbing right now
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {rows.map((r, i) => {
              const row = (
                <>
                  <span style={{ ...MONO, fontSize: 11, color: 'var(--on-ink-text-3)', width: 16 }}>{i + 1}</span>
                  <PlayerName user={r} />
                </>
              )
              // PlayerName paints a calling-card banner behind the name; without
              // clipping it bleeds over the row beneath.
              const style = {
                display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none',
                overflow: 'hidden', paddingBlock: 3, borderRadius: 2,
              }
              return r.userId
                ? <Link key={r.userId} to={`/profile/${r.userId}`} style={style}>{row}</Link>
                : <div key={`${r.username}-${i}`} style={style}>{row}</div>
            })}
          </div>
        </div>
      )}
    </div>
  )
}
const MONO = { fontFamily: 'var(--font-sans)' }
const MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
const TICKER_RE = /^[A-Za-z0-9:.\-]{1,15}$/

const nameOf = (u) => (u?.username ? `@${u.username}` : u?.displayName ?? 'Trader')
const initial = (u) => (u?.username || u?.displayName || '?').charAt(0).toUpperCase()

function timeShort(iso) {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000))
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}
const clock = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

function Avatar({ user, size = 36 }) {
  return user?.avatarUrl ? (
    <img src={user.avatarUrl} alt="" width={size} height={size} referrerPolicy="no-referrer" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  ) : (
    <span aria-hidden="true" style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--on-ink-2)', border: `1px solid ${BORDER}`, color: 'var(--paper)', fontWeight: 700, fontSize: size * 0.4 }}>
      {initial(user)}
    </span>
  )
}

function previewOf(m, meId) {
  if (!m) return 'Say hello'
  const mine = m.from === meId ? 'You: ' : ''
  if (m.attachment) {
    const label = m.attachment.symbol || m.attachment.ticker?.slice(0, 6)
    return label ? `${mine}shared $${label}` : `${mine}shared a token`
  }
  return mine + (m.body ?? '')
}

/* ── ticker card inside a message ─────────────────────────────────────────────
 * A share is only as good as the row it was written from: an older client, a hand-edited row or a coin that has since
 * died can all leave a field missing. Every branch below renders something; none of them reads through a field it has
 * not checked, because a bad attachment used to take the whole thread down with it.
 */
function TickerCard({ a, mine }) {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const ticker = typeof a?.ticker === 'string' ? a.ticker.trim() : ''
  const note = mine ? 'you shared this' : 'shared with you'

  // Solana mints get the same coin card as a callout: logo, live price, copyable address, and a click into the terminal.
  if (a?.kind === 'meme' || MINT_RE.test(ticker)) {
    return <div style={{ minWidth: 'min(280px, 100%)' }}><CoinPreview address={ticker} symbol={a?.symbol} note={note} /></div>
  }

  if (!ticker) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'var(--ink-900)', border: `1px dashed ${BORDER}`, borderRadius: 2, minWidth: 220 }}>
        <span aria-hidden="true" style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${BORDER}`, fontWeight: 700, color: 'var(--on-ink-text-4)' }}>?</span>
        <div style={{ ...MONO, fontSize: 11, color: 'var(--on-ink-text-3)' }}>This share no longer points at anything.</div>
      </div>
    )
  }

  const open = () => { dispatch(setSelectedTicker(ticker)); navigate('/stocks') }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'var(--ink-900)', color: 'var(--paper)', border: `1px solid ${BORDER}`, borderRadius: 2, minWidth: 220 }}>
      <StockLogo ticker={ticker} size={36} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontStretch: '125%', fontWeight: 800, fontSize: 16, textTransform: 'uppercase' }}>${a?.symbol || ticker}</div>
        <div style={{ ...MONO, fontSize: 11, color: 'var(--on-ink-text-3)' }}>Stock / crypto · {note}</div>
      </div>
      <button onClick={open} className="t-btn px-3 py-1.5" style={{ ...MONO, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Open</button>
    </div>
  )
}

function Bubble({ m, mine }) {
  return (
    <div style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', opacity: m.pending ? 0.55 : 1 }}>
      <div style={{ maxWidth: 'min(78%, 460px)', display: 'flex', flexDirection: 'column', gap: 6, alignItems: mine ? 'flex-end' : 'flex-start' }}>
        {m.attachment && <TickerCard a={m.attachment} mine={mine} />}
        {m.body && (
          <div style={{ ...MONO, fontSize: 14, lineHeight: 1.45, padding: '8px 12px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', borderRadius: 2, background: mine ? 'var(--paper)' : 'var(--ink-800)', color: mine ? 'var(--ink-900)' : 'var(--paper)', border: `1px solid ${mine ? 'var(--paper)' : BORDER}` }}>
            {m.body}
          </div>
        )}
        <span style={{ ...MONO, fontSize: 10, color: 'var(--on-ink-text-4)' }}>{m.pending ? 'sending' : clock(m.at)}</span>
      </div>
    </div>
  )
}

/* ── composer with ticker share ─────────────────────────────────────────── */
function Composer({ onSend, sending, error }) {
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [ticker, setTicker] = useState('')
  const watch = useSelector((s) => s.watchlist.stocks)

  const parsed = useMemo(() => {
    const t = ticker.trim()
    if (!t) return null
    if (MINT_RE.test(t)) return { kind: 'meme', ticker: t }
    const sym = t.replace(/^\$/, '')
    return TICKER_RE.test(sym) ? { kind: 'stock', ticker: sym.toUpperCase() } : null
  }, [ticker])

  const send = (attachment) => {
    const body = text.trim()
    if (!body && !attachment) return
    onSend({ body, ticker: attachment }).then((ok) => { if (ok) { setText(''); setOpen(false); setTicker('') } })
  }

  return (
    <div style={{ borderTop: `1px solid ${BORDER}`, background: 'var(--ink-800)', padding: 10 }}>
      {open && (
        <div style={{ marginBottom: 10, padding: 10, border: `1px dashed ${BORDER}` }}>
          <label htmlFor="share-ticker" style={{ ...MONO, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--on-ink-text-3)' }}>Share a ticker</label>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <input
              id="share-ticker" autoFocus value={ticker} onChange={(e) => setTicker(e.target.value.trim().slice(0, 48))}
              placeholder="NVDA, BTC, or a Solana contract address" className="t-input" style={{ flex: 1 }}
              onKeyDown={(e) => { if (e.key === 'Enter' && parsed) { e.preventDefault(); send(parsed) } }}
            />
            <button className={`t-btn px-4 ${parsed && !sending ? 't-btn-primary' : ''}`} disabled={!parsed || sending} onClick={() => send(parsed)} style={{ ...MONO, fontSize: 12, textTransform: 'uppercase' }}>Send</button>
          </div>
          {watch.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {watch.slice(0, 12).map((t) => (
                <button key={t} className="t-btn px-2 py-1" style={{ ...MONO, fontSize: 11 }} onClick={() => send({ kind: 'stock', ticker: t })} disabled={sending} title={`Send $${t}`}>${t}</button>
              ))}
            </div>
          )}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <button className={`t-btn px-3 py-2 ${open ? 't-on' : ''}`} onClick={() => setOpen((o) => !o)} aria-pressed={open} aria-label="Share a ticker" style={{ ...MONO, fontSize: 12 }}>$</button>
        <textarea
          value={text} onChange={(e) => setText(e.target.value.slice(0, 1000))} rows={1} aria-label="Message"
          placeholder="Message" className="t-input" style={{ flex: 1, resize: 'none', maxHeight: 120, minHeight: 38 }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(null) } }}
        />
        <button className={`t-btn px-4 py-2 ${text.trim() && !sending ? 't-btn-primary' : ''}`} disabled={!text.trim() || sending} onClick={() => send(null)} style={{ ...MONO, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Send</button>
      </div>
      {error && <p role="alert" style={{ ...MONO, fontSize: 12, color: 'var(--negative)', margin: '8px 0 0' }}>{error}</p>}
    </div>
  )
}

/* ── thread ─────────────────────────────────────────────────────────────── */
function Thread({ friend, meId }) {
  const q = useGetThreadQuery(friend.userId, { pollingInterval: 6000, skipPollingIfUnfocused: true, refetchOnMountOrArgChange: true })
  const [send, { isLoading: sending }] = useSendMessageMutation()
  const [markRead] = useMarkThreadReadMutation()
  const [error, setError] = useState('')
  const endRef = useRef(null)
  const messages = q.data?.messages ?? []
  const lastId = messages.at(-1)?.id
  const lastFromThem = messages.at(-1) && messages.at(-1).from !== meId

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [lastId, friend.userId])
  useEffect(() => { if (lastFromThem) markRead(friend.userId) }, [lastId, lastFromThem, friend.userId, markRead])

  const onSend = async (payload) => {
    setError('')
    // meId rides along for the local echo only; the request body is just { body, ticker }.
    const res = await send({ userId: friend.userId, meId, ...payload })
    if (res.error) { setError(res.error?.data?.message ?? 'Message failed to send.'); return false }
    return true
  }

  return (
    <section aria-label={`Conversation with ${nameOf(friend)}`} style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {q.isLoading && <p style={{ ...MONO, fontSize: 12, color: 'var(--on-ink-text-3)' }}>Loading…</p>}
        {q.isError && <p role="alert" style={{ ...MONO, fontSize: 12, color: 'var(--negative)' }}>Could not load this conversation. <button className="t-btn px-2 py-0.5" onClick={q.refetch}>Retry</button></p>}
        {!q.isLoading && !q.isError && messages.length === 0 && (
          <p style={{ ...MONO, fontSize: 13, color: 'var(--on-ink-text-3)', textAlign: 'center', marginTop: 40 }}>
            No messages yet. Say hello, or share a ticker with the <b>$</b> button.
          </p>
        )}
        {messages.map((m) => <Bubble key={m.id} m={m} mine={m.from === meId} />)}
        <div ref={endRef} />
      </div>
      <Composer onSend={onSend} sending={sending} error={error} />
    </section>
  )
}

/* ── one friend, two views ──────────────────────────────────────────────────
 * Visiting a friend lands on their profile — their calling card, their name, then their numbers, their live book and
 * their best closes, in the same order your own profile states them. The conversation is one tab away and keeps its
 * unread count, so nothing that used to be here has moved out of reach.
 */
function FriendPane({ friend, meId, unread, onBack }) {
  const [params, setParams] = useSearchParams()
  const view = params.get('view') === 'chat' ? 'chat' : 'profile'
  const show = (next) => {
    const p = new URLSearchParams(params)
    if (next === 'profile') p.delete('view'); else p.set('view', next)
    setParams(p, { replace: true })
  }
  const tab = { ...MONO, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em' }

  return (
    <section aria-label={nameOf(friend)} style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: `1px solid ${BORDER}`, background: 'var(--ink-800)' }}>
        <button onClick={onBack} className="md:hidden t-btn px-2 py-1" aria-label="Back to conversations" style={MONO}>{'<-'}</button>
        <button onClick={() => show('profile')} style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, background: 'transparent', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left' }} title={`View ${nameOf(friend)}`}>
          <Avatar user={friend} />
          <span style={{ minWidth: 0 }}>
            <PlayerName user={friend} size="md" link={false} aura={false} />
            {friend.displayName && friend.username && <span style={{ ...MONO, display: 'block', fontSize: 11, color: 'var(--on-ink-text-3)' }}>{friend.displayName}</span>}
          </span>
        </button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexShrink: 0 }}>
          <button className={`t-btn px-3 py-1.5 ${view === 'profile' ? 't-on' : ''}`} aria-pressed={view === 'profile'} onClick={() => show('profile')} style={tab}>Profile</button>
          <button className={`t-btn px-3 py-1.5 ${view === 'chat' ? 't-on' : ''}`} aria-pressed={view === 'chat'} onClick={() => show('chat')} style={tab}>
            Chat{unread > 0 && <span style={{ marginLeft: 6, fontWeight: 800 }}>{unread}</span>}
          </button>
        </div>
      </header>
      {view === 'chat'
        ? <Thread key={friend.userId} friend={friend} meId={meId} />
        : <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}><FriendProfile userId={friend.userId} onMessage={() => show('chat')} /></div>}
    </section>
  )
}

/* ── page ───────────────────────────────────────────────────────────────── */
export default function Friends() {
  const { userId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [adding, setAdding] = useState(false)
  const convos = useGetConversationsQuery(undefined, { pollingInterval: 20000, skipPollingIfUnfocused: true })
  const lists = useGetFriendsQuery()
  const [accept] = useAcceptFriendMutation()
  const [decline] = useRemoveFriendMutation()
  const list = convos.data?.conversations ?? []
  const incoming = lists.data?.incoming ?? []
  const outgoing = lists.data?.outgoing ?? []
  const activeConvo = list.find((c) => c.user.userId === userId)
  const active = activeConvo?.user
  const activeUnread = activeConvo?.unread ?? 0

  return (
    <main className="flex flex-1 min-h-0" style={{ height: 'calc(100vh)', minHeight: 520 }}>
      <aside
        className={userId ? 'hidden md:flex' : 'flex'}
        style={{ width: 'min(100%, 320px)', flexShrink: 0, flexDirection: 'column', borderRight: `1px solid ${BORDER}`, background: 'var(--ink-800)', flex: userId ? undefined : '1 1 auto', maxWidth: userId ? 320 : undefined }}
      >
        <div style={{ padding: '14px 14px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${BORDER}` }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontStretch: '125%', fontWeight: 800, fontSize: 18, textTransform: 'uppercase', margin: 0, color: 'var(--paper)' }}>Friends</h1>
          <button className={`t-btn px-3 py-1.5 ${adding ? 't-on' : ''}`} aria-pressed={adding} onClick={() => setAdding((a) => !a)} style={{ ...MONO, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{adding ? 'Close' : '+ Add'}</button>
        </div>

        {adding && <div style={{ padding: 12, borderBottom: `1px solid ${BORDER}`, overflowY: 'auto', maxHeight: '55%' }}><FriendsPanel showLists={false} /></div>}

        {incoming.length > 0 && (
          <div style={{ padding: '8px 14px', borderBottom: `1px solid ${BORDER}` }}>
            <p style={{ ...MONO, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--on-ink-text-3)', margin: '0 0 6px' }}>Requests · {incoming.length}</p>
            {incoming.map((p) => (
              <div key={p.userId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>
                <Avatar user={p} size={28} />
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}><PlayerName user={p} size="sm" /></span>
                <button className="t-btn t-btn-primary px-2 py-1" style={{ ...MONO, fontSize: 11 }} onClick={() => accept(p.userId)}>Accept</button>
                <button className="t-btn px-2 py-1" style={{ ...MONO, fontSize: 11 }} onClick={() => decline(p.userId)}>No</button>
              </div>
            ))}
          </div>
        )}

        {outgoing.length > 0 && (
          <div style={{ padding: '8px 14px', borderBottom: `1px solid ${BORDER}` }}>
            <p style={{ ...MONO, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--on-ink-text-3)', margin: '0 0 6px' }}>Sent · {outgoing.length}</p>
            {outgoing.map((p) => (
              <div key={p.userId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                <Avatar user={p} size={24} />
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}><PlayerName user={p} size="sm" elo={false} /></span>
                <button className="t-btn px-2 py-1" style={{ ...MONO, fontSize: 11 }} onClick={() => decline(p.userId)}>Cancel</button>
              </div>
            ))}
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {convos.isLoading && <p style={{ ...MONO, fontSize: 12, color: 'var(--on-ink-text-3)', padding: 14 }}>Loading…</p>}
          {convos.isError && <p role="alert" style={{ ...MONO, fontSize: 12, color: 'var(--negative)', padding: 14 }}>Could not load conversations.</p>}
          {!convos.isLoading && !convos.isError && list.length === 0 && <EmptyFriends />}
          {list.map((c) => {
            const on = c.user.userId === userId
            return (
              <button
                key={c.user.userId} onClick={() => navigate(`/friends/${c.user.userId}`)} aria-current={on ? 'true' : undefined}
                className="t-row" style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 10, textAlign: 'left' }}
              >
                <Avatar user={c.user} />
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ ...MONO, display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 14, fontWeight: c.unread ? 700 : 600, color: 'var(--paper)' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}><PlayerName user={c.user} size="sm" link={false} aura={false} /></span>
                    {c.last && <span style={{ fontSize: 10, color: 'var(--on-ink-text-3)', flexShrink: 0 }}>{timeShort(c.last.at)}</span>}
                  </span>
                  <span style={{ ...MONO, display: 'block', fontSize: 12, color: c.unread ? 'var(--paper)' : 'var(--on-ink-text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {previewOf(c.last, user?.id)}
                  </span>
                </span>
                {c.unread > 0 && <span aria-label={`${c.unread} unread`} style={{ ...MONO, minWidth: 18, height: 18, padding: '0 5px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, background: 'var(--paper)', color: 'var(--ink-900)', borderRadius: 2 }}>{c.unread}</span>}
              </button>
            )
          })}
        </div>
      </aside>

      <div className={userId ? 'flex flex-1 min-w-0' : 'hidden md:flex flex-1 min-w-0'} style={{ flexDirection: 'column' }}>
        {active ? (
          <FriendPane key={active.userId} friend={active} meId={user?.id} unread={activeUnread} onBack={() => navigate('/friends')} />
        ) : userId && !convos.isLoading ? (
          <div style={{ ...MONO, margin: 'auto', textAlign: 'center', padding: 24, color: 'var(--on-ink-text-3)', fontSize: 13 }}>
            You are not friends yet.<br />
            <Link to={`/profile/${userId}`} style={{ color: 'var(--paper)' }}>View their profile</Link> to send a request.
          </div>
        ) : (
          /* The dead space: with no conversation open, the pane carries the circle's callouts instead of a shrug. */
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 'clamp(14px, 2.5vw, 24px)' }}>
            <div style={{ maxWidth: 560, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <p style={{ ...MONO, fontSize: 12.5, color: 'var(--on-ink-text-3)', margin: 0 }}>
                Pick a friend to see what they are holding, or share a ticker with them.
              </p>
              <Callouts meId={user?.id} />
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
