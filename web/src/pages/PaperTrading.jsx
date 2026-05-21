import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import TradingViewChart from '../components/TradingViewChart'
import {
  useGetPortfolioQuery,
  useBuyStockMutation,
  useSellStockMutation,
  useUpdatePositionMutation,
  useGetTransactionsQuery,
  useGetLeaderboardQuery,
  usePurchaseCashMutation,
} from '../api/paperTradingApi'
import { useGetStockQuery } from '../api/stocksApi'
import JargonTooltip from '../components/JargonTooltip'

/* ─── Access gate ─────────────────────────────────────────────────────────── */
const VALID_CODES = new Set(['MARKETIQ2026', 'PAPERTRADER', 'EARLYACCESS', 'TRADEBETA'])
const LS_KEY = 'miq_pt_unlocked'
const ORDER_LS_KEY = 'miq_group_order' // reuse key pattern

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
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-6"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-white text-center tracking-tight mb-2">Paper Trading</h1>
        <p className="text-white/35 text-sm text-center mb-8">Early access feature — enter your code to continue.</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="text"
            value={code}
            onChange={(e) => { setCode(e.target.value); setError('') }}
            placeholder="Enter access code"
            autoFocus
            className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none tracking-widest uppercase"
            style={{ background: 'rgba(255,255,255,0.05)', border: error ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(255,255,255,0.10)' }}
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
      </div>
    </div>
  )
}

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
const fmt = (n, dec = 2) =>
  n == null ? '—' : n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })

const fmtCompact = (n) => {
  if (n == null) return '—'
  if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(2)}T`
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(1)}K`
  return `$${fmt(n)}`
}

const fmtTime = (iso) => {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

const glassCard = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 16,
}

/* ─── Stat chip ───────────────────────────────────────────────────────────── */
function Stat({ label, value, color }) {
  return (
    <div className="flex flex-col gap-0.5 px-3 py-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)' }}>
      <span className="text-[10px] uppercase tracking-widest text-white/30">{label}</span>
      <span className={`text-xs font-semibold tabular-nums ${color ?? 'text-white/80'}`}>{value}</span>
    </div>
  )
}

/* ─── Ticker search ───────────────────────────────────────────────────────── */
function TickerSearch({ value, onConfirm }) {
  const [input, setInput] = useState(value)

  const submit = () => {
    const t = input.trim().toUpperCase()
    if (t) onConfirm(t)
  }

  return (
    <div className="flex gap-2 mb-4">
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value.toUpperCase())}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="Search ticker — e.g. AAPL, TSLA, BTC-USD"
        className="flex-1 px-4 py-2.5 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none"
        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}
      />
      <button
        onClick={submit}
        className="px-4 py-2.5 rounded-xl text-sm font-medium bg-white/10 hover:bg-white/15 text-white transition-colors"
      >
        Go
      </button>
    </div>
  )
}

