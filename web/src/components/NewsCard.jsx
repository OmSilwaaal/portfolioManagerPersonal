import { useState } from 'react'
import UrgencyTag from './UrgencyTag'
import JargonTooltip from './JargonTooltip'
import { jargonMap } from '../utils/jargonMap'

const INK8   = 'var(--ink-800)'
const BORDER = 'var(--on-ink-border)'
const CREAM  = 'var(--paper)'
const MUTED  = 'var(--on-ink-text-3)'
const DIM    = 'var(--on-ink-text-4)'

function timeAgo(dateStr) {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  return `${diffDays}d ago`
}

function highlightJargon(text) {
  const terms = Object.keys(jargonMap)
  const parts = []
  let remaining = text
  let key = 0

  while (remaining.length > 0) {
    let foundIndex = -1
    let foundTerm = null
    for (const term of terms) {
      const idx = remaining.toLowerCase().indexOf(term.toLowerCase())
      if (idx !== -1 && (foundIndex === -1 || idx < foundIndex)) {
        foundIndex = idx
        foundTerm = term
      }
    }
    if (foundIndex === -1) {
      parts.push(<span key={key++}>{remaining}</span>)
      break
    }
    if (foundIndex > 0) {
      parts.push(<span key={key++}>{remaining.slice(0, foundIndex)}</span>)
    }
    parts.push(
      <JargonTooltip key={key++} term={foundTerm}>
        {remaining.slice(foundIndex, foundIndex + foundTerm.length)}
      </JargonTooltip>
    )
    remaining = remaining.slice(foundIndex + foundTerm.length)
  }
  return parts
}

export default function NewsCard({ item }) {
  const [expanded, setExpanded] = useState(false)
  if (!item) return null

  return (
    <div style={{ background: INK8, border: `1px solid ${BORDER}`, borderRadius: 'var(--r-md)', padding: '16px 20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <a
            href={item.url || '#'}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 500, color: CREAM, lineHeight: 1.4, textDecoration: 'none', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
          >
            {item.headline}
          </a>
        </div>
        <UrgencyTag urgency={item.urgency} />
      </div>

      {/* Meta */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 10, color: MUTED, marginBottom: 10 }}>
        <span>{item.source}</span>
        <span style={{ color: DIM }}>·</span>
        <span>{timeAgo(item.publishedAt)}</span>
        {item.ticker && (
          <>
            <span style={{ color: DIM }}>·</span>
            <span style={{ color: 'var(--party-dem)', fontWeight: 600, letterSpacing: '0.08em' }}>{item.ticker}</span>
          </>
        )}
      </div>

      {/* AI Summary */}
      {item.summary && item.summary !== 'Summary unavailable' && (
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: MUTED, lineHeight: 1.65, margin: '0 0 10px' }}>
          {highlightJargon(item.summary)}
        </p>
      )}

      {/* Expand toggle */}
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', color: 'var(--moss-200)', background: 'none', border: 0, cursor: 'pointer', padding: 0 }}
      >
        {expanded ? 'Hide details ↑' : 'What does this mean for me? ↓'}
      </button>

      {expanded && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${BORDER}` }}>
          {item.reasoning && (
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: MUTED, lineHeight: 1.65, marginBottom: 8 }}>
              <span style={{ color: CREAM, fontWeight: 500 }}>AI Reasoning: </span>
              {item.reasoning}
            </p>
          )}
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: DIM, fontStyle: 'italic' }}>
            AI-generated summary. Not financial advice.
          </p>
        </div>
      )}
    </div>
  )
}
