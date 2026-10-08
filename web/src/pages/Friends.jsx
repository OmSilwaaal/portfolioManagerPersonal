import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { useAuth } from '../contexts/AuthContext'
import {
  useGetConversationsQuery, useGetThreadQuery, useSendMessageMutation, useMarkThreadReadMutation,
  useGetFriendsQuery, useAcceptFriendMutation, useRemoveFriendMutation,
} from '../api/socialApi'
import { setSelectedTicker } from '../store/watchlistSlice'
import StockLogo from '../components/StockLogo'
import { FriendsPanel } from '../components/welcome/panels'

const BORDER = 'var(--on-ink-border)'
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
  if (m.attachment) return `${mine}shared $${m.attachment.symbol || m.attachment.ticker.slice(0, 6)}`
  return mine + m.body
}

/* ── ticker card inside a message ───────────────────────────────────────── */
function TickerCard({ a, mine }) {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const label = a.symbol || (a.kind === 'meme' ? `${a.ticker.slice(0, 4)}…${a.ticker.slice(-4)}` : a.ticker)
  const open = () => {
    if (a.kind === 'meme') navigate(`/terminal?token=${a.ticker}`)
    else { dispatch(setSelectedTicker(a.ticker)); navigate('/stocks') }
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'var(--ink-900)', color: 'var(--paper)', border: `1px solid ${BORDER}`, borderRadius: 2, minWidth: 220 }}>
      {a.kind === 'meme' ? (
        <span aria-hidden="true" style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${BORDER}`, fontWeight: 700 }}>$</span>
      ) : <StockLogo ticker={a.ticker} size={36} />}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontStretch: '125%', fontWeight: 800, fontSize: 16, textTransform: 'uppercase' }}>${label}</div>
        <div style={{ ...MONO, fontSize: 11, color: 'var(--on-ink-text-3)' }}>{a.kind === 'meme' ? 'Solana token' : 'Stock / crypto'}{mine ? ' · you shared' : ''}</div>
      </div>
      <button onClick={open} className="t-btn px-3 py-1.5" style={{ ...MONO, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Open</button>
    </div>
  )
}

function Bubble({ m, mine }) {
  return (
    <div style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
      <div style={{ maxWidth: 'min(78%, 460px)', display: 'flex', flexDirection: 'column', gap: 6, alignItems: mine ? 'flex-end' : 'flex-start' }}>
        {m.attachment && <TickerCard a={m.attachment} mine={mine} />}
        {m.body && (
          <div style={{ ...MONO, fontSize: 14, lineHeight: 1.45, padding: '8px 12px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', borderRadius: 2, background: mine ? 'var(--paper)' : 'var(--ink-800)', color: mine ? 'var(--ink-900)' : 'var(--paper)', border: `1px solid ${mine ? 'var(--paper)' : BORDER}` }}>
            {m.body}
          </div>
        )}
        <span style={{ ...MONO, fontSize: 10, color: 'var(--on-ink-text-4)' }}>{clock(m.at)}</span>
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
            <button className="t-btn t-btn-primary px-4" disabled={!parsed || sending} onClick={() => send(parsed)} style={{ ...MONO, fontSize: 12, textTransform: 'uppercase' }}>Send</button>
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
        <button className="t-btn t-btn-primary px-4 py-2" disabled={!text.trim() || sending} onClick={() => send(null)} style={{ ...MONO, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Send</button>
      </div>
      {error && <p role="alert" style={{ ...MONO, fontSize: 12, color: 'var(--negative)', margin: '8px 0 0' }}>{error}</p>}
    </div>
  )
}

/* ── thread ─────────────────────────────────────────────────────────────── */
function Thread({ friend, meId, onBack }) {
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
    const res = await send({ userId: friend.userId, ...payload })
    if (res.error) { setError(res.error?.data?.message ?? 'Message failed to send.'); return false }
    return true
  }

  return (
    <section aria-label={`Conversation with ${nameOf(friend)}`} style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: `1px solid ${BORDER}`, background: 'var(--ink-800)' }}>
        <button onClick={onBack} className="md:hidden t-btn px-2 py-1" aria-label="Back to conversations" style={MONO}>{'<-'}</button>
        <Link to={friend.username ? `/u/${friend.username}` : `/profile/${friend.userId}`} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', minWidth: 0 }}>
          <Avatar user={friend} />
          <div style={{ minWidth: 0 }}>
            <div style={{ ...MONO, fontWeight: 700, fontSize: 14, color: 'var(--paper)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nameOf(friend)}</div>
            {friend.displayName && friend.username && <div style={{ ...MONO, fontSize: 11, color: 'var(--on-ink-text-3)' }}>{friend.displayName}</div>}
          </div>
        </Link>
        <Link to={friend.username ? `/u/${friend.username}` : `/profile/${friend.userId}`} className="t-btn px-3 py-1.5" style={{ ...MONO, marginLeft: 'auto', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', textDecoration: 'none' }}>Profile</Link>
      </header>
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
  const active = list.find((c) => c.user.userId === userId)?.user

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
                <span style={{ ...MONO, fontSize: 13, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--paper)' }}>{nameOf(p)}</span>
                <button className="t-btn t-btn-primary px-2 py-1" style={{ ...MONO, fontSize: 11 }} onClick={() => accept(p.userId)}>Accept</button>
                <button className="t-btn px-2 py-1" style={{ ...MONO, fontSize: 11 }} onClick={() => decline(p.userId)}>No</button>
              </div>
            ))}
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {convos.isLoading && <p style={{ ...MONO, fontSize: 12, color: 'var(--on-ink-text-3)', padding: 14 }}>Loading…</p>}
          {convos.isError && <p role="alert" style={{ ...MONO, fontSize: 12, color: 'var(--negative)', padding: 14 }}>Could not load conversations.</p>}
          {!convos.isLoading && !convos.isError && list.length === 0 && (
            <p style={{ ...MONO, fontSize: 13, color: 'var(--on-ink-text-3)', padding: 16, lineHeight: 1.5 }}>
              No friends yet. Use <b>+ Add</b> to find people by @username, then message them and swap tickers.
            </p>
          )}
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
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nameOf(c.user)}</span>
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
          <Thread key={active.userId} friend={active} meId={user?.id} onBack={() => navigate('/friends')} />
        ) : userId && !convos.isLoading ? (
          <div style={{ ...MONO, margin: 'auto', textAlign: 'center', padding: 24, color: 'var(--on-ink-text-3)', fontSize: 13 }}>
            You can only message friends.<br />
            <Link to={`/profile/${userId}`} style={{ color: 'var(--paper)' }}>View their profile</Link> to send a request.
          </div>
        ) : (
          <div style={{ ...MONO, margin: 'auto', textAlign: 'center', padding: 24, color: 'var(--on-ink-text-3)', fontSize: 13 }}>
            Pick a conversation, or share a ticker with a friend.
          </div>
        )}
      </div>
    </main>
  )
}
