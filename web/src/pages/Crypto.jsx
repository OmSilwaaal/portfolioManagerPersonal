import { useSelector } from 'react-redux'
import { useGetCryptoQuery } from '../api/cryptoApi'
import ProGate from '../components/ProGate'
import StockChart from '../components/StockChart'

const DEFAULT_CRYPTOS = ['BTC', 'ETH', 'SOL', 'DOGE']

const CRYPTO_NAMES = {
  BTC: 'Bitcoin',
  ETH: 'Ethereum',
  SOL: 'Solana',
  DOGE: 'Dogecoin',
}

function CryptoCard({ symbol, isLocked }) {
  const { data, isLoading, isError } = useGetCryptoQuery(symbol)

  const content = (
    <div className="p-4 bg-surface dark:bg-surface bg-[#f9f9f9] border border-border-subtle dark:border-border-subtle border-[#e5e7eb] rounded-md shadow-[0_1px_3px_rgba(0,0,0,0.3)]">
      {isLoading ? (
        <div className="animate-pulse space-y-2">
          <div className="h-5 bg-[#1f1f1f] rounded w-1/3" />
          <div className="h-8 bg-[#1f1f1f] rounded w-1/2" />
          <div className="h-4 bg-[#1f1f1f] rounded w-1/4" />
        </div>
      ) : isError || !data ? (
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="font-semibold text-white dark:text-white text-[#0f0f0f]">{symbol}</span>
            <span className="text-xs text-[#a1a1aa]">{CRYPTO_NAMES[symbol]}</span>
          </div>
          <p className="text-sm text-[#a1a1aa]">Price data unavailable</p>
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-2">
            <div>
              <span className="font-semibold text-white dark:text-white text-[#0f0f0f] text-lg">
                {symbol}
              </span>
              <span className="ml-2 text-sm text-[#a1a1aa]">{data.name}</span>
            </div>
            <span
              className={`text-sm font-medium ${
                (data.changePercent24h || 0) >= 0 ? 'text-green-400' : 'text-red-500'
              }`}
            >
              {(data.changePercent24h || 0) >= 0 ? '+' : ''}
              {(data.changePercent24h || 0).toFixed(2)}%
            </span>
          </div>
          <p className="text-2xl font-semibold text-white dark:text-white text-[#0f0f0f] mb-3">
            ${(data.price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <StockChart
            data={data.candles}
            basePrice={data.price}
          />
          {data.volume24h && (
            <p className="text-xs text-[#6b7280] mt-2">
              24h Volume: {data.volume24h.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
          )}
        </div>
      )}
    </div>
  )

  if (isLocked) return <ProGate label="Crypto charts">{content}</ProGate>
  return <>{content}</>
}

export default function Crypto() {
  const isPro = useSelector((state) => state.preferences.isPro)
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <header className="flex items-center justify-between px-6 py-4 border-b border-[#1f1f1f] dark:border-[#1f1f1f] border-[#e5e7eb]">
        <div>
          <h1 className="text-xl font-semibold text-white dark:text-white text-[#0f0f0f]">Crypto</h1>
          <p className="text-sm text-[#a1a1aa]">Cryptocurrency prices and news</p>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-screen-xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {DEFAULT_CRYPTOS.map((symbol, index) => (
              <CryptoCard
                key={symbol}
                symbol={symbol}
                isLocked={!isPro && index >= 2}
              />
            ))}
          </div>

          <p className="mt-6 text-xs text-[#6b7280] text-center">
            Cryptocurrency prices are volatile and subject to rapid change. Not financial advice.
          </p>
        </div>
      </main>
    </div>
  )
}
