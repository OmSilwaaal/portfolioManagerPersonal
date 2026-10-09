import { useCallback, useEffect, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import CallingCard from '../../ascii/CallingCard'
import { TIERS, formatElo } from '../../utils/elo'
import TierIcon from './TierIcon'
import { tierInk } from './tierIcons'
import { rangeLabel, standingFor } from './standing'

const MONO = { fontFamily: 'var(--font-sans)' }
const NUM = { fontVariantNumeric: 'tabular-nums' }
const DISPLAY = { fontFamily: 'var(--font-display)', fontStretch: '125%', textTransform: 'uppercase' }
const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current'

const COL = 92 // a tier column: wide enough for the icon and the threshold under it
const ICON = 76
const CENTRE = 100 / (TIERS.length * 2) // 6.25% — centre of the first column, and the rail's inset

const n = (v) => v.toLocaleString('en-US')

/** The threshold under each icon: short enough to sit in a 92px column. */
const thresholdLabel = (i) => (i === 0 ? '< 500' : formatElo(TIERS[i].min))

function TierButton({ i, tier, ink, open, here, reached, onToggle }) {
  return (
    <button
      type="button"
      className={FOCUS}
      aria-expanded={open}
      aria-controls={open ? 'elo-tier-detail' : undefined}
      onClick={() => onToggle(tier.id)}
      style={{
        ...MONO,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        padding: '10px 4px 8px',
        background: open ? 'var(--ink-700)' : 'transparent',
        border: here ? `2px solid ${ink}` : '1px solid transparent',
        borderRadius: 2,
        color: ink,
        cursor: 'pointer',
        opacity: reached ? 1 : 0.6,
        transition: 'background 120ms, opacity 120ms',
      }}
      title={`${tier.name} — ${rangeLabel(i)}`}
    >
      <TierIcon id={tier.id} color={ink} size={ICON} label={`${tier.name} rank icon`} />
      <span style={{ ...DISPLAY, fontWeight: 900, fontSize: 12, letterSpacing: '0.04em', lineHeight: 1 }}>{tier.name}</span>
      <span style={{ ...NUM, fontSize: 10.5, color: 'var(--on-ink-text-3)' }}>{thresholdLabel(i)}</span>
    </button>
  )
}

function TierDetail({ i, tier, ink, me, onClose }) {
  const reached = me ? me.peak >= tier.min : false
  const here = me ? standingFor(me.elo).tier.id === tier.id : false
  const away = me && !reached && tier.min > me.elo ? tier.min - me.elo : 0
  return (
    <div
      id="elo-tier-detail"
      role="region"
      aria-label={`${tier.name}: what it means`}
      style={{ border: `1px solid ${ink}`, background: 'var(--ink-800)', padding: '14px 16px', display: 'grid', gap: 10 }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{ ...DISPLAY, fontWeight: 900, fontSize: 20, margin: 0, color: ink }}>{tier.name}</h3>
        <span style={{ ...MONO, ...NUM, fontSize: 12, color: 'var(--on-ink-text-2)' }}>{rangeLabel(i)}</span>
        {here && <span className="t-chip" style={{ color: ink, borderColor: ink }}>You are here</span>}
        {!here && reached && <span className="t-chip">Reached</span>}
        {!!away && <span className="t-chip" style={{ ...NUM }}>{n(away)} Elo away</span>}
        <button
          type="button"
          className={`t-chip ${FOCUS}`}
          onClick={onClose}
          style={{ marginLeft: 'auto', padding: '5px 10px', cursor: 'pointer', background: 'transparent' }}
        >
          Close
        </button>
      </div>
      <p style={{ ...MONO, fontSize: 13.5, lineHeight: 1.55, margin: 0, color: 'var(--paper)', maxWidth: '60ch' }}>{tier.blurb}</p>
      <p style={{ ...MONO, fontSize: 12, margin: 0, color: 'var(--on-ink-text-3)' }}>
        Unlocks the {tier.name} calling card{tier.id === 'rekt' ? ', the one nobody wants' : ''}:
      </p>
      {/* The one big ASCII scene on the page, and only while a tier is open. Drawn once, not
          animated: the page's old cost was eight of these repainting, and a card you opened on
          purpose should not be the thing that brings it back. */}
      <CallingCard scene={tier.id} cols={100} rows={14} fps={0} label={`${tier.name} calling card`} style={{ maxWidth: 620 }} />
    </div>
  )
}

export default function EloTrack({ me }) {
  const isDark = useSelector((s) => s.theme.isDark)
  const [openId, setOpenId] = useState(null)
  const scrollRef = useRef(null)
  const stand = me ? standingFor(me.elo) : null
  const peakTier = me ? standingFor(me.peak).tier : null
  const inkFor = useCallback((hex) => tierInk(hex, isDark), [isDark])

  const toggle = useCallback((id) => setOpenId((cur) => (cur === id ? null : id)), [])

  // Eight columns do not fit a phone, so the strip scrolls; it should open showing you.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !stand) return
    const target = ((stand.index + 0.5) / TIERS.length) * el.scrollWidth - el.clientWidth / 2
    el.scrollLeft = Math.max(0, target)
  }, [stand?.index])

  useEffect(() => {
    if (!openId) return undefined
    const onKey = (e) => { if (e.key === 'Escape') setOpenId(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openId])

  const openIndex = openId ? TIERS.findIndex((t) => t.id === openId) : -1
  const hereInk = stand ? inkFor(stand.tier.color) : 'var(--on-ink-text-2)'
  const pct = stand ? Math.round(stand.within * 100) : 0
  const fill = stand ? stand.track : 0

  return (
    <section aria-labelledby="ladder" style={{ display: 'grid', gap: 12, minWidth: 0 }}>
      <h2 id="ladder" className="sr-only">The ladder</h2>

      {/* Standing: the one number, and the one number left to go. */}
      <div style={{ border: `1px solid ${stand ? hereInk : 'var(--on-ink-border)'}`, background: 'var(--ink-800)', padding: '14px 16px', display: 'grid', gap: 10 }}>
        {stand ? (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
              <span className="t-chip" style={{ color: hereInk, borderColor: hereInk }}>You are here</span>
              <span style={{ ...DISPLAY, fontWeight: 900, fontSize: 24, lineHeight: 1, color: hereInk }}>{stand.tier.name}</span>
              <span style={{ ...MONO, ...NUM, fontSize: 20, fontWeight: 700, color: 'var(--paper)' }}>{n(stand.elo)}</span>
              <span style={{ ...MONO, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--on-ink-text-3)' }}>Elo</span>
              <span style={{ ...MONO, ...NUM, fontSize: 12.5, color: 'var(--on-ink-text-2)', marginLeft: 'auto' }}>
                {stand.next
                  ? <><b style={{ color: 'var(--paper)' }}>{n(stand.gap)}</b> to {stand.next.name} · {pct}% there</>
                  : 'Top of the ladder'}
              </span>
            </div>

            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              aria-valuetext={stand.next ? `${n(stand.elo)} Elo, ${n(stand.gap)} to ${stand.next.name}` : `${n(stand.elo)} Elo, top tier`}
              style={{ position: 'relative', height: 14, background: 'var(--ink-950)', border: '1px solid var(--on-ink-border)', overflow: 'hidden' }}
            >
              {/* a floor of 1.5% so a fresh 0% still reads as a bar rather than an empty box */}
              <div style={{ position: 'absolute', inset: 0, width: `${Math.max(1.5, stand.within * 100)}%`, background: hereInk, opacity: 0.85 }} />
            </div>

            <div style={{ ...MONO, ...NUM, fontSize: 11, display: 'flex', justifyContent: 'space-between', color: 'var(--on-ink-text-3)' }}>
              <span>{stand.tier.min === 0 ? '0' : n(stand.tier.min)} · {stand.tier.name}</span>
              <span>{stand.next ? `${n(stand.next.min)} · ${stand.next.name}` : 'no ceiling'}</span>
            </div>

            {me.peak > me.elo && (
              <p style={{ ...MONO, fontSize: 11.5, margin: 0, color: 'var(--on-ink-text-3)' }}>
                Peak <b style={{ ...NUM, color: 'var(--on-ink-text-2)' }}>{n(me.peak)}</b> ({peakTier.name}). Peaks are kept, so the cards you earned stay yours.
              </p>
            )}
          </>
        ) : (
          <p style={{ ...MONO, fontSize: 13, margin: 0, color: 'var(--on-ink-text-2)' }}>Close your first trade and your standing shows up here.</p>
        )}
      </div>

      {/* The whole ladder, left to right. One equal segment per tier, so every rank is aimable. */}
      <div style={{ border: '1px solid var(--on-ink-border)', background: 'var(--ink-800)', minWidth: 0 }}>
        <div ref={scrollRef} style={{ overflowX: 'auto', overflowY: 'hidden', padding: '6px 2px 2px', scrollbarWidth: 'thin' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${TIERS.length}, minmax(${COL}px, 1fr))`, alignItems: 'end' }}>
            {TIERS.map((t, i) => (
              <TierButton
                key={t.id}
                i={i}
                tier={t}
                ink={inkFor(t.color)}
                open={openId === t.id}
                here={stand?.tier.id === t.id}
                reached={!me || me.peak >= t.min || i === 0}
                onToggle={toggle}
              />
            ))}

            <div style={{ gridColumn: '1 / -1', position: 'relative', height: 30 }}>
              {/* rail, inset to the outer columns' centres so the dots land under the icons */}
              <div style={{ position: 'absolute', left: `${CENTRE}%`, right: `${CENTRE}%`, top: 13, height: 2, background: 'var(--on-ink-3)' }} />
              <div style={{ position: 'absolute', left: `${CENTRE}%`, width: `calc(${fill} * ${100 - CENTRE * 2}%)`, top: 13, height: 2, background: hereInk }} />
              {TIERS.map((t, i) => (
                <div
                  key={t.id}
                  aria-hidden="true"
                  style={{
                    position: 'absolute', left: `calc(${(i + 0.5) * (100 / TIERS.length)}% - 3px)`, top: 11,
                    width: 6, height: 6, borderRadius: '50%',
                    background: stand && i <= stand.index ? inkFor(t.color) : 'var(--ink-800)',
                    border: `1px solid ${stand && i <= stand.index ? inkFor(t.color) : 'var(--on-ink-3)'}`,
                  }}
                />
              ))}
              {stand && (
                <div
                  aria-hidden="true"
                  style={{ position: 'absolute', left: `calc(${CENTRE + stand.track * (100 - CENTRE * 2)}%)`, top: 0, transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
                >
                  <div style={{ width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderBottom: `7px solid ${hereInk}` }} />
                  <div style={{ width: 2, height: 6, background: hereInk }} />
                  <div style={{ ...MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: hereInk, marginTop: 1 }}>YOU</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <p style={{ ...MONO, fontSize: 11.5, margin: 0, color: 'var(--on-ink-text-3)' }}>
        {openId ? 'Click the rank again, or press Escape, to close.' : 'Click a rank for what it means and the card it unlocks.'}
      </p>

      {openIndex >= 0 && (
        <TierDetail
          i={openIndex}
          tier={TIERS[openIndex]}
          ink={inkFor(TIERS[openIndex].color)}
          me={me}
          onClose={() => setOpenId(null)}
        />
      )}
    </section>
  )
}
