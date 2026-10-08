import { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link } from 'react-router-dom'
import { setThemeMode } from '../store/themeSlice'
import AsciiIcon from '../ascii/icons'
import { AsciiAura, EFFECTS } from '../ascii/effects'
import CallingCard from '../ascii/CallingCard'
import useCosmetics from '../ascii/useCosmetics'
import { ACHIEVEMENTS, evaluate, useAchievementStats } from '../ascii/achievements'

const BORDER = 'var(--on-ink-border)'
const LABEL = { fontFamily: 'var(--font-sans)', fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--on-ink-text-3)' }
const TITLE = { fontFamily: 'var(--font-display)', fontStretch: '125%', fontWeight: 800, fontSize: 22, letterSpacing: '-0.01em', textTransform: 'uppercase', color: 'var(--paper)', margin: 0 }

function Back({ onBack }) {
  return (
    <button onClick={onBack} style={{ ...LABEL, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, background: 'none', border: 0, cursor: 'pointer', color: 'var(--on-ink-text-2)' }}>
      {'<-'} Settings
    </button>
  )
}

function Heading({ title, note }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <h1 style={TITLE}>{title}</h1>
      {note && <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--on-ink-text-3)', margin: '8px 0 0', lineHeight: 1.5 }}>{note}</p>}
    </div>
  )
}

/* ── Appearance ─────────────────────────────────────────────────────────── */
const THEMES = [
  { id: 'light', label: 'Paper', note: 'Warm off-white, ink text', icon: 'sun', palette: 'amber', swatch: 'linear-gradient(135deg,#efeee9 50%,#d9d8d2 50%)' },
  { id: 'dark', label: 'Ink', note: 'Near-black, bone text', icon: 'moon', palette: 'violet', swatch: 'linear-gradient(135deg,#0b0b0b 50%,#1f1f1d 50%)' },
  { id: 'system', label: 'System', note: 'Match your device', icon: 'gear', palette: 'teal', swatch: 'linear-gradient(135deg,#efeee9 50%,#0b0b0b 50%)' },
]

