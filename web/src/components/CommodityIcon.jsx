import AsciiArt from '../ascii/AsciiArt'

// Commodity marks, drawn in ASCII. Each entry: art lines + gradient.
const BAR = ['  ___  ', ' /___\\ ', '/_____\\']
const DROP = ['  /\\  ', ' /  \\ ', '(    )', ' \\__/ ']
const WHEAT = [' \\|/ ', ' \\|/ ', '  |  ', '  |  ']
const POD = [' .-. ', '(:::)', " '-' "]
const SEEDS = ['(o)(o)', ' (o)  ']

const ICONS = {
  CL1: { art: DROP, palette: ['#334155', '#94a3b8'] },
  NG1: { art: ['  (  ', ' ) ) ', '( ( )', ' \\_/ '], palette: 'ice' },
  HO1: { art: DROP, palette: 'amber' },
  RB1: { art: ['.--. ', '|  |>', '|##| ', "'--' "], palette: 'violet' },
  GC1: { art: BAR, palette: 'gold' },
  SI1: { art: BAR, palette: ['#64748b', '#e2e8f0'] },
  HG1: { art: [' .-. ', '(   )', " '-' "], palette: ['#92400e', '#fb923c'] },
  PL1: { art: BAR, palette: ['#94a3b8', '#ffffff'] },
  PA1: { art: BAR, palette: 'violet' },
  ZW1: { art: WHEAT, palette: 'amber' },
  ZC1: { art: ['  /\\ ', ' /::\\', ' \\::/', '  \\/ '], palette: 'gold' },
  ZS1: { art: SEEDS, palette: 'lime' },
  KC1: { art: ['(\\_/)', '( o )', " '-' "], palette: ['#7c2d12', '#d97706'] },
  SB1: { art: ['.---.', '|:::|', "'---'"], palette: 'pink' },
  CT1: { art: [' .~. ', '(~~~)', " '~' "], palette: ['#94a3b8', '#f8fafc'] },
  OJ1: { art: ['.-"-.', '( O )', " '-' "], palette: 'amber' },
  LE1: { art: [' _  _ ', '(o\\/o)', ' \\__/ '], palette: ['#7c2d12', '#d97706'] },
  HE1: { art: ['(o  o)', ' (  ) ', ' d  b '], palette: 'pink' },
  LBS1: { art: ['=====', '=====', '====='], palette: ['#7c2d12', '#d97706'] },
  ZO1: { art: [' .:. ', '  |  ', '  |  '], palette: 'amber' },
  ZR1: { art: SEEDS, palette: ['#a16207', '#fef08a'] },
  CC1: { art: POD, palette: ['#451a03', '#a16207'] },
}

const SYMBOL_ALIASES = {
  WTI: 'CL1', BRENT: 'CL1', GOLD: 'GC1', SILVER: 'SI1', NATURAL_GAS: 'NG1', COPPER: 'HG1',
  WHEAT: 'ZW1', CORN: 'ZC1', SOYBEANS: 'ZS1', COFFEE: 'KC1', SUGAR: 'SB1', COTTON: 'CT1',
  COCOA: 'CC1', PLATINUM: 'PL1', PALLADIUM: 'PA1',
}

const SECTOR_FALLBACKS = {
  Energy: { art: DROP, palette: 'amber' },
  Metals: { art: BAR, palette: 'gold' },
  Agriculture: { art: WHEAT, palette: 'lime' },
  Other: { art: ['.---.', '| o |', "'---'"], palette: 'mono' },
}

export default function CommodityIcon({ symbol, sector = 'Other', size = 40, className = '' }) {
  const resolved = SYMBOL_ALIASES[symbol] || symbol
  const icon = ICONS[resolved] || SECTOR_FALLBACKS[sector] || SECTOR_FALLBACKS.Other
  const cols = Math.max(...icon.art.map((l) => l.length))
  const font = Math.max(5, Math.min((size * 0.9) / (cols * 0.6), (size * 0.9) / (icon.art.length * 1.08)))
  return (
    <div
      className={`flex items-center justify-center flex-shrink-0 ${className}`}
      style={{ width: size, height: size }}
      title={resolved}
    >
      <AsciiArt lines={icon.art} palette={icon.palette} size={font} label={resolved} />
    </div>
  )
}
