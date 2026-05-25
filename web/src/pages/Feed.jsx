import { useSelector, useDispatch } from 'react-redux'
import { setFeedFilter, setFeedSubFilter } from '../store/feedSlice'
import { useAuth } from '../contexts/AuthContext'
import FilterBar from '../components/feed/FilterBar'
import FeedCard from '../components/feed/FeedCard'
import WhyMovingCard from '../components/WhyMovingCard'
import { useGetGovTradesQuery } from '../api/govTradesApi'
import { useGetCommoditiesQuery } from '../api/commoditiesApi'
import { useGetFeedQuery, useGetFeedBriefQuery } from '../api/feedApi'
import { useGetStockQuery } from '../api/stocksApi'
import { usePersonalizedFeed } from '../hooks/usePersonalizedFeed'
import ProGate from '../components/ProGate'

const INK8   = 'var(--ink-800)'
const BORDER = 'var(--on-ink-border)'
const CREAM  = 'var(--paper)'
const MUTED  = 'var(--on-ink-text-3)'
const DIM    = 'var(--on-ink-text-4)'

const BULLET_COLORS = {
  'Watch:':       'var(--ochre-300)',
  'Risk:':        'var(--clay-300)',
  'Opportunity:': 'var(--positive)',
  'Trend:':       '#5b7fbb',
}

function WatchlistMover({ ticker }) {
  const { data, isLoading } = useGetStockQuery(ticker)
  if (isLoading || !data) return null
  const changePercent = data.changePercent ?? data.change_percent ?? data.regularMarketChangePercent ?? 0
  if (Math.abs(changePercent) < 2) return null
  const price = data.price ?? data.regularMarketPrice ?? 0
  return <WhyMovingCard ticker={ticker} price={price} changePercent={changePercent} />
}

