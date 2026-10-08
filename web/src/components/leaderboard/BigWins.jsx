import { Link } from 'react-router-dom'
import { useGetWinnersQuery } from '../../api/winnersApi'
import { useAuth } from '../../contexts/AuthContext'
import CallingCard from '../../ascii/CallingCard'
import Killcam from '../../ascii/Killcam'
import AsciiArt from '../../ascii/AsciiArt'
import { AsciiAura } from '../../ascii/effects'
import PlayerName from '../PlayerName'
import { tierById } from '../../utils/elo'

const BORDER = 'var(--on-ink-border)'
const MONO = { fontFamily: 'var(--font-sans)' }
const PLUS = ['   ###   ', '   ###   ', '   ###   ', '#########', '#########', '#########', '   ###   ', '   ###   ', '   ###   ']

const usd = (n) => `$${Math.round(n).toLocaleString('en-US')}`
const solText = (n) => `${n >= 100 ? Math.round(n).toLocaleString('en-US') : n >= 1 ? n.toFixed(2) : n.toFixed(3)} SOL`
const price = (p) => (p == null ? '--' : p >= 1 ? `$${p.toFixed(2)}` : p >= 0.01 ? `$${p.toFixed(4)}` : `$${Number(p).toPrecision(3)}`)
function ago(iso) {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000))
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function Avatar({ w, size = 44 }) {
  const label = (w.username || w.displayName || '?').charAt(0).toUpperCase()
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      {w.effect && w.effect !== 'none' && <AsciiAura effect={w.effect} bleed={{ top: 14, side: 10, bottom: 8 }} fontPx={7} />}
      {w.avatarUrl ? (
        <img src={w.avatarUrl} alt="" referrerPolicy="no-referrer" style={{ position: 'relative', width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--paper)' }} />
      ) : (
        <span aria-hidden="true" style={{ position: 'relative', width: size, height: size, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--ink-800)', border: '2px solid var(--paper)', color: 'var(--paper)', fontWeight: 700, fontSize: size * 0.42 }}>{label}</span>
      )}
    </div>
  )
}

// A big win. Pro traders get their calling card behind them and a killcam; free traders get a plain tier-coloured header (no card, no effect).
function WinCard({ w, mine }) {
  const handle = w.username ? `@${w.username}` : w.displayName ?? 'trader'
  const tier = tierById(w.tier)
  const top = w.rank <= 3
  return (
    <article
      aria-label={`Rank ${w.rank}: ${handle} made ${usd(w.pnlUsd)} on ${w.symbol}`}
      style={{ background: 'var(--ink-800)', border: `${mine ? 2 : 1}px solid ${mine ? 'var(--paper)' : BORDER}`, borderRadius: 2, overflow: 'hidden' }}
    >
      <div style={{ position: 'relative', height: 132, overflow: 'hidden', background: w.banner ? '#07070a' : `linear-gradient(100deg, ${tier.color}22, #07070a 70%)` }}>
        {w.banner && (
          <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', transform: 'translateY(-48%)' }}>
            <CallingCard scene={w.banner} cols={150} rows={22} fps={w.rank <= 3 ? 8 : 0} style={{ border: 0, background: 'transparent' }} label={`${handle}'s calling card`} />
          </div>
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(7,7,10,0.88) 0%, rgba(7,7,10,0.45) 55%, rgba(7,7,10,0.1) 100%)' }} />
        <div style={{ position: 'absolute', left: 14, right: 14, bottom: 12, display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontStretch: '150%', fontWeight: 900, fontSize: top ? 44 : 34, lineHeight: 1, color: top ? '#fde047' : '#fff', textShadow: '0 2px 6px #000' }}>#{w.rank}</span>
          <Avatar w={w} />
          <div style={{ minWidth: 0 }}>
            <PlayerName user={w} size="lg" aura={false} nameStyle={{ textShadow: '0 1px 4px #000' }} />
            <div style={{ ...MONO, fontSize: 11, color: 'rgba(255,255,255,0.78)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 2 }}>
              <span>{ago(w.at)}</span>
              {mine && <span className="t-chip" style={{ color: '#fff', borderColor: '#fff' }}>You</span>}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: w.banner ? 'repeat(auto-fit, minmax(300px, 1fr))' : '1fr', gap: 0 }}>
        {w.banner && <Killcam anim={w.anim} seed={w.id} style={{ border: 0, borderTop: `1px solid ${BORDER}`, borderRight: `1px solid ${BORDER}` }} />}
        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 14, borderTop: `1px solid ${BORDER}`, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <AsciiArt lines={PLUS} palette="mint" size={11} shimmer={!!w.banner} style={{ flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div aria-label={`Profit ${usd(w.pnlUsd)}`} style={{ fontFamily: 'var(--font-display)', fontStretch: '125%', fontWeight: 900, fontSize: 'clamp(30px, 4.6vw, 52px)', lineHeight: 1, color: 'var(--positive)', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
                +{usd(w.pnlUsd)}
              </div>
              <div style={{ ...MONO, fontSize: 18, fontWeight: 700, color: 'var(--positive)', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>+{solText(w.pnlSol)}</div>
            </div>
          </div>
          <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 14px', margin: 0, ...MONO, fontSize: 13 }}>
            <dt style={{ color: 'var(--on-ink-text-3)' }}>Token</dt><dd style={{ margin: 0, fontWeight: 700, color: 'var(--paper)' }}>${w.symbol}</dd>
            <dt style={{ color: 'var(--on-ink-text-3)' }}>Return</dt><dd style={{ margin: 0, fontWeight: 700, color: 'var(--positive)' }}>{w.pnlPct != null ? `+${w.pnlPct.toFixed(1)}%` : '--'}</dd>
            <dt style={{ color: 'var(--on-ink-text-3)' }}>Entry → exit</dt><dd style={{ margin: 0, color: 'var(--paper)' }}>{price(w.entry)} → {price(w.exit)}</dd>
          </dl>
        </div>
      </div>
    </article>
  )
}

export default function BigWins({ range }) {
  const { user } = useAuth()
  const q = useGetWinnersQuery({ range, limit: 24 }, { pollingInterval: 60000, skipPollingIfUnfocused: true })
  const wins = q.data?.wins ?? []
  return (
    <section aria-label="Biggest single wins">
      <p style={{ ...MONO, fontSize: 13, color: 'var(--on-ink-text-3)', margin: '0 0 14px', maxWidth: 560, lineHeight: 1.5 }}>
        The biggest single profitable trades, in USD and SOL. Pro traders bring their calling card and a killcam.
      </p>
      {q.isLoading && <p style={{ ...MONO, fontSize: 13, color: 'var(--on-ink-text-3)' }}>Loading the board…</p>}
      {q.isError && <p role="alert" style={{ ...MONO, fontSize: 13, color: 'var(--negative)' }}>Could not load big wins. <button className="t-btn px-2 py-0.5" onClick={q.refetch}>Retry</button></p>}
      {!q.isLoading && !q.isError && wins.length === 0 && (
        <div style={{ border: `1px dashed ${BORDER}`, padding: 28, textAlign: 'center', ...MONO, color: 'var(--on-ink-text-2)', fontSize: 14, lineHeight: 1.6 }}>
          No winning trades in this window yet.<br />
          <Link to="/terminal" style={{ color: 'var(--paper)', fontWeight: 700 }}>Open the terminal</Link> and close a position in profit to take the first spot.
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {wins.map((w) => <WinCard key={w.id} w={w} mine={!!user && w.userId === user.id} />)}
      </div>
      {q.data?.solPrice && <p style={{ ...MONO, fontSize: 11, color: 'var(--on-ink-text-4)', marginTop: 18 }}>SOL amounts use the SOL price at the time of the trade. Paper trading only. No real money moves.</p>}
    </section>
  )
}
