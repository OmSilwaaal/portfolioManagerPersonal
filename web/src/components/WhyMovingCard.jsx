import { Link } from 'react-router-dom'
import { useGetExplanationQuery } from '../api/explainerApi'

export default function WhyMovingCard({ ticker, price, changePercent, explanation: propExplanation }) {
  const shouldShow = Math.abs(changePercent) >= 2

  const { data, isLoading } = useGetExplanationQuery(ticker, {
    skip: !shouldShow || Boolean(propExplanation),
  })

  if (!shouldShow) return null

  const explanation = propExplanation || data?.explanation
  const isPositive = changePercent >= 0
  const changeFormatted = `${isPositive ? '+' : ''}${changePercent.toFixed(1)}%`
  const direction = isPositive ? 'up' : 'down'
  const blurb = explanation
    ? `${ticker} is ${direction} ${Math.abs(changePercent).toFixed(1)}% today — ${explanation.split('.')[0].toLowerCase().trim()}.`
    : null

  return (
    <Link to="/stocks" style={{ display: 'block', textDecoration: 'none' }}>
      <div style={{
        background: 'var(--ink-800)', border: '1px solid var(--on-ink-border)',
        borderRadius: 3, padding: '14px 22px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        transition: 'border-color .2s',
      }}
        onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--on-ink-3)'}
        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--on-ink-border)'}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--on-ink-text-3)', letterSpacing: '0.18em', textTransform: 'uppercase' }}>Why is it moving?</span>
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 16, fontWeight: 700, color: 'var(--paper)', letterSpacing: '-0.01em' }}>{ticker}</span>
          {price != null && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--on-ink-text-2)' }}>${price.toFixed(2)}</span>
          )}
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: isPositive ? 'var(--positive)' : 'var(--negative)' }}>
            {changeFormatted}
          </span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {isLoading || !blurb ? (
            <div style={{ height: 14, background: 'var(--on-ink-2)', borderRadius: 2, animation: 'pulse 1.5s ease-in-out infinite', maxWidth: 320 }} className="animate-pulse" />
          ) : (
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--on-ink-text-2)', lineHeight: 1.6, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {blurb}
            </p>
          )}
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--moss-200)', letterSpacing: '0.12em', flexShrink: 0 }}>Tap to explain →</span>
      </div>
    </Link>
  )
}
