import UrgencyTag from '../UrgencyTag'
import CommitteeOverlapBadge from './CommitteeOverlapBadge'

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return dateStr
  const diffMs = Date.now() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'today'
  if (diffDays === 1) return '1 day ago'
  if (diffDays < 30) return `${diffDays} days ago`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`
  return `${Math.floor(diffDays / 365)} years ago`
}

export default function GovTradeCard({ trade }) {
  const { officialName, title, chamber, party, ticker, assetName, transactionType, tradeDate, disclosureLagDays, amountRange, committeeOverlap, urgency, aiSummary } = trade

  const partyColor = party === 'Democrat' ? 'var(--party-dem)' : party === 'Republican' ? 'var(--party-rep)' : 'var(--party-ind)'
  const isBuy = /purchase/i.test(transactionType || '')

  return (
    <article style={{ background: 'var(--ink-800)', border: '1px solid var(--on-ink-border)', borderRadius: 3, padding: '16px 20px' }}>
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: partyColor, marginTop: 6, flexShrink: 0 }} />
          <div>
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 600, color: 'var(--paper)', letterSpacing: '-0.02em' }}>
              {title} {officialName}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--on-ink-text-3)', letterSpacing: '0.08em', marginTop: 2 }}>
              {chamber} · {party}
            </div>
          </div>
        </div>
        <UrgencyTag urgency={urgency} />
      </header>

      {committeeOverlap && (
        <div style={{ marginTop: 8 }}>
          <CommitteeOverlapBadge committeeOverlap={committeeOverlap} />
        </div>
      )}

      <div style={{ marginTop: 14, borderTop: '1px solid var(--on-ink-border)', paddingTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
            padding: '4px 8px', borderRadius: 2,
            background: isBuy ? 'rgba(126,169,104,0.12)' : 'rgba(211,92,74,0.12)',
            color: isBuy ? 'var(--positive)' : 'var(--negative)',
            letterSpacing: '0.12em',
          }}>{(transactionType || 'TRADE').toUpperCase()}</span>
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 15, fontWeight: 700, color: 'var(--paper)' }}>{ticker}</span>
          {assetName && assetName !== ticker && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--on-ink-text-3)' }}>{assetName}</span>
          )}
        </div>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600, color: 'var(--paper)' }}>{amountRange}</span>
      </div>

      <div style={{ marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--on-ink-text-3)', letterSpacing: '0.06em' }}>
        Traded {timeAgo(tradeDate)}
        {disclosureLagDays > 0 && (
          <span style={{ color: disclosureLagDays > 30 ? 'var(--ochre-300)' : undefined }}>
            {' · '}Disclosed {disclosureLagDays} day{disclosureLagDays !== 1 ? 's' : ''} after trade{disclosureLagDays > 30 ? ' ⚠' : ''}
          </span>
        )}
      </div>

      {aiSummary && (
        <div style={{ marginTop: 14, borderTop: '1px solid var(--on-ink-border)', paddingTop: 12 }}>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: 12, lineHeight: 1.7, color: 'var(--on-ink-text-2)', margin: 0 }}>{aiSummary}</p>
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--on-ink-text-4)', letterSpacing: '0.18em', textTransform: 'uppercase' }}>STOCK Act disclosure</span>
      </div>
    </article>
  )
}
