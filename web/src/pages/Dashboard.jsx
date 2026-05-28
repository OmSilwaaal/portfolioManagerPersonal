import { useGetFeedQuery } from '../api/feedApi'
import { useGetStockQuery } from '../api/stocksApi'
import NewsCard from '../components/NewsCard'
import MacroCalendar from '../components/MacroCalendar'

const INK   = 'var(--ink-900)'
const INK8  = 'var(--ink-800)'
const CREAM = 'var(--paper)'
const BORDER = 'var(--on-ink-border)'
const MUTED  = 'var(--on-ink-text-3)'
const DIM    = 'var(--on-ink-text-4)'

const MARKET_TICKERS = ['SPY', 'QQQ', 'BTC']
const WATCHLIST_TICKERS = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'BTC']

function useMarketTime() {
  const now = new Date()
  const day = now.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()
  const date = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()
  const hour = now.getHours()
  const isOpen = hour >= 9 && hour < 16 && ![0, 6].includes(now.getDay())
  return { day, date, isOpen }
}

// ── Market stat strip ────────────────────────────────────────────────────────

function MarketStat({ ticker }) {
  const { data, isLoading } = useGetStockQuery(ticker)

  if (isLoading) {
    return (
      <div style={{ flex: 1, padding: '20px 24px', borderRight: `1px solid ${BORDER}` }}>
        <div style={{ height: 10, width: 32, background: 'var(--on-ink-2)', marginBottom: 10 }} />
        <div style={{ height: 28, width: 90, background: 'var(--on-ink-2)', marginBottom: 8 }} />
        <div style={{ height: 10, width: 50, background: 'var(--on-ink-1)' }} />
      </div>
    )
  }

  const price = data?.price ?? 0
  const change = data?.changePercent ?? data?.changePercent24h ?? 0
  const positive = change >= 0

  return (
    <div style={{ flex: 1, padding: '20px 24px', borderRight: `1px solid ${BORDER}` }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: MUTED, marginBottom: 8 }}>
        {ticker}
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'clamp(20px,2.4vw,30px)', letterSpacing: '-0.03em', color: CREAM, lineHeight: 1, marginBottom: 8 }}>
        ${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: positive ? 'var(--positive)' : 'var(--negative)', letterSpacing: '0.04em' }}>
        {positive ? '▲' : '▼'} {Math.abs(change).toFixed(2)}%
      </div>
    </div>
  )
}

// ── Watchlist row ────────────────────────────────────────────────────────────

function WatchlistRow({ ticker }) {
  const { data, isLoading } = useGetStockQuery(ticker)

  if (isLoading) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 80px', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ height: 11, width: 36, background: 'var(--on-ink-2)' }} />
        <div style={{ height: 11, width: 64, background: 'var(--on-ink-1)' }} />
        <div style={{ height: 11, width: 44, background: 'var(--on-ink-1)', marginLeft: 'auto' }} />
      </div>
    )
  }

  const price = data?.price ?? 0
  const change = data?.changePercent ?? data?.changePercent24h ?? 0
  const positive = change >= 0

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 80px', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${BORDER}` }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, letterSpacing: '0.10em', color: CREAM }}>
        {ticker}
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--on-ink-text-2)' }}>
        ${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: positive ? 'var(--positive)' : 'var(--negative)', textAlign: 'right', letterSpacing: '0.04em' }}>
        {positive ? '+' : ''}{change.toFixed(2)}%
      </span>
    </div>
  )
}

// ── Feed skeleton ────────────────────────────────────────────────────────────

function FeedSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} style={{ borderTop: `1px solid ${BORDER}`, padding: '20px 0' }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'center' }}>
            <div style={{ height: 8, width: 40, background: 'var(--on-ink-2)' }} />
            <div style={{ height: 8, width: 24, background: 'var(--on-ink-1)' }} />
          </div>
          <div style={{ height: 16, width: '78%', background: 'var(--on-ink-2)', marginBottom: 8 }} />
          <div style={{ height: 16, width: '55%', background: 'var(--on-ink-1)' }} />
        </div>
      ))}
    </div>
  )
}

