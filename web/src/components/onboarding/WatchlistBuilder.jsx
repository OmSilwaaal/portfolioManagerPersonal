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

function typeBadge(type) {
  const t = (type || '').toLowerCase()
  if (t === 'etf') return 'text-yellow-400 bg-yellow-400/10'
  if (t === 'crypto') return 'text-[#3b82f6] bg-[#3b82f6]/10'
  return 'text-[#a1a1aa] bg-[#1f1f1f]'
}

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
    <div className="w-full max-w-xl">
      <h2 className="text-3xl font-semibold text-white mb-3 text-center">
        Build your watchlist
      </h2>
      <p className="text-[#a1a1aa] text-center mb-6 text-sm">
        Click suggestions or type a ticker and press Enter
      </p>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {tags.map((tag) => (
            <span
              key={tag.ticker}
              className="flex items-center gap-1 bg-[#3b82f6]/20 border border-[#3b82f6] text-[#3b82f6] text-sm px-3 py-1 rounded-full"
            >
              {tag.ticker}
              <button
                onClick={() => removeTag(tag.ticker)}
                className="ml-1 text-[#3b82f6] hover:text-white leading-none"
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative mb-4">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search or type a ticker..."
          className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-white placeholder-gray-500 rounded-lg px-4 py-3 focus:outline-none focus:border-[#3b82f6] text-sm"
        />

        {showDropdown && (
          <div className="absolute top-full left-0 right-0 z-10 mt-1 bg-[#141414] border border-[#1f1f1f] rounded-lg overflow-hidden shadow-lg">
            {isFetching && (
              <div className="flex items-center justify-center py-4">
                <div className="w-4 h-4 border-2 border-[#3b82f6] border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {!isFetching && searchResults.length === 0 && (
              <p className="text-[#a1a1aa] text-sm text-center py-4">No results</p>
            )}

            {!isFetching &&
              searchResults.map((s) => (
                <button
                  key={s.ticker}
                  onClick={() => addTag({ ticker: s.ticker, assetType: s.type || 'stock', name: s.name })}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-[#1f1f1f] hover:text-white border-b border-[#1f1f1f] last:border-b-0 flex items-center gap-2"
                >
                  <span className="font-bold text-white">{s.ticker}</span>
                  <span className="text-[#a1a1aa] flex-1 truncate">{s.name}</span>
                  <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${typeBadge(s.type)}`}>
                    {typeLabel(s.type)}
                  </span>
                </button>
              ))}
          </div>
        )}
      </div>

      {showGrid &&
        Object.entries(SUGGESTIONS).map(([category, items]) => (
          <div key={category} className="mb-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">{category}</p>
            <div className="flex flex-wrap gap-2">
              {items.map((s) => {
                const isAdded = tags.some((t) => t.ticker === s.ticker)
                return (
                  <button
                    key={s.ticker}
                    onClick={() => (isAdded ? removeTag(s.ticker) : addTag(s))}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                      isAdded
                        ? 'bg-[#3b82f6] border-[#3b82f6] text-white'
                        : 'bg-[#1a1a1a] border-[#2a2a2a] text-gray-300 hover:border-[#3b82f6] hover:text-white'
                    }`}
                  >
                    {s.ticker}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
    </div>
  )
}
