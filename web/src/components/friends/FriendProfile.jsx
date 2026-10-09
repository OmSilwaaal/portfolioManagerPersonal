import { Link, useNavigate } from 'react-router-dom'
import { useGetProfileQuery } from '../../api/profilesApi'
import { useGetFriendProfileQuery } from '../../api/socialApi'
import ProfileHero from '../profile/ProfileHero'
import { formatElo, pct, tierById } from '../../utils/elo'
import { fmtPrice, fmtTokens, fmtUsd, fmtUsdSigned, fmtPct, toneOf, timeShort } from './fmt'

const BORDER = 'var(--on-ink-border)'
const MONO = { fontFamily: 'var(--font-sans)' }
const LABEL = { ...MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--on-ink-text-3)' }

function Stat({ label, value, tone }) {
  return (
    <div style={{ padding: '8px 10px', border: `1px solid ${BORDER}`, background: 'var(--ink-800)', borderRadius: 2, minWidth: 0 }}>
      <div style={{ fontFamily: 'var(--font-display)', fontStretch: '125%', fontWeight: 800, fontSize: 16, color: tone ?? 'var(--paper)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={LABEL}>{label}</div>
    </div>
  )
}

function Section({ title, note, children }) {
  return (
    <section aria-label={title}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, margin: '0 0 6px' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontStretch: '125%', fontWeight: 800, fontSize: 13, textTransform: 'uppercase', margin: 0, color: 'var(--paper)' }}>{title}</h2>
        {note && <span style={LABEL}>{note}</span>}
      </div>
      {children}
    </section>
  )
}

const Empty = ({ children }) => <p style={{ ...MONO, fontSize: 12, color: 'var(--on-ink-text-4)', margin: 0, padding: '6px 0' }}>{children}</p>