export function AppearanceView({ onBack }) {
  const dispatch = useDispatch()
  const mode = useSelector((s) => s.theme.mode)
  return (
    <>
      <Back onBack={onBack} />
      <Heading title="Appearance" note="Light is the paper theme, dark is the ink theme. System follows your device and switches automatically." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        {THEMES.map((t) => {
          const on = mode === t.id
          return (
            <button
              key={t.id}
              onClick={() => dispatch(setThemeMode(t.id))}
              aria-pressed={on}
              style={{ textAlign: 'left', padding: 16, cursor: 'pointer', background: 'var(--ink-800)', color: 'var(--paper)', border: `${on ? 2 : 1}px solid ${on ? 'var(--paper)' : BORDER}`, borderRadius: 2, display: 'flex', flexDirection: 'column', gap: 12 }}
            >
              <div style={{ height: 56, border: `1px solid ${BORDER}`, background: t.swatch, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <AsciiIcon name={t.icon} palette={t.palette} size={48} />
              </div>
              <div>
                <p style={{ fontFamily: 'var(--font-display)', fontStretch: '125%', fontWeight: 800, fontSize: 14, textTransform: 'uppercase', margin: 0 }}>{t.label}{on ? '  [on]' : ''}</p>
                <p style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--on-ink-text-3)', margin: '4px 0 0' }}>{t.note}</p>
              </div>
            </button>
          )
        })}
      </div>
    </>
  )
}

/* ── Pro effects ────────────────────────────────────────────────────────── */
function EffectTile({ fx, active, locked, onPick }) {
  return (
    <button
      onClick={onPick}
      aria-pressed={active}
      style={{ textAlign: 'left', padding: 14, cursor: 'pointer', background: 'var(--ink-800)', color: 'var(--paper)', border: `${active ? 2 : 1}px solid ${active ? 'var(--paper)' : BORDER}`, borderRadius: 2, display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      <div style={{ position: 'relative', margin: '26px 10px 12px', height: 44, border: `1px dashed ${BORDER}`, display: 'flex', alignItems: 'center', gap: 10, padding: '0 10px' }}>
        {fx.id !== 'none' && <AsciiAura effect={fx.id} bleed={{ top: 26, side: 10, bottom: 12 }} />}
        <span style={{ position: 'relative', width: 26, height: 26, borderRadius: '50%', background: 'var(--on-ink-3)', border: `1px solid ${BORDER}` }} />
        <span style={{ position: 'relative', fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 700 }}>@you</span>
      </div>
      <div>
        <p style={{ fontFamily: 'var(--font-display)', fontStretch: '125%', fontWeight: 800, fontSize: 13, textTransform: 'uppercase', margin: 0 }}>
          {fx.label}{active ? '  [equipped]' : ''}{locked && fx.id !== 'none' ? '  [pro]' : ''}
        </p>
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--on-ink-text-3)', margin: '4px 0 0' }}>{fx.note}</p>
      </div>
    </button>
  )
}

export function EffectsView({ onBack }) {
  const isPro = useSelector((s) => s.preferences.isPro)
  const { effect, equipEffect } = useCosmetics()
  return (
    <>
      <Back onBack={onBack} />
      <Heading title="Pro effects" note="An ASCII aura that sits behind your name in the sidebar. Everyone can preview them; equipping one is a Pro perk." />
      {!isPro && (
        <div style={{ border: `1px dashed ${BORDER}`, padding: '12px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--on-ink-text-2)' }}>Upgrade to Pro to equip an effect.</span>
          <Link to="/pricing" style={{ ...LABEL, color: 'var(--paper)', textDecoration: 'underline' }}>See Pro</Link>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
        {EFFECTS.map((fx) => (
          <EffectTile key={fx.id} fx={fx} active={effect === fx.id} locked={!isPro} onPick={() => { if (isPro) equipEffect(fx.id) }} />
        ))}
      </div>
    </>
  )
}

/* ── Calling cards ──────────────────────────────────────────────────────── */
function CardTile({ a, state, equipped, onEquip }) {
  const [hover, setHover] = useState(false)
  const pct = Math.round((state.value / state.goal) * 100)
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ border: `${equipped ? 2 : 1}px solid ${equipped ? 'var(--paper)' : BORDER}`, background: 'var(--ink-800)', borderRadius: 2 }}
    >
      <div style={{ position: 'relative' }}>
        <CallingCard scene={a.scene} fps={state.unlocked && hover ? 10 : 0} style={{ border: 0, filter: state.unlocked ? 'none' : 'grayscale(1) brightness(0.45)' }} />
        {!state.unlocked && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AsciiIcon name="lock" palette={['#b9b9b0', '#ffffff']} size={64} label="Locked" />
          </div>
        )}
      </div>
      <div style={{ padding: '10px 12px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontStretch: '125%', fontWeight: 800, fontSize: 13, textTransform: 'uppercase', color: 'var(--paper)' }}>{a.name}</span>
          {equipped && <span style={{ ...LABEL, color: 'var(--paper)' }}>[equipped]</span>}
        </div>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--on-ink-text-3)' }}>{a.how}</span>
        {state.unlocked ? (
          <button
            onClick={onEquip}
            disabled={equipped}
            style={{ marginTop: 4, padding: '7px 10px', fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: equipped ? 'default' : 'pointer', background: equipped ? 'transparent' : 'var(--paper)', color: equipped ? 'var(--on-ink-text-3)' : 'var(--ink-900)', border: `1px solid ${equipped ? BORDER : 'var(--paper)'}`, borderRadius: 2 }}
          >
            {equipped ? 'In use' : 'Equip'}
          </button>
        ) : (
          <div style={{ marginTop: 4 }}>
            <div style={{ height: 6, border: `1px solid ${BORDER}`, borderRadius: 1 }}>
              <div style={{ height: '100%', width: `${pct}%`, background: 'var(--paper)', opacity: 0.8 }} />
            </div>
            <span style={{ ...LABEL, display: 'block', marginTop: 5 }}>{state.value} / {state.goal}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export function CardsView({ onBack }) {
  const stats = useAchievementStats()
  const { banner, equipBanner } = useCosmetics()
  const states = ACHIEVEMENTS.map((a) => [a, evaluate(a, stats)])
  const unlocked = states.filter(([, s]) => s.unlocked).length
  return (
    <>
      <Back onBack={onBack} />
      <Heading title="Calling cards" note={`${unlocked} of ${ACHIEVEMENTS.length} unlocked. Equip one and it shows at the top of your settings and profile. Hover an unlocked card to see it move.`} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
        {states.map(([a, s]) => (
          <CardTile key={a.id} a={a} state={s} equipped={banner === a.scene} onEquip={() => equipBanner(a.scene)} />
        ))}
      </div>
    </>
  )
}

/** The equipped calling card, for the top of Settings and Profile. Falls back to the first card if the saved one is unknown or locked. */
export function EquippedBanner({ fps = 6, style }) {
  const stats = useAchievementStats()
  const { banner } = useCosmetics()
  const owned = ACHIEVEMENTS.find((a) => a.scene === banner && evaluate(a, stats).unlocked)
  const scene = owned ? owned.scene : 'sunrise'
  return <CallingCard scene={scene} fps={fps} style={style} />
}
