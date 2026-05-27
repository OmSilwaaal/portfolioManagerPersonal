import { useGetFeedQuery } from '../api/feedApi'
import { useGetStockQuery } from '../api/stocksApi'
import NewsCard from '../components/NewsCard'
import MacroCalendar from '../components/MacroCalendar'

const INK  = 'var(--ink-900)'
const INK8 = 'var(--ink-800)'
const CREAM = 'var(--paper)'
const BORDER = 'var(--on-ink-border)'
const MUTED = 'var(--on-ink-text-3)'
const DIM   = 'var(--on-ink-text-4)'

const WATCHLIST_TICKERS = ['AAPL', 'MSFT', 'BTC']

function WatchlistItem({ ticker }) {
  const { data, isLoading, isError } = useGetStockQuery(ticker)

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ width: 36, height: 11, background: 'var(--on-ink-2)', borderRadius: 1 }} />
        <div style={{ width: 56, height: 11, background: 'var(--on-ink-2)', borderRadius: 1 }} />
        <div style={{ width: 44, height: 11, background: 'var(--on-ink-2)', borderRadius: 1 }} />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderBottom: `1px solid ${BORDER}` }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: MUTED }}>{ticker}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: DIM }}>—</span>
      </div>
    )
  }

  const changeValue = data.changePercent ?? data.changePercent24h ?? data.change24h ?? 0
  const positive = changeValue >= 0

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderBottom: `1px solid ${BORDER}` }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: CREAM, letterSpacing: '0.04em', width: 44 }}>{ticker}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--on-ink-text-2)' }}>
        ${(data.price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: positive ? 'var(--positive)' : 'var(--negative)', minWidth: 52, textAlign: 'right' }}>
        {positive ? '+' : ''}{changeValue.toFixed(2)}%
      </span>
    </div>
  )
}

function FeedSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} style={{ background: INK8, border: `1px solid ${BORDER}`, borderRadius: 'var(--r-md)', padding: '18px 20px' }}>
          <div style={{ height: 10, background: 'var(--on-ink-2)', borderRadius: 1, width: '60%', marginBottom: 10 }} />
          <div style={{ height: 14, background: 'var(--on-ink-2)', borderRadius: 1, width: '85%', marginBottom: 6 }} />
          <div style={{ height: 14, background: 'var(--on-ink-1)', borderRadius: 1, width: '70%', marginBottom: 14 }} />
          <div style={{ height: 10, background: 'var(--on-ink-1)', borderRadius: 1, width: '30%' }} />
        </div>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const { data: feedData, isLoading: feedLoading, isError: feedError } = useGetFeedQuery()
  const items = feedData?.items || []

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: INK }}>

      {/* Header */}
      <header className="flex items-center justify-between px-5 py-4 sm:px-10 sm:py-5 flex-shrink-0" style={{ borderBottom: `1px solid ${BORDER}` }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-sans)', fontSize: 18, fontWeight: 600, letterSpacing: '-0.022em', color: CREAM, margin: 0 }}>Dashboard</h1>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.24em', textTransform: 'uppercase', color: MUTED, marginTop: 4, display: 'block' }}>Market overview · latest news</span>
        </div>
        <div className="hidden sm:flex items-center gap-3">
          <div style={{ position: 'relative', background: INK8, border: `1px solid ${BORDER}`, borderRadius: 'var(--r-sm)', padding: '7px 12px 7px 32px', width: 220 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ position: 'absolute', left: 10, top: 9, color: MUTED }}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input placeholder="Search tickers, news…" style={{ background: 'transparent', border: 0, outline: 'none', width: '100%', fontFamily: 'var(--font-sans)', fontSize: 12, color: CREAM }} />
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-10 sm:py-8">
        <div className="max-w-[1200px] mx-auto grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 lg:gap-8 items-start">

          {/* Left: News Feed */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 500, letterSpacing: '0.24em', textTransform: 'uppercase', color: MUTED }}>Latest News</span>
              {items.length > 0 && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: DIM, letterSpacing: '0.1em' }}>{Math.min(items.length, 10)} items</span>}
            </div>

            {feedLoading && <FeedSkeleton />}

            {feedError && (
              <div style={{ background: INK8, border: `1px solid ${BORDER}`, borderRadius: 'var(--r-md)', padding: '22px 24px' }}>
                <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: MUTED, margin: 0 }}>
                  Unable to load news feed. Make sure the backend is running on port 3001.
                </p>
              </div>
            )}

            {!feedLoading && !feedError && items.length === 0 && (
              <div style={{ background: INK8, border: `1px solid ${BORDER}`, borderRadius: 'var(--r-md)', padding: '22px 24px' }}>
                <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: MUTED, margin: 0 }}>No news items available.</p>
              </div>
            )}

            {!feedLoading && !feedError && items.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {items.slice(0, 10).map((item) => (
                  <NewsCard key={item.id} item={item} />
                ))}
              </div>
            )}
          </section>

          {/* Right: Watchlist + Calendar */}
          <aside style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* Watchlist */}
            <div style={{ background: INK8, border: `1px solid ${BORDER}`, borderRadius: 'var(--r-md)', padding: '20px 22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 500, letterSpacing: '0.24em', textTransform: 'uppercase', color: MUTED }}>Watchlist</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: DIM, letterSpacing: '0.1em' }}>Live</span>
              </div>
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
      </main>
    </div>
  )
}
