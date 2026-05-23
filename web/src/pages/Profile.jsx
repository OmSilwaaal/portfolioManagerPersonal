import { useParams, Link } from 'react-router-dom'
import { useGetProfileQuery } from '../api/profilesApi'
import { useAuth } from '../contexts/AuthContext'

function initials(name) {
  return (name ?? '?').split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?'
}

const glassStyle = {
  background: '#111',
  border: '1px solid #1f1f1f',
}

export default function Profile() {
  const { userId } = useParams()
  const { user } = useAuth()
  const { data: profile, isLoading, isError } = useGetProfileQuery(userId)

  const isOwnProfile = user?.id === userId

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0a0a0a]">
        <div className="w-6 h-6 border-2 border-white/20 border-t-white/70 rounded-full animate-spin" />
      </div>
    )
  }

  if (isError || !profile) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#0a0a0a] gap-3">
        <p className="text-white/40 text-sm">Profile not found.</p>
        <Link to="/groups" className="text-white/60 hover:text-white text-sm underline">Back to groups</Link>
      </div>
    )
  }

  const realName = profile.display_name ?? profile.username ?? null
  const headline = profile.username ? `@${profile.username}` : (realName ?? 'Member')
  const subline = profile.username && profile.display_name ? profile.display_name : null
  const avatarInitials = initials(realName ?? 'M')

  const joinedDate = profile.joined_at
    ? new Date(profile.joined_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0a0a0a]">
      <header className="flex items-center gap-4 px-6 py-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <Link to={-1} className="text-white/40 hover:text-white transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </Link>
        <h1 className="text-xl font-semibold text-white tracking-tight">Profile</h1>
        {isOwnProfile && (
          <Link to="/settings" className="ml-auto text-xs text-white/40 hover:text-white transition-colors">
            Edit profile
          </Link>
        )}
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-md mx-auto flex flex-col gap-5">
          {/* Avatar + name */}
          <div className="flex flex-col items-center gap-3 pt-4 pb-2">
            <div
              className="w-24 h-24 rounded-2xl flex items-center justify-center text-2xl font-bold text-white overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.12)' }}
            >
              {profile.avatar_url
                ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                : avatarInitials
              }
            </div>
            <div className="text-center">
              <p className="text-white font-bold text-xl">{headline}</p>
              {subline && <p className="text-white/40 text-sm mt-0.5">{subline}</p>}
            </div>
          </div>

          {/* Joined date */}
          {joinedDate && (
            <div className="flex items-center justify-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <span className="text-xs text-white/30">Joined {joinedDate}</span>
            </div>
          )}

          {/* Bio */}
          {profile.bio ? (
            <div className="rounded-xl p-4" style={glassStyle}>
              <p className="text-[10px] uppercase tracking-widest text-white/30 mb-2">About</p>
              <p className="text-sm text-white/70 leading-relaxed whitespace-pre-wrap">{profile.bio}</p>
            </div>
          ) : isOwnProfile ? (
            <div className="rounded-xl p-4 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.10)' }}>
              <p className="text-white/25 text-sm">No bio yet.</p>
              <Link to="/settings" className="text-white/40 hover:text-white text-xs underline mt-1 inline-block">Add one in settings</Link>
            </div>
          ) : (
            <div className="rounded-xl p-4 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.08)' }}>
              <p className="text-white/20 text-sm">No bio yet.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
