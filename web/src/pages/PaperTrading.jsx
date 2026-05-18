import { useState } from 'react'
import { useSelector } from 'react-redux'

/* ─── Access codes ────────────────────────────────────────────────────────── */
const VALID_CODES = new Set(['MARKETIQ2026', 'PAPERTRADER', 'EARLYACCESS', 'TRADEBETA'])
const LS_KEY = 'miq_pt_unlocked'

function useAccessCode() {
  const [unlocked, setUnlocked] = useState(() => localStorage.getItem(LS_KEY) === '1')
  const unlock = (code) => {
    if (VALID_CODES.has(code.trim().toUpperCase())) {
      localStorage.setItem(LS_KEY, '1')
      setUnlocked(true)
      return true
    }
    return false
  }
  return { unlocked, unlock }
}

function AccessGate({ onUnlock }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!onUnlock(code)) setError('Invalid code. Please try again.')
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-0 bg-[#0a0a0a] px-6">
      <div className="w-full max-w-sm">
        {/* Icon */}
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-6"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-white text-center tracking-tight mb-2">
          Paper Trading
        </h1>
        <p className="text-white/35 text-sm text-center mb-8">
          This feature is in early access. Enter your access code to continue.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="text"
            value={code}
            onChange={(e) => { setCode(e.target.value); setError('') }}
            placeholder="Enter access code"
            autoFocus
            className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none tracking-widest uppercase"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: error ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(255,255,255,0.10)',
            }}
          />
          {error && <p className="text-red-400 text-xs text-center">{error}</p>}
          <button
            type="submit"
            disabled={!code.trim()}
            className="w-full py-3 rounded-xl text-sm font-semibold bg-white hover:bg-gray-100 text-[#0a0a0a] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Unlock
          </button>
        </form>

        <p className="text-white/15 text-xs text-center mt-6">
          Don't have a code? Join the waitlist to get early access.
        </p>
      </div>
    </div>
  )
}
import {
  useGetPortfolioQuery,
  useGetTradableStocksQuery,
  useBuyStockMutation,
  useSellStockMutation,
  useGetTransactionsQuery,
  usePurchaseCashMutation,
} from '../api/paperTradingApi'

/* ─── Style constants ─────────────────────────────────────────────────────── */
const glassStyle = {
  background: 'linear-gradient(145deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 50%, rgba(255,255,255,0.06) 100%)',
  backdropFilter: 'blur(24px) saturate(180%)',
  WebkitBackdropFilter: 'blur(24px) saturate(180%)',
  border: '1px solid rgba(255,255,255,0.10)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.14)',
}

/* ─── Role config ─────────────────────────────────────────────────────────── */
const ROLE_CONFIG = {
  student:      { label: 'Student',             hint: 'Practice without risk — the best way to learn markets.' },
  educator:     { label: 'Educator',            hint: 'Demonstrate real trading concepts with simulated markets.' },
  professional: { label: 'Professional Trader', hint: 'Test strategies before committing real capital.' },
  retail:       { label: 'Retail Investor',     hint: 'Practise on your own terms, zero downside.' },
  fun:          { label: 'Trading for Fun',     hint: 'No pressure — just play the market.' },
}

/* ─── Formatting helpers ──────────────────────────────────────────────────── */
const fmt = (n) => n?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '—'

