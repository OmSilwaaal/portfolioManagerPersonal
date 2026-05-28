import { useState } from 'react'
import UrgencyTag from './UrgencyTag'
import JargonTooltip from './JargonTooltip'
import { jargonMap } from '../utils/jargonMap'

const BORDER = 'var(--on-ink-border)'
const CREAM  = 'var(--paper)'
const MUTED  = 'var(--on-ink-text-3)'
const DIM    = 'var(--on-ink-text-4)'

function timeAgo(dateStr) {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMins = Math.floor((now - date) / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m`
  if (diffHours < 24) return `${diffHours}h`
  return `${diffDays}d`
}

function highlightJargon(text) {
  const terms = Object.keys(jargonMap)
  const parts = []
  let remaining = text
  let key = 0
  while (remaining.length > 0) {
    let foundIndex = -1, foundTerm = null
    for (const term of terms) {
      const idx = remaining.toLowerCase().indexOf(term.toLowerCase())
      if (idx !== -1 && (foundIndex === -1 || idx < foundIndex)) { foundIndex = idx; foundTerm = term }
    }
    if (foundIndex === -1) { parts.push(<span key={key++}>{remaining}</span>); break }
    if (foundIndex > 0) parts.push(<span key={key++}>{remaining.slice(0, foundIndex)}</span>)
    parts.push(<JargonTooltip key={key++} term={foundTerm}>{remaining.slice(foundIndex, foundIndex + foundTerm.length)}</JargonTooltip>)
    remaining = remaining.slice(foundIndex + foundTerm.length)
  }
  return parts
}

export default function NewsCard({ item }) {
  const [expanded, setExpanded] = useState(false)
  if (!item) return null

  return (
    <div style={{ borderTop: `1px solid ${BORDER}`, padding: '18px 0' }}>

      {/* Meta row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: DIM }}>
          {item.source}
        </span>
        <span style={{ color: 'var(--on-ink-text-4)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>—</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: DIM, letterSpacing: '0.10em' }}>
          {timeAgo(item.publishedAt)}
        </span>
        {item.ticker && (
          <>
            <span style={{ color: DIM, fontFamily: 'var(--font-mono)', fontSize: 10 }}>—</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ochre-300)', letterSpacing: '0.14em', fontWeight: 600 }}>
              {item.ticker}
            </span>
          </>
        )}
        <div style={{ marginLeft: 'auto' }}>
          <UrgencyTag urgency={item.urgency} />
        </div>
      </div>

      {/* Headline */}
      <a
        href={item.url || '#'}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'block',
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: 15,
          letterSpacing: '-0.02em',
          lineHeight: 1.35,
          color: CREAM,
          textDecoration: 'none',
          marginBottom: item.summary ? 10 : 0,
        }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--on-ink-text-2)'}
        onMouseLeave={e => e.currentTarget.style.color = CREAM}
      >
        {item.headline}
      </a>

      {/* AI Summary */}
      {item.summary && item.summary !== 'Summary unavailable' && (
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: MUTED, lineHeight: 1.7, margin: '0 0 10px', fontWeight: 400 }}>
          {highlightJargon(item.summary)}
        </p>
      )}

      {/* Expand */}
      <button
        onClick={() => setExpanded(v => !v)}
        style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--moss-200)', background: 'none', border: 0, cursor: 'pointer', padding: 0 }}
      >
        {expanded ? '↑ Less' : '↓ What does this mean?'}
      </button>

      {expanded && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${BORDER}` }}>
          {item.reasoning && (
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: MUTED, lineHeight: 1.7, marginBottom: 8 }}>
              <span style={{ color: CREAM, fontWeight: 600 }}>Analysis · </span>
              {item.reasoning}
            </p>
          )}
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: DIM, margin: 0 }}>
            AI-generated — not financial advice
          </p>
        </div>
      )}
    </div>
  )
}
