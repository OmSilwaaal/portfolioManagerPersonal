import { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { addStock, removeStock, setSelectedTicker } from '../store/watchlistSlice'
import { useGetStockQuery } from '../api/stocksApi'
import NewsCard from '../components/NewsCard'
import StockChart from '../components/StockChart'
import ProGate from '../components/ProGate'

function StockRow({ ticker, isSelected, onClick }) {
  const { data, isLoading, isError } = useGetStockQuery(ticker)
  const dispatch = useDispatch()

  const handleRemove = (e) => {
    e.stopPropagation()
    dispatch(removeStock(ticker))
  }

  if (isLoading) {
    return (
      <tr className="animate-pulse">
        <td className="py-3 px-4"><div className="h-4 bg-[#1f1f1f] rounded w-12" /></td>
        <td className="py-3 px-4"><div className="h-4 bg-[#1f1f1f] rounded w-20" /></td>
        <td className="py-3 px-4"><div className="h-4 bg-[#1f1f1f] rounded w-16" /></td>
        <td className="py-3 px-4"><div className="h-4 bg-[#1f1f1f] rounded w-24" /></td>
        <td className="py-3 px-4" />
      </tr>
    )
  }

  const price = data?.price || 0
  const changePercent = data?.changePercent || 0
  const positive = changePercent >= 0

  return (
    <>
      <tr
        className={`cursor-pointer transition-colors hover:bg-[#141414] dark:hover:bg-[#141414] ${
          isSelected ? 'bg-[#141414] dark:bg-[#141414]' : ''
        }`}
        onClick={onClick}
      >
        <td className="py-3 px-4">
          <span className="font-medium text-white dark:text-white text-[#0f0f0f] text-sm">
            {ticker}
          </span>
          {data?.name && (
            <span className="ml-2 text-xs text-[#6b7280] hidden sm:inline">
              {data.name}
            </span>
          )}
        </td>
        <td className="py-3 px-4 text-sm text-white dark:text-white text-[#0f0f0f]">
          {isError ? (
            <span className="text-[#6b7280]">—</span>
          ) : (
            `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          )}
        </td>
        <td className="py-3 px-4">
          {isError ? (
            <span className="text-[#6b7280] text-sm">—</span>
          ) : (
            <span className={`text-sm ${positive ? 'text-green-400' : 'text-red-500'}`}>
              {positive ? '+' : ''}{changePercent.toFixed(2)}%
            </span>
          )}
        </td>
        <td className="py-3 px-4">
          {/* Sparkline — small inline chart indicator */}
          <div className="flex items-center gap-1">
            <div
              className={`h-6 w-16 flex items-end gap-px`}
              aria-hidden="true"
            >
              {Array.from({ length: 7 }).map((_, i) => {
                const h = 40 + Math.sin(i + (price % 5)) * 30 + Math.random() * 20
                return (
                  <div
                    key={i}
                    className={`flex-1 rounded-sm ${positive ? 'bg-green-400' : 'bg-red-500'} opacity-60`}
                    style={{ height: `${Math.max(20, Math.min(90, h))}%` }}
                  />
                )
              })}
            </div>
          </div>
        </td>
        <td className="py-3 px-4">
          <button
            onClick={handleRemove}
            className="text-[#6b7280] hover:text-red-500 transition-colors text-sm"
            title={`Remove ${ticker}`}
          >
            ×
          </button>
        </td>
      </tr>

      {/* Expanded inline chart + news */}
      {isSelected && (
        <tr>
          <td colSpan={5} className="px-4 pb-4 bg-[#0a0a0a] dark:bg-[#0a0a0a]">
            <ProGate label="Full charts & AI news">
              <div className="pt-4 space-y-4">
                <StockChart basePrice={price} />
                {data?.news && data.news.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-[#a1a1aa]">
                      Recent News for {ticker}
                    </h4>
                    {data.news.slice(0, 3).map((item) => (
                      <NewsCard key={item.id} item={item} />
                    ))}
                  </div>
                )}
              </div>
            </ProGate>
          </td>
        </tr>
      )}
    </>
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
    }
  }

  const handleRowClick = (ticker) => {
    dispatch(setSelectedTicker(selectedTicker === ticker ? null : ticker))
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-[#1f1f1f] dark:border-[#1f1f1f] border-[#e5e7eb]">
        <div>
          <h1 className="text-xl font-semibold text-white dark:text-white text-[#0f0f0f]">Stocks</h1>
          <p className="text-sm text-[#a1a1aa]">Track your stock watchlist</p>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-screen-xl mx-auto space-y-6">
          {/* Add ticker form */}
          <form onSubmit={handleAddTicker} className="flex gap-3">
            <input
              type="text"
              value={newTicker}
              onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
              placeholder="Add ticker (e.g. TSLA)"
              maxLength={10}
              className="flex-1 max-w-xs px-3 py-2 text-sm bg-[#141414] dark:bg-[#141414] bg-[#f9f9f9] text-white dark:text-white text-[#0f0f0f] placeholder-[#6b7280] border border-[#1f1f1f] dark:border-[#1f1f1f] border-[#e5e7eb] rounded-md focus:outline-none focus:ring-1 focus:ring-[#3b82f6]"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-[#3b82f6] text-white text-sm font-medium rounded-md hover:bg-blue-500 transition-colors"
            >
              Add
            </button>
          </form>

          {/* Watchlist table */}
          <div className="bg-surface dark:bg-surface bg-[#f9f9f9] border border-border-subtle dark:border-border-subtle border-[#e5e7eb] rounded-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#1f1f1f] dark:border-[#1f1f1f] border-[#e5e7eb]">
                    <th className="py-3 px-4 text-left text-xs font-medium text-[#a1a1aa] uppercase tracking-wider">
                      Ticker
                    </th>
                    <th className="py-3 px-4 text-left text-xs font-medium text-[#a1a1aa] uppercase tracking-wider">
                      Price
                    </th>
                    <th className="py-3 px-4 text-left text-xs font-medium text-[#a1a1aa] uppercase tracking-wider">
                      Change
                    </th>
                    <th className="py-3 px-4 text-left text-xs font-medium text-[#a1a1aa] uppercase tracking-wider">
                      7d Chart
                    </th>
                    <th className="py-3 px-4" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1f1f1f] dark:divide-[#1f1f1f] divide-[#e5e7eb]">
                  {stocks.map((ticker) => (
                    <StockRow
                      key={ticker}
                      ticker={ticker}
                      isSelected={selectedTicker === ticker}
                      onClick={() => handleRowClick(ticker)}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {stocks.length === 0 && (
              <div className="py-10 text-center text-[#a1a1aa] text-sm">
                No stocks in your watchlist. Add one above.
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
