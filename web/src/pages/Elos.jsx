import { Link } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { useGetMyEloQuery } from '../api/eloApi'
import EloTrack from '../components/elo/EloTrack'
import { tierInk } from '../components/elo/tierIcons'
import { START_ELO, formatElo, tierFor } from '../utils/elo'

const BORDER = 'var(--on-ink-border)'
const MONO = { fontFamily: 'var(--font-sans)' }
const NUM = { fontVariantNumeric: 'tabular-nums' }
const H2 = { fontFamily: 'var(--font-display)', fontStretch: '125%', fontWeight: 800, fontSize: 16, textTransform: 'uppercase', margin: '0 0 10px', color: 'var(--paper)' }
const P = { ...MONO, fontSize: 13.5, lineHeight: 1.6, color: 'var(--on-ink-text-2)', margin: 0, maxWidth: '68ch' }
const PANEL = { border: `1px solid ${BORDER}`, background: 'var(--ink-800)', padding: '14px 16px' }

const CHIP_TIER = tierFor(1240)

export default function Elos() {
  const { data: me } = useGetMyEloQuery()
  const isDark = useSelector((s) => s.theme.isDark)
  const chipInk = tierInk(CHIP_TIER.color, isDark)
  return (
    <main className="flex-1 w-full px-4 py-6 sm:px-10 sm:py-8" style={{ maxWidth: 1040, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <header>
        <h1 style={{ fontFamily: 'var(--font-display)', fontStretch: '125%', fontWeight: 800, fontSize: 30, textTransform: 'uppercase', margin: 0, letterSpacing: '-0.01em', color: 'var(--paper)' }}>Elos</h1>
        <p style={{ ...P, marginTop: 8 }}>
          Your rating as a trader. Everyone starts at {START_ELO}, every closed trade moves it, and the ladder climbs by tens
          from {START_ELO} to 100 million with no ceiling after that.
        </p>
      </header>

      <EloTrack me={me} />

      <section aria-labelledby="how">
        <h2 id="how" style={H2}>How it is worked out</h2>
        <ul style={{ ...P, padding: 0, margin: '0 0 10px', listStyle: 'none', display: 'grid', gap: 4 }}>
          <li><b style={{ color: 'var(--paper)' }}>Each closed trade</b> — +15 won, -12 lost.</li>
          <li><b style={{ color: 'var(--paper)' }}>Total PnL</b> — every dollar made or lost, in USD.</li>
          <li><b style={{ color: 'var(--paper)' }}>Win rate</b> — after 5 trades it scales that PnL, 1.5x at 100% down to 0.5x at 0%. On a loss it inverts, so a good record softens the hit and a bad one deepens it.</li>
        </ul>
        <pre style={{ ...MONO, fontSize: 12.5, lineHeight: 1.7, margin: 0, padding: '12px 14px', border: `1px solid ${BORDER}`, background: 'var(--ink-800)', color: 'var(--paper)', overflowX: 'auto' }}>
{`Elo = 500 + 15 x wins - 12 x losses + total PnL x skill
skill = 0.5 + win rate   (profit)      skill = 1.5 - win rate   (loss)

8 wins, 2 losses, +$1,000:   500 + 120 - 24 + 1,000 x 1.3  =  1,896
2 wins, 8 losses, +$1,000:   500 +  30 - 96 + 1,000 x 0.7  =  1,134`}
        </pre>
        <p style={{ ...MONO, fontSize: 11.5, color: 'var(--on-ink-text-3)', margin: '6px 0 0' }}>Same profit, better win rate, higher Elo. It never falls below 0.</p>
      </section>

      <section aria-label="Elo in the rest of the app" style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <div style={PANEL}>
          <h2 style={H2}>It falls too</h2>
          <p style={P}>
            Elo is settled every trade, so it drops as fast as it climbs. Far enough down and you land in Rekt, under {START_ELO}.
            Your peak is kept, so a bad week never takes a calling card back.
          </p>
        </div>
        <div style={PANEL}>
          <h2 style={H2}>Where it shows</h2>
          <p style={P}>
            Beside your name on the leaderboard, in friends and messages, in clans and on your profile — a diamond chip in your tier&rsquo;s colour, like
            <span style={{ ...MONO, ...NUM, display: 'inline-block', margin: '0 6px', padding: '0 6px', border: `1px solid ${chipInk}`, color: chipInk, fontWeight: 800, fontSize: 12 }}>◆ {formatElo(1240)}</span>.
          </p>
          <p style={{ ...P, marginTop: 8 }}>
            <Link to="/leaderboard" style={{ color: 'var(--paper)', fontWeight: 700 }}>Leaderboard</Link>
            <span style={{ color: 'var(--on-ink-text-4)' }}> · </span>
            <Link to="/clans" style={{ color: 'var(--paper)', fontWeight: 700 }}>Clans</Link>
          </p>
        </div>
      </section>
    </main>
  )
}
