const URGENCY_STYLES = {
  High: 'bg-red-500/15 text-red-400 border border-red-500/25',
  Medium: 'bg-amber-500/15 text-amber-400 border border-amber-500/25',
  Low: 'bg-[#1f1f1f] text-[#6b7280] border border-[#2a2a2a]',
}

export default function UrgencyTag({ urgency }) {
  const level = urgency || 'Low'
  const style = URGENCY_STYLES[level] ?? URGENCY_STYLES.Low
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${style}`}>
      {level}
    </span>
  )
}
