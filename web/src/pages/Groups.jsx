import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useGetGroupsQuery, useJoinGroupMutation } from '../api/groupsApi'
import { useGetMyProfileQuery } from '../api/profilesApi'

const glassStyle = {
  background: 'linear-gradient(145deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 50%, rgba(255,255,255,0.06) 100%)',
  backdropFilter: 'blur(24px) saturate(180%)',
  WebkitBackdropFilter: 'blur(24px) saturate(180%)',
  border: '1px solid rgba(255,255,255,0.10)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.14)',
}

function GroupCard({ group }) {
  const initial = group.name.charAt(0).toUpperCase()
  return (
    <Link
      to={`/groups/${group.id}`}
      className="block rounded-2xl overflow-hidden hover:scale-[1.01] transition-transform duration-200"
      style={glassStyle}
    >
      <div className="h-1.5 w-full" style={{ background: group.color }} />
      <div className="p-5">
        <div className="flex items-start gap-3 mb-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center text-xl flex-shrink-0 font-bold"
            style={{ background: group.color + '22', border: `1px solid ${group.color}55`, color: group.color }}
          >
            {group.emoji || initial}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-white text-sm truncate">{group.name}</h3>
            <p className="text-xs text-white/40 truncate mt-0.5 leading-snug">
              {group.description || 'No description'}
            </p>
          </div>
          <span
            className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded flex-shrink-0"
            style={{ background: group.role === 'admin' ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)', color: group.role === 'admin' ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.35)' }}
          >
            {group.role}
          </span>
        </div>
        <p className="text-xs text-white/25">{group.memberCount ?? 0} members · {group.postCount ?? 0} posts</p>
      </div>
    </Link>
  )
}

export default function Groups() {
  const { data: groups = [], isLoading } = useGetGroupsQuery()
  const [joinGroup, { isLoading: joining }] = useJoinGroupMutation()
  const { data: myProfile } = useGetMyProfileQuery()
  const navigate = useNavigate()

  const [joinModal, setJoinModal] = useState(false)
  const [profileGate, setProfileGate] = useState(false)
  const [code, setCode] = useState('')
  const [joinError, setJoinError] = useState('')

  const hasUsername = !!myProfile?.username

  const openJoin = () => {
    if (!hasUsername) { setProfileGate(true); return }
    setJoinModal(true); setCode(''); setJoinError('')
  }

  const handleJoin = async (e) => {
    e.preventDefault()
    setJoinError('')
    try {
      const result = await joinGroup({ code: code.trim().toUpperCase() }).unwrap()
      navigate(`/groups/${result.id}`)
    } catch (err) {
      const msg = err?.data?.message ?? (typeof err?.data?.error === 'string' ? err.data.error : null) ?? 'Invalid code. Please try again.'
      setJoinError(msg)
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0a0a0a]">
      <header className="flex items-center justify-between px-6 py-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <div>
          <h1 className="text-xl font-semibold text-white tracking-tight">Groups</h1>
          <p className="text-sm text-white/35">Your investment clubs and communities</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openJoin}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white/60 hover:text-white border transition-colors"
            style={{ borderColor: 'rgba(255,255,255,0.15)' }}
          >
            Join
          </button>
          <button
            onClick={() => { if (!hasUsername) { setProfileGate(true); return } navigate('/groups/new') }}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-white text-[#0a0a0a] hover:bg-white/90 transition-colors"
          >
            + Create
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-screen-xl mx-auto">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-32 rounded-2xl animate-pulse" style={{ background: 'rgba(255,255,255,0.05)' }} />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-5 text-center">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <div>
              <p className="text-white/60 font-medium text-sm">No groups yet</p>
              <p className="text-white/25 text-xs mt-1">Create a group or join one with an invite code</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={openJoin}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white/60 hover:text-white border transition-colors"
                style={{ borderColor: 'rgba(255,255,255,0.15)' }}
              >
                Join with code
              </button>
              <button
                onClick={() => { if (!hasUsername) { setProfileGate(true); return } navigate('/groups/new') }}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-white text-[#0a0a0a] hover:bg-white/90 transition-colors"
              >
                Create group
              </button>
            </div>
          </div>
        ) : (
          <div className="max-w-screen-xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {groups.map((g) => <GroupCard key={g.id} group={g} />)}
          </div>
        )}
      </main>

      {profileGate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setProfileGate(false) }}
        >
          <div className="w-full max-w-sm rounded-2xl p-6" style={glassStyle}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
              </svg>
            </div>
            <h2 className="text-base font-bold text-white mb-1">Set up your profile first</h2>
            <p className="text-sm text-white/40 mb-5">You need a username before you can join or create groups. It only takes a second.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setProfileGate(false)}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white/50 hover:text-white border transition-colors"
                style={{ borderColor: 'rgba(255,255,255,0.12)' }}
              >
                Cancel
              </button>
              <Link
                to="/settings"
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-white text-[#0a0a0a] hover:bg-white/90 transition-colors text-center"
              >
                Go to Settings
              </Link>
            </div>
          </div>
        </div>
      )}

      {joinModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setJoinModal(false) }}
        >
          <div className="w-full max-w-sm rounded-2xl p-6" style={glassStyle}>
            <h2 className="text-lg font-bold text-white mb-1">Join a group</h2>
            <p className="text-xs text-white/40 mb-5">Enter the 6-character invite code</p>
            <form onSubmit={handleJoin} className="flex flex-col gap-3">
              <input
                type="text"
                value={code}
                onChange={(e) => { setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')); setJoinError('') }}
                placeholder="XXXXXX"
                autoFocus
                maxLength={6}
                className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none tracking-[0.3em] font-mono text-center"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: joinError ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(255,255,255,0.10)',
                }}
              />
              {joinError && <p className="text-red-400 text-xs text-center">{joinError}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setJoinModal(false)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white/50 hover:text-white border transition-colors"
                  style={{ borderColor: 'rgba(255,255,255,0.12)' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={code.length < 6 || joining}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-white text-[#0a0a0a] hover:bg-white/90 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  {joining ? 'Joining...' : 'Join'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
