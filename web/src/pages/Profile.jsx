import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useGetProfileQuery, useGetProfileByUsernameQuery } from '../api/profilesApi'
import {
  useGetFriendsQuery, useRequestFriendMutation, useAcceptFriendMutation, useRemoveFriendMutation,
} from '../api/socialApi'
import CallingCard from '../ascii/CallingCard'
import AsciiIcon from '../ascii/icons'
import { AsciiAura } from '../ascii/effects'
import useCosmetics from '../ascii/useCosmetics'
import { ACHIEVEMENTS, evaluate, statsFromProfile } from '../ascii/achievements'

const BORDER = 'var(--on-ink-border)'
const MONO = { fontFamily: 'var(--font-sans)' }
const LABEL = { ...MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--on-ink-text-3)' }
const usd = (n) => `$${Math.round(n).toLocaleString('en-US')}`

function initials(name) {
  return (name ?? '?').split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?'
}

function Stat({ label, value, tone }) {
  return (
    <div style={{ padding: '12px 14px', border: `1px solid ${BORDER}`, background: 'var(--ink-800)', borderRadius: 2, minWidth: 0 }}>
      <div style={{ fontFamily: 'var(--font-display)', fontStretch: '125%', fontWeight: 800, fontSize: 22, color: tone ?? 'var(--paper)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={LABEL}>{label}</div>
    </div>
  )
}

function Achievement({ a, state, equipped, canEquip, onEquip }) {
  const pct = Math.round((state.value / state.goal) * 100)
  return (
    <div style={{ border: `${equipped ? 2 : 1}px solid ${equipped ? 'var(--paper)' : BORDER}`, background: 'var(--ink-800)', borderRadius: 2 }}>
      <div style={{ position: 'relative' }}>
        <CallingCard scene={a.scene} cols={110} rows={16} style={{ border: 0, filter: state.unlocked ? 'none' : 'grayscale(1) brightness(0.45)' }} label={`${a.name} calling card`} />
        {!state.unlocked && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AsciiIcon name="lock" palette={['#b9b9b0', '#ffffff']} size={56} label="Locked" />
          </div>
        )}
      </div>
      <div style={{ padding: '8px 10px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontStretch: '125%', fontWeight: 800, fontSize: 12, textTransform: 'uppercase', color: 'var(--paper)' }}>{a.name}</span>
          {equipped && <span style={{ ...LABEL, color: 'var(--paper)' }}>[equipped]</span>}
        </div>
        <span style={{ ...MONO, fontSize: 11, color: 'var(--on-ink-text-3)' }}>{a.how}</span>
        {state.unlocked ? (
          canEquip && !equipped && <button className="t-btn t-btn-primary px-2 py-1" style={{ ...MONO, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', marginTop: 2 }} onClick={onEquip}>Equip</button>
        ) : (
          <div>
            <div style={{ height: 5, border: `1px solid ${BORDER}`, marginTop: 2 }}><div style={{ width: `${pct}%`, height: '100%', background: 'var(--paper)', opacity: 0.8 }} /></div>
            <span style={{ ...LABEL, fontSize: 9 }}>{state.value} / {state.goal}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function FriendAction({ userId, username }) {
  const navigate = useNavigate()
  const { data } = useGetFriendsQuery()
  const [request, { isLoading: requesting }] = useRequestFriendMutation()
  const [accept, { isLoading: accepting }] = useAcceptFriendMutation()
  const [remove, { isLoading: removing }] = useRemoveFriendMutation()
  const has = (k) => (data?.[k] ?? []).some((p) => p.userId === userId)
  const busy = requesting || accepting || removing
  const btn = { ...MONO, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.1em' }

  if (has('friends')) {
    return (
      <>
        <button className="t-btn t-btn-primary px-4 py-2" style={btn} onClick={() => navigate(`/friends/${userId}`)}>Message</button>
        <button className="t-btn px-3 py-2" style={btn} disabled={busy} onClick={() => remove(userId)}>Unfriend</button>
      </>
    )
  }
  if (has('incoming')) return <button className="t-btn t-btn-primary px-4 py-2" style={btn} disabled={busy} onClick={() => accept(userId)}>Accept request</button>
  if (has('outgoing')) return <button className="t-btn px-4 py-2" style={btn} disabled={busy} onClick={() => remove(userId)}>Requested · cancel</button>
  return <button className="t-btn t-btn-primary px-4 py-2" style={btn} disabled={busy} onClick={() => request(userId)} aria-label={`Add ${username ? `@${username}` : 'user'} as a friend`}>Add friend</button>
}

export default function Profile() {
  const { userId: paramId, username } = useParams()
  const { user } = useAuth()
  const { banner: myBanner, equipBanner } = useCosmetics()

  const byName = useGetProfileByUsernameQuery(username, { skip: !username })
  const userId = paramId ?? byName.data?.user_id
  const { data: profile, isLoading, isError } = useGetProfileQuery(userId, { skip: !userId })

  if ((username && byName.isLoading) || isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center" aria-busy="true">
        <p style={{ ...MONO, fontSize: 13, color: 'var(--on-ink-text-3)' }}>Loading profile…</p>
      </div>
    )
  }
  if (byName.isError || isError || !profile) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <p style={{ ...MONO, fontSize: 14, color: 'var(--on-ink-text-2)' }}>Profile not found.</p>
        <Link to="/friends" style={{ ...MONO, color: 'var(--paper)', fontSize: 13 }}>Back to friends</Link>
      </div>
    )
  }

  const isOwn = user?.id === profile.user_id
  const realName = profile.display_name ?? profile.username ?? null
  const handle = profile.username ? `@${profile.username}` : (realName ?? 'Member')
  const joinedDate = profile.joined_at ? new Date(profile.joined_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : null
  const stats = statsFromProfile(profile)
  const equippedScene = isOwn ? myBanner : profile.banner
  const states = ACHIEVEMENTS.map((a) => [a, evaluate(a, stats)])
  const heroScene = states.find(([a, s]) => a.scene === equippedScene && s.unlocked)?.[0]?.scene ?? 'sunrise'
  const unlocked = states.filter(([, s]) => s.unlocked).length
  const s = profile.stats ?? {}

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <main className="flex-1 overflow-y-auto" style={{ padding: 'clamp(14px, 3vw, 32px)' }}>
        <div style={{ maxWidth: 880, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ position: 'relative' }}>
            <CallingCard scene={heroScene} cols={150} rows={20} fps={6} label={`${handle}'s calling card`} />
            <div style={{ position: 'absolute', left: 18, bottom: -34, display: 'flex', alignItems: 'flex-end', gap: 14 }}>
              <div style={{ position: 'relative', width: 88, height: 88 }}>
                {profile.is_pro && profile.effect && profile.effect !== 'none' && <AsciiAura effect={profile.effect} bleed={{ top: 22, side: 14, bottom: 10 }} />}
                <div style={{ position: 'relative', width: 88, height: 88, borderRadius: '50%', overflow: 'hidden', border: '3px solid var(--ink-900)', outline: '2px solid var(--paper)', background: 'var(--ink-800)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 30, color: 'var(--paper)' }}>
                  {profile.avatar_url ? <img src={profile.avatar_url} alt="" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials(realName ?? 'M')}
                </div>
              </div>
            </div>
          </div>

          <header style={{ marginTop: 34, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ fontFamily: 'var(--font-display)', fontStretch: '125%', fontWeight: 800, fontSize: 28, margin: 0, textTransform: 'uppercase', color: 'var(--paper)', overflowWrap: 'anywhere' }}>{handle}</h1>
              <p style={{ ...MONO, fontSize: 13, color: 'var(--on-ink-text-3)', margin: '4px 0 0', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                {profile.username && realName && realName !== profile.username && <span>{realName}</span>}
                {joinedDate && <span>Joined {joinedDate}</span>}
                {profile.is_pro && <span className="t-chip" style={{ color: '#fde047', borderColor: '#fde047' }}>Pro</span>}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {isOwn ? (
                <Link to="/settings" className="t-btn px-4 py-2" style={{ ...MONO, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.1em', textDecoration: 'none' }}>Edit profile</Link>
              ) : (
                <FriendAction userId={profile.user_id} username={profile.username} />
              )}
            </div>
          </header>

          <section aria-label="About">
            {profile.bio ? (
              <p style={{ ...MONO, fontSize: 14, lineHeight: 1.55, color: 'var(--on-ink-text-1)', margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxWidth: '65ch' }}>{profile.bio}</p>
            ) : (
              <p style={{ ...MONO, fontSize: 13, color: 'var(--on-ink-text-4)', margin: 0 }}>{isOwn ? 'No bio yet. Add one in settings.' : 'No bio yet.'}</p>
            )}
          </section>

          <section aria-label="Stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
            <Stat label="Friends" value={s.friends ?? 0} />
            <Stat label="Groups" value={s.groups ?? 0} />
            <Stat label="Winning trades" value={s.wins ?? 0} />
            <Stat label="Best win" value={s.bestWinUsd > 0 ? `+${usd(s.bestWinUsd)}` : '--'} tone={s.bestWinUsd > 0 ? 'var(--positive)' : undefined} />
          </section>

          <section aria-label="Achievements">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '6px 0 10px' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontStretch: '125%', fontWeight: 800, fontSize: 16, textTransform: 'uppercase', margin: 0, color: 'var(--paper)' }}>Calling cards</h2>
              <span style={LABEL}>{unlocked} / {ACHIEVEMENTS.length} unlocked</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12 }}>
              {states.map(([a, st]) => (
                <Achievement key={a.id} a={a} state={st} equipped={a.scene === equippedScene && st.unlocked} canEquip={isOwn} onEquip={() => equipBanner(a.scene)} />
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
