import { useGetCommoditiesQuery } from '../api/commoditiesApi'
import PaywallBlur from '../components/shared/PaywallBlur'

function CommodityCard({ commodity, isLocked }) {
  const { commodity: name, symbol, price, unit, changePercent, macroContext } = commodity
  const isPositive = changePercent >= 0

  return (
    <PaywallBlur isLocked={isLocked} tier="pro" reason="Unlock all commodity data">
      <div className="bg-[#141414] border border-[#2a2a2a] rounded-lg p-4 hover:border-[#3a3a3a] transition-colors h-full">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-white font-semibold text-sm">{name}</p>
            <p className="text-gray-500 text-xs mt-0.5">{symbol}</p>
          </div>
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded ${
              isPositive ? 'text-green-400 bg-green-400/10' : 'text-red-400 bg-red-400/10'
            }`}
          >
            {isPositive ? '+' : ''}
            {typeof changePercent === 'number' ? changePercent.toFixed(2) : changePercent}%
          </span>
        </div>

        <div className="mb-3">
          <p className="text-white text-2xl font-bold">
            {typeof price === 'number'
              ? price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
              : price}
          </p>
          <p className="text-gray-500 text-xs">{unit}</p>
        </div>

        {macroContext && (
          <p className="text-gray-400 text-xs leading-relaxed border-t border-[#2a2a2a] pt-3">
            {macroContext}
          </p>
        )}
      </div>
    </PaywallBlur>
  )
}

function SkeletonCard() {
  return (
    <div className="bg-[#141414] border border-[#2a2a2a] rounded-lg p-4 animate-pulse">
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

export default function Commodities() {
  const { data, isLoading, isError } = useGetCommoditiesQuery()
  const commodities = data?.commodities || []
  const FREE_LIMIT = 4

  return (
    <main className="flex-1 p-5 md:p-8 max-w-5xl mx-auto w-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Commodities</h1>
        <p className="text-gray-400 text-sm mt-1">Live prices with AI macro context</p>
      </div>

      {isError && (
        <div className="text-center py-12">
          <p className="text-red-400 text-sm">Failed to load commodities data.</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading &&
          [...Array(7)].map((_, i) => <SkeletonCard key={i} />)}

        {!isLoading &&
          commodities.map((c, i) => (
            <CommodityCard key={c.symbol} commodity={c} isLocked={i >= FREE_LIMIT} />
          ))}
      </div>

      {!isLoading && commodities.length === 0 && !isError && (
        <div className="text-center py-12">
          <p className="text-gray-400 text-sm">No commodity data available.</p>
        </div>
      )}
    </main>
  )
}
