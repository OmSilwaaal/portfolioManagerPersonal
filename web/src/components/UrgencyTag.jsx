const URGENCY_STYLES = {
  'Act Now': 'text-red-400',
  'Watch': 'text-yellow-400',
  'Low': 'text-green-400',
}

export default function UrgencyTag({ urgency }) {
  const level = urgency || 'Low'
  const colorClass = URGENCY_STYLES[level] ?? 'text-[#a1a1aa]'
  return (
    <span className={`text-[10px] font-semibold ${colorClass}`}>
      {level}
    </span>
  )
}
