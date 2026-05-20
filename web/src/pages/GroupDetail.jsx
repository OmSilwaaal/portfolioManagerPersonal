import { useState, useRef, useCallback, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../utils/supabase/client'
import {
  useGetGroupQuery,
  useCreatePostMutation,
  useDeletePostMutation,
  useUpdateMemberMutation,
  useRemoveMemberMutation,
  useUpdateGroupMutation,
  useDeleteGroupMutation,
  useVotePollMutation,
} from '../api/groupsApi'
import '../api/profilesApi'

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

function resizeImageToDataUrl(file, maxSize = 200, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const scale = Math.min(maxSize / img.width, maxSize / img.height, 1)
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.onerror = reject
      img.src = e.target.result
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// Parse article shares: handles __ARTICLE__{json} format and legacy "📰 [" format
// Also handles __POLL__{json} format
function parsePostContent(content) {
  if (!content) return { type: 'text', text: content }

  // Poll format: __POLL__{"question":"...","options":["A","B"],"votes":{}}
  if (content.startsWith('__POLL__')) {
    try {
      const firstNewline = content.indexOf('\n')
      const jsonStr = firstNewline > -1 ? content.slice(8, firstNewline) : content.slice(8)
      const { question, options, votes = {} } = JSON.parse(jsonStr)
      return { type: 'poll', question, options, votes }
    } catch { return { type: 'text', text: content } }
  }

  // New rich format: __ARTICLE__{"headline":...}\nmessage
  if (content.startsWith('__ARTICLE__')) {
    try {
      const firstNewline = content.indexOf('\n')
      const jsonStr = firstNewline > -1 ? content.slice(11, firstNewline) : content.slice(11)
      const message = firstNewline > -1 ? content.slice(firstNewline + 1).trim() : ''
      const { headline, ticker, summary, image_url, url, sentiment } = JSON.parse(jsonStr)
      return { type: 'article', headline, ticker, summary, image_url, url, sentiment, message }
    } catch {
      return { type: 'text', text: content }
    }
  }

  // Legacy format: 📰 [Title · TICKER]
  if (content.startsWith('📰 [') || content.startsWith('📰 ')) {
    const firstNewline = content.indexOf('\n')
    const header = firstNewline > -1 ? content.slice(0, firstNewline) : content
    const message = firstNewline > -1 ? content.slice(firstNewline + 1).trim() : ''
    const match = header.match(/📰 \[(.+?)(?:\s·\s(.+?))?\]/)
    if (match) {
      return { type: 'article', headline: match[1], ticker: match[2] || '', message }
    }
    return { type: 'article', headline: header.replace('📰 ', ''), ticker: '', message }
  }

  return { type: 'text', text: content }
}

// Discord-style user colors
const USER_COLORS = [
  '#60a5fa','#34d399','#f472b6','#fb923c','#a78bfa',
  '#38bdf8','#4ade80','#fbbf24','#f87171','#c084fc',
]
function userColor(userId) {
  if (!userId) return USER_COLORS[0]
  let h = 0
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0
  return USER_COLORS[h % USER_COLORS.length]
}

function PollCard({ poll, post, groupId, currentUserId, votePoll }) {
  const { question, options, votes = {} } = poll
  const myVote = votes[currentUserId] ?? null
  const total = Object.keys(votes).length

  return (
    <div className="mt-1 max-w-sm rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}>
      <div className="flex items-center gap-1.5 mb-3">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
        </svg>
        <span className="text-[10px] font-semibold uppercase tracking-widest text-white/30">Poll</span>
      </div>
      <p className="text-sm font-semibold text-white/90 mb-3">{question}</p>
      <div className="flex flex-col gap-2">
        {options.map((opt, idx) => {
          const count = Object.values(votes).filter(v => v === idx).length
          const pct = total > 0 ? Math.round((count / total) * 100) : 0
          const isMyVote = myVote === idx
          return (
            <button
              key={idx}
              onClick={() => votePoll({ groupId, postId: post.id, optionIndex: idx })}
              className="relative w-full text-left rounded-lg px-3 py-2.5 overflow-hidden transition-all"
              style={{
                background: isMyVote ? 'rgba(96,165,250,0.15)' : 'rgba(255,255,255,0.04)',
                border: isMyVote ? '1px solid rgba(96,165,250,0.4)' : '1px solid rgba(255,255,255,0.08)',
              }}
            >
              {/* Progress fill */}
              <div
                className="absolute inset-0 rounded-lg transition-all duration-500"
                style={{ width: `${pct}%`, background: isMyVote ? 'rgba(96,165,250,0.12)' : 'rgba(255,255,255,0.04)' }}
              />
              <div className="relative flex items-center justify-between">
                <span className="text-sm text-white/80 font-medium">{opt}</span>
                <div className="flex items-center gap-2">
                  {isMyVote && <span className="text-[10px] text-blue-400">✓</span>}
                  <span className="text-xs text-white/40">{pct}%</span>
                </div>
              </div>
            </button>
          )
        })}
      </div>
      <p className="text-[11px] text-white/25 mt-2">{total} vote{total !== 1 ? 's' : ''}</p>
    </div>
  )
}

function PostCard({ post, groupId, isAdmin, currentUserId, isFirst, isLast }) {
  const isOwn = post.author_id === currentUserId
  const isAnnouncement = post.type === 'announcement'
  const isNotification = post.type === 'notification'
  const [deletePost] = useDeletePostMutation()
  const [votePoll] = useVotePollMutation()
  const parsed = parsePostContent(post.content)
  const color = userColor(post.author_id)

  const handleDelete = async () => {
    if (!confirm('Delete this post?')) return
    try { await deletePost({ groupId, postId: post.id }).unwrap() } catch (_) {}
  }

  const leftBorderStyle = isAnnouncement
    ? { borderLeft: '3px solid rgba(255,255,255,0.35)', paddingLeft: 12, background: 'rgba(255,255,255,0.03)' }
    : isNotification
    ? { borderLeft: '3px solid rgba(251,191,36,0.6)', paddingLeft: 12, background: 'rgba(251,191,36,0.04)' }
    : {}

  return (
    <div
      className={`group relative flex gap-3 px-4 hover:bg-white/[0.02] transition-colors ${isFirst ? 'mt-4 pt-0.5' : 'mt-0.5'}`}
      style={leftBorderStyle}
    >
      {/* Avatar column — always 32px wide to keep alignment */}
      <div className="w-8 flex-shrink-0 flex flex-col items-center">
        {isFirst ? (
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5"
            style={{ background: color + '22', color, border: `1px solid ${color}44` }}
          >
            {initials(post.author_name)}
          </div>
        ) : (
          <span className="text-[10px] text-white/0 group-hover:text-white/25 transition-colors select-none mt-1.5 leading-none w-8 text-center">
            {fmtTime(post.created_at).replace(' ago','').replace('just now','now')}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pb-0.5">
        {isFirst && (
          <div className="flex items-baseline gap-2 mb-0.5">
            <span className="text-sm font-semibold" style={{ color }}>{post.author_name ?? 'Member'}</span>
            <span className="text-[11px] text-white/25">{fmtTime(post.created_at)}</span>
            {(isAnnouncement || isNotification) && (
              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                style={{ background: isNotification ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.10)', color: isNotification ? 'rgba(251,191,36,0.9)' : 'rgba(255,255,255,0.5)' }}>
                {isNotification ? 'Notification' : 'Announcement'}
              </span>
            )}
          </div>
        )}

        {parsed.type === 'poll' ? (
          <PollCard poll={parsed} post={post} groupId={groupId} currentUserId={currentUserId} votePoll={votePoll} />
        ) : parsed.type === 'article' ? (
          <div className="flex flex-col gap-2 mt-1">
            <div className="rounded-lg overflow-hidden max-w-sm" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}>
              {parsed.image_url && (
                <img src={parsed.image_url} alt={parsed.headline} className="w-full max-h-36 object-cover" />
              )}
              <div className="p-3">
                <p className="text-sm font-semibold text-white/85 leading-snug mb-1">{parsed.headline}</p>
                {parsed.summary && <p className="text-xs text-white/40 line-clamp-2 mb-2">{parsed.summary}</p>}
                <div className="flex items-center gap-2 flex-wrap">
                  {parsed.ticker && <span className="text-[10px] font-bold text-white/50 tracking-widest px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.08)' }}>{parsed.ticker}</span>}
                  {parsed.sentiment && (() => {
                    const s = parsed.sentiment
                    const bg = s === 'Bullish' ? 'rgba(52,211,153,0.15)' : s === 'Bearish' ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.08)'
                    const clr = s === 'Bullish' ? 'rgba(52,211,153,0.9)' : s === 'Bearish' ? 'rgba(239,68,68,0.9)' : 'rgba(255,255,255,0.45)'
                    return <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: bg, color: clr }}>{s === 'Bullish' ? '↑ Bullish' : s === 'Bearish' ? '↓ Bearish' : '— Neutral'}</span>
                  })()}
                  {parsed.url && <a href={parsed.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-white/40 hover:text-white/70 ml-auto">Read →</a>}
                </div>
              </div>
            </div>
            {parsed.message && <p className="text-sm text-white/70 leading-relaxed whitespace-pre-wrap break-words">{parsed.message}</p>}
          </div>
        ) : (
          <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap break-words">{parsed.text}</p>
        )}
      </div>

      {/* Delete button — hover only */}
      {(isAdmin || isOwn) && (
        <button
          onClick={handleDelete}
          className="absolute top-1 right-3 text-white/0 group-hover:text-white/30 hover:!text-red-400 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
          </svg>
        </button>
      )}
    </div>
  )
}

function MemberList({ members, isAdmin, currentUserId, onMemberAction, onUpdateMember }) {
  const [editingMember, setEditingMember] = useState(null)
  const [rankInput, setRankInput] = useState('')
  const [openMenu, setOpenMenu] = useState(null)

  const openRankEdit = (m) => {
    setEditingMember(m.user_id)
    setRankInput(m.rank ?? '')
    setOpenMenu(null)
  }

  const saveRank = async (userId, canPost) => {
    await onUpdateMember(userId, { rank: rankInput, can_post: canPost })
    setEditingMember(null)
  }

  return (
    <div className="rounded-xl p-4" style={glassStyle}>
      <p className="text-[10px] uppercase tracking-widest text-white/30 mb-3">Members ({members.length})</p>
      <div className="flex flex-col gap-3">
        {members.map((m) => (
          <div key={m.user_id}>
            <div className="flex items-center gap-2.5">
              <Link to={`/profile/${m.user_id}`} className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold text-white flex-shrink-0 hover:opacity-80 transition-opacity" style={{ background: 'rgba(255,255,255,0.10)' }}>
                {initials(m.display_name)}
              </Link>
              <div className="flex-1 min-w-0">
                <Link to={`/profile/${m.user_id}`} className="text-xs font-medium text-white/70 hover:text-white transition-colors truncate block">
                  {m.display_name ?? m.email ?? 'Member'}
                </Link>
                {m.rank && (
                  <span className="text-[9px] text-white/40 truncate block">{m.rank}</span>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {/* Show custom rank/title as primary badge; role in smaller text */}
                <div className="flex flex-col items-end gap-0.5">
                  <span
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                    style={{
                      background: m.role === 'admin' ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)',
                      color: m.role === 'admin' ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.35)',
                    }}
                  >
                    {m.rank || (m.role === 'admin' ? 'Admin' : 'Member')}
                  </span>
                  {m.rank && (
                    <span className="text-[9px] text-white/20 leading-none">{m.role}</span>
                  )}
                </div>
                {m.role === 'member' && m.can_post && !m.rank && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(134,239,172,0.12)', color: 'rgba(134,239,172,0.8)' }}>
                    can post
                  </span>
                )}
              </div>
              {isAdmin && m.user_id !== currentUserId && (
                <div className="relative flex-shrink-0">
                  <button
                    onClick={() => setOpenMenu(openMenu === m.user_id ? null : m.user_id)}
                    className="text-white/20 hover:text-white/60 transition-colors p-1"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>
                    </svg>
                  </button>
                  {openMenu === m.user_id && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setOpenMenu(null)} />
                      <div
                        className="absolute right-0 top-7 z-20 flex flex-col rounded-xl overflow-hidden shadow-2xl"
                        style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.12)', minWidth: 170 }}
                      >
                        <button onClick={() => openRankEdit(m)} className="text-left px-3 py-2.5 text-xs text-white/60 hover:bg-white/10 hover:text-white transition-colors">
                          Set title / permissions
                        </button>
                        {m.role === 'member' && (
                          <button
                            onClick={() => { onMemberAction(m.user_id, 'admin'); setOpenMenu(null) }}
                            className="text-left px-3 py-2.5 text-xs text-white/60 hover:bg-white/10 hover:text-white transition-colors"
                          >
                            Make admin
                          </button>
                        )}
                        {m.role === 'admin' && (
                          <button
                            onClick={() => { onMemberAction(m.user_id, 'member'); setOpenMenu(null) }}
                            className="text-left px-3 py-2.5 text-xs text-amber-400 hover:bg-white/10 transition-colors"
                          >
                            Revoke admin
                          </button>
                        )}
                        <div className="border-t border-white/8 my-0.5" />
                        <button
                          onClick={() => { onMemberAction(m.user_id, 'remove'); setOpenMenu(null) }}
                          className="text-left px-3 py-2.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                          Kick from group
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {editingMember === m.user_id && (
              <div className="mt-2 ml-9 p-3 rounded-xl flex flex-col gap-2" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' }}>
                <input
                  type="text"
                  value={rankInput}
                  onChange={(e) => setRankInput(e.target.value.slice(0, 30))}
                  placeholder="Title (e.g. CTO, CFO, Analyst, Lead)"
                  className="w-full px-3 py-1.5 rounded-lg text-xs text-white placeholder-white/25 focus:outline-none"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}
                />
                <div className="flex gap-1.5">
                  <button
                    onClick={() => saveRank(m.user_id, false)}
                    className="flex-1 py-1.5 rounded-lg text-xs font-medium text-white/50 hover:text-white border transition-colors"
                    style={{ borderColor: 'rgba(255,255,255,0.12)' }}
                  >
                    Save (read-only)
                  </button>
                  <button
                    onClick={() => saveRank(m.user_id, true)}
                    className="flex-1 py-1.5 rounded-lg text-xs font-medium text-white bg-white/10 hover:bg-white/20 transition-colors"
                  >
                    Save + can post
                  </button>
                </div>
                <button onClick={() => setEditingMember(null)} className="text-xs text-white/25 hover:text-white/50 text-center transition-colors">Cancel</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

const CHANNELS = [
  { id: 'stream', label: 'Stream', types: ['post'] },
  { id: 'announcements', label: 'Announcements', types: ['announcement'] },
  { id: 'notifications', label: 'Notifications', types: ['notification'] },
]

export default function GroupDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data: group, isLoading, isError, refetch } = useGetGroupQuery(id, {
    pollingInterval: 3000,
  })
  const [createPost, { isLoading: posting }] = useCreatePostMutation()
  const [updateMember] = useUpdateMemberMutation()
  const [removeMember] = useRemoveMemberMutation()
  const [updateGroup, { isLoading: savingSettings }] = useUpdateGroupMutation()
  const [deleteGroup] = useDeleteGroupMutation()

  const [realtimePosts, setRealtimePosts] = useState([])
  const [realtimeUpdates, setRealtimeUpdates] = useState({})
  const [typingUsers, setTypingUsers] = useState({})
  const messagesEndRef = useRef(null)
  const channelRef = useRef(null)
  const typingTimeoutRef = useRef(null)

  // Supabase Realtime — posts (INSERT + UPDATE), members (all events), and Presence (typing)
  useEffect(() => {
    if (!id || !user?.id) return
    const ch = supabase
      .channel(`group_live_${id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'group_posts', filter: `group_id=eq.${id}` },
        (payload) => {
          setRealtimePosts((prev) => {
            if (prev.some((p) => p.id === payload.new.id)) return prev
            return [...prev, payload.new]
          })
        }
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'group_posts', filter: `group_id=eq.${id}` },
        (payload) => {
          setRealtimeUpdates((prev) => ({ ...prev, [payload.new.id]: payload.new }))
          setRealtimePosts((prev) => prev.map((p) => p.id === payload.new.id ? payload.new : p))
        }
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'group_members', filter: `group_id=eq.${id}` },
        () => { refetch() }
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'groups', filter: `id=eq.${id}` },
        () => { refetch() }
      )
      .on('presence', { event: 'sync' }, () => {
        const state = ch.presenceState()
        const typing = {}
        Object.values(state).flat().forEach((p) => {
          if (p.userId && p.userId !== user.id && p.typing) {
            typing[p.userId] = p.username || 'Someone'
          }
        })
        setTypingUsers(typing)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await ch.track({
            userId: user.id,
            username: user.user_metadata?.full_name ?? user.email ?? user.id,
            typing: false,
          })
        }
      })
    channelRef.current = ch
    return () => {
      clearTimeout(typingTimeoutRef.current)
      supabase.removeChannel(ch)
      channelRef.current = null
    }
  }, [id, refetch, user?.id])

  const [activeChannel, setActiveChannel] = useState('stream')
  const [content, setContent] = useState('')
  const [postType, setPostType] = useState('post')
  const [postError, setPostError] = useState('')

  // Poll composer state
  const [pollMode, setPollMode] = useState(false)
  const [pollQuestion, setPollQuestion] = useState('')
  const [pollOptions, setPollOptions] = useState(['', ''])

  const [codeCopied, setCodeCopied] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editColor, setEditColor] = useState('')
  const [editEmoji, setEditEmoji] = useState('')
  const [editImageUrl, setEditImageUrl] = useState('')
  const [imageDragOver, setImageDragOver] = useState(false)
  const [imageUploadError, setImageUploadError] = useState('')
  const imageInputRef = useRef(null)

  const processGroupImage = useCallback(async (file) => {
    if (!file || !file.type.startsWith('image/')) { setImageUploadError('Please drop an image file.'); return }
    setImageUploadError('')
    try {
      const dataUrl = await resizeImageToDataUrl(file, 200, 0.75)
      setEditImageUrl(dataUrl)
    } catch { setImageUploadError('Failed to process image.') }
  }, [])

  // Channel filtering — merge RTK cache + realtime new posts + in-place updates (poll votes etc.)
  const currentChannel = CHANNELS.find(c => c.id === activeChannel)
  const channelPosts = [
    ...(group?.posts ?? []).map((p) => realtimeUpdates[p.id] ?? p),
    ...realtimePosts
      .filter((rp) => !(group?.posts ?? []).some((p) => p.id === rp.id))
      .map((p) => realtimeUpdates[p.id] ?? p),
  ]
    .filter((p) => currentChannel?.types.includes(p.type))
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

  // Auto-scroll to newest message whenever the list grows
  useEffect(() => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    })
  }, [channelPosts.length])

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
        <p className="text-white/40 text-sm">Group not found or you&apos;re not a member.</p>
        <Link to="/groups" className="text-white/60 hover:text-white text-sm underline">Back to groups</Link>
      </div>
    )
  }

  const isAdmin = group.role === 'admin'
  const currentUserId = user?.id
  const myMember = group.members?.find(m => m.user_id === currentUserId)
  const canPost = isAdmin || myMember?.can_post

  // Post type follows active channel for regular members; admins can override
  const defaultPostTypeForChannel = activeChannel === 'announcements' ? 'announcement'
    : activeChannel === 'notifications' ? 'notification'
    : 'post'

  const stopTyping = () => {
    clearTimeout(typingTimeoutRef.current)
    if (channelRef.current && user?.id) {
      channelRef.current.track({
        userId: user.id,
        username: user.user_metadata?.full_name ?? user.email ?? user.id,
        typing: false,
      })
    }
  }

  const handlePost = async (e) => {
    e.preventDefault()
    if (!content.trim()) return
    setPostError('')
    stopTyping()
    const type = isAdmin ? postType : defaultPostTypeForChannel
    try {
      await createPost({ groupId: id, content: content.trim(), type }).unwrap()
      setContent('')
    } catch (err) {
      setPostError(err?.data?.message ?? 'Failed to post.')
    }
  }

  const handleCreatePoll = async () => {
    const question = pollQuestion.trim()
    const options = pollOptions.map(o => o.trim()).filter(Boolean)
    if (!question || options.length < 2) return
    setPostError('')
    stopTyping()
    const pollContent = `__POLL__${JSON.stringify({ question, options, votes: {} })}`
    const type = isAdmin ? postType : defaultPostTypeForChannel
    try {
      await createPost({ groupId: id, content: pollContent, type }).unwrap()
      setPollMode(false)
      setPollQuestion('')
      setPollOptions(['', ''])
    } catch (err) {
      setPostError(err?.data?.message ?? 'Failed to create poll.')
    }
  }

  const copyCode = () => {
    navigator.clipboard.writeText(group.code)
    setCodeCopied(true)
    setTimeout(() => setCodeCopied(false), 2000)
  }

  const openSettings = () => {
    setEditName(group.name)
    setEditDesc(group.description ?? '')
    setEditColor(group.color ?? '#e2e8f0')
    setEditEmoji(group.emoji ?? '')
    setEditImageUrl(group.image_url ?? '')
    setImageUploadError('')
    setSettingsOpen(true)
  }

  const handleSaveSettings = async () => {
    try {
      await updateGroup({ id, name: editName, description: editDesc, color: editColor, emoji: editEmoji, image_url: editImageUrl }).unwrap()
      setSettingsOpen(false)
    } catch (_) {}
  }

  const handleDeleteGroup = async () => {
    if (!confirm(`Are you sure you want to delete "${group.name}"? This cannot be undone and will remove all posts and members.`)) return
    try {
      await deleteGroup(id).unwrap()
      navigate('/groups')
    } catch (_) {}
  }

  const handleMemberAction = async (memberId, action) => {
    if (action === 'remove') {
      if (!confirm('Kick this member from the group?')) return
      await removeMember({ groupId: id, userId: memberId }).unwrap().catch(() => {})
    } else {
      await updateMember({ groupId: id, userId: memberId, role: action }).unwrap().catch(() => {})
    }
  }

  const groupInitial = group.name.charAt(0).toUpperCase()
  const groupAvatar = group.image_url || null

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0a0a0a]">
      {/* Header */}
      <header className="flex items-center gap-4 px-6 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <Link to="/groups" className="text-white/40 hover:text-white transition-colors flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </Link>

        {groupAvatar ? (
          <img src={groupAvatar} alt={group.name} className="w-9 h-9 rounded-xl object-cover flex-shrink-0" />
        ) : (
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-base font-bold flex-shrink-0"
            style={{ background: (group.color ?? '#e2e8f0') + '22', border: `1px solid ${group.color ?? '#e2e8f0'}55`, color: group.color ?? '#e2e8f0' }}
          >
            {group.emoji || groupInitial}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold text-white truncate">{group.name}</h1>
          {group.description && <p className="text-xs text-white/35 truncate">{group.description}</p>}
        </div>
        <span
          className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded flex-shrink-0"
          style={{
            background: isAdmin ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)',
            color: isAdmin ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.35)',
          }}
        >
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

      {/* Channel tabs */}
      <div className="flex items-center gap-1 px-6 py-2.5 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        {CHANNELS.map((ch) => {
          const count = (group.posts ?? []).filter(p => ch.types.includes(p.type)).length
          return (
            <button
              key={ch.id}
              onClick={() => { setActiveChannel(ch.id); setPostType(defaultPostTypeForChannel) }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                background: activeChannel === ch.id ? 'rgba(255,255,255,0.10)' : 'transparent',
                color: activeChannel === ch.id ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.30)',
              }}
            >
              {ch.label}
              {count > 0 && (
                <span
                  className="text-[10px] px-1.5 rounded-full"
                  style={{
                    background: activeChannel === ch.id ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.08)',
                    color: activeChannel === ch.id ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.25)',
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <main className="flex-1 overflow-hidden flex flex-col lg:flex-row">
        {/* Stream */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Post composer */}
          {canPost && (activeChannel === 'stream' || isAdmin) && (
            <div className="px-4 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
              {pollMode ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white/50 uppercase tracking-widest">Create Poll</span>
                    <button
                      type="button"
                      onClick={() => { setPollMode(false); setPollQuestion(''); setPollOptions(['', '']) }}
                      className="text-white/25 hover:text-white/60 text-xs transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                  <input
                    type="text"
                    value={pollQuestion}
                    onChange={(e) => setPollQuestion(e.target.value.slice(0, 200))}
                    placeholder="Ask a question…"
                    className="w-full px-4 py-2.5 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                  />
                  <div className="flex flex-col gap-2">
                    {pollOptions.map((opt, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={opt}
                          onChange={(e) => {
                            const next = [...pollOptions]
                            next[idx] = e.target.value.slice(0, 100)
                            setPollOptions(next)
                          }}
                          placeholder={`Option ${idx + 1}`}
                          className="flex-1 px-3 py-2 rounded-lg text-sm text-white placeholder-white/20 focus:outline-none"
                          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                        />
                        {pollOptions.length > 2 && (
                          <button
                            type="button"
                            onClick={() => setPollOptions(pollOptions.filter((_, i) => i !== idx))}
                            className="text-white/20 hover:text-red-400 transition-colors text-xs"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    {pollOptions.length < 5 && (
                      <button
                        type="button"
                        onClick={() => setPollOptions([...pollOptions, ''])}
                        className="text-xs text-white/35 hover:text-white/60 transition-colors"
                      >
                        + Add option
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleCreatePoll}
                      disabled={posting || !pollQuestion.trim() || pollOptions.filter(o => o.trim()).length < 2}
                      className="ml-auto px-4 py-1.5 rounded-lg text-xs font-semibold bg-white text-[#0a0a0a] hover:bg-white/90 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      {posting ? 'Creating…' : 'Create Poll'}
                    </button>
                  </div>
                  {postError && <p className="text-red-400 text-xs">{postError}</p>}
                </div>
              ) : (
                <form onSubmit={handlePost} className="flex flex-col gap-2">
                  <textarea
                    value={content}
                    onChange={(e) => {
                      setContent(e.target.value.slice(0, 2000))
                      setPostError('')
                      if (channelRef.current && user?.id) {
                        const uname = user.user_metadata?.full_name ?? user.email ?? user.id
                        channelRef.current.track({ userId: user.id, username: uname, typing: true })
                        clearTimeout(typingTimeoutRef.current)
                        typingTimeoutRef.current = setTimeout(() => {
                          channelRef.current?.track({ userId: user.id, username: uname, typing: false })
                        }, 2000)
                      }
                    }}
                    placeholder={
                      activeChannel === 'announcements'
                        ? 'Write an announcement…'
                        : activeChannel === 'notifications'
                        ? 'Send a notification to the group…'
                        : 'Share something with the group…'
                    }
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none resize-none"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                  />
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {isAdmin && activeChannel === 'stream' && (
                        <div className="flex gap-1 p-0.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.06)' }}>
                          {[['post','Post'],['announcement','Announcement'],['notification','Notification']].map(([val, label]) => (
                            <button
                              key={val}
                              type="button"
                              onClick={() => setPostType(val)}
                              className="px-2.5 py-1 rounded-md text-xs font-medium transition-all"
                              style={{
                                background: postType === val ? 'rgba(255,255,255,0.15)' : 'transparent',
                                color: postType === val ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.35)',
                              }}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      )}
                      {/* Poll button */}
                      <button
                        type="button"
                        onClick={() => setPollMode(true)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all"
                        style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.40)' }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                        </svg>
                        Poll
                      </button>
                      <span className="text-[10px] text-white/20">{content.length}/2000</span>
                    </div>
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
              )}
            </div>
          )}

          {/* Posts — Discord-style, no uniform gap */}
          <div className="flex-1 overflow-y-auto flex flex-col py-4">
            {channelPosts.length === 0 ? (
              <div className="flex flex-col items-center justify-center flex-1 py-16 gap-2">
                <p className="text-white/20 text-sm">
                  {activeChannel === 'announcements' ? 'No announcements yet.' : activeChannel === 'notifications' ? 'No notifications yet.' : 'No posts yet. Be the first to share something.'}
                </p>
                {activeChannel !== 'stream' && !isAdmin && (
                  <p className="text-white/15 text-xs">Only admins can post here.</p>
                )}
              </div>
            ) : (
              channelPosts.map((post, idx) => {
                const prev = channelPosts[idx - 1]
                const isFirst = !prev || prev.author_id !== post.author_id || prev.type !== post.type ||
                  (new Date(post.created_at) - new Date(prev.created_at)) > 5 * 60 * 1000
                const next = channelPosts[idx + 1]
                const isLast = !next || next.author_id !== post.author_id || next.type !== post.type
                return (
                  <PostCard
                    key={post.id}
                    post={post}
                    groupId={id}
                    isAdmin={isAdmin}
                    currentUserId={currentUserId}
                    isFirst={isFirst}
                    isLast={isLast}
                  />
                )
              })
            )}
            {/* Typing indicator */}
            {Object.keys(typingUsers).length > 0 && (
              <div className="px-4 py-2 flex items-center gap-2">
                <div className="flex gap-[3px] items-center">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-white/30 animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s`, animationDuration: '0.9s' }}
                    />
                  ))}
                </div>
                <span className="text-xs text-white/30 italic">
                  {Object.values(typingUsers).join(', ')} {Object.keys(typingUsers).length === 1 ? 'is' : 'are'} typing…
                </span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Sidebar */}
        <aside className="lg:w-72 flex-shrink-0 border-t lg:border-t-0 lg:border-l overflow-y-auto p-4 flex flex-col gap-4" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          {/* Invite code */}
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
          <MemberList
            members={group.members ?? []}
            isAdmin={isAdmin}
            currentUserId={currentUserId}
            onMemberAction={handleMemberAction}
            onUpdateMember={(userId, updates) => updateMember({ groupId: id, userId, ...updates }).unwrap().catch(() => {})}
          />
        </aside>
      </main>

      {/* Settings modal */}
      {settingsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setSettingsOpen(false) }}
        >
          <div className="w-full max-w-md rounded-2xl p-6 overflow-y-auto max-h-[90vh]" style={glassStyle}>
            <h2 className="text-lg font-bold text-white mb-5">Edit group</h2>
            <div className="flex flex-col gap-4">

              {/* Group image */}
              <div>
                <label className="block text-xs uppercase tracking-widest text-white/30 mb-2">Group image</label>
                <div className="flex items-center gap-3">
                  <div
                    onDrop={(e) => { e.preventDefault(); setImageDragOver(false); processGroupImage(e.dataTransfer.files[0]) }}
                    onDragOver={(e) => { e.preventDefault(); setImageDragOver(true) }}
                    onDragLeave={() => setImageDragOver(false)}
                    onClick={() => imageInputRef.current?.click()}
                    className="w-16 h-16 rounded-xl flex items-center justify-center cursor-pointer transition-all border-2 border-dashed overflow-hidden flex-shrink-0"
                    style={{
                      borderColor: imageDragOver ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.12)',
                      background: imageDragOver ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
                    }}
                  >
                    {editImageUrl ? (
                      <img src={editImageUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="17 8 12 3 7 8"/>
                        <line x1="12" y1="3" x2="12" y2="15"/>
                      </svg>
                    )}
                  </div>
                  <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => processGroupImage(e.target.files[0])} />
                  <div className="flex-1 min-w-0">
                    <input
                      type="url"
                      value={editImageUrl.startsWith('data:') ? '' : editImageUrl}
                      onChange={(e) => setEditImageUrl(e.target.value)}
                      placeholder="Or paste image URL…"
                      className="w-full px-3 py-2 rounded-lg text-xs text-white placeholder-white/25 focus:outline-none"
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}
                    />
                    {editImageUrl && (
                      <button onClick={() => setEditImageUrl('')} className="text-[10px] text-red-400/60 hover:text-red-400 mt-1 transition-colors">Remove image</button>
                    )}
                    {imageUploadError && <p className="text-red-400 text-[10px] mt-1">{imageUploadError}</p>}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs uppercase tracking-widest text-white/30 mb-1.5">Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl text-sm text-white focus:outline-none"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' }}
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-widest text-white/30 mb-1.5">Description</label>
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  rows={2}
                  className="w-full px-4 py-2.5 rounded-xl text-sm text-white focus:outline-none resize-none"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' }}
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-widest text-white/30 mb-2">Color</label>
                <div className="flex gap-2 flex-wrap">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEditColor(c)}
                      className="w-7 h-7 rounded-full transition-all"
                      style={{ background: c, boxShadow: editColor === c ? `0 0 0 2px #0a0a0a, 0 0 0 3.5px ${c}` : 'none', transform: editColor === c ? 'scale(1.2)' : 'scale(1)' }}
                    />
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs uppercase tracking-widest text-white/30 mb-2">Icon</label>
                <div className="flex gap-1.5 flex-wrap mb-2">
                  {EMOJIS.map((em) => (
                    <button
                      key={em}
                      type="button"
                      onClick={() => setEditEmoji(em === editEmoji ? '' : em)}
                      className="w-8 h-8 rounded-lg text-base flex items-center justify-center transition-all"
                      style={{
                        background: editEmoji === em ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)',
                        border: editEmoji === em ? '1px solid rgba(255,255,255,0.30)' : '1px solid rgba(255,255,255,0.08)',
                      }}
                    >
                      {em}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={editEmoji}
                  onChange={(e) => setEditEmoji(e.target.value.slice(-2))}
                  placeholder="Or type any emoji…"
                  className="w-full px-3 py-2 rounded-xl text-sm text-white focus:outline-none"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                />
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setSettingsOpen(false)}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white/50 hover:text-white border transition-colors"
                style={{ borderColor: 'rgba(255,255,255,0.12)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSettings}
                disabled={savingSettings || !editName.trim()}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-white text-[#0a0a0a] hover:bg-white/90 disabled:opacity-30 transition-colors"
              >
                {savingSettings ? 'Saving…' : 'Save'}
              </button>
            </div>
            <button
              onClick={() => { setSettingsOpen(false); handleDeleteGroup() }}
              className="w-full mt-3 py-2.5 rounded-lg text-sm font-medium text-red-400 hover:bg-red-500/10 border border-red-500/20 transition-colors"
            >
              Delete group
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
