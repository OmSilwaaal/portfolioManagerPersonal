import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useGetLeaderboardQuery, useGetMyEloQuery } from '../api/eloApi'
import { useRequestFriendMutation, useGetFriendsQuery } from '../api/socialApi'
import { useAuth } from '../contexts/AuthContext'
import CallingCard from '../ascii/CallingCard'
import PlayerName, { EloBadge } from '../components/PlayerName'
import BigWins from '../components/leaderboard/BigWins'
import CardPicker from '../components/leaderboard/CardPicker'
import { formatElo, signedUsd, pct, tierById, tierFor, TIERS } from '../utils/elo'

const BORDER = 'var(--on-ink-border)'
const MONO = { fontFamily: 'var(--font-sans)' }
const NUM = { fontVariantNumeric: 'tabular-nums' }

const RANGES = [
  { id: 'day', label: '24h' },
  { id: 'week', label: '7d' },
  { id: 'month', label: '30d' },
  { id: 'all', label: 'All time' },
]
// Each board: what it sorts by and the figure shown big on every row
const BOARDS = [
  { id: 'elo',     label: 'Elo',        hint: 'Rating from win rate and total PnL. Always all-time.', value: (r) => formatElo(r.elo), unit: 'Elo' },
  { id: 'pnl',     label: 'Total PnL',  hint: 'Realized profit minus losses in the window.', value: (r) => signedUsd(r.totalPnl), unit: 'PnL', tone: (r) => (r.totalPnl >= 0 ? 'var(--positive)' : 'var(--negative)') },
  { id: 'winrate', label: 'Win rate',   hint: 'Share of closed trades in profit. Needs 5+ trades.', value: (r) => pct(r.winRate), unit: 'win rate' },
  { id: 'best',    label: 'Best trade', hint: 'Single biggest winning trade.', value: (r) => signedUsd(r.bestWin), unit: 'best', tone: () => 'var(--positive)' },
  { id: 'streak',  label: 'Streak',     hint: 'Winning trades in a row, right now.', value: (r) => `${r.streak}`, unit: 'in a row' },
  { id: 'trades',  label: 'Volume',     hint: 'Closed trades in the window.', value: (r) => `${r.trades}`, unit: 'trades' },
  { id: 'wins',    label: 'Big wins',   hint: 'Hall of fame: the biggest single trades, with killcams.' },
]

function Avatar({ r, size = 36 }) {
  const label = (r.username || r.displayName || '?').charAt(0).toUpperCase()
  return r.avatarUrl ? (
    <img src={r.avatarUrl} alt="" width={size} height={size} referrerPolicy="no-referrer" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  ) : (
    <span aria-hidden="true" style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--on-ink-2)', border: `1px solid ${BORDER}`, color: 'var(--paper)', fontWeight: 700, fontSize: size * 0.4 }}>{label}</span>
  )
}

/** Progress drawn in characters: [#########-----------] */
function AsciiBar({ pct: p, color, width = 28 }) {
  const on = Math.round((Math.max(0, Math.min(100, p)) / 100) * width)
  return (
    <span aria-hidden="true" style={{ fontFamily: "'Courier Prime', 'Courier New', monospace", fontWeight: 700, color, letterSpacing: 0, whiteSpace: 'pre' }}>
      [{'#'.repeat(on)}<span style={{ color: 'var(--on-ink-text-4)' }}>{'-'.repeat(width - on)}</span>]
    </span>
  )
}

