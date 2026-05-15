import { useState } from 'react'
import { useGetGovTradesQuery, useGetGovTradesSummaryQuery } from '../api/govTradesApi'
import GovTradeCard from '../components/gov-trades/GovTradeCard'

const DISCLAIMER =
  'This data is sourced from public STOCK Act disclosures. This is not evidence of illegal activity or investment advice.'

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="bg-[#141414] border border-[#2a2a2a] rounded-lg p-4 animate-pulse">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2.5 h-2.5 rounded-full bg-[#2a2a2a]" />
            <div className="h-4 bg-[#2a2a2a] rounded w-40" />
          </div>
          <div className="h-3 bg-[#2a2a2a] rounded w-full mb-2" />
          <div className="h-3 bg-[#2a2a2a] rounded w-2/3" />
        </div>
      ))}
    </div>
  )
}

export default function GovTrades() {
  const [filters, setFilters] = useState({
    chamber: '',
    party: '',
    days: '30',
    ticker: '',
  })
  const [tickerInput, setTickerInput] = useState('')

  const queryParams = {
    limit: '50',
    ...(filters.chamber && { chamber: filters.chamber }),
    ...(filters.party && { party: filters.party }),
    ...(filters.days && { days: filters.days }),
    ...(filters.ticker && { ticker: filters.ticker }),
  }

  const { data, isLoading, isError } = useGetGovTradesQuery(queryParams)
  const { data: summary } = useGetGovTradesSummaryQuery()

  const handleTickerSearch = (e) => {
    e.preventDefault()
    setFilters((f) => ({ ...f, ticker: tickerInput.toUpperCase() }))
  }

  const trades = data?.trades || []

  return (
    <main className="flex-1 p-5 md:p-8 max-w-4xl mx-auto w-full">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Government Insider Trades</h1>
        <p className="text-gray-400 text-sm mt-1">Public STOCK Act disclosures from Congress</p>
      </div>

      {/* Disclaimer banner */}
      <div className="bg-amber-900/20 border border-amber-700/40 rounded-lg px-4 py-3 mb-6">
        <p className="text-amber-300 text-xs leading-relaxed">{DISCLAIMER}</p>
      </div>

      {/* Summary stats */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-[#141414] border border-[#2a2a2a] rounded-lg p-3">
            <p className="text-gray-400 text-xs">Total trades (30d)</p>
            <p className="text-white font-bold text-xl mt-1">{summary.totalTrades}</p>
          </div>
          <div className="bg-[#141414] border border-[#2a2a2a] rounded-lg p-3">
            <p className="text-gray-400 text-xs">Act Now signals</p>
            <p className="text-red-400 font-bold text-xl mt-1">
              {summary.urgencyBreakdown?.['Act Now'] || 0}
            </p>
          </div>
          <div className="bg-[#141414] border border-[#2a2a2a] rounded-lg p-3">
            <p className="text-gray-400 text-xs">Democrats</p>
            <p className="text-blue-400 font-bold text-xl mt-1">
              {summary.partyBreakdown?.Democrat || 0}
            </p>
          </div>
          <div className="bg-[#141414] border border-[#2a2a2a] rounded-lg p-3">
            <p className="text-gray-400 text-xs">Republicans</p>
            <p className="text-red-400 font-bold text-xl mt-1">
              {summary.partyBreakdown?.Republican || 0}
            </p>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 mb-5">
        <select
          value={filters.chamber}
          onChange={(e) => setFilters((f) => ({ ...f, chamber: e.target.value }))}
          className="bg-[#1a1a1a] border border-[#2a2a2a] text-gray-300 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-[#3b82f6]"
        >
          <option value="">All Chambers</option>
          <option value="Senate">Senate</option>
          <option value="House">House</option>
        </select>

        <select
          value={filters.party}
          onChange={(e) => setFilters((f) => ({ ...f, party: e.target.value }))}
          className="bg-[#1a1a1a] border border-[#2a2a2a] text-gray-300 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-[#3b82f6]"
        >
          <option value="">All Parties</option>
          <option value="Democrat">Democrat</option>
          <option value="Republican">Republican</option>
          <option value="Independent">Independent</option>
        </select>

        <select
          value={filters.days}
          onChange={(e) => setFilters((f) => ({ ...f, days: e.target.value }))}
          className="bg-[#1a1a1a] border border-[#2a2a2a] text-gray-300 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-[#3b82f6]"
        >
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
        </select>

        <form onSubmit={handleTickerSearch} className="flex gap-2">
          <input
            type="text"
            value={tickerInput}
            onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
            placeholder="Filter by ticker..."
            className="bg-[#1a1a1a] border border-[#2a2a2a] text-gray-300 text-sm rounded-lg px-3 py-2 w-36 focus:outline-none focus:border-[#3b82f6] placeholder-gray-600"
          />
          <button
            type="submit"
            className="bg-[#1f1f1f] border border-[#2a2a2a] text-gray-400 hover:text-white text-sm px-3 py-2 rounded-lg transition-colors"
          >
            Search
          </button>
          {filters.ticker && (
            <button
              type="button"
              onClick={() => { setFilters((f) => ({ ...f, ticker: '' })); setTickerInput('') }}
              className="text-gray-500 hover:text-white text-sm px-2 py-2 transition-colors"
            >
              Clear
            </button>
          )}
        </form>
      </div>

      {/* Stats row */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-gray-500 text-sm">
          {isLoading ? 'Loading...' : `${trades.length} trades`}
          {filters.ticker && ` for ${filters.ticker}`}
        </p>
        {data?.total && data.total > trades.length && (
          <p className="text-gray-600 text-xs">Showing first {trades.length} of {data.total}</p>
        )}
      </div>

      {/* Content */}
      {isLoading && <LoadingSkeleton />}

      {isError && (
        <div className="text-center py-12">
          <p className="text-red-400 text-sm">Failed to load gov trades data.</p>
          <p className="text-gray-500 text-xs mt-1">Check that the backend is running.</p>
        </div>
      )}

      {!isLoading && !isError && trades.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-400 text-sm">No trades found for the selected filters.</p>
          <p className="text-gray-600 text-xs mt-1">Try expanding the date range or removing filters.</p>
        </div>
      )}

      {!isLoading && !isError && trades.length > 0 && (
        <div className="space-y-3">
          {trades.map((trade) => (
            <GovTradeCard key={trade.id} trade={trade} />
          ))}
        </div>
      )}
    </main>
  )
}
