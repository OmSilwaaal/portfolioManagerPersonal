import { useMemo } from 'react'
import { useSelector } from 'react-redux'

const URGENCY_ORDER = { 'Act Now': 0, Watch: 1, Low: 2 }

export function usePersonalizedFeed(feedData = [], govTradesData = [], commoditiesData = []) {
  const preferences = useSelector((state) => state.preferences)

  return useMemo(() => {
    const { watchedCategories } = preferences
    const hasFilter = watchedCategories && watchedCategories.length > 0

    let items = []

    // Add stock/macro feed items
    if (!hasFilter || watchedCategories.includes('stocks') || watchedCategories.includes('crypto')) {
      const mapped = (feedData || []).map((item) => ({
        ...item,
        _feedType: item.feedType || 'stock',
        _urgencyRank: URGENCY_ORDER[item.urgency] ?? 2,
      }))
      items = items.concat(mapped)
    }

    // Add gov trades
    if (!hasFilter || watchedCategories.includes('gov-trades')) {
      const mapped = (govTradesData || []).map((trade) => ({
        id: trade.id,
        type: 'gov-trade',
        _feedType: 'gov-trade',
        ticker: trade.ticker,
        headline: `${trade.title} ${trade.officialName} ${trade.transactionType} ${trade.ticker}`,
        urgency: trade.urgency || 'Low',
        _urgencyRank: URGENCY_ORDER[trade.urgency] ?? 2,
        timestamp: trade.disclosureDate || trade.tradeDate,
        data: trade,
      }))
      items = items.concat(mapped)
    }

    // Add commodities
    if (!hasFilter || watchedCategories.includes('commodities')) {
      const mapped = (commoditiesData || []).map((c) => ({
        id: `commodity_${c.symbol}`,
        type: 'commodity',
        _feedType: 'commodity',
        ticker: c.symbol,
        headline: `${c.commodity}: $${c.price} (${c.changePercent > 0 ? '+' : ''}${c.changePercent}%)`,
        urgency: Math.abs(c.changePercent || 0) > 3 ? 'Watch' : 'Low',
        _urgencyRank: Math.abs(c.changePercent || 0) > 3 ? 1 : 2,
        timestamp: c.lastRefreshed || new Date().toISOString(),
        data: c,
      }))
      items = items.concat(mapped)
    }

    // Sort by urgency rank then timestamp
    items.sort((a, b) => {
      const rankDiff = (a._urgencyRank ?? 2) - (b._urgencyRank ?? 2)
      if (rankDiff !== 0) return rankDiff
      const ta = new Date(a.timestamp || 0)
      const tb = new Date(b.timestamp || 0)
      return tb - ta
    })

    return items
  }, [feedData, govTradesData, commoditiesData, preferences])
}
