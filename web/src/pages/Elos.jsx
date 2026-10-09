import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useGetMyEloQuery } from '../api/eloApi'
import CallingCard from '../ascii/CallingCard'
import { TIERS, START_ELO, formatElo, tierFor } from '../utils/elo'

const BORDER = 'var(--on-ink-border)'
const MONO = { fontFamily: 'var(--font-sans)' }
const NUM = { fontVariantNumeric: 'tabular-nums' }
const H2 = { fontFamily: 'var(--font-display)', fontStretch: '125%', fontWeight: 800, fontSize: 18, textTransform: 'uppercase', margin: '0 0 10px', color: 'var(--paper)' }
const P = { ...MONO, fontSize: 14, lineHeight: 1.6, color: 'var(--on-ink-text-2)', margin: '0 0 10px', maxWidth: '68ch' }

function TierRow({ t, i, current, reached }) {
  const next = TIERS[i + 1]
  const artRef = useRef(null)
  // One animated ASCII canvas per tier, and there are eight of them. Mounting the
  // lot at once was most of this page's load cost, so a card waits until its row
  // is nearly on screen. It is never unmounted again: remounting would restart
  // the scene and cost more than leaving it, and AsciiCanvas already stops
  // drawing whatever is scrolled away.
  const [showArt, setShowArt] = useState(false)
  useEffect(() => {
    const el = artRef.current
    if (!el || showArt) return undefined
    if (typeof IntersectionObserver !== 'function') { setShowArt(true); return undefined }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setShowArt(true) }, { rootMargin: '300px' })
    io.observe(el)
    return () => io.disconnect()
  }, [showArt])
  return (
    <li style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', border: `${current ? 2 : 1}px solid ${current ? t.color : BORDER}`, background: 'var(--ink-800)' }}>
      <div ref={artRef} style={{ position: 'relative', minHeight: 124, background: '#07070a', filter: reached ? 'none' : 'grayscale(0.7) brightness(0.7)' }}>
        {showArt && <CallingCard scene={t.id} cols={110} rows={16} fps={9} style={{ border: 0 }} label={`${t.name} calling card`} />}
      </div>
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontStretch: '125%', fontWeight: 900, fontSize: 22, textTransform: 'uppercase', margin: 0, color: t.color }}>{t.name}</h3>
          {current && <span className="t-chip" style={{ color: t.color, borderColor: t.color }}>You are here</span>}
        </div>
        <div style={{ ...MONO, fontSize: 13, color: 'var(--paper)', ...NUM }}>
          {t.id === 'rekt' ? `Under ${START_ELO} Elo` : `${t.min.toLocaleString('en-US')} Elo`}{next ? ` to ${(next.min - 1).toLocaleString('en-US')}` : ' and up'}
        </div>
        <p style={{ ...MONO, fontSize: 13, color: 'var(--on-ink-text-3)', margin: 0, lineHeight: 1.5 }}>{t.blurb}</p>
        <p style={{ ...MONO, fontSize: 12, color: 'var(--on-ink-text-3)', margin: 0 }}>Unlocks the <b style={{ color: 'var(--paper)' }}>{t.name}</b> calling card{t.id === 'rekt' ? ' once you take a loss' : ''}.</p>
      </div>
    </li>
  )
}

