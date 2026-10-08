import { Link } from 'react-router-dom'
import { AsciiAura } from '../ascii/effects'
import { formatElo, tierById } from '../utils/elo'

const MONO = { fontFamily: 'var(--font-sans)' }

/** Elo chip: a tier-coloured diamond and the rating. Lives next to a name wherever a player shows up. */
export function EloBadge({ elo, tier, size = 'md', title }) {
  if (elo == null) return null
  const t = tierById(tier)
  const s = size === 'sm' ? { f: 10, p: '1px 5px' } : size === 'lg' ? { f: 14, p: '3px 9px' } : { f: 11, p: '1px 6px' }
  return (
    <span
      title={title || `${t.name} · ${Number(elo).toLocaleString('en-US')} Elo`}
      style={{ ...MONO, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: s.f, fontWeight: 800, lineHeight: 1.35, padding: s.p, color: t.color, border: `1px solid ${t.color}`, borderRadius: 2, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.02em', verticalAlign: 'middle' }}
    >
      <span aria-hidden="true" style={{ fontSize: s.f * 0.8 }}>◆</span>{formatElo(elo)}
    </span>
  )
}

/** [TAG] in the clan's colour. */
export function ClanTag({ tag, color, size = 'md' }) {
  if (!tag) return null
  return (
    <span style={{ ...MONO, fontWeight: 800, fontSize: size === 'sm' ? 11 : 'inherit', color: color || 'var(--on-ink-text-2)', whiteSpace: 'nowrap', marginRight: 4 }}>[{tag}]</span>
  )
}

/**
 * A player's name as everyone sees it: [CLAN] name, in their solid colour (any account) with an animated aura (Pro only; the
 * server already strips effects for free accounts), followed by their Elo. `user` is any identity card from the API.
 */
export default function PlayerName({ user, fallback = 'trader', handle = true, elo = true, size = 'md', link = true, aura = true, style, nameStyle }) {
  if (!user) return <span style={{ ...MONO, color: 'var(--on-ink-text-3)' }}>{fallback}</span>
  const label = user.username ? (handle ? `@${user.username}` : user.username) : user.displayName ?? fallback
  const href = user.username ? `/u/${user.username}` : user.userId ? `/profile/${user.userId}` : null
  const fs = size === 'sm' ? 12 : size === 'lg' ? 20 : 14
  const color = user.nameColor || 'var(--paper)'
  const showAura = aura && user.isPro && user.effect && user.effect !== 'none'
  const text = (
    <span style={{ position: 'relative', zIndex: 1, color, fontWeight: 700, textShadow: showAura ? '0 0 3px #000, 0 1px 2px #000' : undefined, ...nameStyle }}>{label}</span>
  )
  return (
    <span style={{ ...MONO, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: fs, minWidth: 0, ...style }}>
      <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', minWidth: 0 }}>
        {showAura && <AsciiAura effect={user.effect} bleed={{ top: 10, side: 6, bottom: 5 }} fontPx={6} opacity={0.85} />}
        <ClanTag tag={user.clanTag} color={user.clanColor} size={size} />
        {link && href ? <Link to={href} style={{ textDecoration: 'none', position: 'relative', zIndex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{text}</Link> : text}
      </span>
      {elo && <EloBadge elo={user.elo} tier={user.tier} size={size === 'lg' ? 'md' : 'sm'} />}
    </span>
  )
}
