// Shared gradients for ASCII logos, icons, effects and scenes.
// Each is a list of colour stops that read on both the paper and ink themes.
export const GRADIENTS = {
  blue: ['#1d4ed8', '#38bdf8'],
  teal: ['#0f766e', '#2dd4bf'],
  violet: ['#6d28d9', '#e879f9'],
  amber: ['#b45309', '#f59e0b'],
  rose: ['#be123c', '#fb7185'],
  lime: ['#3f6212', '#a3e635'],
  ice: ['#0284c7', '#a5f3fc'],
  fire: ['#b91c1c', '#f97316', '#fde047'],
  gold: ['#a16207', '#facc15', '#fef08a'],
  mint: ['#047857', '#6ee7b7'],
  pink: ['#be185d', '#f9a8d4'],
  mono: ['#3a3a37', '#9a9a91'],
}

const ORDER = ['blue', 'teal', 'violet', 'amber', 'rose', 'lime', 'ice', 'mint', 'pink']

export function resolveGradient(p) {
  if (Array.isArray(p)) return p
  return GRADIENTS[p] || GRADIENTS.blue
}

export function gradientFor(key) {
  let h = 0
  const s = String(key || '')
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return ORDER[h % ORDER.length]
}

export function cssGradient(p, angle = 100) {
  const c = resolveGradient(p)
  // the first colour is repeated at the end so an animated background loops without a seam
  return `linear-gradient(${angle}deg, ${c.join(', ')}, ${c[0]})`
}

export function hexToRgb(hex) {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function sampleGradient(p, t) {
  const c = resolveGradient(p).map(hexToRgb)
  const x = Math.max(0, Math.min(1, t)) * (c.length - 1)
  const i = Math.min(c.length - 2, Math.floor(x))
  const f = x - i
  return [0, 1, 2].map((k) => Math.round(c[i][k] + (c[i + 1][k] - c[i][k]) * f))
}