// ── Main dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const { data: feedData, isLoading: feedLoading, isError: feedError } = useGetFeedQuery()
  const items = feedData?.items || []
  const { day, date, isOpen } = useMarketTime()

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: INK }}>

      {/* ── Header ── */}
      <header style={{ borderBottom: `1px solid ${BORDER}`, padding: '0 clamp(20px,3vw,40px)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 52 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.24em', textTransform: 'uppercase', color: DIM }}>
              § 01
            </span>
            <span style={{ width: 1, height: 14, background: BORDER, display: 'inline-block' }} />
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, letterSpacing: '-0.02em', color: CREAM, margin: 0 }}>
              Market Overview
            </h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.16em', color: DIM }}>
              {day} · {date}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: isOpen ? 'var(--positive)' : 'var(--on-ink-text-4)', display: 'inline-block' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em', color: isOpen ? 'var(--positive)' : DIM }}>
                {isOpen ? 'OPEN' : 'CLOSED'}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* ── Market stat strip ── */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${BORDER}`, flexShrink: 0, overflowX: 'auto' }}>
        {MARKET_TICKERS.map((t, i) => (
          <div key={t} style={{ flex: 1, minWidth: 120, borderRight: i < MARKET_TICKERS.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
            <MarketStat ticker={t} />
          </div>
        ))}
        {/* Vol. tag */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 4, minWidth: 100 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: DIM }}>Vol.</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em', color: DIM }}>01 · 2026</span>
        </div>
      </div>

      {/* ── Body grid ── */}
      <main style={{ flex: 1, overflowY: 'auto', padding: 'clamp(20px,3vw,40px)' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 0 }}>

          {/* ── Left: News feed ── */}
          <section style={{ borderRight: `1px solid ${BORDER}`, paddingRight: 'clamp(20px,3vw,40px)' }}>

            {/* Section label */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 16, borderBottom: `1px solid ${BORDER}`, marginBottom: 0 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.24em', textTransform: 'uppercase', color: MUTED }}>
                Latest Intelligence
              </span>
              {items.length > 0 && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: DIM, letterSpacing: '0.12em' }}>
                  {Math.min(items.length, 12)} ITEMS
                </span>
              )}
            </div>

            {feedLoading && <FeedSkeleton />}

            {feedError && (
              <div style={{ borderTop: `1px solid ${BORDER}`, padding: '24px 0' }}>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: MUTED, letterSpacing: '0.06em', margin: 0 }}>
                  — FEED UNAVAILABLE. CHECK BACKEND CONNECTION.
                </p>
              </div>
            )}

            {!feedLoading && !feedError && items.length === 0 && (
              <div style={{ borderTop: `1px solid ${BORDER}`, padding: '24px 0' }}>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: MUTED, letterSpacing: '0.06em', margin: 0 }}>
                  — NO ITEMS AVAILABLE.
                </p>
              </div>
            )}

            {!feedLoading && !feedError && items.length > 0 && (
              <div>
                {items.slice(0, 12).map((item) => (
                  <NewsCard key={item.id} item={item} />
                ))}
              </div>
            )}
          </section>

          {/* ── Right sidebar ── */}
          <aside style={{ paddingLeft: 'clamp(20px,3vw,32px)', display: 'flex', flexDirection: 'column', gap: 0 }}>

            {/* Watchlist */}
            <div style={{ paddingBottom: 32, borderBottom: `1px solid ${BORDER}`, marginBottom: 32 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 14, borderBottom: `1px solid ${BORDER}`, marginBottom: 4 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.24em', textTransform: 'uppercase', color: MUTED }}>
                  Watchlist
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--positive)', letterSpacing: '0.14em' }}>
                  ● LIVE
                </span>
              </div>
              {WATCHLIST_TICKERS.map((t) => (
                <WatchlistRow key={t} ticker={t} />
              ))}
            </div>

            {/* Macro calendar */}
            <div>
              <div style={{ paddingBottom: 14, borderBottom: `1px solid ${BORDER}`, marginBottom: 4 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.24em', textTransform: 'uppercase', color: MUTED }}>
                  Upcoming Events
                </span>
              </div>
              <MacroCalendar compact />
            </div>

          </aside>
        </div>
      </main>
    </div>
  )
}
