export default function SentimentBadge({ sentiment }) {
  if (!sentiment) return null

  const dotClass =
    sentiment === 'Bullish'
      ? 'bg-green-400'
      : sentiment === 'Bearish'
      ? 'bg-red-400'
      : 'bg-gray-400'

  const textClass =
    sentiment === 'Bullish'
      ? 'text-green-400'
      : sentiment === 'Bearish'
      ? 'text-red-400'
      : 'text-gray-400'

  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${textClass}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
      {sentiment}
    </span>
  )
}
