import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useGetProfileQuery, useGetProfileByUsernameQuery } from '../api/profilesApi'
import {
  useGetFriendsQuery, useRequestFriendMutation, useAcceptFriendMutation, useRemoveFriendMutation,
} from '../api/socialApi'
import CallingCard from '../ascii/CallingCard'
import AsciiIcon from '../ascii/icons'
import useCosmetics from '../ascii/useCosmetics'
import { ACHIEVEMENTS, GROUPS, evaluate, statsFromProfile } from '../ascii/achievements'
import ProfileHero from '../components/profile/ProfileHero'
import { tierById, formatElo, pct } from '../utils/elo'

const BORDER = 'var(--on-ink-border)'
const MONO = { fontFamily: 'var(--font-sans)' }
const LABEL = { ...MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--on-ink-text-3)' }
const usd = (n) => `$${Math.round(n).toLocaleString('en-US')}`

function Stat({ label, value, tone }) {
  return (
    <div style={{ padding: '12px 14px', border: `1px solid ${BORDER}`, background: 'var(--ink-800)', borderRadius: 2, minWidth: 0 }}>
      <div style={{ fontFamily: 'var(--font-display)', fontStretch: '125%', fontWeight: 800, fontSize: 22, color: tone ?? 'var(--paper)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={LABEL}>{label}</div>
    </div>
  )
}

function Achievement({ a, state, equipped, canEquip, onEquip, needsPro, progress }) {
  const pct = Math.round((state.value / state.goal) * 100)
  return (
    <div style={{ border: `${equipped ? 2 : 1}px solid ${equipped ? 'var(--paper)' : BORDER}`, background: 'var(--ink-800)', borderRadius: 2 }}>
      <div style={{ position: 'relative' }}>
        <CallingCard scene={a.scene} cols={110} rows={16} progress={progress} style={{ border: 0, filter: state.unlocked ? 'none' : 'grayscale(1) brightness(0.45)' }} label={`${a.name} calling card`} />
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
          canEquip && !equipped && (needsPro ? <Link to="/pricing" className="t-btn px-2 py-1" style={{ ...MONO, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', marginTop: 2, textAlign: 'center', textDecoration: 'none' }}>Pro to equip</Link> : <button className="t-btn t-btn-primary px-2 py-1" style={{ ...MONO, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', marginTop: 2 }} onClick={onEquip}>Equip</button>)
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
  // Every hook stays above the loading/error returns below: reading Pro status after them rendered a different number
  // of hooks once the profile arrived, which is React #310. useCosmetics already exposes it, so there is one read.
  const { banner: myBanner, equipBanner, isPro: viewerPro } = useCosmetics()

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
  const stats = statsFromProfile(profile)
  const equippedScene = isOwn ? (viewerPro ? myBanner : null) : profile.banner
  const states = ACHIEVEMENTS.map((a) => [a, evaluate(a, stats)])
  // calling cards are a Pro perk: free profiles get a plain header in their tier colour
  const heroScene = profile.is_pro || (isOwn && viewerPro) ? (states.find(([a, s]) => a.scene === equippedScene && s.unlocked)?.[0]?.scene ?? null) : null
  const e = profile.elo
  const tier = tierById(e?.tier)
  const eloProgress = (e?.pct ?? 35) / 100 * 0.9 + 0.05
  const unlocked = states.filter(([, s]) => s.unlocked).length
  const s = profile.stats ?? {}

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <main className="flex-1 overflow-y-auto" style={{ padding: 'clamp(14px, 3vw, 32px)' }}>
        <div style={{ maxWidth: 880, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <ProfileHero
            profile={profile} scene={heroScene} eloProgress={eloProgress}
            actions={isOwn ? (
              <Link to="/settings" className="t-btn px-4 py-2" style={{ ...MONO, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.1em', textDecoration: 'none' }}>Edit profile</Link>
            ) : (
              <FriendAction userId={profile.user_id} username={profile.username} />
            )}
          />

          <section aria-label="About">
            {profile.bio ? (
              <p style={{ ...MONO, fontSize: 14, lineHeight: 1.55, color: 'var(--on-ink-text-1)', margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxWidth: '65ch' }}>{profile.bio}</p>
            ) : (
              <p style={{ ...MONO, fontSize: 13, color: 'var(--on-ink-text-4)', margin: 0 }}>{isOwn ? 'No bio yet. Add one in settings.' : 'No bio yet.'}</p>
            )}
          </section>

          <section aria-label="Stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
            <Stat label="Friends" value={s.friends ?? 0} />
            <Stat label={`Elo · ${tier.name}`} value={formatElo(e?.elo ?? 500)} tone={tier.color} />
            <Stat label="Win rate" value={e?.trades ? pct(e.winRate) : '--'} />
            <Stat label="Trades" value={e?.trades ?? 0} />
            <Stat label="Best win" value={s.bestWinUsd > 0 ? `+${usd(s.bestWinUsd)}` : '--'} tone={s.bestWinUsd > 0 ? 'var(--positive)' : undefined} />
          </section>

          <section aria-label="Achievements">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '6px 0 10px' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontStretch: '125%', fontWeight: 800, fontSize: 16, textTransform: 'uppercase', margin: 0, color: 'var(--paper)' }}>Calling cards</h2>
              <span style={LABEL}>{unlocked} / {ACHIEVEMENTS.length} unlocked</span>
            </div>
            {GROUPS.map((g) => (
              <div key={g.id} style={{ marginBottom: 16 }}>
                <p style={{ ...MONO, fontSize: 12, color: 'var(--on-ink-text-3)', margin: '0 0 8px' }}><b style={{ color: 'var(--paper)' }}>{g.title}.</b> {g.note}</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12 }}>
                  {states.filter(([a]) => a.group === g.id).map(([a, st]) => (
                    <Achievement key={a.id} a={a} state={st} progress={eloProgress} equipped={a.scene === equippedScene && st.unlocked && viewerPro} canEquip={isOwn} needsPro={!viewerPro} onEquip={() => equipBanner(a.scene)} />
                  ))}
                </div>
              </div>
            ))}
          </section>
        </div>
      </main>
    </div>
  )
}
