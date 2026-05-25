import JargonTooltip from '../JargonTooltip'

const SENTIMENT_MAP = {
  Bullish: { color: 'var(--positive)', dot: 'var(--positive)' },
  Bearish: { color: 'var(--negative)', dot: 'var(--negative)' },
}

export default function SentimentBadge({ sentiment }) {
  if (!sentiment) return null
  const s = SENTIMENT_MAP[sentiment] || { color: 'var(--on-ink-text-3)', dot: 'var(--on-ink-text-3)' }
  const isJargon = sentiment === 'Bullish' || sentiment === 'Bearish'

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 500, color: s.color }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.dot, flexShrink: 0, display: 'inline-block' }} />
      {isJargon ? (
        <JargonTooltip term={sentiment}>{sentiment}</JargonTooltip>
      ) : (
        sentiment
      )}
    </span>
  )
}