const fmtTime = (iso) => {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

/* ─── Main page ───────────────────────────────────────────────────────────── */
export default function PaperTrading() {
  const { unlocked, unlock } = useAccessCode()
  const traderRole = useSelector((s) => s.preferences.traderRole)
  const investorType = useSelector((s) => s.preferences.investorType)

  const roleKey = traderRole || investorType || 'retail'
  const role = ROLE_CONFIG[roleKey] ?? ROLE_CONFIG.retail

  if (!unlocked) return <AccessGate onUnlock={unlock} />

  /* RTK Query hooks */
  const { data: portfolio, isLoading: portfolioLoading, refetch: refetchPortfolio } = useGetPortfolioQuery()
  const { data: tradableStocks, isLoading: stocksLoading } = useGetTradableStocksQuery()
  const { data: transactions, isLoading: txLoading } = useGetTransactionsQuery(10)
  const [buyStock] = useBuyStockMutation()
  const [sellStock] = useSellStockMutation()
  const [purchaseCash] = usePurchaseCashMutation()

  /* Trade modal state */
  const [tradeModal, setTradeModal] = useState(null) // { ticker, companyName, price, mode: 'buy'|'sell' }
  const [tradeShares, setTradeShares] = useState(1)
  const [tradeError, setTradeError] = useState('')
  const [tradeLoading, setTradeLoading] = useState(false)

  /* Cash modal state */
  const [cashModal, setCashModal] = useState(false)
  const [cashUnits, setCashUnits] = useState(1)
  const [cashLoading, setCashLoading] = useState(false)
  const [cashError, setCashError] = useState('')
  const [cashSuccess, setCashSuccess] = useState('')

  /* ── Derived values ── */
  const cash = portfolio?.cash ?? 0
  const positions = portfolio?.positions ?? []
  const portfolioValue = positions.reduce((sum, p) => sum + (p.currentValue ?? 0), 0)
  const totalValue = cash + portfolioValue

  /* ── Open trade modal ── */
  const openBuyModal = (stock) => {
    setTradeModal({ ticker: stock.ticker, companyName: stock.companyName, price: stock.price, mode: 'buy' })
    setTradeShares(1)
    setTradeError('')
  }

  const openSellModal = (position) => {
    setTradeModal({ ticker: position.ticker, companyName: position.companyName, price: position.currentPrice, mode: 'sell', sharesHeld: position.shares })
    setTradeShares(1)
    setTradeError('')
  }

  const closeTradeModal = () => {
    setTradeModal(null)
    setTradeError('')
    setTradeShares(1)
  }

  /* ── Confirm trade ── */
  const handleConfirmTrade = async () => {
    if (!tradeModal) return
    setTradeLoading(true)
    setTradeError('')
    try {
      const payload = { ticker: tradeModal.ticker, shares: Number(tradeShares) }
      if (tradeModal.mode === 'buy') {
        const result = await buyStock(payload).unwrap()
        if (result?.error) setTradeError(result.error)
        else closeTradeModal()
      } else {
        const result = await sellStock(payload).unwrap()
        if (result?.error) setTradeError(result.error)
        else closeTradeModal()
      }
    } catch (err) {
      setTradeError(err?.data?.error ?? err?.message ?? 'Something went wrong.')
    } finally {
      setTradeLoading(false)
    }
  }

  /* ── Confirm cash purchase ── */
  const handlePurchaseCash = async () => {
    setCashLoading(true)
    setCashError('')
    setCashSuccess('')
    try {
      const result = await purchaseCash({ units: cashUnits }).unwrap()
      if (result?.url) {
        window.location.href = result.url
      } else if (result?.devMode) {
        setCashSuccess(`Cash credited (dev mode)`)
        refetchPortfolio()
      } else if (result?.error) {
        setCashError(result.error)
      }
    } catch (err) {
      setCashError(err?.data?.error ?? err?.message ?? 'Something went wrong.')
    } finally {
      setCashLoading(false)
    }
  }

  /* ── Trade modal computed ── */
  const tradePrice = tradeModal?.price ?? 0
  const tradeTotal = tradeShares * tradePrice
  const canAfford = tradeTotal <= cash

  /* ── Cash modal computed ── */
  const paperCashAmount = cashUnits * 500
  const usdCost = cashUnits * 5

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0a0a0a]">
      {/* Desktop header */}
      <header
        className="hidden md:flex items-center justify-between px-6 py-5 border-b"
        style={{ borderColor: 'rgba(255,255,255,0.06)' }}
      >
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-white tracking-tight">Paper Trading</h1>
          <span
            className="px-2.5 py-0.5 rounded-full text-xs font-medium text-white/70"
            style={glassStyle}
          >
            {role.label}
          </span>
        </div>
        <p className="text-sm text-white/35 hidden lg:block">{role.hint}</p>
      </header>

      <main className="flex-1 overflow-y-auto p-5 md:p-6">
        {/* Portfolio summary bar */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-white/30 mb-1">Cash Balance</p>
            <p className="text-4xl font-bold text-white tabular-nums">${fmt(cash)}</p>
            <p className="text-sm text-white/50 mt-1">Portfolio value: ${fmt(totalValue)}</p>
          </div>
          <button
            onClick={() => { setCashModal(true); setCashUnits(1); setCashError(''); setCashSuccess('') }}
            className="self-start sm:self-auto px-4 py-2 rounded-lg text-sm font-semibold bg-white text-[#0a0a0a] hover:bg-white/90 transition-colors"
          >
            + Add Cash
          </button>
        </div>

        <div className="flex flex-col lg:flex-row gap-5">
          {/* ── LEFT: Tradeable stocks ── */}
          <div className="lg:w-3/5">
            <p className="text-xs uppercase tracking-widest text-white/30 mb-3">NYSE · NASDAQ Blue Chips</p>
            <div className="rounded-2xl overflow-hidden" style={glassStyle}>
              {stocksLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-3 border-b animate-pulse" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                    <div className="flex flex-col gap-1.5">
                      <div className="h-3 bg-white/10 rounded w-12" />
                      <div className="h-2.5 bg-white/6 rounded w-24" />
                    </div>
                    <div className="h-3 bg-white/10 rounded w-16" />
                    <div className="h-7 bg-white/8 rounded-lg w-14" />
                  </div>
                ))
              ) : (tradableStocks ?? []).map((stock, i, arr) => (
                <div
                  key={stock.ticker}
                  className="flex items-center justify-between px-4 py-3 hover:bg-white/[0.03] transition-colors border-b last:border-0"
                  style={{ borderColor: 'rgba(255,255,255,0.06)' }}
                >
                  <div className="flex flex-col min-w-0 flex-1 mr-3">
                    <span className="font-bold text-white text-sm">{stock.ticker}</span>
                    <span className="text-xs text-white/40 truncate">{stock.companyName}</span>
                  </div>
                  <span className="text-sm text-white/70 tabular-nums mr-4">${fmt(stock.price)}</span>
                  <button
                    onClick={() => openBuyModal(stock)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-white/70 hover:text-white transition-colors border"
                    style={{ borderColor: 'rgba(255,255,255,0.20)' }}
                  >
                    Buy
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* ── RIGHT: Positions + Recent trades ── */}
          <div className="lg:w-2/5 flex flex-col gap-5">
            {/* Positions */}
            <div className="rounded-2xl p-5" style={glassStyle}>
              <p className="text-xs uppercase tracking-widest text-white/40 mb-4">Your Positions</p>
              {portfolioLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between py-2.5 border-b animate-pulse" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                    <div className="h-3 bg-white/10 rounded w-10" />
                    <div className="h-3 bg-white/8 rounded w-14" />
                    <div className="h-3 bg-white/8 rounded w-16" />
                    <div className="h-6 bg-white/8 rounded w-10" />
                  </div>
                ))
              ) : positions.length === 0 ? (
                <p className="text-sm text-white/30">No open positions yet. Buy a stock to get started.</p>
              ) : (
                positions.map((pos) => {
                  const pnl = pos.unrealizedPnl ?? 0
                  const pnlPct = pos.unrealizedPnlPct ?? 0
                  const positive = pnl >= 0
                  const pnlStr = `${positive ? '+' : '-'}$${fmt(Math.abs(pnl))} (${positive ? '+' : '-'}${Math.abs(pnlPct).toFixed(2)}%)`
                  return (
                    <div
                      key={pos.ticker}
                      className="flex items-center justify-between py-2.5 border-b last:border-0"
                      style={{ borderColor: 'rgba(255,255,255,0.06)' }}
                    >
                      <span className="font-bold text-white text-sm w-12">{pos.ticker}</span>
                      <span className="text-xs text-white/50">{pos.shares} sh</span>
                      <span className={`text-xs tabular-nums font-medium ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
                        {pnlStr}
                      </span>
                      <button
                        onClick={() => openSellModal(pos)}
                        className="px-2.5 py-1 rounded-lg text-xs font-medium text-white/60 hover:text-white transition-colors border"
                        style={{ borderColor: 'rgba(255,255,255,0.15)' }}
                      >
                        Sell
                      </button>
                    </div>
                  )
                })
              )}
            </div>

            {/* Recent trades */}
            <div className="rounded-2xl p-5" style={glassStyle}>
              <p className="text-xs uppercase tracking-widest text-white/40 mb-4">Recent Trades</p>
              {txLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-2 py-2.5 border-b animate-pulse" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                    <div className="h-5 bg-white/10 rounded w-10" />
                    <div className="h-3 bg-white/8 rounded w-24 flex-1" />
                    <div className="h-3 bg-white/8 rounded w-12" />
                  </div>
                ))
              ) : !transactions?.length ? (
                <p className="text-sm text-white/30">No trades yet.</p>
              ) : (
                transactions.slice(0, 10).map((tx, i) => {
                  const isBuy = tx.type?.toUpperCase() === 'BUY'
                  const total = (tx.shares ?? 0) * (tx.price ?? 0)
                  return (
                    <div
                      key={tx.id ?? i}
                      className="flex items-center gap-2 py-2.5 border-b last:border-0 text-xs"
                      style={{ borderColor: 'rgba(255,255,255,0.06)' }}
                    >
                      <span
                        className="px-1.5 py-0.5 rounded text-white/70 font-medium shrink-0"
                        style={{ background: 'rgba(255,255,255,0.10)' }}
                      >
                        {isBuy ? 'BUY' : 'SELL'}
                      </span>
                      <span className="font-semibold text-white shrink-0">{tx.ticker}</span>
                      <span className="text-white/50 flex-1 truncate">{tx.shares} × ${fmt(tx.price)}</span>
                      <span className="text-white/70 tabular-nums shrink-0">${fmt(total)}</span>
                      <span className="text-white/30 shrink-0">{tx.createdAt ? fmtTime(tx.createdAt) : ''}</span>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </main>

      {/* ─── Trade Modal ─────────────────────────────────────────────────────── */}
      {tradeModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) closeTradeModal() }}
        >
          <div className="w-full max-w-sm rounded-2xl p-6" style={glassStyle}>
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-bold text-white">{tradeModal.ticker}</h2>
                <p className="text-xs text-white/40">{tradeModal.companyName}</p>
              </div>
              <span className="text-xl font-semibold text-white tabular-nums">
                {tradeModal.price != null ? `$${fmt(tradeModal.price)}` : 'Loading...'}
              </span>
            </div>

            {/* Mode tabs */}
            <div className="flex gap-1 mb-5 p-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.06)' }}>
              {['buy', 'sell'].map((m) => {
                const hasSell = tradeModal.sharesHeld > 0
                if (m === 'sell' && !hasSell) return null
                return (
                  <button
                    key={m}
                    onClick={() => { setTradeModal((prev) => ({ ...prev, mode: m })); setTradeShares(1); setTradeError('') }}
                    className={`flex-1 py-1.5 rounded-md text-sm font-medium capitalize transition-all ${tradeModal.mode === m ? 'bg-white text-[#0a0a0a]' : 'text-white/50 hover:text-white'}`}
                  >
                    {m}
                  </button>
                )
              })}
            </div>

            {/* Shares input */}
            <div className="mb-4">
              <label className="block text-xs text-white/40 mb-1.5">Shares</label>
              <input
                type="number"
                min={1}
                step={1}
                value={tradeShares}
                onChange={(e) => { setTradeShares(Math.max(1, Math.floor(Number(e.target.value)))); setTradeError('') }}
                className="w-full bg-white/[0.07] border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-white/30 transition-colors"
                style={{ borderColor: 'rgba(255,255,255,0.12)' }}
              />
            </div>

            {/* Total */}
            <div className="flex justify-between items-center mb-4">
              <span className="text-xs text-white/40">Estimated total</span>
              <span className="text-sm font-semibold text-white tabular-nums">${fmt(tradeTotal)}</span>
            </div>

            {/* Context info */}
            {tradeModal.mode === 'buy' ? (
              <div className={`text-xs mb-4 ${!canAfford && tradeShares > 0 ? 'text-red-400' : 'text-white/40'}`}>
                Available cash: ${fmt(cash)}
                {!canAfford && tradeShares > 0 && ' — Insufficient funds'}
              </div>
            ) : (
              <div className="text-xs text-white/40 mb-4">
                You hold {tradeModal.sharesHeld} shares
              </div>
            )}

            {/* Error */}
            {tradeError && (
              <p className="text-xs text-red-400 mb-3">{tradeError}</p>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={closeTradeModal}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white/50 hover:text-white border transition-colors"
                style={{ borderColor: 'rgba(255,255,255,0.12)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmTrade}
                disabled={tradeLoading || (tradeModal.mode === 'buy' && !canAfford)}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-white text-[#0a0a0a] hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {tradeLoading ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Buy Cash Modal ───────────────────────────────────────────────────── */}
      {cashModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) { setCashModal(false); setCashSuccess('') } }}
        >
          <div className="w-full max-w-sm rounded-2xl p-6" style={glassStyle}>
            <h2 className="text-lg font-bold text-white mb-1">Add Paper Cash</h2>
            <p className="text-xs text-white/40 mb-5">Each unit: $5 USD → $500 paper cash</p>

            {/* Unit selector */}
            <div className="flex gap-2 mb-5">
              {[1, 2, 5, 10].map((u) => (
                <button
                  key={u}
                  onClick={() => setCashUnits(u)}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${cashUnits === u ? 'bg-white text-[#0a0a0a]' : 'text-white/60 hover:text-white border'}`}
                  style={cashUnits !== u ? { borderColor: 'rgba(255,255,255,0.15)' } : {}}
                >
                  {u}
                </button>
              ))}
            </div>

            {/* Summary */}
            <div className="rounded-lg p-4 mb-5 space-y-2" style={{ background: 'rgba(255,255,255,0.05)' }}>
              <div className="flex justify-between text-sm">
                <span className="text-white/50">You'll receive</span>
                <span className="text-white font-semibold">${fmt(paperCashAmount)} paper cash</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-white/50">You'll pay</span>
                <span className="text-white font-semibold">${fmt(usdCost)} USD</span>
              </div>
            </div>

            {/* Success / error */}
            {cashSuccess && (
              <p className="text-xs text-emerald-400 mb-3">{cashSuccess}</p>
            )}
            {cashError && (
              <p className="text-xs text-red-400 mb-3">{cashError}</p>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={() => { setCashModal(false); setCashSuccess('') }}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white/50 hover:text-white border transition-colors"
                style={{ borderColor: 'rgba(255,255,255,0.12)' }}
              >
                Cancel
              </button>
              <button
                onClick={handlePurchaseCash}
                disabled={cashLoading}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-white text-[#0a0a0a] hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {cashLoading ? 'Processing...' : 'Continue to payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
