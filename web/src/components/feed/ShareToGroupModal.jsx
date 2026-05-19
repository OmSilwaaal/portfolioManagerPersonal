import { useState } from 'react'
import { useGetGroupsQuery, useCreatePostMutation } from '../../api/groupsApi'
import { useAuth } from '../../contexts/AuthContext'

export default function ShareToGroupModal({ article, onClose }) {
  const { user } = useAuth()
  const { data: groups = [] } = useGetGroupsQuery()
  const [createPost] = useCreatePostMutation()

  const [selectedGroup, setSelectedGroup] = useState('')
  const [message, setMessage] = useState('')
  const [sharing, setSharing] = useState(false)
  const [shared, setShared] = useState(false)
  const [error, setError] = useState('')

  // Include groups where user is admin OR has can_post permission
  const postableGroups = groups.filter(g => g.role === 'admin' || g.can_post !== false)

  const headline = article.headline || article.summary || article.commodity || article.assetName || 'Article'
  const ticker = article.ticker || article.symbol || ''
  const summary = article.summary || ''
  const sentiment = article.sentiment || null

  const handleShare = async () => {
    if (!selectedGroup) { setError('Select a group first.'); return }
    setError('')
    setSharing(true)

    const tickerPart = ticker ? ` · ${ticker}` : ''
    const content = [
      `📰 [${headline}${tickerPart}]`,
      message.trim() || null,
    ].filter(Boolean).join('\n')

    try {
      await createPost({ groupId: selectedGroup, content, type: 'post' }).unwrap()
      setShared(true)
      setTimeout(onClose, 1200)
    } catch (err) {
      setError(err?.data?.message ?? 'Failed to share.')
      setSharing(false)
    }
  }

  const SENTIMENT_COLORS = {
    Bullish: { bg: 'rgba(52,211,153,0.12)', text: 'rgba(52,211,153,0.9)', label: '↑ Bullish' },
    Bearish: { bg: 'rgba(239,68,68,0.12)', text: 'rgba(239,68,68,0.9)', label: '↓ Bearish' },
    Neutral: { bg: 'rgba(255,255,255,0.06)', text: 'rgba(255,255,255,0.4)', label: '— Neutral' },
  }
  const sentCol = sentiment ? SENTIMENT_COLORS[sentiment] ?? SENTIMENT_COLORS.Neutral : null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl p-6"
        style={{
          background: 'linear-gradient(160deg, rgba(22,22,22,0.99) 0%, rgba(14,14,14,0.99) 100%)',
          border: '1px solid rgba(255,255,255,0.10)',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.5), 0 24px 64px rgba(0,0,0,0.6)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-white">Share to group</h2>
          <button onClick={onClose} className="text-white/30 hover:text-white transition-colors p-1">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Article card preview */}
        <div
          className="rounded-xl p-3.5 mb-4"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)' }}
        >
          <div className="flex items-start gap-2.5">
            <div className="flex-shrink-0 mt-0.5">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white/85 leading-snug line-clamp-2">{headline}</p>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {ticker && (
                  <span className="text-[10px] font-bold text-white/40 tracking-widest">{ticker}</span>
                )}
                {sentCol && (
                  <span
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                    style={{ background: sentCol.bg, color: sentCol.text }}
                  >
                    {sentCol.label}
                  </span>
                )}
              </div>
              {summary && (
                <p className="text-[11px] text-white/35 mt-1.5 line-clamp-2 leading-relaxed">{summary}</p>
              )}
            </div>
          </div>
        </div>

        {/* Group selector */}
        <div className="mb-3">
          <label className="block text-[10px] uppercase tracking-widest text-white/30 mb-2">Choose a group</label>
          {postableGroups.length === 0 ? (
            <p className="text-xs text-white/30 py-2">You don&apos;t have posting rights in any group.</p>
          ) : (
            <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto pr-1">
              {postableGroups.map(g => {
                const avatar = g.image_url || null
                return (
                  <button
                    key={g.id}
                    onClick={() => setSelectedGroup(g.id)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all"
                    style={{
                      background: selectedGroup === g.id ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.03)',
                      border: selectedGroup === g.id ? `1px solid ${g.color ?? '#fff'}50` : '1px solid rgba(255,255,255,0.07)',
                    }}
                  >
                    {avatar ? (
                      <img src={avatar} alt={g.name} className="w-7 h-7 rounded-lg object-cover flex-shrink-0" />
                    ) : (
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0 font-bold"
                        style={{ background: (g.color ?? '#e2e8f0') + '22', color: g.color ?? '#e2e8f0' }}
                      >
                        {g.emoji || g.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white/80 font-medium truncate">{g.name}</p>
                      <p className="text-[10px] text-white/25">{g.memberCount ?? ''} {g.memberCount === 1 ? 'member' : 'members'}</p>
                    </div>
                    {selectedGroup === g.id && (
                      <svg className="flex-shrink-0" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Message textarea */}
        <div className="mb-4">
          <label className="block text-[10px] uppercase tracking-widest text-white/30 mb-2">Your take <span className="normal-case text-white/20">(optional)</span></label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, 500))}
            placeholder="What do you think about this? Share your analysis…"
            rows={3}
            className="w-full px-3 py-2.5 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none resize-none"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
          />
          <p className="text-[10px] text-white/20 mt-1 text-right">{message.length}/500</p>
        </div>

        {error && <p className="text-red-400 text-xs mb-3">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white/50 hover:text-white border transition-colors"
            style={{ borderColor: 'rgba(255,255,255,0.12)' }}
          >
            Cancel
          </button>
          <button
            onClick={handleShare}
            disabled={sharing || shared || !selectedGroup}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors"
            style={{
              background: shared ? 'rgba(52,211,153,0.2)' : 'white',
              color: shared ? 'rgba(52,211,153,1)' : '#0a0a0a',
              opacity: (sharing || !selectedGroup) && !shared ? 0.4 : 1,
              cursor: (sharing || !selectedGroup) && !shared ? 'not-allowed' : 'pointer',
            }}
          >
            {shared ? '✓ Shared!' : sharing ? 'Sharing…' : 'Share'}
          </button>
        </div>
      </div>
    </div>
  )
}