function SkeletonCard() {
  return (
    <div style={{ background: INK8, border: `1px solid ${BORDER}`, borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ height: 18, width: 56, background: 'var(--on-ink-2)', borderRadius: 'var(--r-sm)' }} />
        <div style={{ height: 14, width: 36, background: 'var(--on-ink-2)', borderRadius: 'var(--r-sm)' }} />
      </div>
      <div style={{ padding: '0 20px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ height: 13, background: 'var(--on-ink-2)', borderRadius: 1, width: '100%' }} />
        <div style={{ height: 13, background: 'var(--on-ink-2)', borderRadius: 1, width: '80%' }} />
        <div style={{ height: 11, background: 'var(--on-ink-1)', borderRadius: 1, width: '100%', marginTop: 6 }} />
        <div style={{ height: 11, background: 'var(--on-ink-1)', borderRadius: 1, width: '65%' }} />
      </div>
      <div style={{ padding: '10px 20px', borderTop: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ height: 10, width: 56, background: 'var(--on-ink-2)', borderRadius: 1 }} />
        <div style={{ height: 10, width: 80, background: 'var(--on-ink-2)', borderRadius: 1 }} />
      </div>
    </div>
  )
}

function BriefSkeleton() {
  return (
    <div style={{ background: INK8, border: `1px solid ${BORDER}`, borderRadius: 'var(--r-md)', padding: '20px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--on-ink-3)' }} />
        <div style={{ height: 10, width: 80, background: 'var(--on-ink-2)', borderRadius: 1 }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
        <div style={{ height: 11, background: 'var(--on-ink-1)', borderRadius: 1, width: '100%' }} />
        <div style={{ height: 11, background: 'var(--on-ink-1)', borderRadius: 1, width: '83%' }} />
        <div style={{ height: 11, background: 'var(--on-ink-1)', borderRadius: 1, width: '67%' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {[...Array(4)].map((_, i) => (
          <div key={i} style={{ height: 11, background: 'var(--on-ink-1)', borderRadius: 1, width: '100%' }} />
        ))}
      </div>
    </div>
  )
}

function BriefCard({ brief, bullets }) {
  const bulletColor = (bullet) => {
    const key = Object.keys(BULLET_COLORS).find((k) => bullet.startsWith(k))
    return key ? BULLET_COLORS[key] : MUTED
  }

  return (
    <div style={{ background: INK8, border: `1px solid ${BORDER}`, borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 22px 6px' }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--on-ink-text-3)', flexShrink: 0, display: 'inline-block' }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 500, letterSpacing: '0.24em', textTransform: 'uppercase', color: MUTED }}>Weekly Brief</span>
      </div>
      <div style={{ padding: '0 22px 18px' }}>
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13, lineHeight: 1.6, color: 'var(--on-ink-text-2)', marginBottom: 14 }}>{brief}</p>
        {bullets && bullets.length > 0 && (
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: 0, padding: 0, listStyle: 'none' }}>
            {bullets.map((b, i) => {
              const colonIdx = b.indexOf(':')
              const prefix = colonIdx > -1 ? b.slice(0, colonIdx + 1) : null
              const rest = colonIdx > -1 ? b.slice(colonIdx + 1) : b
              return (
                <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  {prefix && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, flexShrink: 0, color: bulletColor(b) }}>{prefix}</span>}
                  <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: MUTED }}>{rest.trim()}</span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

function weekLabel() {
  const now = new Date()
  const startOfWeek = new Date(now)
  startOfWeek.setDate(now.getDate() - now.getDay())
  const endOfWeek = new Date(startOfWeek)
  endOfWeek.setDate(startOfWeek.getDate() + 6)
  const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${fmt(startOfWeek)} – ${fmt(endOfWeek)}`
}

const FREE_ITEM_LIMIT = 5

export default function Feed() {
  const dispatch = useDispatch()
  const { activeFilter, subFilter } = useSelector((state) => state.feed)
  const preferences = useSelector((state) => state.preferences)
  const isPro = useSelector((state) => state.preferences.isPro)
  const watchlist = useSelector((state) => state.watchlist?.stocks || [])
  const { user } = useAuth()
  const firstName = (
    user?.user_metadata?.full_name ??
    user?.user_metadata?.name ??
    user?.user_metadata?.display_name ??
    ''
  ).split(' ')[0]
  const watchedCategories = preferences.watchedCategories || []

  const { data: feedData, isLoading: feedLoading } = useGetFeedQuery()
  const { data: govData, isLoading: govLoading } = useGetGovTradesQuery({ days: '30', limit: '20' })
  const { data: commoditiesData, isLoading: commoditiesLoading } = useGetCommoditiesQuery()
  const { data: briefData, isLoading: briefLoading } = useGetFeedBriefQuery()

  const rawFeedItems = feedData?.items || feedData?.news || feedData?.articles || []
  const rawGovTrades = govData?.trades || []
  const rawCommodities = commoditiesData?.commodities || []

  const feedItems = usePersonalizedFeed(rawFeedItems, rawGovTrades, rawCommodities)
  const isLoading = feedLoading || govLoading || commoditiesLoading

  const subFilterChips = (() => {
    if (activeFilter === 'stocks') {
      return watchlist.map((t) => t.toUpperCase())
    }
    if (activeFilter === 'commodities') {
      return rawCommodities.map((c) => c.symbol).filter(Boolean)
    }
    if (activeFilter === 'gov-trades') {
      const seen = new Set()
      return rawGovTrades
        .map((t) => t.ticker)
        .filter((t) => {
          if (!t || seen.has(t)) return false
          seen.add(t)
          return true
        })
    }
    if (activeFilter === 'crypto') {
      const seen = new Set()
      return rawFeedItems
        .filter((item) => {
          const t = (item._feedType || item.type || '').toLowerCase()
          return t === 'crypto'
        })
        .map((item) => (item.ticker || item.data?.ticker || item.symbol || item.data?.symbol || '').toUpperCase())
        .filter((t) => {
          if (!t || seen.has(t)) return false
          seen.add(t)
          return true
        })
    }
    return []
  })()

  const baseFiltered =
    activeFilter === 'all'
      ? feedItems
      : feedItems.filter((item) => {
          const t = (item._feedType || item.type || '').toLowerCase()
          const f = activeFilter.toLowerCase()
          if (f === 'stocks') return t === 'stock' || t === 'stocks'
          if (f === 'crypto') return t === 'crypto'
          if (f === 'commodities') return t === 'commodity' || t === 'commodities'
          if (f === 'gov-trades') return t === 'gov-trade' || t === 'gov-trades'
          if (f === 'macro') return t === 'macro'
          return true
        })

  const filtered = baseFiltered.filter(
    (item) =>
      !subFilter ||
      (item.ticker || item.data?.ticker || item.data?.symbol || '')
        .toUpperCase() === subFilter.toUpperCase()
  )

  const noCategories = watchedCategories.length === 0

  return (
    <main style={{ flex: 1, padding: '32px 40px', maxWidth: 960, margin: '0 auto', width: '100%' }}>

      {/* Personalized header */}
      <div style={{ marginBottom: 28 }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 500, letterSpacing: '0.24em', textTransform: 'uppercase', color: MUTED, marginBottom: 6 }}>
          Week of {weekLabel()}
        </p>
        <h1 style={{ fontFamily: 'var(--font-sans)', fontSize: 22, fontWeight: 600, letterSpacing: '-0.022em', color: CREAM, margin: 0, lineHeight: 1.25 }}>
          {firstName ? `Hello ${firstName},` : 'Hello,'} here&apos;s your brief
        </h1>
      </div>

      {/* Weekly AI Brief */}
      <div style={{ marginBottom: 22 }}>
        {briefLoading ? (
          <BriefSkeleton />
        ) : briefData?.brief ? (
          <BriefCard brief={briefData.brief} bullets={briefData.bullets} />
        ) : null}
      </div>

      {/* Watchlist movers */}
      {watchlist.length > 0 && (
        <div style={{ marginBottom: 22, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {watchlist.slice(0, 6).map((ticker) => (
            <WatchlistMover key={ticker} ticker={ticker.toUpperCase()} />
          ))}
        </div>
      )}

      {/* Filter bar */}
      <div style={{ marginBottom: 6 }}>
        <FilterBar activeFilter={activeFilter} onChange={(f) => dispatch(setFeedFilter(f))} />
      </div>

      {/* Sub-filter chips */}
      {activeFilter !== 'all' && subFilterChips.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14, marginTop: 8 }}>
          {subFilterChips.map((chip) => {
            const isActive = subFilter === chip
            return (
              <button
                key={chip}
                onClick={() => dispatch(setFeedSubFilter(isActive ? null : chip))}
                style={{
                  padding: '4px 10px',
                  borderRadius: 'var(--r-pill)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  border: `1px solid ${isActive ? 'var(--on-ink-text-2)' : BORDER}`,
                  background: isActive ? 'var(--on-ink-2)' : 'transparent',
                  color: isActive ? CREAM : MUTED,
                  cursor: 'pointer',
                  transition: 'all 150ms',
                }}
              >
                {chip}
              </button>
            )
          })}
        </div>
      )}

      {/* Section label */}
      <div style={{ marginBottom: 12 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 500, letterSpacing: '0.24em', textTransform: 'uppercase', color: DIM }}>Today</span>
      </div>

      {noCategories && !isLoading && (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: MUTED }}>Update your preferences to see your feed</p>
          <a href="/settings" style={{ marginTop: 12, display: 'inline-block', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--moss-200)', letterSpacing: '0.08em' }}>
            Go to Settings
          </a>
        </div>
      )}

      {isLoading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          {[...Array(5)].map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {!isLoading && !noCategories && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: MUTED }}>No items match the selected filter.</p>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          {filtered.slice(0, isPro ? filtered.length : FREE_ITEM_LIMIT).map((item, idx) => (
            <div
              key={item.id || `feed-${idx}`}
              style={item.urgency === 'Act Now' ? { gridColumn: '1 / -1' } : {}}
            >
              <FeedCard
                type={item._feedType || item.type || 'stock'}
                data={item.data || item}
                urgency={item.urgency}
                index={idx}
              />
            </div>
          ))}
          {!isPro && filtered.length > FREE_ITEM_LIMIT && (
            <div style={{ gridColumn: '1 / -1' }}>
              <ProGate label="Unlock full feed">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                  {filtered.slice(FREE_ITEM_LIMIT, FREE_ITEM_LIMIT + 3).map((item, idx) => (
                    <FeedCard
                      key={`locked-${idx}`}
                      type={item._feedType || item.type || 'stock'}
                      data={item.data || item}
                      urgency={item.urgency}
                      index={FREE_ITEM_LIMIT + idx}
                    />
                  ))}
                </div>
              </ProGate>
            </div>
          )}
        </div>
      )}
    </main>
  )
}
