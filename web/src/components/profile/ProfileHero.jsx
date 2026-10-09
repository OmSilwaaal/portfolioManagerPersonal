import { Link } from 'react-router-dom'
import CallingCard from '../../ascii/CallingCard'
import { AsciiAura } from '../../ascii/effects'
import { ClanTag, EloBadge } from '../PlayerName'
import { tierById } from '../../utils/elo'

const MONO = { fontFamily: 'var(--font-sans)' }

// Two sizes of the same object: the profile page gives it a full-width banner, the friends panel a shorter one.
const SIZES = {
  lg: { cols: 150, rows: 20, plain: 150, avatar: 88, ring: 3, title: 28, drop: -34, inset: 18, gap: 14 },
  sm: { cols: 120, rows: 14, plain: 96, avatar: 56, ring: 2, title: 19, drop: -22, inset: 14, gap: 10 },
}

function initials(name) {
  return (name ?? '?').split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?'
}

/**
 * Who someone is, in the order the app always states it: calling card, then the name, then everything else below.
 * Shared by the profile page and the friends panel so a visited profile is the same object as your own, not a lookalike.
 * `scene` is passed in rather than read off the profile because your own equipped card lives in local cosmetics state.
 */
export default function ProfileHero({ profile, scene = null, size = 'lg', eloProgress = 0.4, actions = null }) {
  const s = SIZES[size] ?? SIZES.lg
  const realName = profile.display_name ?? profile.username ?? null
  const handle = profile.username ? `@${profile.username}` : (realName ?? 'Member')
  const joinedDate = profile.joined_at
    ? new Date(profile.joined_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null
  const e = profile.elo
  const tier = tierById(e?.tier)

  return (
    <>
      <div style={{ position: 'relative' }}>
        {scene ? (
          <CallingCard scene={scene} cols={s.cols} rows={s.rows} fps={6} progress={eloProgress} label={`${handle}'s calling card`} />
        ) : (
          <div role="img" aria-label="Plain header" style={{ height: s.plain, border: '1px solid var(--on-ink-border)', background: `linear-gradient(110deg, ${tier.color}26, var(--ink-950) 70%)` }} />
        )}
        <div style={{ position: 'absolute', left: s.inset, bottom: s.drop, display: 'flex', alignItems: 'flex-end', gap: s.gap }}>
          <div style={{ position: 'relative', width: s.avatar, height: s.avatar }}>
            {profile.is_pro && profile.effect && profile.effect !== 'none' && <AsciiAura effect={profile.effect} bleed={{ top: 22, side: 14, bottom: 10 }} />}
            <div style={{ position: 'relative', width: s.avatar, height: s.avatar, borderRadius: '50%', overflow: 'hidden', border: `${s.ring}px solid var(--ink-900)`, outline: '2px solid var(--paper)', background: 'var(--ink-800)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: s.avatar * 0.34, color: 'var(--paper)' }}>
              {profile.avatar_url ? <img src={profile.avatar_url} alt="" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials(realName ?? 'M')}
            </div>
          </div>
        </div>
      </div>

      <header style={{ marginTop: -s.drop, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontStretch: '125%', fontWeight: 800, fontSize: s.title, margin: 0, textTransform: 'uppercase', color: profile.name_color || 'var(--paper)', overflowWrap: 'anywhere', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {profile.clan && <Link to={`/clans/${profile.clan.id}`} style={{ textDecoration: 'none' }}><ClanTag tag={profile.clan.tag} color={profile.clan.color} /></Link>}
            {handle}
            {e && <EloBadge elo={e.elo} tier={e.tier} size={size === 'lg' ? 'lg' : 'md'} />}
          </h1>
          <p style={{ ...MONO, fontSize: 13, color: 'var(--on-ink-text-3)', margin: '4px 0 0', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {profile.username && realName && realName !== profile.username && <span>{realName}</span>}
            {joinedDate && <span>Joined {joinedDate}</span>}
            {profile.is_pro && <span className="t-chip" style={{ color: '#fde047', borderColor: '#fde047' }}>Pro</span>}
          </p>
        </div>
        {actions && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{actions}</div>}
      </header>
    </>
  )
}