/* ── your standing ──────────────────────────────────────────────────────── */
function Standing({ me, onEditLook }) {
  const { user } = useAuth()
  if (!me) return null
  const tier = tierById(me.tier)
  const next = me.next
  return (
    <section aria-label="Your standing" style={{ border: `1px solid ${BORDER}`, background: 'var(--ink-800)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
      <div style={{ position: 'relative', minHeight: 150, overflow: 'hidden', background: '#07070a', borderRight: `1px solid ${BORDER}` }}>
        <CallingCard scene="summit" progress={me.pct / 100 * 0.9 + 0.05} cols={100} rows={16} fps={8} style={{ border: 0, position: 'absolute', inset: 0, minWidth: '100%' }} label="Your climb up the Elo ladder" />
        <div style={{ position: 'absolute', inset: 'auto 0 0 0', padding: '28px 14px 12px', background: 'linear-gradient(0deg, rgba(7,7,10,0.92), rgba(7,7,10,0))' }}>
          <div style={{ ...MONO, fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>{me.position ? `#${me.position} of ${me.ranked} ranked` : 'Not ranked yet. Close a trade.'}</div>
        </div>
      </div>
      <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontStretch: '125%', fontWeight: 900, fontSize: 'clamp(32px, 5vw, 48px)', lineHeight: 1, color: tier.color, ...NUM }}>{me.elo.toLocaleString('en-US')}</span>
          <span style={{ fontFamily: 'var(--font-display)', fontStretch: '125%', fontWeight: 800, fontSize: 16, textTransform: 'uppercase', color: 'var(--paper)' }}>{tier.name}</span>
        </div>
        <div style={{ fontSize: 13, overflowX: 'auto' }}><AsciiBar pct={me.pct} color={tier.color} /></div>
        <p style={{ ...MONO, fontSize: 13, color: 'var(--on-ink-text-2)', margin: 0 }}>
          {next ? <><b style={{ color: 'var(--paper)', ...NUM }}>{next.needed.toLocaleString('en-US')}</b> Elo to {next.name}. </> : 'You are at the top of the ladder. '}
          {me.elo < 500 ? 'You ranked down. Win trades to climb back.' : 'Losses rank you down, so pick your trades.'}
        </p>
        <dl style={{ display: 'flex', gap: '4px 22px', flexWrap: 'wrap', margin: 0, ...MONO, fontSize: 12 }}>
          {[['Win rate', pct(me.winRate)], ['Trades', me.trades], ['PnL', signedUsd(me.totalPnl)], ['Streak', me.streak]].map(([k, v]) => (
            <div key={k}><dt style={{ color: 'var(--on-ink-text-3)', display: 'inline' }}>{k} </dt><dd style={{ margin: 0, display: 'inline', fontWeight: 700, color: 'var(--paper)', ...NUM }}>{v}</dd></div>
          ))}
        </dl>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
          <button className="t-btn px-3 py-1.5" style={{ ...MONO, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em' }} onClick={onEditLook}>Calling card &amp; name colour</button>
          <Link to="/elos" className="t-btn px-3 py-1.5" style={{ ...MONO, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', textDecoration: 'none' }}>How Elo works</Link>
          {user && <Link to={`/profile/${user.id}`} className="t-btn px-3 py-1.5" style={{ ...MONO, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', textDecoration: 'none' }}>Profile</Link>}
        </div>
      </div>
    </section>
  )
}

/* ── podium ─────────────────────────────────────────────────────────────── */
function Podium({ rows, board }) {
  // 2nd, 1st, 3rd: the winner stands tallest in the middle
  const order = [rows[1], rows[0], rows[2]].filter(Boolean)
  return (
    <ol aria-label="Top three" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: `repeat(${order.length}, minmax(0, 1fr))`, gap: 10, alignItems: 'end' }}>
      {order.map((r) => {
        const first = r.rank === 1
        const tier = tierById(r.tier)
        return (
          <li key={r.rank} style={{ border: `${r.mine ? 2 : 1}px solid ${r.mine ? 'var(--paper)' : BORDER}`, background: 'var(--ink-800)', minWidth: 0 }}>
            <div style={{ position: 'relative', height: first ? 150 : 112, overflow: 'hidden', background: r.banner ? '#07070a' : `linear-gradient(160deg, ${tier.color}30, #07070a 75%)` }}>
              {r.banner && <CallingCard scene={r.banner} cols={90} rows={first ? 17 : 13} fps={first ? 10 : 0} style={{ border: 0, position: 'absolute', inset: 0, minWidth: '100%' }} label={`${r.username ?? 'trader'}'s calling card`} />}
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(0deg, rgba(7,7,10,0.9) 0%, rgba(7,7,10,0.1) 65%)' }} />
              <span style={{ position: 'absolute', left: 12, top: 8, fontFamily: 'var(--font-display)', fontStretch: '150%', fontWeight: 900, fontSize: first ? 44 : 32, lineHeight: 1, color: first ? '#fde047' : r.rank === 2 ? '#d4d4d8' : '#d6a15c', textShadow: '0 2px 6px #000' }}>#{r.rank}</span>
              <span style={{ position: 'absolute', right: 10, bottom: 8, display: 'flex', alignItems: 'baseline', gap: 6, color: '#fff', textShadow: '0 1px 4px #000' }}>
                <span style={{ fontFamily: 'var(--font-display)', fontStretch: '125%', fontWeight: 900, fontSize: first ? 26 : 20, color: board.tone ? board.tone(r) : '#fff', ...NUM }}>{board.value(r)}</span>
              </span>
            </div>
            <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <Avatar r={r} size={first ? 40 : 32} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <PlayerName user={r} size={first ? 'md' : 'sm'} elo={false} />
                <div style={{ marginTop: 3 }}><EloBadge elo={r.elo} tier={r.tier} size="sm" /></div>
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/* ── ranked rows ────────────────────────────────────────────────────────── */
function FriendButton({ r }) {
  const { data } = useGetFriendsQuery()
  const [request, { isLoading }] = useRequestFriendMutation()
  if (!r.userId || r.mine) return null
  const has = (k) => (data?.[k] ?? []).some((p) => p.userId === r.userId)
  const btn = { ...MONO, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em' }
  if (has('friends')) return <Link to={`/friends/${r.userId}`} className="t-btn px-2 py-1" style={{ ...btn, textDecoration: 'none' }}>Message</Link>
  if (has('outgoing')) return <span style={{ ...btn, color: 'var(--on-ink-text-3)' }}>Requested</span>
  if (has('incoming')) return <Link to="/friends" className="t-btn t-btn-primary px-2 py-1" style={{ ...btn, textDecoration: 'none' }}>Accept</Link>
  return <button className="t-btn px-2 py-1" style={btn} disabled={isLoading} onClick={() => request(r.userId)} aria-label={`Add @${r.username} as a friend`}>+ Friend</button>
}

function Row({ r, board }) {
  const tier = tierById(r.tier)
  return (
    <li style={{ display: 'grid', gridTemplateColumns: '44px minmax(0, 1fr) auto', alignItems: 'center', gap: 10, padding: '10px 12px', borderTop: `1px solid ${BORDER}`, background: r.mine ? 'var(--on-ink-2)' : 'transparent' }}>
      <span style={{ fontFamily: 'var(--font-display)', fontStretch: '125%', fontWeight: 800, fontSize: 16, color: 'var(--on-ink-text-3)', ...NUM }}>{r.rank}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <Avatar r={r} />
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <PlayerName user={r} size="md" />
            {r.mine && <span className="t-chip" style={{ color: 'var(--paper)' }}>You</span>}
            {r.isPro && <span className="t-chip" style={{ color: '#fde047', borderColor: '#fde047' }}>Pro</span>}
          </div>
          <div style={{ ...MONO, fontSize: 11, color: 'var(--on-ink-text-3)', ...NUM }}>
            {tier.name} · {pct(r.winRate)} win · {r.trades} trades · <span style={{ color: r.totalPnl >= 0 ? 'var(--positive)' : 'var(--negative)' }}>{signedUsd(r.totalPnl)}</span>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <FriendButton r={r} />
        <div style={{ textAlign: 'right', minWidth: 74 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontStretch: '125%', fontWeight: 800, fontSize: 18, color: board.tone ? board.tone(r) : 'var(--paper)', ...NUM }}>{board.value(r)}</div>
          <div style={{ ...MONO, fontSize: 10, color: 'var(--on-ink-text-4)' }}>{board.unit}</div>
        </div>
      </div>
    </li>
  )
}

/* ── ladder strip ───────────────────────────────────────────────────────── */
function Ladder({ elo }) {
  return (
    <ol aria-label="Elo tiers" className="t-scroll-x" style={{ listStyle: 'none', margin: 0, padding: 0, gap: 6 }}>
      {TIERS.map((t) => {
        const here = elo != null && tierFor(elo).id === t.id
        return (
          <li key={t.id} style={{ flex: '1 0 auto', padding: '6px 10px', border: `1px solid ${here ? t.color : BORDER}`, background: here ? `${t.color}18` : 'transparent', ...MONO, fontSize: 11, whiteSpace: 'nowrap' }}>
            <b style={{ color: t.color }}>{t.name}</b> <span style={{ color: 'var(--on-ink-text-3)', ...NUM }}>{formatElo(t.min)}+</span>
          </li>
        )
      })}
    </ol>
  )
}

export default function Leaderboard() {
  const [board, setBoard] = useState('elo')
  const [range, setRange] = useState('all')
  const [look, setLook] = useState(false)
  const b = BOARDS.find((x) => x.id === board)
  const isWins = board === 'wins'
  const q = useGetLeaderboardQuery({ sort: isWins ? 'elo' : board, range: board === 'elo' ? 'all' : range, limit: 50 }, { skip: isWins, pollingInterval: 60000, skipPollingIfUnfocused: true })
  const meQ = useGetMyEloQuery()
  const rows = q.data?.rows ?? []
  const podium = rows.slice(0, 3)
  const rest = rows.slice(3)
  const showRanges = board !== 'elo'

  return (
    <main className="flex-1 w-full px-4 py-6 sm:px-10 sm:py-8" style={{ maxWidth: 1040, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontStretch: '125%', fontWeight: 800, fontSize: 30, textTransform: 'uppercase', margin: 0, letterSpacing: '-0.01em', color: 'var(--paper)' }}>Leaderboard</h1>
          <p style={{ ...MONO, fontSize: 13, color: 'var(--on-ink-text-3)', margin: '6px 0 0', maxWidth: 560, lineHeight: 1.5 }}>
            Every paper trade you close moves your Elo, wins and losses. Climb from Rookie to Legend.
          </p>
        </div>
        {showRanges || isWins ? (
          <div role="tablist" aria-label="Time range" className="flex gap-1">
            {RANGES.map((r) => <button key={r.id} role="tab" aria-selected={range === r.id} onClick={() => setRange(r.id)} className="t-tab">{r.label}</button>)}
          </div>
        ) : null}
      </div>

      <Standing me={meQ.data} onEditLook={() => setLook((v) => !v)} />
      {look && (
        <div style={{ border: `1px solid ${BORDER}`, background: 'var(--ink-800)', padding: 16 }}>
          <CardPicker eloPct={(meQ.data?.pct ?? 35) / 100 * 0.9 + 0.05} />
        </div>
      )}

      <Ladder elo={meQ.data?.elo} />

      <div role="tablist" aria-label="Boards" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {BOARDS.map((x) => <button key={x.id} role="tab" aria-selected={board === x.id} onClick={() => setBoard(x.id)} className="t-tab">{x.label}</button>)}
      </div>
      <p style={{ ...MONO, fontSize: 12, color: 'var(--on-ink-text-3)', margin: '-8px 0 0' }}>{b.hint}</p>

      {isWins ? <BigWins range={range} /> : (
        <>
          {q.isLoading && <p style={{ ...MONO, fontSize: 13, color: 'var(--on-ink-text-3)' }}>Loading the board…</p>}
          {q.isError && <p role="alert" style={{ ...MONO, fontSize: 13, color: 'var(--negative)' }}>Could not load the leaderboard. <button className="t-btn px-2 py-0.5" onClick={q.refetch}>Retry</button></p>}
          {!q.isLoading && !q.isError && rows.length === 0 && (
            <div style={{ border: `1px dashed ${BORDER}`, padding: 28, textAlign: 'center', ...MONO, color: 'var(--on-ink-text-2)', fontSize: 14, lineHeight: 1.6 }}>
              Nobody has closed a trade in this window yet.<br />
              <Link to="/terminal" style={{ color: 'var(--paper)', fontWeight: 700 }}>Open the terminal</Link> and sell a position to take the first spot.
            </div>
          )}
          {podium.length > 0 && <Podium rows={podium} board={b} />}
          {rest.length > 0 && (
            <ol aria-label={`${b.label} ranking`} style={{ listStyle: 'none', margin: 0, padding: 0, border: `1px solid ${BORDER}`, borderTop: 0, background: 'var(--ink-800)' }}>
              {rest.map((r) => <Row key={`${r.rank}-${r.userId ?? r.username}`} r={r} board={b} />)}
            </ol>
          )}
        </>
      )}
      <p style={{ ...MONO, fontSize: 11, color: 'var(--on-ink-text-4)', margin: 0 }}>Paper trading only. No real money moves.</p>
    </main>
  )
}
