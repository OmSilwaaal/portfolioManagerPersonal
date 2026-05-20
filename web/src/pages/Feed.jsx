import { useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { setFeedFilter, setFeedSubFilter } from '../store/feedSlice'
import { useAuth } from '../contexts/AuthContext'
import FilterBar from '../components/feed/FilterBar'
import FeedCard from '../components/feed/FeedCard'
import { useGetGovTradesQuery } from '../api/govTradesApi'
import { useGetCommoditiesQuery } from '../api/commoditiesApi'
import { useGetFeedQuery, useGetFeedBriefQuery } from '../api/feedApi'
import { usePersonalizedFeed } from '../hooks/usePersonalizedFeed'
import ProGate from '../components/ProGate'

function SkeletonCard() {
  return (
    <div className="bg-[#111] border border-[#222] rounded-2xl overflow-hidden animate-pulse">
      <div className="px-5 pt-4 pb-2 flex items-center gap-2">
        <div className="h-5 w-16 bg-[#222] rounded-full" />
        <div className="h-4 w-10 bg-[#222] rounded" />
      </div>
      <div className="px-5 pb-4 space-y-2">
        <div className="h-4 bg-[#222] rounded w-full" />
        <div className="h-4 bg-[#222] rounded w-4/5" />
        <div className="h-3 bg-[#1a1a1a] rounded w-full mt-3" />
        <div className="h-3 bg-[#1a1a1a] rounded w-2/3" />
      </div>
      <div className="px-5 py-3 border-t border-[#1e1e1e] flex justify-between">
        <div className="h-3 w-16 bg-[#222] rounded" />
        <div className="h-3 w-24 bg-[#222] rounded" />
      </div>
    </div>
  )
}

function BriefSkeleton() {
  return (
    <div className="bg-[#111] border border-[#222] rounded-2xl p-5 animate-pulse">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-2 h-2 rounded-full bg-[#333]" />
        <div className="h-3 w-24 bg-[#222] rounded" />
      </div>
      <div className="space-y-2 mb-4">
        <div className="h-3 bg-[#1e1e1e] rounded w-full" />
        <div className="h-3 bg-[#1e1e1e] rounded w-5/6" />
        <div className="h-3 bg-[#1e1e1e] rounded w-4/6" />
      </div>
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-3 bg-[#1e1e1e] rounded w-full" />
        ))}
      </div>
    </div>
  )
}

const BULLET_COLORS = {
  'Watch:': 'text-amber-400',
  'Risk:': 'text-red-400',
  'Opportunity:': 'text-emerald-400',
  'Trend:': 'text-blue-400',
}

function BriefCard({ brief, bullets }) {
  const bulletColor = (bullet) => {
    const key = Object.keys(BULLET_COLORS).find((k) => bullet.startsWith(k))
    return key ? BULLET_COLORS[key] : 'text-white/60'
  }

  return (
    <div className="bg-[#111] border border-[#1e1e1e] rounded-2xl overflow-hidden">
      <div className="flex items-center gap-2 px-5 pt-4 pb-1">
        <span className="w-1.5 h-1.5 rounded-full bg-white/30" />
        <span className="text-[11px] font-semibold text-white/40 uppercase tracking-widest">Weekly Brief</span>
      </div>
      <div className="px-5 pb-4">
        <p className="text-white/80 text-sm leading-relaxed mb-4">{brief}</p>
        {bullets && bullets.length > 0 && (
          <ul className="space-y-2">
            {bullets.map((b, i) => {
              const colonIdx = b.indexOf(':')
              const prefix = colonIdx > -1 ? b.slice(0, colonIdx + 1) : null
              const rest = colonIdx > -1 ? b.slice(colonIdx + 1) : b
              return (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className={`font-semibold flex-shrink-0 ${bulletColor(b)}`}>{prefix}</span>
                  <span className="text-white/55">{rest.trim()}</span>
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

  // subFilter is cleared automatically by setFeedFilter in the slice

  // Compute sub-filter chips based on active filter
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
    <main className="flex-1 p-5 md:p-8 max-w-5xl mx-auto w-full">

      {/* Personalized header */}
      <div className="mb-7">
        <p className="text-[#6b7280] text-xs font-medium uppercase tracking-widest mb-1">
          Week of {weekLabel()}
        </p>
        <h1 className="text-2xl font-bold text-white leading-snug">
          {firstName ? `Hello ${firstName},` : 'Hello,'} here&apos;s your brief
        </h1>
      </div>

      {/* Weekly AI Brief */}
      <div className="mb-6">
        {briefLoading ? (
          <BriefSkeleton />
        ) : briefData?.brief ? (
          <BriefCard brief={briefData.brief} bullets={briefData.bullets} />
        ) : null}
      </div>

      {/* Filter bar */}
      <div className="mb-2">
        <FilterBar activeFilter={activeFilter} onChange={(f) => dispatch(setFeedFilter(f))} />
      </div>

      {/* Sub-filter chips */}
      {activeFilter !== 'all' && subFilterChips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4 mt-2">
          {subFilterChips.map((chip) => {
            const isActive = subFilter === chip
            return (
              <button
                key={chip}
                onClick={() => dispatch(setFeedSubFilter(isActive ? null : chip))}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all ${
                  isActive
                    ? 'bg-white/10 border-white/20 text-white'
                    : 'bg-transparent border-white/10 text-white/40 hover:text-white/60 hover:border-white/15'
                }`}
              >
                {chip}
              </button>
            )
          })}
        </div>
      )}

      {/* Section label */}
      <div className="mb-3">
        <span className="text-xs font-semibold text-white/30 uppercase tracking-widest">Today</span>
      </div>

      {noCategories && !isLoading && (
        <div className="text-center py-16">
          <p className="text-[#6b7280] text-sm">Update your preferences to see your feed</p>
          <a href="/settings" className="mt-3 inline-block text-[#3b82f6] text-sm hover:underline">
            Go to Settings
          </a>
        </div>
      )}

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="break-inside-avoid">
              <SkeletonCard />
            </div>
          ))}
        </div>
      )}

      {!isLoading && !noCategories && filtered.length === 0 && (
        <div className="text-center py-16">
          <p className="text-[#6b7280] text-sm">No items match the selected filter.</p>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filtered.slice(0, isPro ? filtered.length : FREE_ITEM_LIMIT).map((item, idx) => (
            <div key={item.id || `feed-${idx}`} className={`break-inside-avoid ${(item.urgency === 'Act Now') ? 'sm:col-span-2' : ''}`}>
              <FeedCard
                type={item._feedType || item.type || 'stock'}
                data={item.data || item}
                urgency={item.urgency}
                index={idx}
              />
            </div>
          ))}
          {!isPro && filtered.length > FREE_ITEM_LIMIT && (
            <ProGate label="Unlock full feed">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {filtered.slice(FREE_ITEM_LIMIT, FREE_ITEM_LIMIT + 3).map((item, idx) => (
                  <div key={`locked-${idx}`} className="break-inside-avoid">
                    <FeedCard
                      type={item._feedType || item.type || 'stock'}
                      data={item.data || item}
                      urgency={item.urgency}
                      index={FREE_ITEM_LIMIT + idx}
                    />
                  </div>
                ))}
              </div>
            </ProGate>
          )}
        </div>
      )}
    </main>
  )
}
