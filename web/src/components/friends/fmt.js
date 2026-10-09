// Number formatting for the friends panels. Deliberately the same rules the terminal uses (sub-cent prices by
// significant digits, K/M/B for money) so a position reads identically wherever you meet it; the terminal keeps its
// copy module-local, so this is a sibling rather than an import.
export function fmtUsd(n) {
  if (n == null || isNaN(n)) return '--'
  const a = Math.abs(n)
  if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (a >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (a >= 1e3) return `$${(n / 1e3).toFixed(1)}K`
  return `$${n.toFixed(2)}`
}

export function fmtPrice(p) {
  if (p == null || isNaN(p)) return '--'
  if (p >= 1) return `$${p.toFixed(2)}`
  if (p >= 0.01) return `$${p.toFixed(4)}`
  return `$${Number(p.toPrecision(3)).toString().includes('e') ? p.toExponential(2) : p.toPrecision(3)}`
}

export function fmtNum(n) {
  if (n == null || isNaN(n)) return '--'
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })
}

export const fmtTokens = (n) => (n == null || isNaN(n) ? '--' : Math.abs(n) >= 1 ? fmtNum(n) : Number(n).toPrecision(3))
export const fmtPct = (v) => (v == null || isNaN(v) ? '--' : `${v >= 0 ? '+' : ''}${Number(v).toFixed(2)}%`)
export const fmtUsdSigned = (n) => (n == null || isNaN(n) ? '--' : `${n >= 0 ? '+' : '-'}${fmtUsd(Math.abs(n))}`)
export const shortAddr = (a) => (typeof a === 'string' && a.length > 10 ? `${a.slice(0, 4)}...${a.slice(-4)}` : a || '')
export const toneOf = (v) => (v == null ? 'var(--on-ink-text-3)' : v >= 0 ? 'var(--positive)' : 'var(--negative)')

export function timeShort(iso) {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000))
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}