/** One open position. The whole row is the hit target: it drops you into the terminal already on that token. */
function PositionRow({ p }) {
  const navigate = useNavigate()
  return (
    <button
      className="t-row" onClick={() => navigate(`/terminal?token=${p.address}`)}
      title={`Open ${p.symbol} in the terminal`}
      style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr) minmax(0,1fr)', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left' }}
    >
      <span style={{ minWidth: 0 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontStretch: '125%', fontWeight: 800, fontSize: 13, textTransform: 'uppercase', color: 'var(--paper)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${p.symbol}</span>
        <span style={{ ...MONO, fontSize: 10, color: 'var(--on-ink-text-3)' }}>{fmtTokens(p.tokens)} @ {fmtPrice(p.avgCost)}</span>
      </span>
      <span style={{ ...MONO, fontSize: 12, color: 'var(--on-ink-text-1)', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
        {p.priceError ? <span style={{ color: 'var(--on-ink-text-4)' }}>no price</span> : fmtPrice(p.currentPrice)}
      </span>
      <span style={{ ...MONO, fontSize: 12, fontWeight: 700, color: toneOf(p.pnl), fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
        {p.pnl == null ? '--' : fmtUsdSigned(p.pnl)}
        <span style={{ display: 'block', fontSize: 10, fontWeight: 400 }}>{fmtPct(p.pnlPct)}</span>
      </span>
    </button>
  )
}

function TradeRow({ t }) {
  const navigate = useNavigate()
  const open = t.address ? () => navigate(`/terminal?token=${t.address}`) : null
  const inner = (
    <>
      <span style={{ minWidth: 0 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontStretch: '125%', fontWeight: 800, fontSize: 13, textTransform: 'uppercase', color: 'var(--paper)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${t.symbol}</span>
        <span style={{ ...MONO, fontSize: 10, color: 'var(--on-ink-text-3)' }}>{fmtPrice(t.entry)} → {fmtPrice(t.exit)} · {timeShort(t.at)} ago</span>
      </span>
      <span style={{ ...MONO, fontSize: 12, fontWeight: 700, color: 'var(--positive)', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
        {fmtUsdSigned(t.pnlUsd)}
        <span style={{ display: 'block', fontSize: 10, fontWeight: 400 }}>{fmtPct(t.pnlPct)}</span>
      </span>
    </>
  )
  const style = { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left' }
  return open
    ? <button className="t-row" onClick={open} title={`Open ${t.symbol} in the terminal`} style={style}>{inner}</button>
    : <div className="t-row" style={{ ...style, cursor: 'default' }}>{inner}</div>
}

/**
 * A friend's profile, inside the friends tab: the same calling card / name header as your own profile, then their
 * numbers, their live book and their best closes. Identity comes from /profiles (anyone signed in may read it);
 * positions and trades come from /friends/:id/profile, which the server releases to friends only — a 403 here is an
 * answer, not a failure, so it is rendered as one.
 */
export default function FriendProfile({ userId, onMessage }) {
  const identity = useGetProfileQuery(userId, { skip: !userId })
  const trading = useGetFriendProfileQuery(userId, {
    skip: !userId, pollingInterval: 20000, skipPollingIfUnfocused: true,
  })
  const profile = identity.data

  if (identity.isLoading) {
    return <p style={{ ...MONO, fontSize: 12, color: 'var(--on-ink-text-3)', padding: 16 }} aria-busy="true">Loading profile…</p>
  }
  if (identity.isError || !profile) {
    return <p role="alert" style={{ ...MONO, fontSize: 12, color: 'var(--negative)', padding: 16 }}>Could not load this profile.</p>
  }

  const e = profile.elo
  const tier = tierById(e?.tier)
  const s = profile.stats ?? {}
  // A calling card is a Pro cosmetic; the server already blanks it for everyone else.
  const scene = profile.is_pro ? profile.banner : null
  const denied = trading.error?.status === 403
  const t = trading.data

  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
      <ProfileHero
        profile={profile} scene={scene} size="sm" eloProgress={(e?.pct ?? 35) / 100 * 0.9 + 0.05}
        actions={(
          <>
            {onMessage && <button className="t-btn t-btn-primary px-3 py-1.5" style={{ ...MONO, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em' }} onClick={onMessage}>Message</button>}
            <Link to={profile.username ? `/u/${profile.username}` : `/profile/${profile.user_id}`} className="t-btn px-3 py-1.5" style={{ ...MONO, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', textDecoration: 'none' }}>Full profile</Link>
          </>
        )}
      />

      {profile.bio && (
        <p style={{ ...MONO, fontSize: 12.5, lineHeight: 1.5, color: 'var(--on-ink-text-1)', margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{profile.bio}</p>
      )}

      <section aria-label="Standing" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: 8 }}>
        <Stat label={`Elo · ${tier.name}`} value={formatElo(e?.elo ?? 500)} tone={tier.color} />
        <Stat label="Win rate" value={e?.trades ? pct(e.winRate) : '--'} />
        <Stat label="Trades" value={e?.trades ?? 0} />
        <Stat label="Best win" value={s.bestWinUsd > 0 ? `+${fmtUsd(s.bestWinUsd)}` : '--'} tone={s.bestWinUsd > 0 ? 'var(--positive)' : undefined} />
      </section>

      {denied ? (
        <p style={{ ...MONO, fontSize: 12.5, lineHeight: 1.5, color: 'var(--on-ink-text-3)', margin: 0, padding: '10px 12px', border: `1px dashed ${BORDER}`, borderRadius: 2 }}>
          Positions and trades are friends-only. Add {profile.username ? `@${profile.username}` : 'them'} as a friend to see what they are holding.
        </p>
      ) : (
        <>
          <Section
            title="Open positions"
            note={t?.priced === false ? 'prices unavailable' : (
              <span className="t-chip" data-tone="ok" title="Prices refresh while this panel is open">live</span>
            )}
          >
            {trading.isLoading && <Empty>Loading positions…</Empty>}
            {!trading.isLoading && (t?.positions?.length ? (
              <>
                <div style={{ borderTop: `1px solid ${BORDER}` }}>
                  {t.positions.map((p) => <PositionRow key={p.address} p={p} />)}
                </div>
                {t.totals && (
                  <p style={{ ...MONO, fontSize: 11, color: 'var(--on-ink-text-3)', margin: '6px 0 0', fontVariantNumeric: 'tabular-nums' }}>
                    Book {fmtUsd(t.totals.valueUsd)} · unrealised <span style={{ color: toneOf(t.totals.pnl), fontWeight: 700 }}>{fmtUsdSigned(t.totals.pnl)}</span>
                  </p>
                )}
              </>
            ) : <Empty>No open positions.</Empty>)}
          </Section>

          <Section title="Top trades" note={t?.topTrades?.length ? 'biggest closes' : null}>
            {t?.topTrades?.length ? (
              <div style={{ borderTop: `1px solid ${BORDER}` }}>
                {t.topTrades.map((x) => <TradeRow key={x.id} t={x} />)}
              </div>
            ) : <Empty>No winning trades logged yet.</Empty>}
          </Section>
        </>
      )}
    </div>
  )
}
