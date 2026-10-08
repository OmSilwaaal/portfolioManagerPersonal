import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { useGetClansQuery, useCreateClanMutation, useJoinClanMutation } from '../api/clansApi'
import { formatElo, signedUsd, pct } from '../utils/elo'

const BORDER = 'var(--on-ink-border)'
const MONO = { fontFamily: 'var(--font-sans)' }
const NUM = { fontVariantNumeric: 'tabular-nums' }
const SORTS = [{ id: 'pnl', label: 'Clan PnL' }, { id: 'elo', label: 'Avg Elo' }, { id: 'members', label: 'Members' }]
const CLAN_COLORS = ['#e2e8f0', '#38bdf8', '#34d399', '#fbbf24', '#fb923c', '#f87171', '#f472b6', '#a78bfa']
const LABEL = { ...MONO, fontSize: 11, fontWeight: 700, color: 'var(--on-ink-text-3)', display: 'block', marginBottom: 6 }

const errText = (e) => e?.data?.message ?? 'Something went wrong. Try again.'

function CreateClan({ onDone }) {
  const [create, { isLoading }] = useCreateClanMutation()
  const [f, setF] = useState({ name: '', tag: '', description: '', color: CLAN_COLORS[1] })
  const [err, setErr] = useState('')
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: k === 'tag' ? e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 5).toUpperCase() : e.target.value }))
  const ok = f.name.trim().length >= 3 && f.tag.length >= 2
  const submit = async (e) => {
    e.preventDefault()
    setErr('')
    const res = await create(f)
    if (res.error) setErr(errText(res.error)); else onDone(res.data)
  }
  return (
    <form onSubmit={submit} style={{ border: `1px solid ${BORDER}`, background: 'var(--ink-800)', padding: 16, display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
      <div>
        <label htmlFor="clan-name" style={LABEL}>Clan name</label>
        <input id="clan-name" className="t-input" value={f.name} onChange={set('name')} maxLength={24} placeholder="Alpha Wolves" autoComplete="off" />
      </div>
      <div>
        <label htmlFor="clan-tag" style={LABEL}>Tag (shown as [TAG] before every member's name)</label>
        <input id="clan-tag" className="t-input" value={f.tag} onChange={set('tag')} maxLength={5} placeholder="WOLF" autoComplete="off" style={{ textTransform: 'uppercase' }} />
      </div>
      <div style={{ gridColumn: '1 / -1' }}>
        <label htmlFor="clan-desc" style={LABEL}>What is your clan about?</label>
        <input id="clan-desc" className="t-input" value={f.description} onChange={set('description')} maxLength={200} placeholder="Memecoin snipers. No paper hands." />
      </div>
      <div style={{ gridColumn: '1 / -1' }}>
        <span style={LABEL}>Tag colour</span>
        <div role="radiogroup" aria-label="Tag colour" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {CLAN_COLORS.map((c) => <button type="button" key={c} role="radio" aria-checked={f.color === c} aria-label={c} onClick={() => setF((x) => ({ ...x, color: c }))} style={{ width: 28, height: 28, background: c, border: f.color === c ? '2px solid var(--paper)' : `1px solid ${BORDER}`, cursor: 'pointer' }} />)}
        </div>
      </div>
      <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <span style={{ ...MONO, fontSize: 14, fontWeight: 800, color: f.color }}>[{f.tag || 'TAG'}] <span style={{ color: 'var(--paper)' }}>@you</span></span>
        <button className="t-btn t-btn-primary px-4 py-2" disabled={!ok || isLoading} style={{ ...MONO, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{isLoading ? 'Creating…' : 'Create clan'}</button>
        <button type="button" className="t-btn px-3 py-2" style={{ ...MONO, fontSize: 12 }} onClick={() => onDone(null)}>Cancel</button>
        {err && <span role="alert" style={{ ...MONO, fontSize: 12, color: 'var(--negative)' }}>{err}</span>}
      </div>
    </form>
  )
}

function ClanRow({ c, myClanId }) {
  const navigate = useNavigate()
  const [join, { isLoading }] = useJoinClanMutation()
  const [err, setErr] = useState('')
  const inOther = myClanId != null && c.id !== myClanId
  const open = () => c.id && navigate(`/clans/${c.id}`)
  return (
    <li style={{ display: 'grid', gridTemplateColumns: '40px minmax(0, 1fr) auto', gap: 12, alignItems: 'center', padding: '12px 14px', borderTop: `1px solid ${BORDER}`, background: c.mine ? 'var(--on-ink-2)' : 'transparent' }}>
      <span style={{ fontFamily: 'var(--font-display)', fontStretch: '125%', fontWeight: 800, fontSize: 16, color: 'var(--on-ink-text-3)', ...NUM }}>{c.rank}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <span style={{ ...MONO, fontWeight: 800, fontSize: 15, color: c.color }}>[{c.tag}]</span>
          {c.id ? (
            <Link to={`/clans/${c.id}`} style={{ ...MONO, fontWeight: 700, fontSize: 15, color: 'var(--paper)', textDecoration: 'none' }}>{c.name}</Link>
          ) : <span style={{ ...MONO, fontWeight: 700, fontSize: 15, color: 'var(--paper)' }}>{c.name}</span>}
          {c.mine && <span className="t-chip" style={{ color: 'var(--paper)' }}>Your clan</span>}
        </div>
        <div style={{ ...MONO, fontSize: 12, color: 'var(--on-ink-text-3)', ...NUM, marginTop: 2 }}>
          {c.members} members · avg <span style={{ color: 'var(--paper)' }}>{formatElo(c.avgElo)}</span> Elo · {pct(c.winRate)} win rate
        </div>
        {c.description && <div style={{ ...MONO, fontSize: 12, color: 'var(--on-ink-text-4)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.description}</div>}
        {err && <div role="alert" style={{ ...MONO, fontSize: 11, color: 'var(--negative)', marginTop: 4 }}>{err}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontStretch: '125%', fontWeight: 800, fontSize: 17, color: c.pnl >= 0 ? 'var(--positive)' : 'var(--negative)', ...NUM }}>{signedUsd(c.pnl)}</div>
          <div style={{ ...MONO, fontSize: 10, color: 'var(--on-ink-text-4)' }}>clan PnL</div>
        </div>
        {c.mine ? (
          <button className="t-btn px-3 py-1.5" style={{ ...MONO, fontSize: 11, textTransform: 'uppercase' }} onClick={open}>Open</button>
        ) : !c.id ? (
          <span style={{ ...MONO, fontSize: 11, color: 'var(--on-ink-text-3)' }}>Invite only</span>
        ) : (
          <button
            className="t-btn t-btn-primary px-3 py-1.5" style={{ ...MONO, fontSize: 11, textTransform: 'uppercase' }}
            disabled={isLoading || inOther} title={inOther ? 'You can only be in one clan. Leave yours first.' : undefined}
            onClick={async () => { setErr(''); const r = await join(c.id); if (r.error) setErr(errText(r.error)); else open() }}
          >{isLoading ? 'Joining…' : 'Join'}</button>
        )}
      </div>
    </li>
  )
}

export default function Clans() {
  const navigate = useNavigate()
  const isPro = useSelector((s) => s.preferences.isPro)
  const [sort, setSort] = useState('pnl')
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)
  const query = useGetClansQuery({ sort, q: q.trim() })
  const clans = query.data?.clans ?? []
  const mine = query.data?.myClanId ?? null

  return (
    <main className="flex-1 w-full px-4 py-6 sm:px-10 sm:py-8" style={{ maxWidth: 960, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontStretch: '125%', fontWeight: 800, fontSize: 30, textTransform: 'uppercase', margin: 0, letterSpacing: '-0.01em', color: 'var(--paper)' }}>Clans</h1>
          <p style={{ ...MONO, fontSize: 13, color: 'var(--on-ink-text-3)', margin: '6px 0 0', maxWidth: 560, lineHeight: 1.5 }}>
            One clan per trader. Wear its [TAG] before your name, and add your trades to the clan's PnL. A clan's PnL is every member's realized profit since they joined.
          </p>
        </div>
        {!mine && !creating && (
          isPro
            ? <button className="t-btn t-btn-primary px-4 py-2" style={{ ...MONO, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.1em' }} onClick={() => setCreating(true)}>Create a clan</button>
            : <Link to="/pricing" className="t-btn px-4 py-2" style={{ ...MONO, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.1em', textDecoration: 'none' }} title="Founding a clan is a Pro feature">Pro to create a clan</Link>
        )}
      </div>

      {creating && <CreateClan onDone={(c) => { setCreating(false); if (c?.id) navigate(`/clans/${c.id}`) }} />}
      {mine && <p style={{ ...MONO, fontSize: 13, color: 'var(--on-ink-text-2)', margin: 0 }}>You are in a clan. Open it below, or leave it from its page to join another.</p>}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <div role="tablist" aria-label="Sort clans" className="flex gap-1">
          {SORTS.map((s) => <button key={s.id} role="tab" aria-selected={sort === s.id} onClick={() => setSort(s.id)} className="t-tab">{s.label}</button>)}
        </div>
        <input className="t-input" style={{ maxWidth: 240 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or tag" aria-label="Search clans" />
      </div>

      {query.isLoading && <p style={{ ...MONO, fontSize: 13, color: 'var(--on-ink-text-3)' }}>Loading clans…</p>}
      {query.isError && <p role="alert" style={{ ...MONO, fontSize: 13, color: 'var(--negative)' }}>Could not load clans. <button className="t-btn px-2 py-0.5" onClick={query.refetch}>Retry</button></p>}
      {!query.isLoading && !query.isError && clans.length === 0 && (
        <div style={{ border: `1px dashed ${BORDER}`, padding: 28, textAlign: 'center', ...MONO, color: 'var(--on-ink-text-2)', fontSize: 14, lineHeight: 1.6 }}>
          {q ? 'No clan matches that search.' : 'No clans yet. Pro members can found the first one.'}
        </div>
      )}
      {clans.length > 0 && (
        <ol aria-label="Clan ranking" style={{ listStyle: 'none', margin: 0, padding: 0, border: `1px solid ${BORDER}`, borderTop: 0, background: 'var(--ink-800)' }}>
          {clans.map((c) => <ClanRow key={c.id ?? c.tag} c={c} myClanId={mine} />)}
        </ol>
      )}
    </main>
  )
}
