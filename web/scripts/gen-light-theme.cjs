/* Generates src/light-theme.css: paper-theme overrides for every Tailwind colour class used in src/.
 * Run:  node scripts/gen-light-theme.cjs
 * The app's dark theme is the default; these rules apply under `html:not(.dark)`.
 */
const fs = require('fs')
const path = require('path')
const colors = require('tailwindcss/colors')

const SRC = path.join(__dirname, '..', 'src')

function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name)
    if (f.isDirectory()) walk(p, out)
    else if (/\.(jsx?|html)$/.test(f.name)) out.push(p)
  }
  return out
}

const PROPS = 'bg|text|border|divide|ring|placeholder|fill|stroke'
const NAMED = 'white|black|gray|zinc|neutral|slate|stone|red|green|emerald|blue|yellow|amber|violet|purple|pink|cyan|orange|rose|indigo|sky|teal|lime'
const VARIANTS = 'hover|focus|group-hover|focus-within|active|disabled|focus-visible'
const TOKEN = new RegExp(
  `(?<![\\w-])((?:(?:${VARIANTS}):)*)(${PROPS})-(\\[#[0-9a-fA-F]{3,8}\\]|(?:${NAMED})(?:-\\d{2,3})?)(?:\\/(\\d{1,3}))?(?![\\w-])`,
  'g',
)

const found = new Set()
for (const file of walk(SRC)) {
  const text = fs.readFileSync(file, 'utf8')
  let m
  while ((m = TOKEN.exec(text))) found.add(m[0])
}

/* ── colour maths ───────────────────────────────────────────────────────── */
const hexToRgb = (h) => {
  h = h.replace('#', '')
  if (h.length === 3) h = h.split('').map((x) => x + x).join('')
  const n = parseInt(h.slice(0, 6), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const rgbToHex = ([r, g, b]) => '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')
const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b

function interp(table, x) {
  if (x <= table[0][0]) return table[0][1]
  for (let i = 1; i < table.length; i++) {
    if (x <= table[i][0]) {
      const [x0, y0] = table[i - 1], [x1, y1] = table[i]
      return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0)
    }
  }
  return table[table.length - 1][1]
}

// dark-theme neutral lightness -> paper-theme neutral lightness, per property kind
const TABLES = {
  bg: [[0, 242], [20, 233], [32, 226], [45, 218], [60, 210], [90, 188], [140, 150], [200, 60], [255, 17]],
  border: [[0, 226], [32, 208], [45, 200], [60, 192], [90, 168], [140, 130], [255, 17]],
  text: [[0, 205], [40, 175], [75, 140], [112, 108], [161, 78], [200, 42], [255, 14]],
}

function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (mx + mn) / 2
  if (mx !== mn) {
    const d = mx - mn
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0)
    else if (mx === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h /= 6
  }
  return [h, s, l]
}
function hslToRgb([h, s, l]) {
  const f = (p, q, t) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  if (s === 0) return [l * 255, l * 255, l * 255]
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q
  return [f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255]
}

function toPaper(rgb, kind) {
  const [h, s, l] = rgbToHsl(rgb)
  if (s < 0.14) { // neutral: remap lightness, keep a hint of warm paper
    const t = kind === 'text' ? 'text' : kind === 'border' ? 'border' : 'bg'
    const n = interp(TABLES[t], lum(rgb))
    return [n, n - 1, n - 4]
  }
  // coloured: text must stay readable on paper, fills keep their hue
  if (kind === 'text') return hslToRgb([h, Math.min(1, s * 1.05), Math.min(l, 0.36)])
  if (kind === 'bg' && l > 0.7) return hslToRgb([h, s, 0.9])
  return rgb
}

function resolveColor(name) {
  if (name.startsWith('[#')) return hexToRgb(name.slice(1, -1))
  if (name === 'white') return [255, 255, 255]
  if (name === 'black') return [0, 0, 0]
  const [base, shade] = name.split(/-(?=\d)/)
  const v = colors[base] && colors[base][shade]
  return v ? hexToRgb(v) : null
}

/* ── selector building ──────────────────────────────────────────────────── */
const esc = (s) => s.replace(/([^\w-])/g, '\\$1')

function ruleFor(token) {
  const m = token.match(new RegExp(`^((?:(?:${VARIANTS}):)*)(${PROPS})-(\\[#[0-9a-fA-F]{3,8}\\]|[a-z]+(?:-\\d{2,3})?)(?:\\/(\\d{1,3}))?$`))
  if (!m) return null
  const [, variants, prop, name, alphaPct] = m
  const rgb = resolveColor(name)
  if (!rgb) return null
  const kind = prop === 'bg' || prop === 'fill' ? 'bg' : prop === 'border' || prop === 'divide' || prop === 'ring' ? 'border' : 'text'
  const alpha = alphaPct ? Number(alphaPct) / 100 : null
  const isWhite = name === 'white'
  const isBlack = name === 'black'

  let out
  if (isBlack) return null // black scrims (overlays) read fine on paper too
  if (isWhite) {
    // white on dark UI = ink on paper; translucent white layers become translucent ink
    out = alpha == null ? 'rgb(17,17,16)' : `rgba(17,17,16,${(alpha * (kind === 'text' ? 1.08 : 0.9)).toFixed(3)})`
  } else {
    const p = toPaper(rgb, kind)
    out = alpha == null ? rgbToHex(p) : `rgba(${p.map(Math.round).join(',')},${alpha})`
  }

  const parts = variants.split(':').filter(Boolean)
  const pseudo = parts.filter((v) => ['hover', 'focus', 'active', 'disabled', 'focus-visible', 'focus-within'].includes(v)).map((v) => `:${v}`).join('')
  const group = parts.includes('group-hover')
  let sel = `.${esc(token)}`
  if (group) sel = `.group:hover ${sel}`
  sel += pseudo
  let decl
  if (prop === 'bg') decl = `background-color:${out}`
  else if (prop === 'text') decl = `color:${out}`
  else if (prop === 'border') decl = `border-color:${out}`
  else if (prop === 'ring') decl = `--tw-ring-color:${out}`
  else if (prop === 'fill') decl = `fill:${out}`
  else if (prop === 'stroke') decl = `stroke:${out}`
  else if (prop === 'placeholder') { sel += '::placeholder'; decl = `color:${out}` }
  else if (prop === 'divide') { sel = `${sel} > :not([hidden]) ~ :not([hidden])`; decl = `border-color:${out}` }
  return `html:not(.dark) ${sel}{${decl}}`
}

const rules = [...found].sort().map(ruleFor).filter(Boolean)
const header = `/* GENERATED by scripts/gen-light-theme.cjs — do not edit by hand.\n   Paper-theme overrides for Tailwind colour classes used in src/. ${rules.length} rules. */\n`
fs.writeFileSync(path.join(SRC, 'light-theme.css'), header + rules.join('\n') + '\n')
console.log(`light-theme.css: ${rules.length} rules from ${found.size} class tokens`)
