export default function ProBadge({ tier = 'pro' }) {
  const label = tier === 'premium' ? 'PREMIUM' : 'PRO'
  return (
    <span className="text-[#3b82f6] text-xs font-bold border border-[#3b82f6] rounded px-1">
      {label}
    </span>
  )
}
