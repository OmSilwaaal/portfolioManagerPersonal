import { useGetFeedQuery } from '../api/feedApi'
import { useGetStockQuery } from '../api/stocksApi'
import NewsCard from '../components/NewsCard'
import MacroCalendar from '../components/MacroCalendar'

/* ─── Shared glass style (mirrors Landing.jsx) ───────────────────────────── */
const glassStyle = {
  background: 'linear-gradient(145deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 50%, rgba(255,255,255,0.06) 100%)',
  backdropFilter: 'blur(24px) saturate(180%)',
  WebkitBackdropFilter: 'blur(24px) saturate(180%)',
  border: '1px solid rgba(255,255,255,0.10)',
  boxShadow: [
    '0 8px 32px rgba(0,0,0,0.4)',
    'inset 0 1px 0 rgba(255,255,255,0.14)',
    'inset 0 -1px 0 rgba(255,255,255,0.04)',
  ].join(', '),
}

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
    <div className="flex items-center justify-between py-3 border-b last:border-0" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
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
        <div key={i} className="p-4 rounded-xl animate-pulse" style={glassStyle}>
          <div className="h-4 bg-white/8 rounded w-3/4 mb-2" />
          <div className="h-3 bg-white/8 rounded w-1/4 mb-3" />
          <div className="h-3 bg-white/8 rounded w-full mb-1" />
          <div className="h-3 bg-white/8 rounded w-5/6" />
        </div>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const { data: feedData, isLoading: feedLoading, isError: feedError } = useGetFeedQuery()
  const items = feedData?.items || []

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0a0a0a]">

      {/* Mobile header */}
      <header className="flex items-center px-5 py-4 border-b md:hidden" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-white rounded-md flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0a0a0a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
            </svg>
          </div>
          <span className="font-semibold text-white text-base tracking-tight">MarketIQ</span>
        </div>
      </header>

      {/* Desktop header */}
      <header className="hidden md:flex items-center px-6 py-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <div>
          <h1 className="text-lg font-semibold text-white tracking-tight">Dashboard</h1>
          <p className="text-xs text-white/30 mt-0.5">Market overview and latest news</p>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto p-5 md:p-6">
        <div className="max-w-screen-xl mx-auto">
          <div className="flex flex-col lg:flex-row gap-5">

            {/* Left: News Feed */}
            <section className="lg:w-2/3">
              <h2 className="text-sm font-semibold text-white/50 uppercase tracking-widest mb-4">
                Latest News
              </h2>

              {feedLoading && <FeedSkeleton />}

              {feedError && (
                <div className="p-5 rounded-xl" style={glassStyle}>
                  <p className="text-white/40 text-sm">
                    Unable to load news feed. Make sure the backend is running on port 3001.
                  </p>
                </div>
              )}

              {!feedLoading && !feedError && items.length === 0 && (
                <div className="p-5 rounded-xl" style={glassStyle}>
                  <p className="text-white/40 text-sm">No news items available.</p>
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
              <div className="rounded-2xl p-5 relative overflow-hidden" style={glassStyle}>
                {/* Specular top edge */}
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent pointer-events-none" />
                <h3 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-1">
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
