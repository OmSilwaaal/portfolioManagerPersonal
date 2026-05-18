import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  useGetGroupQuery,
  useCreatePostMutation,
  useDeletePostMutation,
  useUpdateMemberMutation,
  useRemoveMemberMutation,
  useUpdateGroupMutation,
} from '../api/groupsApi'

const COLORS = ['#e2e8f0','#fca5a5','#fdba74','#fef08a','#86efac','#93c5fd','#c4b5fd','#f9a8d4']
const EMOJIS = ['📈','💹','🏦','🎯','📊','🚀','💡','🔬']

const glassStyle = {
  background: 'linear-gradient(145deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 50%, rgba(255,255,255,0.06) 100%)',
  backdropFilter: 'blur(24px) saturate(180%)',
  WebkitBackdropFilter: 'blur(24px) saturate(180%)',
  border: '1px solid rgba(255,255,255,0.10)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.14)',
}

function fmtTime(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return new Date(iso).toLocaleDateString()
}

function initials(name) {
  return (name ?? '?').split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?'
}

function PostCard({ post, groupId, isAdmin, currentUserId, onDelete }) {
  const isOwn = post.authorId === currentUserId
  const isAnnouncement = post.type === 'announcement'
  const isNotification = post.type === 'notification'
  const [deletePost] = useDeletePostMutation()

  const handleDelete = async () => {
    if (!confirm('Delete this post?')) return
    try { await deletePost({ groupId, postId: post.id }).unwrap() } catch (_) {}
    if (onDelete) onDelete()
  }

  return (
    <div
      className="rounded-xl p-4 relative"
      style={{
        background: isNotification
          ? 'linear-gradient(135deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.05) 100%)'
          : isAnnouncement
          ? 'rgba(255,255,255,0.06)'
          : 'rgba(255,255,255,0.04)',
        border: isNotification
          ? '1px solid rgba(255,255,255,0.18)'
          : isAnnouncement
          ? '1px solid rgba(255,255,255,0.10)'
          : '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {(isAnnouncement || isNotification) && (
        <div className="flex items-center gap-1.5 mb-2">
          {isNotification ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.41 2 2 0 0 1 3.6 1.24h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.18 6.18l1.83-1.83a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
          )}
          <span className="text-[10px] font-semibold uppercase tracking-widest text-white/50">
            {isNotification ? 'Notification' : 'Announcement'}
          </span>
        </div>
      )}
      <div className="flex items-start gap-3">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 text-white"
          style={{ background: 'rgba(255,255,255,0.12)' }}
        >
          {initials(post.authorName)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-sm font-semibold text-white/80">{post.authorName ?? 'Unknown'}</span>
            <span className="text-xs text-white/25">{fmtTime(post.createdAt)}</span>
          </div>
          <p className="text-sm text-white/70 leading-relaxed whitespace-pre-wrap break-words">{post.content}</p>
        </div>
        {(isAdmin || isOwn) && (
          <button
            onClick={handleDelete}
            className="text-white/20 hover:text-red-400 transition-colors flex-shrink-0 mt-0.5"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}

export default function GroupDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data: group, isLoading, isError } = useGetGroupQuery(id)
  const [createPost, { isLoading: posting }] = useCreatePostMutation()
  const [updateMember] = useUpdateMemberMutation()
  const [removeMember] = useRemoveMemberMutation()
  const [updateGroup, { isLoading: savingSettings }] = useUpdateGroupMutation()

  const [content, setContent] = useState('')
  const [postType, setPostType] = useState('post')
  const [postError, setPostError] = useState('')

  const [codeCopied, setCodeCopied] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editColor, setEditColor] = useState('')
  const [editEmoji, setEditEmoji] = useState('')

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0a0a0a]">
        <div className="w-6 h-6 border-2 border-white/20 border-t-white/70 rounded-full animate-spin" />
      </div>
    )
  }

  if (isError || !group) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#0a0a0a] gap-3">
        <p className="text-white/40 text-sm">Group not found or you're not a member.</p>
        <Link to="/groups" className="text-white/60 hover:text-white text-sm underline">Back to groups</Link>
      </div>
    )
  }

  const isAdmin = group.role === 'admin'
  const currentUserId = user?.id

  const handlePost = async (e) => {
    e.preventDefault()
    if (!content.trim()) return
    setPostError('')
    try {
      await createPost({ groupId: id, content: content.trim(), type: postType }).unwrap()
      setContent('')
      setPostType('post')
    } catch (err) {
      setPostError(err?.data?.error ?? 'Failed to post.')
    }
  }

  const copyCode = () => {
    navigator.clipboard.writeText(group.code)
    setCodeCopied(true)
    setTimeout(() => setCodeCopied(false), 2000)
  }

  const openSettings = () => {
    setEditName(group.name)
    setEditDesc(group.description)
    setEditColor(group.color)
    setEditEmoji(group.emoji)
    setSettingsOpen(true)
  }

  const handleSaveSettings = async () => {
    try {
      await updateGroup({ id, name: editName, description: editDesc, color: editColor, emoji: editEmoji }).unwrap()
      setSettingsOpen(false)
    } catch (_) {}
  }

  const handleMemberAction = async (memberId, action) => {
    if (action === 'remove') {
      if (!confirm('Remove this member?')) return
      await removeMember({ groupId: id, userId: memberId }).unwrap().catch(() => {})
    } else {
      await updateMember({ groupId: id, userId: memberId, role: action }).unwrap().catch(() => {})
    }
  }

  const initial = group.name.charAt(0).toUpperCase()

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0a0a0a]">
      {/* Header */}
      <header className="flex items-center gap-4 px-6 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <Link to="/groups" className="text-white/40 hover:text-white transition-colors flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </Link>
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center text-base font-bold flex-shrink-0"
          style={{ background: group.color + '22', border: `1px solid ${group.color}55`, color: group.color }}
        >
          {group.emoji || initial}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold text-white truncate">{group.name}</h1>
          {group.description && <p className="text-xs text-white/35 truncate">{group.description}</p>}
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded flex-shrink-0" style={{ background: isAdmin ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)', color: isAdmin ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.35)' }}>
          {group.role}
        </span>
        {isAdmin && (
          <button onClick={openSettings} className="text-white/30 hover:text-white transition-colors flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        )}
      </header>

      <main className="flex-1 overflow-hidden flex flex-col lg:flex-row">
        {/* Stream */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Post composer */}
          <div className="px-4 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            <form onSubmit={handlePost} className="flex flex-col gap-2">
              <textarea
                value={content}
                onChange={(e) => { setContent(e.target.value); setPostError('') }}
                placeholder="Share something with the group…"
                rows={3}
                className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none resize-none"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
              />
              <div className="flex items-center justify-between gap-2">
                {isAdmin ? (
                  <div className="flex gap-1 p-0.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    {[['post','Post'],['announcement','Announcement'],['notification','Notification']].map(([val, label]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setPostType(val)}
                        className="px-3 py-1 rounded-md text-xs font-medium transition-all"
                        style={{
                          background: postType === val ? 'rgba(255,255,255,0.15)' : 'transparent',
                          color: postType === val ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.35)',
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                ) : <div />}
                <button
                  type="submit"
                  disabled={posting || !content.trim()}
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-white text-[#0a0a0a] hover:bg-white/90 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  {posting ? 'Posting…' : 'Post'}
                </button>
              </div>
              {postError && <p className="text-red-400 text-xs">{postError}</p>}
            </form>
          </div>

          {/* Posts */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
            {(group.posts ?? []).length === 0 ? (
              <p className="text-white/25 text-sm text-center py-12">No posts yet. Be the first to share something.</p>
            ) : (
              (group.posts ?? []).map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  groupId={id}
                  isAdmin={isAdmin}
                  currentUserId={currentUserId}
                />
              ))
            )}
          </div>
        </div>

        {/* Sidebar */}
        <aside className="lg:w-72 flex-shrink-0 border-t lg:border-t-0 lg:border-l overflow-y-auto p-4 flex flex-col gap-4" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          {/* Group code */}
          <div className="rounded-xl p-4" style={glassStyle}>
            <p className="text-[10px] uppercase tracking-widest text-white/30 mb-2">Invite Code</p>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xl font-bold text-white tracking-[0.2em] flex-1">{group.code}</span>
              <button
                onClick={copyCode}
                className="text-xs px-3 py-1.5 rounded-lg border transition-colors"
                style={{ borderColor: 'rgba(255,255,255,0.15)', color: codeCopied ? 'rgba(134,239,172,1)' : 'rgba(255,255,255,0.5)' }}
              >
                {codeCopied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="text-[10px] text-white/20 mt-2">Share this code to invite members</p>
          </div>

          {/* Members */}
          <div className="rounded-xl p-4" style={glassStyle}>
            <p className="text-[10px] uppercase tracking-widest text-white/30 mb-3">Members ({(group.members ?? []).length})</p>
            <div className="flex flex-col gap-2">
              {(group.members ?? []).map((m) => (
                <div key={m.userId} className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold text-white flex-shrink-0" style={{ background: 'rgba(255,255,255,0.10)' }}>
                    {initials(m.displayName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-white/70 truncate">{m.displayName ?? m.email ?? 'Member'}</p>
                  </div>
                  <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ background: m.role === 'admin' ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)', color: m.role === 'admin' ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.30)' }}>
                    {m.role}
                  </span>
                  {isAdmin && m.userId !== currentUserId && (
                    <div className="relative group">
                      <button className="text-white/20 hover:text-white/60 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>
                        </svg>
                      </button>
                      <div className="absolute right-0 top-5 z-10 hidden group-focus-within:flex group-hover:flex flex-col rounded-lg overflow-hidden shadow-xl" style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.12)', minWidth: 130 }}>
                        {m.role === 'member' && (
                          <button onClick={() => handleMemberAction(m.userId, 'admin')} className="text-left px-3 py-2 text-xs text-white/60 hover:bg-white/10 hover:text-white transition-colors">Make admin</button>
                        )}
                        {m.role === 'admin' && (
                          <button onClick={() => handleMemberAction(m.userId, 'member')} className="text-left px-3 py-2 text-xs text-white/60 hover:bg-white/10 hover:text-white transition-colors">Remove admin</button>
                        )}
                        <button onClick={() => handleMemberAction(m.userId, 'remove')} className="text-left px-3 py-2 text-xs text-red-400 hover:bg-white/10 transition-colors">Remove</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </aside>
      </main>

      {/* Settings modal */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) setSettingsOpen(false) }}>
          <div className="w-full max-w-md rounded-2xl p-6" style={glassStyle}>
            <h2 className="text-lg font-bold text-white mb-5">Edit group</h2>
            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-xs uppercase tracking-widest text-white/30 mb-1.5">Name</label>
                <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full px-4 py-2.5 rounded-xl text-sm text-white focus:outline-none" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' }} />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-widest text-white/30 mb-1.5">Description</label>
                <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={2} className="w-full px-4 py-2.5 rounded-xl text-sm text-white focus:outline-none resize-none" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' }} />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-widest text-white/30 mb-2">Color</label>
                <div className="flex gap-2 flex-wrap">
                  {COLORS.map((c) => (
                    <button key={c} type="button" onClick={() => setEditColor(c)} className="w-7 h-7 rounded-full transition-all" style={{ background: c, boxShadow: editColor === c ? `0 0 0 2px #0a0a0a, 0 0 0 3.5px ${c}` : 'none', transform: editColor === c ? 'scale(1.2)' : 'scale(1)' }} />
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs uppercase tracking-widest text-white/30 mb-2">Icon</label>
                <div className="flex gap-1.5 flex-wrap mb-2">
                  {EMOJIS.map((em) => (
                    <button key={em} type="button" onClick={() => setEditEmoji(em === editEmoji ? '' : em)} className="w-8 h-8 rounded-lg text-base flex items-center justify-center transition-all" style={{ background: editEmoji === em ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)', border: editEmoji === em ? '1px solid rgba(255,255,255,0.30)' : '1px solid rgba(255,255,255,0.08)' }}>
                      {em}
                    </button>
                  ))}
                </div>
                <input type="text" value={editEmoji} onChange={(e) => setEditEmoji(e.target.value.slice(-2))} placeholder="Or type any emoji…" className="w-full px-3 py-2 rounded-xl text-sm text-white focus:outline-none" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }} />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setSettingsOpen(false)} className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white/50 hover:text-white border transition-colors" style={{ borderColor: 'rgba(255,255,255,0.12)' }}>Cancel</button>
              <button onClick={handleSaveSettings} disabled={savingSettings || !editName.trim()} className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-white text-[#0a0a0a] hover:bg-white/90 disabled:opacity-30 transition-colors">{savingSettings ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