/* ─── Order panel ─────────────────────────────────────────────────────────── */
function OrderPanel({ ticker, stockData, stockLoading, stockError, cash, position, onSuccess }) {
  const [mode, setMode] = useState('buy')
  const [shares, setShares] = useState('')
  const [targetPrice, setTargetPrice] = useState('')
  const [stopLoss, setStopLoss] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [buyStock] = useBuyStockMutation()
  const [sellStock] = useSellStockMutation()

  const price = stockData?.price ?? null
  const sharesNum = parseFloat(shares) || 0
  const total = price != null ? sharesNum * price : null
  const canAfford = total != null && total <= cash
  const maxSell = position?.shares ?? 0

  useEffect(() => { setError(''); setSuccess('') }, [ticker, mode])

  const handleSubmit = async () => {
    if (!shares || sharesNum <= 0) { setError('Enter a valid number of shares'); return }
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      if (mode === 'buy') {
        const tp = parseFloat(targetPrice) || null
        const sl = parseFloat(stopLoss) || null
        await buyStock({ ticker, shares: sharesNum, targetPrice: tp, stopLoss: sl }).unwrap()
        setSuccess(`Bought ${sharesNum} share${sharesNum !== 1 ? 's' : ''} of ${ticker}`)
        setShares('')
        setTargetPrice('')
        setStopLoss('')
        onSuccess?.()
      } else {
        await sellStock({ ticker, shares: sharesNum }).unwrap()
        setSuccess(`Sold ${sharesNum} share${sharesNum !== 1 ? 's' : ''} of ${ticker}`)
        setShares('')
        onSuccess?.()
      }
    } catch (err) {
      setError(err?.data?.error ?? err?.message ?? 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  const canSubmit = !loading && sharesNum > 0 && price != null &&
    (mode === 'buy' ? canAfford : sharesNum <= maxSell)

  return (
    <div className="flex flex-col gap-4 p-5 h-full" style={glassCard}>
      {/* Price header */}
      <div>
        <p className="text-xs text-white/30 uppercase tracking-widest mb-1">{ticker}</p>
        {stockLoading ? (
          <div className="h-8 w-32 bg-white/10 rounded animate-pulse" />
        ) : stockError ? (
          <p className="text-red-400 text-sm">Ticker not found</p>
        ) : (
          <div className="flex items-end gap-2">
            <span className="text-3xl font-bold text-white tabular-nums">
              {price != null ? `$${fmt(price)}` : '—'}
            </span>
            {stockData?.change != null && (
              <span className={`text-sm font-medium mb-0.5 ${stockData.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {stockData.change >= 0 ? '+' : ''}{fmt(stockData.change)} ({stockData.changePercent >= 0 ? '+' : ''}{fmt(stockData.changePercent)}%)
              </span>
            )}
          </div>
        )}
      </div>

      {/* Buy / Sell tabs */}
      <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <button
          onClick={() => setMode('buy')}
          className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-all ${mode === 'buy' ? 'bg-emerald-500 text-white' : 'text-white/40 hover:text-white'}`}
        >
          Buy
        </button>
        <button
          onClick={() => setMode('sell')}
          className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-all ${mode === 'sell' ? 'bg-red-500 text-white' : 'text-white/40 hover:text-white'}`}
        >
          Sell
        </button>
      </div>

      {/* Inputs */}
      <div className="flex flex-col gap-3">
        <div>
          <label className="block text-[11px] text-white/40 mb-1 uppercase tracking-wider">Shares</label>
          <input
            type="number"
            min={0.01}
            step="any"
            value={shares}
            onChange={(e) => { setShares(e.target.value); setError('') }}
            placeholder="0"
            className="w-full px-3 py-2.5 rounded-lg text-white text-sm focus:outline-none tabular-nums"
            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.10)' }}
          />
          {mode === 'sell' && maxSell > 0 && (
            <button
              onClick={() => setShares(String(maxSell))}
              className="mt-1 text-[11px] text-white/30 hover:text-white/60 transition-colors"
            >
              Max: {maxSell} shares
            </button>
          )}
        </div>

        {mode === 'buy' && (
          <>
            <div>
              <label className="block text-[11px] text-white/40 mb-1 uppercase tracking-wider">
                Target Price <span className="normal-case text-white/20">(auto-sell above)</span>
              </label>
              <input
                type="number"
                min={0}
                step="any"
                value={targetPrice}
                onChange={(e) => setTargetPrice(e.target.value)}
                placeholder="Optional"
                className="w-full px-3 py-2.5 rounded-lg text-white text-sm focus:outline-none tabular-nums"
                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.10)' }}
              />
            </div>
            <div>
              <label className="block text-[11px] text-white/40 mb-1 uppercase tracking-wider">
                Stop Loss <span className="normal-case text-white/20">(auto-sell below)</span>
              </label>
              <input
                type="number"
                min={0}
                step="any"
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                placeholder="Optional"
                className="w-full px-3 py-2.5 rounded-lg text-white text-sm focus:outline-none tabular-nums"
                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.10)' }}
              />
            </div>
          </>
        )}
      </div>

      {/* Order summary */}
      {total != null && sharesNum > 0 && (
        <div className="rounded-lg px-3 py-2.5 space-y-1" style={{ background: 'rgba(255,255,255,0.04)' }}>
          <div className="flex justify-between text-xs">
            <span className="text-white/40">Est. total</span>
            <span className="text-white font-semibold tabular-nums">${fmt(total)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-white/40">Cash after</span>
            <span className={`font-semibold tabular-nums ${mode === 'buy' ? (canAfford ? 'text-white/70' : 'text-red-400') : 'text-emerald-400'}`}>
              ${fmt(mode === 'buy' ? cash - total : cash + total)}
            </span>
          </div>
        </div>
      )}

      {error && <p className="text-red-400 text-xs">{error}</p>}
      {success && <p className="text-emerald-400 text-xs">{success}</p>}

      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className={`w-full py-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
          mode === 'buy'
            ? 'bg-emerald-500 hover:bg-emerald-400 text-white'
            : 'bg-red-500 hover:bg-red-400 text-white'
        }`}
      >
        {loading ? 'Processing...' : mode === 'buy' ? `Buy ${ticker}` : `Sell ${ticker}`}
      </button>

      {mode === 'buy' && (
        <p className="text-[11px] text-white/20 text-center">
          Available cash: ${fmt(cash)}
        </p>
      )}
    </div>
  )
}

/* ─── Positions table ─────────────────────────────────────────────────────── */
function PositionRow({ pos, onClose, onUpdateTP }) {
  const positive = (pos.pnl ?? 0) >= 0
  const [editing, setEditing] = useState(false)
  const [tp, setTp] = useState(pos.targetPrice != null ? String(pos.targetPrice) : '')
  const [sl, setSl] = useState(pos.stopLoss != null ? String(pos.stopLoss) : '')
  const [updatePosition] = useUpdatePositionMutation()
  const [saving, setSaving] = useState(false)

  const saveOrders = async () => {
    setSaving(true)
    try {
      await updatePosition({
        ticker: pos.ticker,
        targetPrice: parseFloat(tp) || null,
        stopLoss: parseFloat(sl) || null,
      }).unwrap()
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <tr className="border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
        <td className="py-3 pr-3">
          <button onClick={() => onUpdateTP(pos.ticker)} className="text-left">
            <span className="font-bold text-white text-sm block">{pos.ticker}</span>
            <span className="text-[11px] text-white/30">{pos.shares} shares</span>
          </button>
        </td>
        <td className="py-3 pr-3 text-sm text-white/60 tabular-nums">${fmt(pos.avgCost)}</td>
        <td className="py-3 pr-3 text-sm text-white/80 tabular-nums">
          {pos.currentPrice != null ? `$${fmt(pos.currentPrice)}` : '—'}
        </td>
        <td className={`py-3 pr-3 text-sm font-medium tabular-nums ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
          <span className="block">{pos.pnl != null ? `${positive ? '+' : ''}$${fmt(Math.abs(pos.pnl))}` : '—'}</span>
          <span className="text-[11px] opacity-70">{pos.pnlPct != null ? `${positive ? '+' : ''}${fmt(pos.pnlPct)}%` : ''}</span>
        </td>
        <td className="py-3 pr-3">
          <button
            onClick={() => setEditing(!editing)}
            className="text-[11px] text-white/40 hover:text-white/70 transition-colors"
          >
            {pos.targetPrice != null ? `TP $${fmt(pos.targetPrice)}` : '—'} / {pos.stopLoss != null ? `SL $${fmt(pos.stopLoss)}` : '—'}
          </button>
        </td>
        <td className="py-3">
          <button
            onClick={() => onClose(pos)}
            className="px-2.5 py-1 rounded-lg text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors border border-red-500/20"
          >
            Close
          </button>
        </td>
      </tr>
      {editing && (
        <tr style={{ borderColor: 'transparent' }}>
          <td colSpan={6} className="pb-3">
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <span className="text-[11px] text-white/40 mr-1">TP</span>
              <input
                type="number"
                value={tp}
                onChange={(e) => setTp(e.target.value)}
                placeholder="Target Price"
                className="w-28 px-2 py-1 rounded-lg text-xs text-white focus:outline-none"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.10)' }}
              />
              <span className="text-[11px] text-white/40 ml-2 mr-1">SL</span>
              <input
                type="number"
                value={sl}
                onChange={(e) => setSl(e.target.value)}
                placeholder="Stop Loss"
                className="w-28 px-2 py-1 rounded-lg text-xs text-white focus:outline-none"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.10)' }}
              />
              <button
                onClick={saveOrders}
                disabled={saving}
                className="ml-2 px-3 py-1 rounded-lg text-xs font-medium bg-white text-[#0a0a0a] hover:bg-white/90 transition-colors disabled:opacity-40"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="px-2 py-1 rounded-lg text-xs text-white/40 hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

/* ─── Close position modal ────────────────────────────────────────────────── */
function CloseModal({ pos, cash, onConfirm, onCancel }) {
  const [shares, setShares] = useState(String(pos.shares))
  const sharesNum = parseFloat(shares) || 0
  const total = pos.currentPrice != null ? sharesNum * pos.currentPrice : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: '#111', border: '1px solid rgba(255,255,255,0.10)' }}>
        <h2 className="text-base font-bold text-white mb-1">Close {pos.ticker} Position</h2>
        <p className="text-xs text-white/40 mb-4">Current price: {pos.currentPrice != null ? `$${fmt(pos.currentPrice)}` : 'Unknown'}</p>
        <div className="mb-4">
          <label className="block text-[11px] text-white/40 mb-1 uppercase tracking-wider">Shares to sell</label>
          <input
            type="number"
            min={0.01}
            max={pos.shares}
            step="any"
            value={shares}
            onChange={(e) => setShares(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg text-white text-sm focus:outline-none"
            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.10)' }}
          />
          <button onClick={() => setShares(String(pos.shares))} className="mt-1 text-[11px] text-white/30 hover:text-white/60">
            Sell all {pos.shares} shares
          </button>
        </div>
        {total != null && <div className="flex justify-between text-xs mb-4">
          <span className="text-white/40">You'll receive</span>
          <span className="text-white font-semibold">${fmt(total)}</span>
        </div>}
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white/50 hover:text-white border transition-colors" style={{ borderColor: 'rgba(255,255,255,0.12)' }}>Cancel</button>
          <button
            onClick={() => onConfirm(pos.ticker, sharesNum)}
            disabled={sharesNum <= 0 || sharesNum > pos.shares}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-red-500 hover:bg-red-400 text-white disabled:opacity-30 transition-colors"
          >
            Confirm Sell
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── Add cash modal ──────────────────────────────────────────────────────── */
function CashModal({ onClose }) {
  const [units, setUnits] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [purchaseCash] = usePurchaseCashMutation()
  const paperAmount = units * 500
  const usdCost = units * 5

  const handlePurchase = async () => {
    setLoading(true); setError(''); setSuccess('')
    try {
      const result = await purchaseCash({ units }).unwrap()
      if (result?.url) { window.location.href = result.url }
      else if (result?.devMode) { setSuccess(`$${paperAmount} paper cash credited!`) }
      else if (result?.error) { setError(result.error) }
    } catch (err) {
      setError(err?.data?.error ?? 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: '#111', border: '1px solid rgba(255,255,255,0.10)' }}>
        <h2 className="text-base font-bold text-white mb-1">Add Paper Cash</h2>
        <p className="text-xs text-white/40 mb-5">1 unit = $5 USD → $500 paper cash</p>
        <div className="flex gap-2 mb-5">
          {[1, 2, 5, 10].map((u) => (
            <button key={u} onClick={() => setUnits(u)}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${units === u ? 'bg-white text-[#0a0a0a]' : 'text-white/60 hover:text-white border'}`}
              style={units !== u ? { borderColor: 'rgba(255,255,255,0.15)' } : {}}>
              {u}
            </button>
          ))}
        </div>
        <div className="rounded-lg p-3 mb-4 space-y-1.5" style={{ background: 'rgba(255,255,255,0.05)' }}>
          <div className="flex justify-between text-sm"><span className="text-white/40">You get</span><span className="text-white font-semibold">${paperAmount.toLocaleString()} paper cash</span></div>
          <div className="flex justify-between text-sm"><span className="text-white/40">You pay</span><span className="text-white font-semibold">${usdCost} USD</span></div>
        </div>
        {success && <p className="text-emerald-400 text-xs mb-3">{success}</p>}
        {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white/50 hover:text-white border transition-colors" style={{ borderColor: 'rgba(255,255,255,0.12)' }}>Cancel</button>
          <button onClick={handlePurchase} disabled={loading} className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-white text-[#0a0a0a] hover:bg-white/90 disabled:opacity-40 transition-colors">
            {loading ? 'Processing...' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── Leaderboard ─────────────────────────────────────────────────────────── */
function Leaderboard({ currentUserId }) {
  const { data, isLoading } = useGetLeaderboardQuery()
  const board = data?.leaderboard ?? []

  return (
    <div className="rounded-2xl overflow-hidden" style={glassCard}>
      <div className="px-5 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <h3 className="text-sm font-semibold text-white">Leaderboard</h3>
        <p className="text-[11px] text-white/30 mt-0.5">Ranked by trading return on starting $500 — extra top-ups excluded</p>
      </div>
      {isLoading ? (
        <div className="p-5 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 animate-pulse">
              <div className="w-6 h-3 bg-white/10 rounded" />
              <div className="flex-1 h-3 bg-white/10 rounded" />
              <div className="w-20 h-3 bg-white/8 rounded" />
            </div>
          ))}
        </div>
      ) : board.length === 0 ? (
        <div className="px-5 py-8 text-center text-white/30 text-sm">No data yet — be the first to trade!</div>
      ) : (
        <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
          {board.map((entry, idx) => {
            const isMe = entry.userId === currentUserId
            const positive = (entry.returnPct ?? 0) >= 0
            return (
              <div key={entry.userId} className={`flex items-center gap-4 px-5 py-3.5 ${isMe ? 'bg-white/[0.03]' : ''}`}>
                <span className={`text-sm font-bold w-6 text-center tabular-nums ${idx === 0 ? 'text-yellow-400' : idx === 1 ? 'text-gray-300' : idx === 2 ? 'text-amber-600' : 'text-white/30'}`}>
                  {idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium truncate">
                    {isMe ? 'You' : `Trader ${entry.userId.slice(-4).toUpperCase()}`}
                    {isMe && <span className="ml-2 text-[10px] text-white/40 font-normal">← you</span>}
                  </p>
                  <p className="text-[11px] text-white/30">{entry.positionCount} position{entry.positionCount !== 1 ? 's' : ''}</p>
                </div>
                <div className="text-right">
                  <p className={`text-lg font-bold tabular-nums ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
                    {positive ? '+' : ''}{fmt(entry.returnPct)}%
                  </p>
                  <p className="text-[11px] text-white/30 tabular-nums">
                    {positive ? '+' : ''}${fmt(Math.abs(entry.tradingPnl ?? 0))} P&L
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ─── Main page ───────────────────────────────────────────────────────────── */
export default function PaperTrading() {
  const { unlocked, unlock } = useAccessCode()
  const { user } = useAuth()

  if (!unlocked) return <AccessGate onUnlock={unlock} />

  return <PaperTradingInner userId={user?.id} />
}

function PaperTradingInner({ userId }) {
  const [activeTab, setActiveTab] = useState('trade')
  const [ticker, setTicker] = useState('AAPL')
  const [cashModal, setCashModal] = useState(false)
  const [closeModal, setCloseModal] = useState(null)

  const { data: portfolio, isLoading: portfolioLoading, refetch: refetchPortfolio } = useGetPortfolioQuery()
  const { data: transactions, isLoading: txLoading } = useGetTransactionsQuery(50)
  const { data: stockData, isLoading: stockLoading, isError: stockError } = useGetStockQuery(ticker, { skip: !ticker })
  const [sellStock] = useSellStockMutation()

  const cash = portfolio?.cashBalance ?? 0
  const positions = portfolio?.positions ?? []
  const positionsValue = positions.reduce((s, p) => s + (p.currentValue ?? 0), 0)
  const totalValue = cash + positionsValue
  const totalPnL = positions.reduce((s, p) => s + (p.pnl ?? 0), 0)

  const currentPosition = positions.find((p) => p.ticker === ticker)

  const handleSell = async (t, shares) => {
    try {
      await sellStock({ ticker: t, shares }).unwrap()
      setCloseModal(null)
      refetchPortfolio()
    } catch (_) {}
  }

  const tabs = [
    { id: 'trade', label: 'Trade' },
    { id: 'positions', label: `Positions (${positions.length})` },
    { id: 'history', label: 'History' },
    { id: 'leaderboard', label: 'Leaderboard' },
  ]

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0a0a0a]">
      {/* Header */}
      <header className="px-6 py-4 border-b flex items-center justify-between gap-4 flex-wrap" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-6 flex-wrap">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-white/30 mb-0.5">Cash Balance</p>
            <p className="text-2xl font-bold text-white tabular-nums">${fmt(cash)}</p>
          </div>
          <div className="hidden sm:block w-px h-8" style={{ background: 'rgba(255,255,255,0.08)' }} />
          <div className="hidden sm:block">
            <p className="text-[10px] uppercase tracking-widest text-white/30 mb-0.5">Portfolio Value</p>
            <p className="text-lg font-semibold text-white tabular-nums">${fmt(totalValue)}</p>
          </div>
          <div className="hidden sm:block">
            <p className="text-[10px] uppercase tracking-widest text-white/30 mb-0.5">Unrealized P&L</p>
            <p className={`text-lg font-semibold tabular-nums ${totalPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {totalPnL >= 0 ? '+' : ''}${fmt(Math.abs(totalPnL))}
            </p>
          </div>
        </div>
        <button
          onClick={() => setCashModal(true)}
          className="px-4 py-2 rounded-xl text-sm font-semibold bg-white text-[#0a0a0a] hover:bg-white/90 transition-colors"
        >
          + Add Cash
        </button>
      </header>

      {/* Tabs */}
      <div className="flex border-b px-6" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-all ${
              activeTab === tab.id
                ? 'border-white text-white'
                : 'border-transparent text-white/35 hover:text-white/60'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <main className="flex-1 overflow-y-auto p-5 md:p-6">
        {/* ── TRADE TAB ── */}
        {activeTab === 'trade' && (
          <div className="max-w-screen-xl mx-auto">
            <TickerSearch value={ticker} onConfirm={setTicker} />
            {/* Chart + Order panel */}
            <div className="flex flex-col lg:flex-row gap-5">
              {/* Left: chart + stats */}
              <div className="flex-1 flex flex-col gap-4">
                <div className="rounded-2xl overflow-hidden" style={{ ...glassCard, height: 380 }}>
                  <TradingViewChart ticker={ticker} />
                </div>
                {/* Stats row */}
                {!stockLoading && !stockError && stockData && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <Stat label="Open" value={stockData.open != null ? `$${fmt(stockData.open)}` : '—'} />
                    <Stat label="Prev Close" value={stockData.previousClose != null ? `$${fmt(stockData.previousClose)}` : '—'} />
                    <Stat label="Day High" value={stockData.high != null ? `$${fmt(stockData.high)}` : '—'} />
                    <Stat label="Day Low" value={stockData.low != null ? `$${fmt(stockData.low)}` : '—'} />
                    <Stat label={<JargonTooltip term="Volume">Volume</JargonTooltip>} value={stockData.volume != null ? fmtCompact(stockData.volume).replace('$', '') : '—'} />
                    <Stat label="Mkt Cap" value={stockData.marketCap != null ? fmtCompact(stockData.marketCap * 1e6) : '—'} />
                    {currentPosition && (
                      <>
                        <Stat label="Your Shares" value={currentPosition.shares} />
                        <Stat
                          label="Your P&L"
                          value={currentPosition.pnl != null ? `${currentPosition.pnl >= 0 ? '+' : ''}$${fmt(Math.abs(currentPosition.pnl))}` : '—'}
                          color={currentPosition.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}
                        />
                      </>
                    )}
                  </div>
                )}
              </div>
              {/* Right: order panel */}
              <div className="lg:w-72 xl:w-80">
                <OrderPanel
                  ticker={ticker}
                  stockData={stockData}
                  stockLoading={stockLoading}
                  stockError={stockError}
                  cash={cash}
                  position={currentPosition}
                  onSuccess={refetchPortfolio}
                />
              </div>
            </div>

            {/* Compact open positions — visible without switching tabs */}
            {positions.length > 0 && (
              <div className="mt-6 rounded-2xl overflow-hidden" style={glassCard}>
                <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                  <span className="text-xs uppercase tracking-widest text-white/30 font-semibold">Open Positions</span>
                  <button onClick={() => setActiveTab('positions')} className="text-[11px] text-white/30 hover:text-white/60 transition-colors">View all →</button>
                </div>
                <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                  {positions.map((pos) => {
                    const positive = (pos.pnl ?? 0) >= 0
                    return (
                      <div key={pos.ticker} className="flex items-center gap-4 px-5 py-3">
                        <button
                          onClick={() => setTicker(pos.ticker)}
                          className="font-bold text-sm text-white hover:text-white/70 transition-colors w-14 text-left"
                        >
                          {pos.ticker}
                        </button>
                        <span className="text-xs text-white/40 w-16">{pos.shares} sh @ ${fmt(pos.avgCost)}</span>
                        <span className="text-xs text-white/60 flex-1">
                          {pos.currentPrice != null ? `$${fmt(pos.currentPrice)}` : '—'}
                        </span>
                        <span className={`text-xs font-semibold tabular-nums ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
                          {pos.pnl != null ? `${positive ? '+' : ''}$${fmt(Math.abs(pos.pnl))}` : '—'}
                        </span>
                        <button
                          onClick={() => setCloseModal(pos)}
                          className="text-xs text-red-400/60 hover:text-red-400 transition-colors ml-2"
                        >
                          Close
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── POSITIONS TAB ── */}
        {activeTab === 'positions' && (
          <div className="max-w-screen-xl mx-auto">
            {portfolioLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-14 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.05)' }} />
                ))}
              </div>
            ) : positions.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-white/30 text-sm mb-2">No open positions</p>
                <button onClick={() => setActiveTab('trade')} className="text-white/50 text-sm hover:text-white transition-colors">
                  Go to Trade →
                </button>
              </div>
            ) : (
              <div className="rounded-2xl overflow-hidden" style={glassCard}>
                <table className="w-full">
                  <thead>
                    <tr className="border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                      {['Ticker', 'Avg Cost', 'Price', 'P&L', 'TP / SL', ''].map((h) => (
                        <th key={h} className="text-left py-3 px-5 text-[11px] uppercase tracking-widest text-white/30 font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: 'transparent' }}>
                    {positions.map((pos) => (
                      <PositionRow
                        key={pos.ticker}
                        pos={pos}
                        onClose={(p) => setCloseModal(p)}
                        onUpdateTP={(t) => { setTicker(t); setActiveTab('trade') }}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── HISTORY TAB ── */}
        {activeTab === 'history' && (
          <div className="max-w-screen-xl mx-auto rounded-2xl overflow-hidden" style={glassCard}>
            {txLoading ? (
              <div className="p-5 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-10 bg-white/5 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : !transactions?.transactions?.length ? (
              <div className="py-16 text-center text-white/30 text-sm">No transactions yet</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                    {['Type', 'Ticker', 'Shares', 'Price', 'Total', 'Time'].map((h) => (
                      <th key={h} className="text-left py-3 px-5 text-[11px] uppercase tracking-widest text-white/30 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(transactions.transactions ?? []).map((tx, i) => {
                    const isBuy = tx.type === 'buy'
                    const isDeposit = tx.type === 'deposit'
                    return (
                      <tr key={tx.id ?? i} className="border-b last:border-0" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                        <td className="py-3 px-5">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded ${isDeposit ? 'text-blue-400 bg-blue-500/10' : isBuy ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10'}`}>
                            {tx.type?.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-3 px-5 text-sm font-medium text-white">{tx.ticker ?? '—'}</td>
                        <td className="py-3 px-5 text-sm text-white/60 tabular-nums">{tx.shares ?? '—'}</td>
                        <td className="py-3 px-5 text-sm text-white/60 tabular-nums">{tx.price != null ? `$${fmt(tx.price)}` : '—'}</td>
                        <td className="py-3 px-5 text-sm text-white font-medium tabular-nums">${fmt(tx.total)}</td>
                        <td className="py-3 px-5 text-xs text-white/30">{fmtTime(tx.createdAt)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── LEADERBOARD TAB ── */}
        {activeTab === 'leaderboard' && (
          <div className="max-w-2xl mx-auto">
            <Leaderboard currentUserId={userId} />
          </div>
        )}
      </main>

      {cashModal && <CashModal onClose={() => setCashModal(false)} />}
      {closeModal && (
        <CloseModal
          pos={closeModal}
          cash={cash}
          onConfirm={handleSell}
          onCancel={() => setCloseModal(null)}
        />
      )}
    </div>
  )
}
