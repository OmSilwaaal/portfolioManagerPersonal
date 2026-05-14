import { getUrgencyColor } from '../utils/urgencyScorer'

export default function UrgencyTag({ urgency }) {
  const colorClass = getUrgencyColor(urgency)
  return (
    <span className={`text-sm font-medium ${colorClass}`}>
      {urgency || 'Low'}
    </span>
  )
}
