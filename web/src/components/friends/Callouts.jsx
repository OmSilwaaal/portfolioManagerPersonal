import { useEffect, useMemo, useRef, useState } from 'react'
import { useGetCalloutsQuery, useWatchCalloutsQuery, usePostCalloutMutation, useDeleteCalloutMutation } from '../../api/socialApi'
import { useGetMyProfileQuery } from '../../api/profilesApi'
import { useGetMemePositionsQuery, useGetMemeHistoryQuery } from '../../api/memecoinApi'
import PlayerName from '../PlayerName'
import CoinPreview from './CoinPreview'
import { fmtPrice, timeShort } from './fmt'

const BORDER = 'var(--on-ink-border)'
const MONO = { fontFamily: 'var(--font-sans)' }
const LABEL = { ...MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--on-ink-text-3)' }
const MAX_BODY = 240          // the server caps at the same number
const PAGE = 12               // previews resolve a price in pages, so a long feed cannot flood the global rate limiter
const BACKSTOP_MS = 30_000    // slow safety net: the push is in-process on the server, so a second instance needs one
const REARM_MS = 3_000        // floor between parked reads, so a server answering instantly can never become a spin loop

/**
 * Keeps the feed fresh by parking a read on the server until there is something newer, instead of polling harder.
 * Only runs while the tab is visible, re-arms no faster than REARM_MS, and does nothing at all until the first page
 * has loaded — so the worst case it can degrade to is a slow poll.
 */
function useCalloutPush(newestId, onNew) {
  const [epoch, setEpoch] = useState(0)
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || !document.hidden)
  useEffect(() => {
    const sync = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', sync)
    return () => document.removeEventListener('visibilitychange', sync)
  }, [])

  const armed = visible && newestId > 0
  const watch = useWatchCalloutsQuery({ after: newestId, epoch }, { skip: !armed })

  // The re-arm timer is held in a ref rather than returned as effect cleanup: the effect re-runs whenever RTK hands
  // back a new flag, and cleaning up there would cancel the pending re-arm and quietly stall the loop.
  const timer = useRef(null)
  const handled = useRef('')
  const notify = useRef(onNew)
  notify.current = onNew

  useEffect(() => () => clearTimeout(timer.current), [])
  // Coming back from a hidden tab starts a fresh subscription, so the last answer must count as unhandled again.
  useEffect(() => { if (armed) handled.current = '' }, [armed])

  useEffect(() => {
    if (!armed || watch.isFetching) return
    if (watch.data === undefined && !watch.isError) return
    const token = `${newestId}:${epoch}`
    if (handled.current === token) return
    handled.current = token
    const top = watch.data?.callouts?.[0]
    if (top && top.id > newestId) notify.current()
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setEpoch((n) => n + 1), REARM_MS)
  }, [armed, watch.isFetching, watch.data, watch.isError, newestId, epoch])
}

/** Which of my positions may be called out: what I hold now, plus mints I have bought before and since closed. */
function useMyCallable() {
  const open = useGetMemePositionsQuery()
  const history = useGetMemeHistoryQuery({ limit: 50 })
  return useMemo(() => {
    const held = (open.data?.positions ?? []).map((p) => ({ address: p.address, symbol: p.symbol, stance: 'open' }))
    const heldSet = new Set(held.map((p) => p.address))
    const closed = []
    for (const h of history.data?.items ?? []) {
      if (heldSet.has(h.address) || closed.some((c) => c.address === h.address)) continue
      closed.push({ address: h.address, symbol: h.symbol, stance: 'closed' })
    }
    return { options: [...held, ...closed.slice(0, 12)], loading: open.isLoading || history.isLoading }
  }, [open.data, history.data, open.isLoading, history.isLoading])
}

function Composer({ onDone, author }) {
  const { options, loading } = useMyCallable()
  const [pick, setPick] = useState(null)
  const [text, setText] = useState('')
  const [post, { isLoading: posting }] = usePostCalloutMutation()
  const [error, setError] = useState('')

  // `.t-btn:disabled` outranks `.t-btn-primary` in terminal.css, so a disabled primary keeps its paper fill and
  // loses its text colour. Wear the primary class only while the button can actually be pressed.
  const canPost = Boolean(pick && text.trim() && !posting)

  const submit = async () => {
    setError('')
    const res = await post({ address: pick.address, symbol: pick.symbol, body: text.trim(), author })
    if (res.error) { setError(res.error?.data?.message ?? 'Could not post that callout.'); return }
    setText(''); setPick(null); onDone?.()
  }

  return (
    <div role="group" aria-label="Post a callout" style={{ padding: 12, border: `1px dashed ${BORDER}`, borderRadius: 2, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={LABEL}>Call out one of your positions</p>
      {loading && <p style={{ ...MONO, fontSize: 12, color: 'var(--on-ink-text-3)', margin: 0 }}>Loading your positions…</p>}
      {!loading && options.length === 0 && (
        <p style={{ ...MONO, fontSize: 12, color: 'var(--on-ink-text-3)', margin: 0 }}>
          You can only call out a coin you have traded. Buy something in the terminal first.
        </p>
      )}
      {options.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {options.map((o) => (
            <button
              key={o.address} onClick={() => setPick(o)} aria-pressed={pick?.address === o.address}
              className={`t-btn px-2 py-1 ${pick?.address === o.address ? 't-on' : ''}`}
              style={{ ...MONO, fontSize: 11 }} title={o.stance === 'open' ? 'Open position' : 'Closed position'}
            >
              ${o.symbol}{o.stance === 'closed' && <span style={{ opacity: 0.6 }}> · closed</span>}
            </button>
          ))}
        </div>
      )}
      <textarea
        value={text} onChange={(e) => setText(e.target.value.slice(0, MAX_BODY))} rows={2} aria-label="Callout"
        placeholder="What is the call?" className="t-input" style={{ resize: 'none', minHeight: 54 }}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && pick && text.trim()) { e.preventDefault(); submit() } }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ ...MONO, fontSize: 10, color: text.length >= MAX_BODY ? 'var(--negative)' : 'var(--on-ink-text-4)' }}>{text.length}/{MAX_BODY}</span>
        <button
          className={`t-btn px-4 py-1.5 ${canPost ? 't-btn-primary' : ''}`}
          style={{ ...MONO, marginLeft: 'auto', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em' }}
          disabled={!canPost} onClick={submit}
        >
          {posting ? 'Posting…' : 'Post callout'}
        </button>
      </div>
      {error && <p role="alert" style={{ ...MONO, fontSize: 12, color: 'var(--negative)', margin: 0 }}>{error}</p>}
    </div>
  )
}

