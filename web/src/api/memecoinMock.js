// -----------------------------------------------------------------------------
// DEV-ONLY mock fallbacks for the memecoin API. Used by memecoinApi.js ONLY when
// a request fails AND import.meta.env.DEV is true. Never used in production.
// -----------------------------------------------------------------------------

const NAMES = [
  ['BONKJR', 'Bonk Junior'], ['WIFHAT', 'Dog Wif Hat'], ['PEPE2', 'Pepe Returns'],
  ['MOODENG', 'Moo Deng'], ['GIGA', 'Gigachad'], ['POPCAT', 'Popcat'],
  ['FWOG', 'Fwog'], ['MEW', 'Cat in a dogs world'], ['MICHI', 'Michi'], ['RETARDIO', 'Retardio'],
]

function rng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function hashStr(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
function fakeAddress(seed) {
  const r = rng(seed)
  let out = ''
  for (let i = 0; i < 44; i++) out += B58[Math.floor(r() * B58.length)]
  return out
}

export function mockToken(i, stage = 'trending') {
  const [symbol, name] = NAMES[i % NAMES.length]
  const r = rng(i * 7919 + 13)
  const price = r() * 0.002 + 0.00001
  const marketCap = Math.round(price * 1e9)
  return {
    address: fakeAddress(i * 104729 + 7),
    symbol, name, stage,
    image: null,
    price,
    marketCap,
    liquidity: Math.round(marketCap * (0.08 + r() * 0.2)),
    volume24h: Math.round(marketCap * (0.5 + r() * 4)),
    holders: Math.round(100 + r() * 9000),
    change5m: +((r() - 0.45) * 12).toFixed(2),
    change1h: +((r() - 0.45) * 40).toFixed(2),
    change24h: +((r() - 0.4) * 150).toFixed(2),
    ageMinutes: Math.round(r() * 600),
    bondingProgress: Math.round(r() * 100),
  }
}

export const mockTrending = () => Array.from({ length: 10 }, (_, i) => mockToken(i, 'trending'))
export const mockNew = () => Array.from({ length: 10 }, (_, i) => mockToken(i + 20, 'new'))

export function mockSearch(q = '') {
  const all = [...mockTrending(), ...mockNew()]
  const s = q.toLowerCase()
  return all
    .filter((t) => t.symbol.toLowerCase().includes(s) || t.name.toLowerCase().includes(s) || t.address.toLowerCase().startsWith(s))
    .slice(0, 8)
}

export function mockTokenDetail(address) {
  const found = [...mockTrending(), ...mockNew()].find((t) => t.address === address)
  if (found) return found
  return { ...mockToken(hashStr(address) % 50, 'trending'), address }
}

const TF_SECONDS = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600 }

export function mockOhlcv(address, tf = '1m') {
  const step = TF_SECONDS[tf] || 60
  const base = mockTokenDetail(address).price
  const r = rng(hashStr(address + tf))
  let t = Math.floor(Date.now() / 1000 / step) * step - step * 200
  let price = base * (0.7 + r() * 0.3)
  const out = []
  for (let i = 0; i < 200; i++) {
    const open = price
    const close = open * (1 + (r() - 0.48) * 0.06)
    out.push({
      time: t, open, close,
      high: Math.max(open, close) * (1 + r() * 0.02),
      low: Math.min(open, close) * (1 - r() * 0.02),
      volume: Math.round(r() * 5000 * (i % 17 === 0 ? 5 : 1)),
    })
    price = close
    t += step
  }
  return out
}

export function mockTrades(address) {
  const base = mockTokenDetail(address).price
  const r = rng(Math.floor(Date.now() / 5000) + hashStr(address))
  const now = Date.now()
  return Array.from({ length: 30 }, (_, i) => {
    const amountSol = +(r() * 4 + 0.05).toFixed(3)
    return {
      id: `m-${i}-${Math.floor(now / 5000)}`,
      side: r() > 0.5 ? 'buy' : 'sell',
      amountSol,
      price: base * (1 + (r() - 0.5) * 0.04),
      amountToken: Math.round((amountSol * 150) / base),
      maker: fakeAddress(Math.floor(r() * 1e6)),
      timestamp: now - i * 3000 - Math.floor(r() * 2000),
    }
  })
}

export function mockQuote({ address, side, amountSol, slippageBps }) {
  const price = mockTokenDetail(address).price
  const sol = Number(amountSol) || 0
  const out = side === 'buy' ? (sol * 150) / price : sol
  return {
    address, side, amountSol: sol, slippageBps, price,
    expectedOut: out,
    minOut: out * (1 - (slippageBps || 0) / 10000),
    priceImpactPct: +(sol * 0.12).toFixed(2),
    feeSol: +(sol * 0.01).toFixed(5),
  }
}

export function mockTrade(body) {
  return { ...mockQuote(body), id: `mock-${Date.now()}`, status: 'filled', paper: true, timestamp: Date.now() }
}
