import { useParams, Link } from 'react-router-dom'
import { useGetProfileQuery } from '../api/profilesApi'
import { useAuth } from '../contexts/AuthContext'

function initials(name) {
  return (name ?? '?').split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?'
}

const glassStyle = {
  background: 'linear-gradient(145deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 50%, rgba(255,255,255,0.06) 100%)',
  backdropFilter: 'blur(24px) saturate(180%)',
  WebkitBackdropFilter: 'blur(24px) saturate(180%)',
  border: '1px solid rgba(255,255,255,0.10)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.14)',
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

  // Show real name if available, fall back to email-style truncation, never "Anonymous"
  const realName = profile.display_name ?? profile.username ?? null
  const headline = profile.username ? `@${profile.username}` : (realName ?? 'Member')
  const subline = profile.username && profile.display_name ? profile.display_name : null
  const avatarInitials = initials(realName ?? 'M')

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
              className="w-20 h-20 rounded-2xl flex items-center justify-center text-2xl font-bold text-white"
              style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.12)' }}
            >
              {profile.avatar_url
                ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover rounded-2xl" />
                : avatarInitials
              }
            </div>
            <div className="text-center">
              <p className="text-white font-bold text-lg">{headline}</p>
              {subline && <p className="text-white/40 text-sm mt-0.5">{subline}</p>}
            </div>
          </div>

          {/* Bio */}
          {profile.bio ? (
            <div className="rounded-xl p-4" style={glassStyle}>
              <p className="text-[10px] uppercase tracking-widest text-white/30 mb-2">Bio</p>
              <p className="text-sm text-white/70 leading-relaxed whitespace-pre-wrap">{profile.bio}</p>
            </div>
          ) : isOwnProfile ? (
            <div className="rounded-xl p-4 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.10)' }}>
              <p className="text-white/25 text-sm">No bio yet.</p>
              <Link to="/settings" className="text-white/40 hover:text-white text-xs underline mt-1 inline-block">Add one in settings</Link>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  )
}
