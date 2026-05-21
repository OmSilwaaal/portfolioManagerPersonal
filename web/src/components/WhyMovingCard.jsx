import { Link } from 'react-router-dom'
import { useGetExplanationQuery } from '../api/explainerApi'

const glassStyle = {
  background: 'linear-gradient(145deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 50%, rgba(255,255,255,0.06) 100%)',
  backdropFilter: 'blur(24px) saturate(180%)',
  border: '1px solid rgba(255,255,255,0.10)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
}

export default function WhyMovingCard({ ticker, price, changePercent, explanation: propExplanation }) {
  const shouldShow = Math.abs(changePercent) >= 2

  // Fetch AI explanation if not provided as prop
  const { data, isLoading } = useGetExplanationQuery(ticker, {
    skip: !shouldShow || Boolean(propExplanation),
  })

  if (!shouldShow) return null

  const explanation = propExplanation || data?.explanation

  const isPositive = changePercent >= 0
  const changeFormatted = `${isPositive ? '+' : ''}${changePercent.toFixed(1)}%`

  const direction = isPositive ? 'up' : 'down'
  const changeAbs = Math.abs(changePercent).toFixed(1)

  // Build a one-sentence blurb from the explanation
  const blurb = explanation
    ? `${ticker} is ${direction} ${changeAbs}% today — ${explanation.split('.')[0].toLowerCase().trim()}.`
    : null

  return (
    <Link to="/stocks" style={{ display: 'block', textDecoration: 'none' }}>
      <div
        style={{
          ...glassStyle,
          borderRadius: '16px',
          padding: '14px 16px',
          cursor: 'pointer',
          transition: 'border-color 0.2s',
        }}
      >
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
          <span style={{ color: '#ffffff', fontWeight: 'bold', fontSize: '0.95rem', letterSpacing: '0.02em' }}>
            {ticker}
          </span>
          <span
            style={{
              background: isPositive ? 'rgba(52,211,153,0.15)' : 'rgba(239,68,68,0.15)',
              color: isPositive ? 'rgba(52,211,153,1)' : 'rgba(239,68,68,1)',
              border: `1px solid ${isPositive ? 'rgba(52,211,153,0.3)' : 'rgba(239,68,68,0.3)'}`,
              borderRadius: '6px',
              padding: '2px 8px',
              fontSize: '0.78rem',
              fontWeight: '600',
            }}
          >
            {changeFormatted}
          </span>
          <span style={{ color: 'rgba(255,255,255,0.30)', fontSize: '0.72rem', marginLeft: 'auto' }}>
            why?
          </span>
        </div>

        {/* Body */}
        {isLoading || !blurb ? (
          <div
            style={{
              height: '16px',
              background: 'rgba(255,255,255,0.10)',
              borderRadius: '4px',
              animation: 'pulse 1.5s ease-in-out infinite',
              marginBottom: '10px',
            }}
            className="animate-pulse"
          />
        ) : (
          <p
            style={{
              color: 'rgba(255,255,255,0.70)',
              fontSize: '0.875rem',
              lineHeight: '1.5',
              margin: '0 0 10px 0',
            }}
          >
            {blurb}
          </p>
        )}

        {/* Footer */}
        <p style={{ color: 'rgba(255,255,255,0.20)', fontSize: '10px', margin: 0 }}>
          AI generated &middot; not financial advice
        </p>
      </div>
    </Link>
  )
}
