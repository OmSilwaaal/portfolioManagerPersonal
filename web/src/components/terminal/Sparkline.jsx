import React, { useMemo } from 'react'

/**
 * Median of a numeric series: the middle order statistic, or the mean of the two
 * middle ones for an even count.
 *
 * Spelled out because the three cheap things that get written instead are all
 * wrong for this: the mean is pulled around by one spike, the midpoint of the
 * extremes ((min+max)/2) is entirely decided by the two least typical samples,
 * and Array#sort without a comparator sorts lexicographically, which puts 1e-7
 * after 9e-8. Non-finite samples are dropped rather than poisoning the sort.
 */
export function median(values) {
  const sorted = []
  for (const v of values) if (Number.isFinite(v)) sorted.push(v)
  if (sorted.length === 0) return null
  sorted.sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * Compact price path with its median drawn across it.
 *
 * The median is computed from exactly the array that is plotted and mapped
 * through the same y() as the line, so where it crosses the path is where the
 * path is at its median value — not an eyeballed middle of the box.
 */
export default function Sparkline({
  values,
  width = 72,
  height = 22,
  stroke,
  className = '',
  title,
}) {
  const geom = useMemo(() => {
    const pts = []
    for (const v of values) if (Number.isFinite(v) && v > 0) pts.push(v)
    if (pts.length < 2) return null

    let lo = Infinity
    let hi = -Infinity
    for (const v of pts) { if (v < lo) lo = v; if (v > hi) hi = v }
    const pad = 2
    // A flat series would divide by zero; give it a hairline band so the line
    // lands mid-box instead of on an edge.
    const span = hi - lo || Math.abs(hi) || 1
    const y = (v) => height - pad - ((v - lo) / span) * (height - pad * 2)
    const x = (i) => (i / (pts.length - 1)) * width

    const med = median(pts)
    return {
      d: pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)} ${y(v).toFixed(2)}`).join(' '),
      medianY: y(med),
      median: med,
      lastY: y(pts[pts.length - 1]),
      last: pts[pts.length - 1],
      first: pts[0],
      n: pts.length,
    }
  }, [values, width, height])

  if (!geom) {
    return <div className="t-spark-empty" style={{ width, height }} aria-hidden="true" />
  }

  const up = geom.last >= geom.first
  const colour = stroke || (up ? 'var(--positive)' : 'var(--negative)')

  return (
    <svg
      className={`t-spark ${className}`}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={title || `price path, ${geom.n} samples`}
    >
      {title && <title>{title}</title>}
      <line
        className="t-spark-median"
        x1="0"
        x2={width}
        y1={geom.medianY}
        y2={geom.medianY}
      />
      <path d={geom.d} fill="none" stroke={colour} strokeWidth="1.25" strokeLinejoin="round" strokeLinecap="round" />
      {/* the newest sample, so "where it is now" reads without tracing the line */}
      <circle cx={width - 1} cy={geom.lastY} r="1.6" fill={colour} />
    </svg>
  )
}
