import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useCreateGroupMutation } from '../api/groupsApi'

const COLORS = ['#e2e8f0','#fca5a5','#fdba74','#fef08a','#86efac','#93c5fd','#c4b5fd','#f9a8d4']
const EMOJIS = ['📈','💹','🏦','🎯','📊','🚀','💡','🔬']

const glassStyle = {
  background: 'linear-gradient(145deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 50%, rgba(255,255,255,0.06) 100%)',
  backdropFilter: 'blur(24px) saturate(180%)',
  WebkitBackdropFilter: 'blur(24px) saturate(180%)',
  border: '1px solid rgba(255,255,255,0.10)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.14)',
}

export default function CreateGroup() {
  const navigate = useNavigate()
  const [createGroup, { isLoading }] = useCreateGroupMutation()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState(COLORS[0])
  const [emoji, setEmoji] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) { setError('Group name is required.'); return }
    setError('')
    try {
      const result = await createGroup({ name: name.trim(), description: description.trim(), color, emoji }).unwrap()
      navigate(`/groups/${result.id}`)
    } catch (err) {
      const msg = err?.data?.message ?? (typeof err?.data?.error === 'string' ? err.data.error : null) ?? err?.error ?? `Error ${err?.status ?? ''}`.trim() || 'Something went wrong.'
      setError(msg)
    }
  }

  const initial = name.charAt(0).toUpperCase() || '?'

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0a0a0a]">
      <header className="flex items-center gap-4 px-6 py-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <Link to="/groups" className="text-white/40 hover:text-white transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </Link>
        <h1 className="text-xl font-semibold text-white tracking-tight">Create a group</h1>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-lg mx-auto flex flex-col gap-6">
          {/* Preview card */}
          <div className="rounded-2xl overflow-hidden" style={glassStyle}>
            <div className="h-1.5 w-full" style={{ background: color }} />
            <div className="p-5 flex items-center gap-3">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center text-xl font-bold flex-shrink-0"
                style={{ background: color + '22', border: `1px solid ${color}55`, color }}
              >
                {emoji || initial}
              </div>
              <div>
                <p className="font-semibold text-white text-sm">{name || 'Group name'}</p>
                <p className="text-xs text-white/40 mt-0.5">{description || 'Group description'}</p>
              </div>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {/* Name */}
            <div>
              <label className="block text-xs uppercase tracking-widest text-white/30 mb-2">Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); setError('') }}
                placeholder="e.g. Investment Club 2026"
                maxLength={60}
                className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/25 transition-colors"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' }}
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs uppercase tracking-widest text-white/30 mb-2">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this group about?"
                maxLength={200}
                rows={3}
                className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none resize-none focus:border-white/25 transition-colors"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' }}
              />
            </div>

            {/* Color */}
            <div>
              <label className="block text-xs uppercase tracking-widest text-white/30 mb-2">Color</label>
              <div className="flex gap-2.5 flex-wrap">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className="w-8 h-8 rounded-full transition-all duration-150 flex items-center justify-center"
                    style={{
                      background: c,
                      boxShadow: color === c ? `0 0 0 2px #0a0a0a, 0 0 0 4px ${c}` : 'none',
                      transform: color === c ? 'scale(1.15)' : 'scale(1)',
                    }}
                  >
                    {color === c && (
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0a0a0a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Emoji */}
            <div>
              <label className="block text-xs uppercase tracking-widest text-white/30 mb-2">Icon (emoji)</label>
              <div className="flex gap-2 flex-wrap mb-2">
                {EMOJIS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => setEmoji(em === emoji ? '' : em)}
                    className="w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all"
                    style={{
                      background: emoji === em ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)',
                      border: emoji === em ? '1px solid rgba(255,255,255,0.30)' : '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    {em}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={emoji}
                onChange={(e) => setEmoji(e.target.value.slice(-2))}
                placeholder="Or type any emoji…"
                className="w-full px-4 py-2.5 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
              />
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <div className="flex gap-2 pt-1">
              <Link
                to="/groups"
                className="flex-1 py-3 rounded-xl text-sm font-medium text-white/50 hover:text-white border text-center transition-colors"
                style={{ borderColor: 'rgba(255,255,255,0.12)' }}
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={isLoading || !name.trim()}
                className="flex-1 py-3 rounded-xl text-sm font-semibold bg-white text-[#0a0a0a] hover:bg-white/90 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? 'Creating...' : 'Create group'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}
