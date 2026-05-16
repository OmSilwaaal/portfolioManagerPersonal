import { useState } from 'react'
import { useSelector } from 'react-redux'
import { useAuth } from '../contexts/AuthContext'
import FilterBar from '../components/feed/FilterBar'
import FeedCard from '../components/feed/FeedCard'
import { useGetGovTradesQuery } from '../api/govTradesApi'
import { useGetCommoditiesQuery } from '../api/commoditiesApi'
import { useGetFeedQuery } from '../api/feedApi'
import { usePersonalizedFeed } from '../hooks/usePersonalizedFeed'
import ProGate from '../components/ProGate'

function SkeletonCard() {
  return (
    <div className="bg-[#141414] border border-[#2a2a2a] rounded-lg p-4 animate-pulse">
      <div className="flex justify-between mb-3">
        <div className="h-4 bg-[#2a2a2a] rounded w-32" />
        <div className="h-4 bg-[#2a2a2a] rounded w-16" />
      </div>
      <div className="h-3 bg-[#2a2a2a] rounded w-full mb-2" />
      <div className="h-3 bg-[#2a2a2a] rounded w-3/4" />
    </div>
  )
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

const FREE_ITEM_LIMIT = 5

export default function Feed() {
  const [activeFilter, setActiveFilter] = useState('all')
  const preferences = useSelector((state) => state.preferences)
  const isPro = useSelector((state) => state.preferences.isPro)
  const { user } = useAuth()
  const firstName = (
    user?.user_metadata?.full_name ??
    user?.user_metadata?.name ??
    user?.user_metadata?.display_name ??
    ''
  ).split(' ')[0]
  const watchedCategories = preferences.watchedCategories || []

  // Fetch all data in parallel
  const { data: feedData, isLoading: feedLoading } = useGetFeedQuery()
  const { data: govData, isLoading: govLoading } = useGetGovTradesQuery({ days: '30', limit: '20' })
  const { data: commoditiesData, isLoading: commoditiesLoading } = useGetCommoditiesQuery()

  const rawFeedItems = feedData?.items || feedData?.news || feedData?.articles || []
  const rawGovTrades = govData?.trades || []
  const rawCommodities = commoditiesData?.commodities || []

  const feedItems = usePersonalizedFeed(rawFeedItems, rawGovTrades, rawCommodities)

  const isLoading = feedLoading || govLoading || commoditiesLoading

  // Filter by active filter type
  const filtered =
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

  const noCategories = watchedCategories.length === 0

  return (
    <main className="flex-1 p-5 md:p-8 max-w-2xl mx-auto w-full">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-white">
          {greeting()}{firstName ? `, ${firstName}` : ''}
        </h1>
        <p className="text-[#6b7280] text-sm mt-1">Here's what's moving the markets today</p>
      </div>

      <div className="mb-5">
        <FilterBar activeFilter={activeFilter} onChange={setActiveFilter} />
      </div>

      {noCategories && !isLoading && (
        <div className="text-center py-16">
          <p className="text-gray-400 text-sm">Update your preferences to see your feed</p>
          <a href="/settings" className="mt-3 inline-block text-[#3b82f6] text-sm hover:underline">
            Go to Settings
          </a>
        </div>
      )}

      {isLoading && (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {!isLoading && !noCategories && filtered.length === 0 && (
        <div className="text-center py-16">
          <p className="text-gray-400 text-sm">No items match the selected filter.</p>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.slice(0, isPro ? filtered.length : FREE_ITEM_LIMIT).map((item, idx) => (
            <FeedCard
              key={item.id || `feed-${idx}`}
              type={item._feedType || item.type || 'stock'}
              data={item.data || item}
              urgency={item.urgency}
            />
          ))}
          {!isPro && filtered.length > FREE_ITEM_LIMIT && (
            <ProGate label="Unlock full feed">
              <div className="space-y-3">
                {filtered.slice(FREE_ITEM_LIMIT, FREE_ITEM_LIMIT + 3).map((item, idx) => (
                  <FeedCard
                    key={`locked-${idx}`}
                    type={item._feedType || item.type || 'stock'}
                    data={item.data || item}
                    urgency={item.urgency}
                  />
                ))}
              </div>
            </ProGate>
          )}
        </div>
      )}
    </main>
  )
}
