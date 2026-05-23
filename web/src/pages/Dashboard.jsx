import Logo from '../components/Logo'
import { useGetFeedQuery } from '../api/feedApi'
import { useGetStockQuery } from '../api/stocksApi'
import NewsCard from '../components/NewsCard'
import MacroCalendar from '../components/MacroCalendar'

const cardStyle = 'bg-[#111] border border-[#1f1f1f] rounded-xl'

const WATCHLIST_TICKERS = ['AAPL', 'MSFT', 'BTC']

function WatchlistItem({ ticker }) {
  const { data, isLoading, isError } = useGetStockQuery(ticker)

  if (isLoading) {
    return (
      <div className="animate-pulse flex items-center justify-between py-3">
        <div className="h-3.5 bg-white/8 rounded w-10" />
        <div className="h-3.5 bg-white/8 rounded w-16" />
        <div className="h-3.5 bg-white/8 rounded w-12" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="flex items-center justify-between py-3 text-sm">
        <span className="font-medium text-white/60">{ticker}</span>
        <span className="text-white/25 text-xs">Unavailable</span>
      </div>
    )
  }

  const changeValue = data.changePercent ?? data.changePercent24h ?? data.change24h ?? 0
  const positive = changeValue >= 0

  return (
    <div className="flex items-center justify-between py-3 border-b border-[#1f1f1f] last:border-0">
      <span className="font-semibold text-white text-sm w-12">{ticker}</span>
      <span className="text-sm text-white/70 font-medium">
        ${(data.price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
      <span className={`text-sm font-medium tabular-nums ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
        {positive ? '+' : ''}{changeValue.toFixed(2)}%
      </span>
    </div>
  )
}

function FeedSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className={`p-4 animate-pulse ${cardStyle}`}>
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
    <div className="flex-1 flex flex-col min-h-0 bg-[#0f0f0f]">

      {/* Mobile header */}
      <header className="flex items-center px-5 py-4 border-b border-[#1f1f1f] md:hidden">
        <Logo />
      </header>

      {/* Desktop header */}
      <header className="hidden md:flex items-center px-6 py-5 border-b border-[#1f1f1f]">
        <div>
          <h1 className="text-lg font-semibold text-white tracking-tight">Dashboard</h1>
          <p className="text-xs text-[#a1a1aa] mt-0.5">Market overview and latest news</p>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto p-5 md:p-6">
        <div className="max-w-screen-xl mx-auto">
          <div className="flex flex-col lg:flex-row gap-5">

            {/* Left: News Feed */}
            <section className="lg:w-2/3">
              <h2 className="text-xs font-semibold text-[#a1a1aa] uppercase tracking-widest mb-4">
                Latest News
              </h2>

              {feedLoading && <FeedSkeleton />}

              {feedError && (
                <div className={`p-5 ${cardStyle}`}>
                  <p className="text-[#a1a1aa] text-sm">
                    Unable to load news feed. Make sure the backend is running on port 3001.
                  </p>
                </div>
              )}

              {!feedLoading && !feedError && items.length === 0 && (
                <div className={`p-5 ${cardStyle}`}>
                  <p className="text-[#a1a1aa] text-sm">No news items available.</p>
                </div>
              )}

              {!feedLoading && !feedError && items.length > 0 && (
                <div className="space-y-3">
                  {items.slice(0, 10).map((item) => (
                    <NewsCard key={item.id} item={item} />
                  ))}
                </div>
              )}
            </section>

            {/* Right: Watchlist + Calendar */}
            <aside className="lg:w-1/3 space-y-4">

              {/* Watchlist */}
              <div className={`p-5 ${cardStyle}`}>
                <h3 className="text-xs font-semibold text-[#a1a1aa] uppercase tracking-widest mb-3">
                  Watchlist
                </h3>
                <div>
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
