import { useGetFeedQuery } from '../api/feedApi'
import { useGetStockQuery } from '../api/stocksApi'
import NewsCard from '../components/NewsCard'
import MacroCalendar from '../components/MacroCalendar'
import ThemeToggle from '../components/ThemeToggle'

const WATCHLIST_TICKERS = ['AAPL', 'MSFT', 'BTC']

function WatchlistItem({ ticker }) {
  const { data, isLoading, isError } = useGetStockQuery(ticker)

  if (isLoading) {
    return (
      <div className="animate-pulse flex items-center justify-between py-2">
        <div className="h-4 bg-[#1f1f1f] rounded w-12" />
        <div className="h-4 bg-[#1f1f1f] rounded w-16" />
        <div className="h-4 bg-[#1f1f1f] rounded w-12" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="flex items-center justify-between py-2 text-sm">
        <span className="font-medium text-white dark:text-white text-[#0f0f0f]">{ticker}</span>
        <span className="text-[#6b7280] text-xs">Unavailable</span>
      </div>
    )
  }

  const changePositive = (data.changePercent || data.change24h || 0) >= 0

  return (
    <div className="flex items-center justify-between py-2 border-b border-[#1f1f1f] dark:border-[#1f1f1f] border-[#e5e7eb] last:border-0">
      <span className="font-medium text-white dark:text-white text-[#0f0f0f] text-sm">
        {ticker}
      </span>
      <span className="text-sm font-medium text-white dark:text-white text-[#0f0f0f]">
        ${(data.price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
      <span className={`text-sm ${changePositive ? 'text-green-400' : 'text-red-500'}`}>
        {changePositive ? '+' : ''}
        {((data.changePercent || data.changePercent24h || 0)).toFixed(2)}%
      </span>
    </div>
  )
}

function FeedSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="p-4 bg-surface dark:bg-surface bg-[#f9f9f9] border border-border-subtle dark:border-border-subtle border-[#e5e7eb] rounded-md animate-pulse"
        >
          <div className="h-4 bg-[#1f1f1f] rounded w-3/4 mb-2" />
          <div className="h-3 bg-[#1f1f1f] rounded w-1/4 mb-3" />
          <div className="h-3 bg-[#1f1f1f] rounded w-full mb-1" />
          <div className="h-3 bg-[#1f1f1f] rounded w-5/6" />
        </div>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const { data: feedData, isLoading: feedLoading, isError: feedError } = useGetFeedQuery()

  const items = feedData?.items || []

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-[#1f1f1f] dark:border-[#1f1f1f] border-[#e5e7eb] md:hidden">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-[#3b82f6] rounded-md flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
            </svg>
          </div>
          <span className="font-semibold text-white dark:text-white text-[#0f0f0f]">MarketIQ</span>
        </div>
        <ThemeToggle />
      </header>

      {/* Desktop header */}
      <header className="hidden md:flex items-center justify-between px-6 py-4 border-b border-[#1f1f1f] dark:border-[#1f1f1f] border-[#e5e7eb]">
        <div>
          <h1 className="text-xl font-semibold text-white dark:text-white text-[#0f0f0f]">Dashboard</h1>
          <p className="text-sm text-[#a1a1aa]">Market overview and latest news</p>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-screen-xl mx-auto">
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Left: News Feed (2/3) */}
            <section className="lg:w-2/3">
              <h2 className="text-base font-semibold text-white dark:text-white text-[#0f0f0f] mb-4">
                Latest News
              </h2>

              {feedLoading && <FeedSkeleton />}

              {feedError && (
                <div className="p-4 bg-surface dark:bg-surface bg-[#f9f9f9] border border-border-subtle dark:border-border-subtle border-[#e5e7eb] rounded-md">
                  <p className="text-[#a1a1aa] text-sm">
                    Unable to load news feed. Make sure the backend is running on port 3001.
                  </p>
                </div>
              )}

              {!feedLoading && !feedError && items.length === 0 && (
                <div className="p-4 bg-surface dark:bg-surface bg-[#f9f9f9] border border-border-subtle dark:border-border-subtle border-[#e5e7eb] rounded-md">
                  <p className="text-[#a1a1aa] text-sm">No news items available.</p>
                </div>
              )}

              {!feedLoading && !feedError && items.length > 0 && (
                <div className="space-y-4">
                  {items.slice(0, 10).map((item) => (
                    <NewsCard key={item.id} item={item} />
                  ))}
                </div>
              )}
            </section>

            {/* Right: Calendar + Watchlist (1/3) */}
            <aside className="lg:w-1/3 space-y-4">
              {/* Watchlist summary */}
              <div className="p-4 bg-surface dark:bg-surface bg-[#f9f9f9] border border-border-subtle dark:border-border-subtle border-[#e5e7eb] rounded-md">
                <h3 className="text-sm font-semibold text-white dark:text-white text-[#0f0f0f] mb-3">
                  Watchlist
                </h3>
                <div className="divide-y divide-[#1f1f1f] dark:divide-[#1f1f1f] divide-[#e5e7eb]">
                  {WATCHLIST_TICKERS.map((ticker) => (
                    <WatchlistItem key={ticker} ticker={ticker} />
                  ))}
                </div>
              </div>

              {/* Macro Calendar */}
              <MacroCalendar />
            </aside>
          </div>
        </div>
      </main>
    </div>
  )
}
