export const getUrgencyColor = (urgency) => {
  switch (urgency) {
    case 'Act Now':
      return 'text-red-500'
    case 'Watch':
      return 'text-yellow-400'
    case 'Low':
    default:
      return 'text-green-400'
  }
}

export const getUrgencyWeight = (urgency) => {
  switch (urgency) {
    case 'Act Now':
      return 3
    case 'Watch':
      return 2
    case 'Low':
    default:
      return 1
  }
}

export const sortByUrgency = (items) => {
  return [...items].sort(
    (a, b) => getUrgencyWeight(b.urgency) - getUrgencyWeight(a.urgency)
  )
}

export const getUrgencyBadgeClass = (urgency) => {
  switch (urgency) {
    case 'Act Now':
      return 'text-red-500 font-600'
    case 'Watch':
      return 'text-yellow-400 font-500'
    case 'Low':
    default:
      return 'text-green-400'
  }
}
