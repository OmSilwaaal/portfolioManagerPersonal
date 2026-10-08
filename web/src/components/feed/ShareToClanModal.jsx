import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useGetMyClanQuery, usePostToClanMutation } from '../../api/clansApi'

const BORDER = 'var(--on-ink-border)'
const MONO = { fontFamily: 'var(--font-sans)' }

/** Post a feed story to your clan's board. */
export default function ShareToClanModal({ article, onClose }) {
  const { data, isLoading } = useGetMyClanQuery()
  const [post, { isLoading: sharing }] = usePostToClanMutation()
  const [message, setMessage] = useState('')
  const [shared, setShared] = useState(false)
  const [error, setError] = useState('')
  const clan = data?.clan

  const headline = article.headline || article.summary || article.commodity || article.assetName || 'Article'
  const ticker = article.ticker || article.symbol || ''

  const share = async () => {
    setError('')
    const body = [message.trim(), headline, article.url || ''].filter(Boolean).join('\n').slice(0, 500)
    const res = await post({ id: clan.id, body, ticker: ticker ? { kind: 'stock', ticker } : undefined })
    if (res.error) { setError(res.error?.data?.message ?? 'Failed to share.'); return }
    setShared(true)
    setTimeout(onClose, 1100)
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Share to your clan" onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 440, background: 'var(--ink-800)', border: `1px solid ${BORDER}`, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontStretch: '125%', fontWeight: 800, fontSize: 16, textTransform: 'uppercase', margin: 0, color: 'var(--paper)' }}>Share to your clan</h2>
        <p style={{ ...MONO, fontSize: 13, color: 'var(--on-ink-text-2)', margin: 0, overflowWrap: 'anywhere' }}>{headline}{ticker ? ` · $${ticker}` : ''}</p>
        {isLoading ? <p style={{ ...MONO, fontSize: 12, color: 'var(--on-ink-text-3)' }}>Loading…</p> : !clan ? (
          <p style={{ ...MONO, fontSize: 13, color: 'var(--on-ink-text-2)', margin: 0 }}>You are not in a clan yet. <Link to="/clans" style={{ color: 'var(--paper)', fontWeight: 700 }} onClick={onClose}>Browse clans</Link> to join one.</p>
        ) : (
          <>
            <label htmlFor="clan-share-msg" style={{ ...MONO, fontSize: 11, fontWeight: 700, color: 'var(--on-ink-text-3)' }}>Posting to <span style={{ color: clan.color }}>[{clan.tag}]</span> {clan.name}</label>
            <textarea id="clan-share-msg" className="t-input" rows={3} maxLength={300} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Add your take (optional)" style={{ resize: 'none' }} />
          </>
        )}
        {error && <p role="alert" style={{ ...MONO, fontSize: 12, color: 'var(--negative)', margin: 0 }}>{error}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="t-btn px-3 py-1.5" style={{ ...MONO, fontSize: 12 }} onClick={onClose}>Cancel</button>
          {clan && <button className="t-btn t-btn-primary px-4 py-1.5" style={{ ...MONO, fontSize: 12, textTransform: 'uppercase' }} disabled={sharing || shared} onClick={share}>{shared ? 'Shared' : sharing ? 'Sharing…' : 'Share'}</button>}
        </div>
      </div>
    </div>
  )
}
