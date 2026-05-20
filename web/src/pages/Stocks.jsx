import { useState, useRef, useEffect, useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { addStock, removeStock, setSelectedTicker } from '../store/watchlistSlice'
import { useGetStockQuery } from '../api/stocksApi'
import { useSearchSymbolsQuery } from '../api/searchApi'
import NewsCard from '../components/NewsCard'
import TradingViewChart from '../components/TradingViewChart'
import ProGate from '../components/ProGate'
import StockLogo from '../components/StockLogo'

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

function fmt(n) {
  if (n == null) return '—'
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  return `$${n.toLocaleString()}`
}

function fmtVol(n) {
  if (n == null) return '—'
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`
  return String(n)
}

function StockCard({ ticker, isSelected, onClick }) {
  const { data, isLoading, isError } = useGetStockQuery(ticker)
  const dispatch = useDispatch()

  const price = data?.price || 0
  const change = data?.change || 0
  const changePercent = data?.changePercent || 0
  const positive = changePercent >= 0
  const high = data?.high
  const low = data?.low
  const volume = data?.volume

  const handleRemove = (e) => {
    e.stopPropagation()
    dispatch(removeStock(ticker))
  }

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl border transition-all duration-150 px-4 py-3 group ${
        isSelected
          ? 'bg-white/[0.07] border-white/25'
          : 'bg-[#111] border-[#1e1e1e] hover:bg-[#141414] hover:border-[#2a2a2a]'
      }`}
    >
      <div className="flex items-start gap-3">
        <StockLogo ticker={ticker} size={36} />

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-white font-bold text-sm">{ticker}</span>
              {data?.name && <span className="text-[#6b7280] text-xs truncate">{data.name}</span>}
            </div>
            {!isLoading && !isError && (
              <div className="text-right flex-shrink-0">
                <p className="text-white text-sm font-bold">
                  ${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className={`text-xs font-semibold ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
                  {positive ? '+' : ''}{change.toFixed(2)} ({positive ? '+' : ''}{changePercent.toFixed(2)}%)
                </p>
              </div>
            )}
          </div>

          {!isLoading && !isError && (
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              {high != null && low != null && (
                <span className="text-[11px] text-white/35">
                  H: <span className="text-white/55">${high.toFixed(2)}</span>
                  {' · '}
                  L: <span className="text-white/55">${low.toFixed(2)}</span>
                </span>
              )}
              {volume != null && (
                <span className="text-[11px] text-white/35">
                  Vol: <span className="text-white/55">{fmtVol(volume)}</span>
                </span>
              )}
              {data?.marketCap != null && (
                <span className="text-[11px] text-white/35">
                  Cap: <span className="text-white/55">{fmt(data.marketCap * 1e6)}</span>
                </span>
              )}
            </div>
          )}

          {isLoading && <div className="h-3 w-32 bg-[#222] rounded animate-pulse mt-2" />}
          {isError && <span className="text-[#4b5563] text-xs mt-1 block">Data unavailable</span>}
        </div>

        <button
          onClick={handleRemove}
          className="text-[#2a2a2a] hover:text-red-500 transition-colors text-base leading-none flex-shrink-0 opacity-0 group-hover:opacity-100 mt-0.5"
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
  const change = data?.change || 0
  const changePercent = data?.changePercent || 0
  const positive = changePercent >= 0

  return (
    <div className="flex flex-col h-full overflow-y-auto scrollbar-hide">
      <div className="px-6 py-5 border-b border-[#1e1e1e]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <StockLogo ticker={ticker} size={48} />
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
                {positive ? '▲' : '▼'} {Math.abs(change).toFixed(2)} ({positive ? '+' : ''}{changePercent.toFixed(2)}%)
              </p>
            </div>
          )}
        </div>

        {/* Stats row */}
        {!isLoading && data && (
          <div className="grid grid-cols-4 gap-3 mt-4">
            {[
              { label: 'Open', value: data.open != null ? `$${data.open.toFixed(2)}` : '—' },
              { label: 'Prev Close', value: data.previousClose != null ? `$${data.previousClose.toFixed(2)}` : '—' },
              { label: 'Day High', value: data.high != null ? `$${data.high.toFixed(2)}` : '—' },
              { label: 'Day Low', value: data.low != null ? `$${data.low.toFixed(2)}` : '—' },
              { label: 'Volume', value: fmtVol(data.volume) },
              { label: 'Mkt Cap', value: data.marketCap != null ? fmt(data.marketCap * 1e6) : '—' },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="text-[10px] text-white/30 uppercase tracking-widest mb-0.5">{label}</p>
                <p className="text-sm font-semibold text-white/80">{value}</p>
              </div>
            ))}
          </div>
        )}
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

function TickerSearch({ onAdd }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  const inputRef = useRef(null)

  const debouncedQuery = useDebounce(query.trim(), 280)
  const shouldSearch = debouncedQuery.length >= 2
  const { data, isFetching } = useSearchSymbolsQuery(
    { q: debouncedQuery, type: 'stocks' },
    { skip: !shouldSearch }
  )
  const results = data?.results || []

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
    if (e.key === 'Enter') { e.preventDefault(); const t = query.trim().toUpperCase(); if (t) handleSelect(t) }
    if (e.key === 'Escape') { setOpen(false); setQuery('') }
  }

  return (
    <div ref={wrapRef} className="relative w-full">
      <div className="flex items-center gap-2 rounded-xl px-4 py-2.5" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' }}>
        <svg className="text-white/30 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => query.length >= 2 && setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search by company name or ticker — e.g. Apple, NVDA…"
          maxLength={50}
          className="flex-1 bg-transparent text-sm text-white placeholder-white/25 focus:outline-none"
        />
        {query && (
          <button onClick={() => { setQuery(''); setOpen(false) }} className="text-white/25 hover:text-white/60 transition-colors text-lg leading-none">×</button>
        )}
      </div>

      {open && shouldSearch && (
        <div
          className="absolute left-0 right-0 top-full mt-1.5 z-40 rounded-xl overflow-hidden"
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
              <p className="text-[10px] text-white/20 mt-0.5">Try the full company name or exact ticker symbol</p>
            </div>
          )}
          {!isFetching && results.length > 0 && (
            <div className="py-1 max-h-64 overflow-y-auto scrollbar-hide">
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
      {/* Header */}
      <header className="flex items-center gap-4 px-6 py-4 border-b border-[#1a1a1a] flex-shrink-0">
        <div>
          <h1 className="text-lg font-bold text-white">Watchlist</h1>
          <p className="text-[#6b7280] text-xs">
            {stocks.length === 0 ? 'Track stocks you care about' : `${stocks.length} stock${stocks.length !== 1 ? 's' : ''} tracked`}
          </p>
        </div>
      </header>

      {/* Two-panel layout */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left: stock list */}
        <div
          className={`flex flex-col overflow-y-auto border-r border-[#1a1a1a] transition-all duration-200 scrollbar-hide ${
            selectedTicker ? 'w-80 flex-shrink-0' : 'flex-1'
          }`}
        >
          {/* Search bar — always visible at top of list */}
          <div className="px-4 pt-4 pb-3 border-b border-[#1a1a1a] flex-shrink-0">
            <TickerSearch onAdd={handleAdd} />
          </div>

          {stocks.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 py-16 gap-4">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.20)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
                  <polyline points="16 7 22 7 22 13"/>
                </svg>
              </div>
              <div className="text-center px-6">
                <p className="text-white/40 text-sm font-medium">Your watchlist is empty</p>
                <p className="text-white/20 text-xs mt-1">Search above and add stocks to start tracking prices, charts, and news</p>
              </div>
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
        {selectedTicker ? (
          <div className="flex-1 min-w-0 bg-[#080808]">
            <DetailPanel ticker={selectedTicker} />
          </div>
        ) : stocks.length > 0 ? (
          <div className="flex-1 flex items-center justify-center bg-[#080808]">
            <div className="text-center">
              <svg className="mx-auto mb-3" xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
              </svg>
              <p className="text-white/25 text-sm">Select a stock to view details</p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
