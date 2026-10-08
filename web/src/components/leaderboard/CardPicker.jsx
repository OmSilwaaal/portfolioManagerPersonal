import { Link } from 'react-router-dom'
import CallingCard from '../../ascii/CallingCard'
import AsciiIcon from '../../ascii/icons'
import useCosmetics from '../../ascii/useCosmetics'
import { ACHIEVEMENTS, GROUPS, evaluate, useAchievementStats } from '../../ascii/achievements'
import { NAME_COLORS, formatElo } from '../../utils/elo'

const BORDER = 'var(--on-ink-border)'
const MONO = { fontFamily: 'var(--font-sans)' }
const LABEL = { ...MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--on-ink-text-3)' }

function Tile({ a, state, equipped, pro, onEquip, progress }) {
  const pct = Math.round((state.value / state.goal) * 100)
  return (
    <li style={{ listStyle: 'none', width: 220, flexShrink: 0, border: `${equipped ? 2 : 1}px solid ${equipped ? 'var(--paper)' : BORDER}`, background: 'var(--ink-800)' }}>
      <div style={{ position: 'relative' }}>
        <CallingCard scene={a.scene} cols={96} rows={14} progress={progress} style={{ border: 0, filter: state.unlocked ? 'none' : 'grayscale(1) brightness(0.45)' }} label={`${a.name} calling card`} />
        {!state.unlocked && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AsciiIcon name="lock" palette={['#b9b9b0', '#ffffff']} size={44} label="Locked" />
          </div>
        )}
      </div>
      <div style={{ padding: '8px 10px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontStretch: '125%', fontWeight: 800, fontSize: 12, textTransform: 'uppercase', color: 'var(--paper)' }}>{a.name}</span>
          {equipped && <span style={{ ...LABEL, color: 'var(--paper)' }}>[on]</span>}
        </div>
        <span style={{ ...MONO, fontSize: 11, color: 'var(--on-ink-text-3)', minHeight: 30 }}>{a.how}</span>
        {state.unlocked ? (
          !equipped && (pro
            ? <button className="t-btn t-btn-primary px-2 py-1" style={{ ...MONO, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em' }} onClick={onEquip}>Use on leaderboard</button>
            : <Link to="/pricing" className="t-btn px-2 py-1" style={{ ...MONO, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', textAlign: 'center', textDecoration: 'none' }}>Pro to equip</Link>)
        ) : (
          <div>
            <div style={{ height: 5, border: `1px solid ${BORDER}`, marginTop: 2 }}><div style={{ width: `${pct}%`, height: '100%', background: 'var(--paper)', opacity: 0.8 }} /></div>
            <span style={{ ...LABEL, fontSize: 9 }}>{formatElo(state.value)} / {formatElo(state.goal)}</span>
          </div>
        )}
      </div>
    </li>
  )
}

/** Choose which calling card shows on your leaderboard rows and profile, and your name colour. */
export default function CardPicker({ eloPct = 0.35 }) {
  const { banner, nameColor, isPro, equipBanner, equipNameColor } = useCosmetics()
  const stats = useAchievementStats()
  return (
    <section aria-label="Your look" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <h3 style={{ ...MONO, fontSize: 13, fontWeight: 800, margin: '0 0 8px', color: 'var(--paper)' }}>Name colour</h3>
        <div role="radiogroup" aria-label="Name colour" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {NAME_COLORS.map((c) => (
            <button
              key={c} role="radio" aria-checked={nameColor === c} aria-label={c} onClick={() => equipNameColor(c)}
              style={{ width: 28, height: 28, background: c, border: nameColor === c ? '2px solid var(--paper)' : `1px solid ${BORDER}`, outline: nameColor === c ? '2px solid var(--ink-900)' : 'none', outlineOffset: -4, cursor: 'pointer' }}
            />
          ))}
          <button className="t-btn px-2 py-1" style={{ ...MONO, fontSize: 11 }} onClick={() => equipNameColor(null)}>Default</button>
        </div>
        <p style={{ ...MONO, fontSize: 12, color: 'var(--on-ink-text-3)', margin: '8px 0 0' }}>
          {isPro ? 'Solid colours are open to everyone. Your animated aura and calling card are below.' : 'Free accounts get a solid name colour. Animated auras and calling cards are Pro.'}
        </p>
      </div>

      {GROUPS.map((g) => (
        <div key={g.id}>
          <h3 style={{ ...MONO, fontSize: 13, fontWeight: 800, margin: '0 0 2px', color: 'var(--paper)' }}>{g.title}</h3>
          <p style={{ ...MONO, fontSize: 12, color: 'var(--on-ink-text-3)', margin: '0 0 10px' }}>{g.note}</p>
          <ul style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '0 0 10px', margin: 0 }}>
            {ACHIEVEMENTS.filter((a) => a.group === g.id).map((a) => {
              const st = evaluate(a, stats)
              return <Tile key={a.id} a={a} state={st} equipped={isPro && banner === a.scene && st.unlocked} pro={isPro} progress={eloPct} onEquip={() => equipBanner(a.scene)} />
            })}
          </ul>
        </div>
      ))}
      {!isPro && (
        <p style={{ ...MONO, fontSize: 13, color: 'var(--on-ink-text-2)', margin: 0 }}>
          Earn any card for free. <Link to="/pricing" style={{ color: 'var(--paper)', fontWeight: 700 }}>Go Pro</Link> to show one on the leaderboard with a live animation.
        </p>
      )}
    </section>
  )
}
