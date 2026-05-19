import { useState } from 'react'
import { useGetGroupsQuery, useCreatePostMutation } from '../../api/groupsApi'

export default function ShareToGroupModal({ article, onClose }) {
  const { data: groups = [] } = useGetGroupsQuery()
  const [createPost] = useCreatePostMutation()

  const [selectedGroup, setSelectedGroup] = useState('')
  const [message, setMessage] = useState('')
  const [sharing, setSharing] = useState(false)
  const [error, setError] = useState('')

  const postableGroups = groups.filter(g => g.role === 'admin' || g.can_post !== false)

  const handleShare = async () => {
    if (!selectedGroup) { setError('Select a group first.'); return }
    setError('')
    setSharing(true)

    const headline = article.headline || article.summary || article.commodity || article.assetName || ''
    const ticker = article.ticker ? ` · ${article.ticker}` : ''
    const content = [
      `📰 ${headline}${ticker}`,
      message.trim() ? `\n${message.trim()}` : '',
    ].filter(Boolean).join('\n')

    try {
      await createPost({ groupId: selectedGroup, content, type: 'post' }).unwrap()
      onClose()
    } catch (err) {
      setError(err?.data?.message ?? 'Failed to share.')
      setSharing(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-6"
        style={{
          background: 'linear-gradient(145deg, rgba(20,20,20,0.98) 0%, rgba(15,15,15,0.98) 100%)',
          border: '1px solid rgba(255,255,255,0.10)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-white">Share to group</h2>
          <button onClick={onClose} className="text-white/30 hover:text-white transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Article preview */}
        <div className="rounded-xl p-3 mb-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <p className="text-xs text-white/60 leading-relaxed line-clamp-2">
            {article.headline || article.summary || article.commodity || 'Article'}
            {article.ticker ? ` · ${article.ticker}` : ''}
          </p>
        </div>

        {/* Group selector */}
        <div className="mb-3">
          <label className="block text-xs uppercase tracking-widest text-white/30 mb-2">Group</label>
          {postableGroups.length === 0 ? (
            <p className="text-xs text-white/30">You don't have posting rights in any group.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {postableGroups.map(g => (
                <button
                  key={g.id}
                  onClick={() => setSelectedGroup(g.id)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all"
                  style={{
                    background: selectedGroup === g.id ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)',
                    border: selectedGroup === g.id ? `1px solid ${g.color}60` : '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0" style={{ background: g.color + '22', color: g.color }}>
                    {g.emoji || g.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm text-white/80 font-medium truncate">{g.name}</span>
                  {selectedGroup === g.id && (
                    <svg className="ml-auto flex-shrink-0" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Optional message */}
        <div className="mb-4">
          <label className="block text-xs uppercase tracking-widest text-white/30 mb-2">Add a message (optional)</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, 500))}
            placeholder="What do you think about this?"
            rows={3}
            className="w-full px-3 py-2.5 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none resize-none"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
          />
        </div>

        {error && <p className="text-red-400 text-xs mb-3">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white/50 hover:text-white border transition-colors"
            style={{ borderColor: 'rgba(255,255,255,0.12)' }}
          >
            Cancel
          </button>
          <button
            onClick={handleShare}
            disabled={sharing || !selectedGroup}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-white text-[#0a0a0a] hover:bg-white/90 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            {sharing ? 'Sharing…' : 'Share'}
          </button>
        </div>
      </div>
    </div>
  )
}
