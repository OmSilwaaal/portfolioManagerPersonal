import { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { addStock, removeStock, setSelectedTicker } from '../store/watchlistSlice'
import { useGetStockQuery } from '../api/stocksApi'
import NewsCard from '../components/NewsCard'
import TradingViewChart from '../components/TradingViewChart'
import ProGate from '../components/ProGate'
import StockLogo from '../components/StockLogo'

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
      {/* Header */}
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

      {/* Chart */}
      <div className="px-6 py-4">
        <ProGate label="Full charts & AI news">
          <div className="space-y-5">
            <TradingViewChart ticker={ticker} />
            {data?.news && data.news.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-white/30 uppercase tracking-widest mb-3">
                  Latest News
                </p>
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

export default function Stocks() {
  const dispatch = useDispatch()
  const stocks = useSelector((state) => state.watchlist.stocks)
  const selectedTicker = useSelector((state) => state.watchlist.selectedTicker)
  const [newTicker, setNewTicker] = useState('')

  const handleAddTicker = (e) => {
    e.preventDefault()
    const ticker = newTicker.trim().toUpperCase()
    if (ticker) {
      dispatch(addStock(ticker))
      setNewTicker('')
      dispatch(setSelectedTicker(ticker))
    }
  }

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
        <form onSubmit={handleAddTicker} className="flex items-center gap-2">
          <input
            type="text"
            value={newTicker}
            onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
            placeholder="e.g. TSLA"
            maxLength={10}
            className="w-32 px-3 py-2 text-sm bg-[#111] border border-[#222] text-white placeholder-[#4b5563] rounded-lg focus:outline-none focus:border-white/20 transition-colors font-mono uppercase"
          />
          <button
            type="submit"
            className="px-4 py-2 text-sm font-semibold bg-white text-[#0a0a0a] rounded-lg hover:bg-white/90 transition-colors"
          >
            Add
          </button>
        </form>
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
                Add a ticker above to start tracking stocks
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
