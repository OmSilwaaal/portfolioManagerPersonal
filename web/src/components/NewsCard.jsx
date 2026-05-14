import { useState } from 'react'
import UrgencyTag from './UrgencyTag'
import JargonTooltip from './JargonTooltip'
import { jargonMap } from '../utils/jargonMap'

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
    <div className="p-4 bg-surface dark:bg-surface bg-[#f9f9f9] border border-border-subtle dark:border-border-subtle border-[#e5e7eb] rounded-md shadow-[0_1px_3px_rgba(0,0,0,0.3)]">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <a
            href={item.url || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-white dark:text-white text-[#0f0f0f] font-medium text-sm leading-snug line-clamp-2 hover:text-[#3b82f6] transition-colors"
          >
            {item.headline}
          </a>
        </div>
        <UrgencyTag urgency={item.urgency} />
      </div>

      {/* Meta */}
      <div className="flex items-center gap-2 text-xs text-[#a1a1aa] mb-3">
        <span>{item.source}</span>
        <span>·</span>
        <span>{timeAgo(item.publishedAt)}</span>
        {item.ticker && (
          <>
            <span>·</span>
            <span className="text-[#3b82f6] font-medium">{item.ticker}</span>
          </>
        )}
      </div>

      {/* AI Summary */}
      {item.summary && item.summary !== 'Summary unavailable' && (
        <p className="text-sm text-[#a1a1aa] dark:text-[#a1a1aa] leading-relaxed mb-3">
          {highlightJargon(item.summary)}
        </p>
      )}

      {/* Expandable section */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="text-xs text-[#3b82f6] hover:text-blue-400 transition-colors"
      >
        {expanded ? 'Hide details ↑' : 'What does this mean for me? ↓'}
      </button>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-[#1f1f1f] dark:border-[#1f1f1f] border-[#e5e7eb]">
          {item.reasoning && (
            <p className="text-sm text-[#a1a1aa] leading-relaxed mb-2">
              <span className="text-white dark:text-white text-[#0f0f0f] font-medium">AI Reasoning: </span>
              {item.reasoning}
            </p>
          )}
          <p className="text-xs text-[#6b7280] italic">
            This summary is AI-generated and for informational purposes only. Not financial advice.
          </p>
        </div>
      )}
    </div>
  )
}
