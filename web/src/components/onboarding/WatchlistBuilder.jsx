import { useState, useEffect } from 'react'
import { useSearchSymbolsQuery } from '../../api/searchApi'

const SUGGESTIONS = {
  Stocks: [
    { ticker: 'AAPL', assetType: 'stock', name: 'Apple' },
    { ticker: 'NVDA', assetType: 'stock', name: 'NVIDIA' },
    { ticker: 'TSLA', assetType: 'stock', name: 'Tesla' },
    { ticker: 'MSFT', assetType: 'stock', name: 'Microsoft' },
    { ticker: 'AMZN', assetType: 'stock', name: 'Amazon' },
    { ticker: 'GOOGL', assetType: 'stock', name: 'Alphabet' },
    { ticker: 'META', assetType: 'stock', name: 'Meta' },
    { ticker: 'SPY', assetType: 'stock', name: 'S&P 500 ETF' },
    { ticker: 'QQQ', assetType: 'stock', name: 'Nasdaq ETF' },
  ],
  Crypto: [
    { ticker: 'BTC', assetType: 'crypto', name: 'Bitcoin' },
    { ticker: 'ETH', assetType: 'crypto', name: 'Ethereum' },
    { ticker: 'SOL', assetType: 'crypto', name: 'Solana' },
    { ticker: 'BNB', assetType: 'crypto', name: 'BNB' },
    { ticker: 'XRP', assetType: 'crypto', name: 'XRP' },
    { ticker: 'DOGE', assetType: 'crypto', name: 'Dogecoin' },
  ],
  Commodities: [
    { ticker: 'WTI', assetType: 'commodity', name: 'Crude Oil' },
    { ticker: 'GOLD', assetType: 'commodity', name: 'Gold' },
    { ticker: 'SILVER', assetType: 'commodity', name: 'Silver' },
  ],
}

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

const BORDER = 'var(--on-ink-border)'
const MONO = { fontFamily: 'var(--font-sans)' }

function typeLabel(type) {
  const t = (type || '').toLowerCase()
  if (t === 'etf') return 'ETF'
  if (t === 'crypto') return 'CRYPTO'
  return 'STOCK'
}

export default function WatchlistBuilder({ onUpdate, initialTags = [] }) {
  const [tags, setTags] = useState(initialTags)
  const [input, setInput] = useState('')
  const debouncedQuery = useDebounce(input.trim(), 350)

  const { data: searchData, isFetching } = useSearchSymbolsQuery(
    { q: debouncedQuery },
    { skip: debouncedQuery.length < 2 }
  )

  const searchResults = searchData?.results || []
  const showDropdown = debouncedQuery.length >= 2
  const showGrid = !input.trim()

  const addTag = (item) => {
    if (tags.some((t) => t.ticker === item.ticker)) return
    const updated = [...tags, item]
    setTags(updated)
    onUpdate(updated)
    setInput('')
  }

  const removeTag = (ticker) => {
    const updated = tags.filter((t) => t.ticker !== ticker)
    setTags(updated)
    onUpdate(updated)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && input.trim()) {
      const ticker = input.trim().toUpperCase()
      addTag({ ticker, assetType: 'stock', name: ticker })
    }
  }

  return (
    <div className="w-full" style={{ maxWidth: 560 }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontStretch: '125%', fontWeight: 800, fontSize: 'clamp(24px, 4.4vw, 34px)', lineHeight: 1.1, letterSpacing: '-0.02em', textTransform: 'uppercase', color: 'var(--paper)', margin: '0 0 8px' }}>
        Build your watchlist
      </h2>
      <p style={{ ...MONO, fontSize: 14, color: 'var(--on-ink-text-3)', margin: '0 0 22px' }}>
        Tap suggestions, or type a ticker and press Enter.
      </p>

      {tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {tags.map((tag) => (
            <span key={tag.ticker} style={{ ...MONO, display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, padding: '5px 10px', background: 'var(--paper)', color: 'var(--ink-900)', borderRadius: 2 }}>
              {tag.ticker}
              <button onClick={() => removeTag(tag.ticker)} aria-label={`Remove ${tag.ticker}`} style={{ background: 'none', border: 0, cursor: 'pointer', color: 'inherit', fontSize: 16, lineHeight: 1, padding: 0 }}>&times;</button>
            </span>
          ))}
        </div>
      )}

      <div style={{ position: 'relative', marginBottom: 18 }}>
        <input
          type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
          placeholder="Search or type a ticker..." aria-label="Search tickers" className="t-input" style={{ padding: '12px 14px', fontSize: 14 }}
        />
        {showDropdown && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, marginTop: 4, background: 'var(--ink-800)', border: `1px solid ${BORDER}`, maxHeight: 280, overflowY: 'auto' }}>
            {isFetching && <p style={{ ...MONO, fontSize: 13, color: 'var(--on-ink-text-3)', textAlign: 'center', padding: 14, margin: 0 }}>Searching...</p>}
            {!isFetching && searchResults.length === 0 && <p style={{ ...MONO, fontSize: 13, color: 'var(--on-ink-text-3)', textAlign: 'center', padding: 14, margin: 0 }}>No results. Press Enter to add it anyway.</p>}
            {!isFetching && searchResults.map((s) => (
              <button
                key={s.ticker} onClick={() => addTag({ ticker: s.ticker, assetType: s.type || 'stock', name: s.name })} className="tvx-navrow"
                style={{ ...MONO, width: '100%', textAlign: 'left', padding: '10px 14px', fontSize: 13, background: 'transparent', border: 0, borderBottom: `1px solid ${BORDER}`, color: 'var(--paper)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
              >
                <b>{s.ticker}</b>
                <span style={{ color: 'var(--on-ink-text-3)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                <span className="t-chip">{typeLabel(s.type)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {showGrid && Object.entries(SUGGESTIONS).map(([category, items]) => (
        <div key={category} style={{ marginBottom: 16 }}>
          <p style={{ ...MONO, fontSize: 12, fontWeight: 700, color: 'var(--on-ink-text-3)', margin: '0 0 8px' }}>{category}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {items.map((s) => {
              const isAdded = tags.some((t) => t.ticker === s.ticker)
              return (
                <button
                  key={s.ticker} onClick={() => (isAdded ? removeTag(s.ticker) : addTag(s))} aria-pressed={isAdded}
                  className={`t-btn ${isAdded ? 't-on' : ''}`} style={{ ...MONO, padding: '6px 12px', fontSize: 13 }}
                >{s.ticker}</button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
