import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  useGetClanQuery, useJoinClanMutation, useLeaveClanMutation, useDisbandClanMutation, useKickFromClanMutation,
  useGetClanPostsQuery, usePostToClanMutation, useDeleteClanPostMutation,
} from '../api/clansApi'
import { useAuth } from '../contexts/AuthContext'
import PlayerName from '../components/PlayerName'
import { formatElo, signedUsd, pct } from '../utils/elo'

const BORDER = 'var(--on-ink-border)'
const MONO = { fontFamily: 'var(--font-sans)' }
const NUM = { fontVariantNumeric: 'tabular-nums' }
const errText = (e) => e?.data?.message ?? 'Something went wrong. Try again.'
const clock = (iso) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

function Board({ id, meId, isOwner }) {
  const q = useGetClanPostsQuery(id, { pollingInterval: 15000, skipPollingIfUnfocused: true })
  const [post, { isLoading }] = usePostToClanMutation()
  const [del] = useDeleteClanPostMutation()
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const posts = q.data?.posts ?? []
  const send = async () => {
    const body = text.trim()
    if (!body) return
    setErr('')
    const r = await post({ id, body })
    if (r.error) setErr(errText(r.error)); else setText('')
  }
  return (
    <section aria-label="Clan board" style={{ border: `1px solid ${BORDER}`, background: 'var(--ink-800)', display: 'flex', flexDirection: 'column' }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontStretch: '125%', fontWeight: 800, fontSize: 15, textTransform: 'uppercase', margin: 0, padding: '12px 14px', borderBottom: `1px solid ${BORDER}`, color: 'var(--paper)' }}>Clan board</h2>
      <ul style={{ listStyle: 'none', margin: 0, padding: 14, display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 380, overflowY: 'auto' }}>
        {q.isLoading && <li style={{ ...MONO, fontSize: 12, color: 'var(--on-ink-text-3)' }}>Loading…</li>}
        {!q.isLoading && posts.length === 0 && <li style={{ ...MONO, fontSize: 13, color: 'var(--on-ink-text-3)' }}>Nothing here yet. Call a trade, share a ticker, or say gm.</li>}
        {posts.map((p) => (
          <li key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <PlayerName user={p.user} size="sm" />
              <span style={{ ...MONO, fontSize: 10, color: 'var(--on-ink-text-4)' }}>{clock(p.at)}</span>
              {(p.userId === meId || isOwner) && <button onClick={() => del({ id, postId: p.id })} className="t-btn px-1.5 py-0" style={{ ...MONO, fontSize: 10 }} aria-label="Delete post">delete</button>}
            </div>
            <p style={{ ...MONO, fontSize: 14, margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: 'var(--paper)' }}>{p.body}</p>
            {p.attachment && <span className="t-chip" style={{ alignSelf: 'flex-start', color: 'var(--paper)' }}>${p.attachment.ticker}</span>}
          </li>
        ))}
      </ul>
      <div style={{ display: 'flex', gap: 8, padding: 10, borderTop: `1px solid ${BORDER}` }}>
        <textarea className="t-input" rows={1} value={text} maxLength={500} aria-label="Post to your clan" placeholder="Message your clan" style={{ resize: 'none', minHeight: 38 }}
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} />
        <button className="t-btn t-btn-primary px-4" disabled={!text.trim() || isLoading} onClick={send} style={{ ...MONO, fontSize: 12, textTransform: 'uppercase' }}>Post</button>
      </div>
      {err && <p role="alert" style={{ ...MONO, fontSize: 12, color: 'var(--negative)', margin: '0 12px 10px' }}>{err}</p>}
    </section>
  )
}