export default function Elos() {
  const { data: me } = useGetMyEloQuery()
  const cur = me ? tierFor(me.elo) : null
  const peak = me ? tierFor(me.peak) : null
  return (
    <main className="flex-1 w-full px-4 py-6 sm:px-10 sm:py-8" style={{ maxWidth: 1040, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 28 }}>
      <header>
        <h1 style={{ fontFamily: 'var(--font-display)', fontStretch: '125%', fontWeight: 800, fontSize: 30, textTransform: 'uppercase', margin: 0, letterSpacing: '-0.01em', color: 'var(--paper)' }}>Elos</h1>
        <p style={{ ...P, margin: '8px 0 0' }}>
          Your Elo is your rating as a trader. Everyone starts at {START_ELO}. It goes up when you win, down when you lose, and the ladder has no ceiling:
          500, 1,000, 10,000, 100,000 and on by tens, all the way to 100 million.
        </p>
        {me && (
          <p style={{ ...P, color: 'var(--paper)' }}>
            You are <b style={{ color: cur.color }}>{cur.name}</b> at <b style={NUM}>{me.elo.toLocaleString('en-US')}</b> Elo{me.peak > me.elo ? <>, down from a peak of <b style={NUM}>{me.peak.toLocaleString('en-US')}</b> ({peak.name})</> : null}.{' '}
            <Link to="/leaderboard" style={{ color: 'var(--paper)', fontWeight: 700 }}>See the leaderboard</Link>
          </p>
        )}
      </header>

      <section aria-labelledby="how">
        <h2 id="how" style={H2}>How it is worked out</h2>
        <p style={P}>Every time you close a position, in profit or at a loss, the trade counts. Your rating comes from three things:</p>
        <ul style={{ ...P, paddingLeft: 18, listStyle: 'square' }}>
          <li><b style={{ color: 'var(--paper)' }}>Each trade.</b> +15 for a win, -12 for a loss.</li>
          <li><b style={{ color: 'var(--paper)' }}>Total PnL.</b> Every dollar you made or lost, in USD, counts towards the rating.</li>
          <li><b style={{ color: 'var(--paper)' }}>Win rate.</b> After 5 trades it multiplies your PnL: a 100% win rate makes profit count 1.5x, a 0% win rate only 0.5x. On losses it works the other way, so a high win rate softens a bad trade and a low one makes it hurt.</li>
        </ul>
        <pre style={{ ...MONO, fontSize: 12.5, lineHeight: 1.7, margin: '0 0 6px', padding: '12px 14px', border: `1px solid ${BORDER}`, background: 'var(--ink-800)', color: 'var(--paper)', overflowX: 'auto' }}>
{`Elo = 500 + 15 x wins - 12 x losses + total PnL x skill
skill = 0.5 + win rate   (profit)      skill = 1.5 - win rate   (loss)

8 wins, 2 losses, +$1,000:   500 + 120 - 24 + 1,000 x 1.3  =  1,896
2 wins, 8 losses, +$1,000:   500 +  30 - 96 + 1,000 x 0.7  =  1,134`}
        </pre>
        <p style={{ ...MONO, fontSize: 12, color: 'var(--on-ink-text-3)', margin: 0 }}>Same profit, better win rate, higher Elo. Elo never goes below 0.</p>
      </section>

      <section aria-labelledby="down">
        <h2 id="down" style={H2}>Ranking down</h2>
        <p style={P}>
          Elo is earned every trade, so it can fall as fast as it rose. Lose enough and you drop a tier. Lose a lot and you land in <b style={{ color: '#f87171' }}>Rekt</b>, below {START_ELO}.
          The calling cards you earned on the way up stay yours: your peak Elo is remembered, so a bad week never takes a card back.
        </p>
      </section>

      <section aria-labelledby="ladder">
        <h2 id="ladder" style={H2}>The ladder</h2>
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {TIERS.map((t, i) => <TierRow key={t.id} t={t} i={i} current={cur?.id === t.id} reached={!peak || peak.min >= t.min || t.id === 'rekt'} />)}
        </ol>
      </section>

      <section aria-labelledby="show">
        <h2 id="show" style={H2}>Where your Elo shows</h2>
        <p style={P}>
          Next to your name everywhere: the leaderboard, friends and messages, clans and your profile. The diamond chip is coloured by tier, like
          <span style={{ ...MONO, display: 'inline-block', margin: '0 6px', padding: '0 6px', border: `1px solid ${tierFor(1240).color}`, color: tierFor(1240).color, fontWeight: 800, fontSize: 12 }}>◆ {formatElo(1240)}</span>.
          Join a <Link to="/clans" style={{ color: 'var(--paper)', fontWeight: 700 }}>clan</Link> and its [TAG] sits in front of your name too.
        </p>
      </section>
    </main>
  )
}