function Callout({ c, mine, resolve }) {
  const [remove, { isLoading: removing }] = useDeleteCalloutMutation()
  return (
    <article style={{ padding: '10px 0', borderBottom: `1px solid ${BORDER}`, display: 'flex', flexDirection: 'column', gap: 8, opacity: c.pending ? 0.55 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, overflow: 'hidden' }}>
        <PlayerName user={c.user} size="sm" aura={false} />
        <span className="t-chip" data-tone={c.stance === 'open' ? 'ok' : undefined}>{c.stance === 'open' ? 'holding' : 'closed'}</span>
        <span style={{ ...MONO, fontSize: 10, color: 'var(--on-ink-text-4)', marginLeft: 'auto', flexShrink: 0 }}>{c.pending ? 'sending' : timeShort(c.at)}</span>
        {mine && !c.pending && (
          <button className="t-btn px-1.5 py-0.5" style={{ ...MONO, fontSize: 10, flexShrink: 0 }} disabled={removing} onClick={() => remove(c.id)} aria-label="Delete callout">x</button>
        )}
      </div>
      {/* Rendered as a text node: whatever survived the server's sanitiser is shown, never interpreted. */}
      <p style={{ ...MONO, fontSize: 13, lineHeight: 1.45, color: 'var(--paper)', margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{c.body}</p>
      <CoinPreview address={c.address} symbol={c.symbol} resolve={resolve} compact note={c.entry != null ? `called at ${fmtPrice(c.entry)}` : null} />
    </article>
  )
}

/**
 * Live callouts: what your circle is shouting about right now, each with the coin under it. Fills the friends tab when
 * no conversation is open, which is where the dead space was.
 */
export default function Callouts({ meId }) {
  const q = useGetCalloutsQuery(undefined, { pollingInterval: BACKSTOP_MS, skipPollingIfUnfocused: true })
  const [composing, setComposing] = useState(false)
  const [shown, setShown] = useState(PAGE)
  const list = q.data?.callouts ?? []
  const me = useGetMyProfileQuery(undefined, { skip: !meId })

  // The newest *confirmed* id: a local echo carries a string id, and parking a read on it would never return.
  const newestId = list.find((c) => typeof c.id === 'number')?.id ?? 0
  useCalloutPush(newestId, q.refetch)

  // Enough of an identity card for PlayerName to render the echo the way the server will send it back.
  const author = meId ? { userId: meId, username: me.data?.username ?? null, displayName: me.data?.display_name ?? null, avatarUrl: null } : null

  return (
    <section aria-label="Callouts" style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontStretch: '125%', fontWeight: 800, fontSize: 14, textTransform: 'uppercase', margin: 0, color: 'var(--paper)' }}>Callouts</h2>
        <button className={`t-btn px-3 py-1 ${composing ? 't-on' : ''}`} aria-pressed={composing} onClick={() => setComposing((c) => !c)} style={{ ...MONO, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {composing ? 'Close' : '+ Callout'}
        </button>
      </div>

      {composing && <Composer onDone={() => setComposing(false)} author={author} />}

      {q.isLoading && <p style={{ ...MONO, fontSize: 12, color: 'var(--on-ink-text-3)', margin: 0 }}>Loading callouts…</p>}
      {q.isError && <p role="alert" style={{ ...MONO, fontSize: 12, color: 'var(--negative)', margin: 0 }}>Could not load callouts.</p>}
      {!q.isLoading && !q.isError && list.length === 0 && (
        <p style={{ ...MONO, fontSize: 12.5, lineHeight: 1.5, color: 'var(--on-ink-text-3)', margin: 0 }}>
          Nothing called out yet. Post one about a coin you hold — or one you already closed — and your friends will see it here.
        </p>
      )}

      <div>
        {list.slice(0, shown).map((c, i) => (
          <Callout key={c.id} c={c} mine={c.user.userId === meId} resolve={i < shown} />
        ))}
      </div>
      {list.length > shown && (
        <button className="t-btn px-3 py-1.5" style={{ ...MONO, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }} onClick={() => setShown((n) => n + PAGE)}>
          Show more
        </button>
      )}
    </section>
  )
}