export default function ClanDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const q = useGetClanQuery(id)
  const [join, { isLoading: joining }] = useJoinClanMutation()
  const [leave, { isLoading: leaving }] = useLeaveClanMutation()
  const [disband] = useDisbandClanMutation()
  const [kick] = useKickFromClanMutation()
  const [err, setErr] = useState('')
  const [confirm, setConfirm] = useState(null)

  if (q.isLoading) return <div className="flex-1 flex items-center justify-center" aria-busy="true"><p style={{ ...MONO, fontSize: 13, color: 'var(--on-ink-text-3)' }}>Loading clan…</p></div>
  if (q.isError || !q.data) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <p style={{ ...MONO, fontSize: 14, color: 'var(--on-ink-text-2)' }}>Clan not found.</p>
        <Link to="/clans" style={{ ...MONO, color: 'var(--paper)', fontSize: 13 }}>Back to clans</Link>
      </div>
    )
  }
  const { clan, members, isMember, canJoin, full, inOtherClan } = q.data
  const isOwner = clan.role === 'owner'
  const run = async (fn, after) => { setErr(''); const r = await fn(); if (r.error) setErr(errText(r.error)); else after?.() }

  return (
    <main className="flex-1 w-full px-4 py-6 sm:px-10 sm:py-8" style={{ maxWidth: 960, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Link to="/clans" style={{ ...MONO, fontSize: 12, color: 'var(--on-ink-text-3)', textDecoration: 'none' }}>&larr; All clans</Link>
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontStretch: '125%', fontWeight: 800, fontSize: 30, textTransform: 'uppercase', margin: 0, color: 'var(--paper)', overflowWrap: 'anywhere' }}>
            <span style={{ color: clan.color }}>[{clan.tag}]</span> {clan.name}
          </h1>
          {clan.description && <p style={{ ...MONO, fontSize: 14, color: 'var(--on-ink-text-2)', margin: '8px 0 0', maxWidth: '60ch' }}>{clan.description}</p>}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {!isMember && (
            <button
              className="t-btn t-btn-primary px-4 py-2" style={{ ...MONO, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.1em' }}
              disabled={!canJoin || joining} title={inOtherClan ? 'You can only be in one clan. Leave yours first.' : undefined}
              onClick={() => run(() => join(clan.id))}
            >{full ? 'Clan full' : inOtherClan ? 'Already in a clan' : joining ? 'Joining…' : 'Join clan'}</button>
          )}
          {isMember && !confirm && <button className="t-btn px-4 py-2" style={{ ...MONO, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.1em' }} onClick={() => setConfirm('leave')}>Leave clan</button>}
          {isOwner && !confirm && <button className="t-btn px-4 py-2" style={{ ...MONO, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--negative)' }} onClick={() => setConfirm('disband')}>Disband</button>}
          {confirm && (
            <div role="alertdialog" aria-label="Confirm" style={{ display: 'flex', gap: 8, alignItems: 'center', ...MONO, fontSize: 12 }}>
              <span>{confirm === 'leave' ? (isOwner ? 'Leave? Ownership passes to your longest-standing member.' : 'Leave this clan?') : 'Disband for everyone?'}</span>
              <button className="t-btn t-btn-primary px-3 py-1.5" disabled={leaving} onClick={() => run(() => (confirm === 'leave' ? leave() : disband(clan.id)), () => navigate('/clans'))}>Yes</button>
              <button className="t-btn px-3 py-1.5" onClick={() => setConfirm(null)}>No</button>
            </div>
          )}
        </div>
      </header>
      {err && <p role="alert" style={{ ...MONO, fontSize: 13, color: 'var(--negative)', margin: 0 }}>{err}</p>}

      <dl style={{ display: 'flex', gap: '8px 36px', flexWrap: 'wrap', margin: 0, padding: '12px 0', borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}` }}>
        {[
          ['Clan PnL', signedUsd(clan.pnl), clan.pnl >= 0 ? 'var(--positive)' : 'var(--negative)'],
          ['Members', `${clan.members}/50`],
          ['Avg Elo', formatElo(clan.avgElo)],
          ['Win rate', pct(clan.winRate)],
          ['Trades', clan.trades],
        ].map(([k, v, c]) => (
          <div key={k}>
            <dd style={{ margin: 0, fontFamily: 'var(--font-display)', fontStretch: '125%', fontWeight: 800, fontSize: 24, color: c || 'var(--paper)', ...NUM }}>{v}</dd>
            <dt style={{ ...MONO, fontSize: 11, color: 'var(--on-ink-text-3)' }}>{k}</dt>
          </div>
        ))}
      </dl>
      <p style={{ ...MONO, fontSize: 12, color: 'var(--on-ink-text-3)', margin: '-8px 0 0' }}>Clan PnL adds up each member's realized profit and loss since the day they joined.</p>

      <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', alignItems: 'start' }}>
        <section aria-label="Members" style={{ border: `1px solid ${BORDER}`, background: 'var(--ink-800)' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontStretch: '125%', fontWeight: 800, fontSize: 15, textTransform: 'uppercase', margin: 0, padding: '12px 14px', color: 'var(--paper)' }}>Members</h2>
          <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {members.map((m) => (
              <li key={m.userId} style={{ display: 'grid', gridTemplateColumns: '28px minmax(0, 1fr) auto', gap: 8, alignItems: 'center', padding: '9px 14px', borderTop: `1px solid ${BORDER}`, background: m.mine ? 'var(--on-ink-2)' : 'transparent' }}>
                <span style={{ ...MONO, fontWeight: 800, color: 'var(--on-ink-text-3)', ...NUM }}>{m.rank}</span>
                <div style={{ minWidth: 0 }}>
                  <PlayerName user={m} size="sm" />
                  {m.role === 'owner' && <span className="t-chip" style={{ marginLeft: 6 }}>Owner</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ ...MONO, fontSize: 13, fontWeight: 700, color: m.pnl >= 0 ? 'var(--positive)' : 'var(--negative)', ...NUM }}>{signedUsd(m.pnl)}</span>
                  {isOwner && !m.mine && <button className="t-btn px-1.5 py-0" style={{ ...MONO, fontSize: 10 }} onClick={() => run(() => kick({ id: clan.id, userId: m.userId }))} aria-label={`Remove ${m.username ?? 'member'}`}>kick</button>}
                </div>
              </li>
            ))}
          </ol>
        </section>
        {isMember ? <Board id={clan.id} meId={user?.id} isOwner={isOwner} /> : (
          <p style={{ ...MONO, fontSize: 13, color: 'var(--on-ink-text-3)', margin: 0, border: `1px dashed ${BORDER}`, padding: 20 }}>Join this clan to read and post on its board.</p>
        )}
      </div>
    </main>
  )
}
