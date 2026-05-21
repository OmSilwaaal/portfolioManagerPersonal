import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { useGetCommoditiesQuery } from '../api/commoditiesApi'
import { addStock } from '../store/watchlistSlice'
import ProGate from '../components/ProGate'
import CommodityIcon from '../components/CommodityIcon'
import JargonTooltip from '../components/JargonTooltip'

const SECTORS = ['All', 'Energy', 'Metals', 'Agriculture']

function typeBadgeClass(isPositive) {
  return isPositive ? 'text-green-400 bg-green-400/10' : 'text-red-400 bg-red-400/10'
}

function CommodityCard({ commodity }) {
  const dispatch = useDispatch()
  const watchlistStocks = useSelector((state) => state.watchlist.stocks)

  const {
    commodity: name,
    symbol,
    price,
    unit,
    changePercent,
    macroContext,
    sector = 'Other',
    relatedETFs = [],
  } = commodity

  const isPositive = changePercent >= 0
  const isTracked = watchlistStocks.includes(symbol?.toUpperCase())

  const handleTrack = () => {
    if (!isTracked) {
      dispatch(addStock(symbol))
    }
  }

  return (
    <div className="bg-[#141414] border border-[#1f1f1f] rounded-lg p-4 hover:border-[#3a3a3a] transition-colors h-full flex flex-col">
      {/* Header row: icon + name + track button */}
      <div className="flex items-start gap-3 mb-3">
        <CommodityIcon symbol={symbol} sector={sector} size={40} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-white font-semibold text-sm leading-snug">{name}</p>
            <button
              onClick={handleTrack}
              className={`text-xs font-semibold px-2 py-0.5 rounded border transition-colors shrink-0 ${
                isTracked
                  ? 'text-green-400 bg-green-400/10 border-green-400/20'
                  : 'text-[#a1a1aa] bg-[#1f1f1f] border-[#2a2a2a] hover:text-[#3b82f6] hover:border-[#3b82f6]'
              }`}
            >
              {isTracked ? '✓' : '+'}
            </button>
          </div>
          <p className="text-[#a1a1aa] text-xs mt-0.5">{symbol} · {sector}</p>
        </div>
      </div>

      <div className="flex items-center justify-between mb-3 border-t border-[#1f1f1f] pt-3">
        <div>
          <p className="text-white text-2xl font-bold">
            {typeof price === 'number'
              ? price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
              : price}
          </p>
          <p className="text-[#a1a1aa] text-xs">{unit}</p>
        </div>
        <span className={`text-sm font-semibold px-2.5 py-1 rounded-lg ${typeBadgeClass(isPositive)}`}>
          {isPositive ? '+' : ''}
          {typeof changePercent === 'number' ? changePercent.toFixed(2) : changePercent}%
        </span>
      </div>

      {macroContext && (
        <p className="text-[#a1a1aa] text-xs leading-relaxed border-t border-[#1f1f1f] pt-3 mb-3">
          {macroContext}
        </p>
      )}

      {relatedETFs.length > 0 && (
        <div className="mt-auto border-t border-[#1f1f1f] pt-3">
          <p className="text-[#a1a1aa] text-xs mb-2"><JargonTooltip term="Related ETFs">Related ETFs</JargonTooltip></p>
          <div className="flex flex-wrap gap-1.5">
            {relatedETFs.map((etf) => (
              <Link
                key={etf}
                to="/stocks"
                className="text-xs font-semibold px-2 py-0.5 rounded bg-[#1f1f1f] border border-[#2a2a2a] text-[#a1a1aa] hover:text-[#3b82f6] hover:border-[#3b82f6] transition-colors"
              >
                {etf}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="bg-[#141414] border border-[#1f1f1f] rounded-lg p-4 animate-pulse">
      <div className="flex justify-between mb-3">
        <div className="h-4 bg-[#2a2a2a] rounded w-28" />
        <div className="h-4 bg-[#2a2a2a] rounded w-12" />
      </div>
      <div className="h-8 bg-[#2a2a2a] rounded w-24 mb-1" />
      <div className="h-3 bg-[#2a2a2a] rounded w-16 mb-3" />
      <div className="h-3 bg-[#2a2a2a] rounded w-full" />
    </div>
  )
}

const FREE_COMMODITY_LIMIT = 3

export default function Commodities() {
  const { data, isLoading, isError } = useGetCommoditiesQuery()
  const isPro = useSelector((state) => state.preferences.isPro)
  const [activeSector, setActiveSector] = useState('All')

  const commodities = (data?.commodities || []).map((c) => ({
    ...c,
    sector: c.sector || 'Other',
    relatedETFs: c.relatedETFs || [],
  }))

  const filtered =
    activeSector === 'All'
      ? commodities
      : commodities.filter((c) => c.sector === activeSector)

  const sectors = activeSector === 'All'
    ? [...new Set(commodities.map((c) => c.sector))].filter(Boolean)
    : [activeSector]

  return (
    <main className="flex-1 p-5 md:p-8 max-w-5xl mx-auto w-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Commodities</h1>
        <p className="text-[#a1a1aa] text-sm mt-1">Live prices with AI macro context</p>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {SECTORS.map((s) => (
          <button
            key={s}
            onClick={() => setActiveSector(s)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              activeSector === s
                ? 'bg-[#3b82f6] text-white border-[#3b82f6]'
                : 'bg-[#141414] border border-[#1f1f1f] text-[#a1a1aa] hover:border-[#3b82f6]'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {isError && (
        <div className="text-center py-12">
          <p className="text-red-400 text-sm">Failed to load commodities data.</p>
        </div>
      )}

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(7)].map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {!isLoading && !isError && (() => {
        let shown = 0
        const sections = []

        const allGroups = [
          ...sectors.map((sector) => ({ sector, group: filtered.filter((c) => c.sector === sector) })),
          ...(activeSector === 'All' ? [{ sector: 'Other', group: commodities.filter((c) => !SECTORS.slice(1).includes(c.sector)) }] : []),
        ]

        for (const { sector, group } of allGroups) {
          if (group.length === 0) continue
          const freeSlice = isPro ? group : group.slice(0, Math.max(0, FREE_COMMODITY_LIMIT - shown))
          const lockedSlice = isPro ? [] : group.slice(Math.max(0, FREE_COMMODITY_LIMIT - shown))
          shown += freeSlice.length

          sections.push(
            <div key={sector} className="mb-8">
              <h2 className="text-xs font-semibold text-[#a1a1aa] uppercase tracking-wider mb-3">{sector}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {freeSlice.map((c) => <CommodityCard key={c.symbol} commodity={c} />)}
              </div>
              {lockedSlice.length > 0 && (
                <div className="mt-4">
                  <ProGate label="All commodities">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {lockedSlice.map((c) => <CommodityCard key={c.symbol} commodity={c} />)}
                    </div>
                  </ProGate>
                </div>
              )}
            </div>
          )
        }
        return sections
      })()}

      {!isLoading && commodities.length === 0 && !isError && (
        <div className="text-center py-12">
          <p className="text-[#a1a1aa] text-sm">No commodity data available.</p>
        </div>
      )}
    </main>
  )
}
