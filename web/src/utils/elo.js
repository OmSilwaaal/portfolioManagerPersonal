// Client copy of the Elo ladder (the server in backend/src/services/elo.js is the source of truth for ratings).
export const START_ELO = 500

export const TIERS = [
  { id: 'rekt',   name: 'Rekt',   min: 0,         color: '#f87171', blurb: 'Down bad. Every legend has a rock bottom.' },
  { id: 'rookie', name: 'Rookie', min: 500,       color: '#d6a15c', blurb: 'Everyone starts here, with 500 Elo and a dream.' },
  { id: 'trader', name: 'Trader', min: 1000,      color: '#7dd3fc', blurb: 'Consistent green candles. You know what you are doing.' },
  { id: 'shark',  name: 'Shark',  min: 10000,     color: '#38bdf8', blurb: 'You smell blood in the order book.' },
  { id: 'whale',  name: 'Whale',  min: 100000,    color: '#818cf8', blurb: 'Your trades move markets.' },
  { id: 'kraken', name: 'Kraken', min: 1000000,   color: '#c084fc', blurb: 'Something enormous stirs below the chart.' },
  { id: 'titan',  name: 'Titan',  min: 10000000,  color: '#fb923c', blurb: 'Gravity applies to everyone but you.' },
  { id: 'legend', name: 'Legend', min: 100000000, color: '#fde047', blurb: 'The ladder has no ceiling. You found it anyway.' },
]

export const tierFor = (elo) => TIERS.reduce((t, x) => (elo >= x.min ? x : t), TIERS[0])
export const tierById = (id) => TIERS.find((t) => t.id === id) ?? TIERS[1]

/** 1,240 below 100K; 1.2M style above, so a Legend's number still fits next to a name. */
export function formatElo(n) {
  const v = Math.max(0, Math.round(Number(n) || 0))
  if (v < 100000) return v.toLocaleString('en-US')
  const units = [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']]
  for (const [d, s] of units) if (v >= d) return `${(v / d).toFixed(v / d >= 100 ? 0 : 1).replace(/\.0$/, '')}${s}`
  return String(v)
}

export const usd = (n) => `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`
export const signedUsd = (n) => `${n >= 0 ? '+' : '-'}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`
export const pct = (x) => `${Math.round((x || 0) * 100)}%`

// Solid name colours any account can wear. Pro adds effects and calling cards on top.
export const NAME_COLORS = ['#f8fafc', '#38bdf8', '#34d399', '#fbbf24', '#fb923c', '#f87171', '#f472b6', '#a78bfa']
