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
  const {
    officialName,
    title,
    chamber,
    party,
    ticker,
    assetName,
    transactionType,
    tradeDate,
    disclosureDate,
    disclosureLagDays,
    amountRange,
    committeeOverlap,
    urgency,
    aiSummary,
  } = trade

  const partyDotClass =
    party === 'Democrat'
      ? 'bg-blue-500'
      : party === 'Republican'
      ? 'bg-red-500'
      : 'bg-gray-500'

  const isBuy = /purchase/i.test(transactionType)

  return (
    <div className="bg-[#141414] border border-[#2a2a2a] rounded-lg p-4 hover:border-[#3a3a3a] transition-colors">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 mt-0.5 ${partyDotClass}`} />
          <div>
            <span className="text-white font-semibold text-sm">{title} {officialName}</span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-gray-400 text-xs">{chamber}</span>
              {party && <span className="text-gray-500 text-xs">&middot; {party}</span>}
            </div>
          </div>
        </div>
        <UrgencyTag urgency={urgency} />
      </div>

      {/* Committee overlap */}
      {committeeOverlap && (
        <div className="mt-1 mb-2">
          <CommitteeOverlapBadge committeeOverlap={committeeOverlap} />
        </div>
      )}

      <div className="border-t border-[#2a2a2a] my-3" />

      {/* Trade details */}
      <div className="flex items-center justify-between gap-3 mb-1">
        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-bold px-2 py-0.5 rounded ${
              isBuy ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
            }`}
          >
            {transactionType ? transactionType.toUpperCase() : 'TRADE'}
          </span>
          <span className="text-white font-bold">{ticker}</span>
          {assetName && assetName !== ticker && (
            <span className="text-gray-400 text-xs truncate max-w-[120px]">{assetName}</span>
          )}
        </div>
        <span className="text-gray-300 text-sm font-medium">{amountRange}</span>
      </div>

      <div className="flex items-center gap-2 text-xs text-gray-400 mt-1">
        <span>Traded {timeAgo(tradeDate)}</span>
        {disclosureLagDays > 0 && (
          <span className={disclosureLagDays > 30 ? 'text-amber-400' : ''}>
            &middot; Disclosed {disclosureLagDays} day{disclosureLagDays !== 1 ? 's' : ''} after trade
            {disclosureLagDays > 30 && ' ⚠'}
          </span>
        )}
      </div>

      {/* AI summary */}
      {aiSummary && (
        <>
          <div className="border-t border-[#2a2a2a] my-3" />
          <p className="text-gray-400 text-xs leading-relaxed">{aiSummary}</p>
        </>
      )}

      {/* Footer */}
      <div className="mt-3">
        <span className="text-[10px] text-gray-600 uppercase tracking-wider">STOCK Act disclosure</span>
      </div>
    </div>
  )
}
