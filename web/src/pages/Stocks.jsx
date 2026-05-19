import { useState, useRef, useEffect, useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { addStock, removeStock, setSelectedTicker } from '../store/watchlistSlice'
import { useGetStockQuery } from '../api/stocksApi'
import { useSearchSymbolsQuery } from '../api/searchApi'
import NewsCard from '../components/NewsCard'
import TradingViewChart from '../components/TradingViewChart'
import ProGate from '../components/ProGate'
import StockLogo from '../components/StockLogo'

// Debounce hook
function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

function MiniSparkline({ price, changePercent }) {
  const positive = changePercent >= 0
  const bars = Array.from({ length: 8 })
  return (
    <div className="flex items-end gap-px h-8 w-14">
      {bars.map((_, i) => {
        const h = 40 + Math.sin(i * 0.9 + (price % 7)) * 30
        return (
          <div
            key={i}
            className={`flex-1 rounded-sm ${positive ? 'bg-emerald-500' : 'bg-red-500'} opacity-70`}
            style={{ height: `${Math.max(15, Math.min(90, h))}%` }}
          />
        )
      })}
    </div>
  )
}

function StockCard({ ticker, isSelected, onClick }) {
  const { data, isLoading, isError } = useGetStockQuery(ticker)
  const dispatch = useDispatch()

  const price = data?.price || 0
  const changePercent = data?.changePercent || 0
  const positive = changePercent >= 0

  const handleRemove = (e) => {
    e.stopPropagation()
    dispatch(removeStock(ticker))
  }

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl border transition-all duration-150 px-4 py-3.5 group ${
        isSelected
          ? 'bg-white/[0.06] border-white/20'
          : 'bg-[#111] border-[#222] hover:bg-[#141414] hover:border-[#2e2e2e]'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <StockLogo ticker={ticker} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-white font-bold text-sm">{ticker}</span>
            {isSelected && (
              <span className="w-1.5 h-1.5 rounded-full bg-white/50 flex-shrink-0" />
            )}
          </div>
          {data?.name && (
            <p className="text-[#6b7280] text-xs mt-0.5 truncate">{data.name}</p>
          )}
          {isLoading && <div className="h-3 w-20 bg-[#222] rounded animate-pulse mt-0.5" />}
        </div>

        {!isLoading && !isError && (
          <div className="flex items-center gap-3 flex-shrink-0">
            <MiniSparkline price={price} changePercent={changePercent} />
            <div className="text-right">
              <p className="text-white text-sm font-semibold">
                ${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className={`text-xs font-medium ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
                {positive ? '+' : ''}{changePercent.toFixed(2)}%
              </p>
            </div>
          </div>
        )}

        {isError && (
          <span className="text-[#4b5563] text-xs">Unavailable</span>
        )}

        <button
          onClick={handleRemove}
          className="text-[#333] hover:text-red-500 transition-colors text-lg leading-none flex-shrink-0 ml-1 opacity-0 group-hover:opacity-100"
          aria-label={`Remove ${ticker}`}
        >
          ×
        </button>
      </div>
    </button>
  )
}

function DetailPanel({ ticker }) {
  const { data, isLoading } = useGetStockQuery(ticker)
  const price = data?.price || 0
  const changePercent = data?.changePercent || 0
  const positive = changePercent >= 0

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-6 py-5 border-b border-[#1e1e1e]">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <StockLogo ticker={ticker} size={44} />
            <div>
              <h2 className="text-white font-bold text-xl">{ticker}</h2>
              {data?.name && <p className="text-[#6b7280] text-sm mt-0.5">{data.name}</p>}
            </div>
          </div>
          {!isLoading && (
            <div className="text-right">
              <p className="text-white font-bold text-2xl">
                ${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className={`text-sm font-semibold ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
                {positive ? '▲' : '▼'} {Math.abs(changePercent).toFixed(2)}%
              </p>
            </div>
          )}
        </div>
      </div>
      <div className="px-6 py-4">
        <ProGate label="Full charts & AI news">
          <div className="space-y-5">
            <TradingViewChart ticker={ticker} />
            {data?.news && data.news.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-white/30 uppercase tracking-widest mb-3">Latest News</p>
                <div className="space-y-3">
                  {data.news.slice(0, 5).map((item) => (
                    <NewsCard key={item.id} item={item} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </ProGate>
      </div>
    </div>
  )
}

function TickerSearchInput({ onAdd }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  const inputRef = useRef(null)

  const debouncedQuery = useDebounce(query.trim(), 280)
  // Only search when >= 3 chars (handles short companies too — NVDA, IBM — user has to type at least 3 chars regardless)
  const shouldSearch = debouncedQuery.length >= 3
  const { data, isFetching } = useSearchSymbolsQuery(
    { q: debouncedQuery, type: 'stocks' },
    { skip: !shouldSearch }
  )
  const results = data?.results || []

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSelect = useCallback((ticker) => {
    onAdd(ticker.toUpperCase())
    setQuery('')
    setOpen(false)
    inputRef.current?.focus()
  }, [onAdd])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const t = query.trim().toUpperCase()
      if (t) { handleSelect(t) }
    }
    if (e.key === 'Escape') { setOpen(false); setQuery('') }
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex items-center gap-2">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
            onFocus={() => query.length >= 3 && setOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder="Search or enter ticker…"
            maxLength={50}
            className="w-52 pl-8 pr-3 py-2 text-sm bg-[#111] border border-[#222] text-white placeholder-[#4b5563] rounded-lg focus:outline-none focus:border-white/20 transition-colors"
          />
        </div>
        <button
          type="button"
          onClick={() => { const t = query.trim().toUpperCase(); if (t) handleSelect(t) }}
          disabled={!query.trim()}
          className="px-4 py-2 text-sm font-semibold bg-white text-[#0a0a0a] rounded-lg hover:bg-white/90 disabled:opacity-30 transition-colors"
        >
          Add
        </button>
      </div>

      {/* Dropdown */}
      {open && shouldSearch && (
        <div
          className="absolute right-0 top-full mt-1.5 w-72 z-40 rounded-xl overflow-hidden"
          style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.10)', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}
        >
          {isFetching && (
            <div className="px-4 py-3 flex items-center gap-2">
              <div className="w-3 h-3 border border-white/20 border-t-white/60 rounded-full animate-spin" />
              <span className="text-xs text-white/30">Searching…</span>
            </div>
          )}
          {!isFetching && results.length === 0 && (
            <div className="px-4 py-3">
              <p className="text-xs text-white/30">No results for &ldquo;{debouncedQuery}&rdquo;</p>
              <p className="text-[10px] text-white/20 mt-0.5">Try the full company name or exact ticker</p>
            </div>
          )}
          {!isFetching && results.length > 0 && (
            <div className="py-1 max-h-64 overflow-y-auto">
              {results.slice(0, 8).map((r) => (
                <button
                  key={`${r.assetType}_${r.ticker}`}
                  onClick={() => handleSelect(r.ticker)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.06] transition-colors text-left"
                >
                  <StockLogo ticker={r.ticker} size={28} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{r.ticker}</p>
                    <p className="text-xs text-white/40 truncate">{r.name}</p>
                  </div>
                  <span className="text-[10px] text-white/25 uppercase tracking-wide flex-shrink-0">
                    {r.assetType === 'etf' ? 'ETF' : r.exchange || ''}
                  </span>
                </button>
              ))}
            </div>
          )}
          {!shouldSearch && query.length > 0 && (
            <div className="px-4 py-3">
              <p className="text-xs text-white/30">Type at least 3 characters to search</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function Stocks() {
  const dispatch = useDispatch()
  const stocks = useSelector((state) => state.watchlist.stocks)
  const selectedTicker = useSelector((state) => state.watchlist.selectedTicker)

  const handleAdd = useCallback((ticker) => {
    if (!ticker) return
    dispatch(addStock(ticker))
    dispatch(setSelectedTicker(ticker))
  }, [dispatch])

  const handleCardClick = (ticker) => {
    dispatch(setSelectedTicker(selectedTicker === ticker ? null : ticker))
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 h-full">
      {/* Top bar */}
      <header className="flex items-center gap-4 px-6 py-4 border-b border-[#1a1a1a] flex-shrink-0">
        <div className="flex-1">
          <h1 className="text-lg font-bold text-white">Watchlist</h1>
          <p className="text-[#6b7280] text-xs">
            {stocks.length} stock{stocks.length !== 1 ? 's' : ''} tracked
          </p>
        </div>
        <TickerSearchInput onAdd={handleAdd} />
      </header>

      {/* Two-panel layout */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left: stock list */}
        <div
          className={`flex flex-col overflow-y-auto border-r border-[#1a1a1a] transition-all duration-200 ${
            selectedTicker ? 'w-72 flex-shrink-0' : 'flex-1'
          }`}
        >
          {stocks.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 py-20 gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
                <polyline points="16 7 22 7 22 13"/>
              </svg>
              <p className="text-[#4b5563] text-sm text-center px-8">
                Search for a company or ticker above to add to your watchlist
              </p>
            </div>
          ) : (
            <div className={`p-4 space-y-2 ${selectedTicker ? '' : 'max-w-2xl mx-auto w-full'}`}>
              {stocks.map((ticker) => (
                <StockCard
                  key={ticker}
                  ticker={ticker}
                  isSelected={selectedTicker === ticker}
                  onClick={() => handleCardClick(ticker)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right: detail panel */}
        {selectedTicker && (
          <div className="flex-1 min-w-0 bg-[#080808]">
            <DetailPanel ticker={selectedTicker} />
          </div>
        )}
      </div>
    </div>
  )
}
