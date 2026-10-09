import { TIERS } from '../../utils/elo'

export const LAST = TIERS.length - 1

/**
 * Where an Elo sits on the ladder.
 *  index/tier : the tier it is in
 *  next       : the tier above, or null at the top
 *  within     : 0..1 through the current tier, linear in Elo — the honest reading of
 *               "how close am I", since the gap shown next to it is the same number.
 *               1 at the top tier, which has nothing left to climb.
 *  gap        : Elo still needed for the next tier, or 0 at the top
 *  track      : 0..1 along the whole ladder, one equal segment per tier. The thresholds
 *               are decades, so equal segments make the track read as a log scale and
 *               every tier stays wide enough to aim at.
 */
export function standingFor(elo) {
  const v = Math.max(0, Math.round(Number(elo) || 0))
  let index = 0
  for (let i = 0; i < TIERS.length; i++) if (v >= TIERS[i].min) index = i
  const tier = TIERS[index]
  const next = TIERS[index + 1] || null
  if (!next) return { elo: v, index, tier, next: null, within: 1, gap: 0, track: 1 }
  const span = next.min - tier.min
  const within = Math.min(1, Math.max(0, (v - tier.min) / span))
  return { elo: v, index, tier, next, within, gap: next.min - v, track: (index + within) / LAST }
}

/** "1,000 Elo to 9,999" / "100,000,000 Elo and up" — a tier's range, said once. */
export function rangeLabel(i) {
  const t = TIERS[i]
  const next = TIERS[i + 1]
  if (!next) return `${t.min.toLocaleString('en-US')} Elo and up`
  if (t.min === 0) return `Under ${next.min.toLocaleString('en-US')} Elo`
  return `${t.min.toLocaleString('en-US')} to ${(next.min - 1).toLocaleString('en-US')} Elo`
}
