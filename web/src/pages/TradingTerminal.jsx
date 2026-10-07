import React, { useMemo, useState } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import {
  Zap,
  LogOut,
  ArrowUpRight,
  Copy,
  Check,
  Settings,
  Activity,
  BarChart2,
  Wallet,
  CandlestickChart,
} from 'lucide-react'
import PanelWorkspace from '../components/terminal/PanelWorkspace'
import Panel from '../components/terminal/Panel'

/**
 * Panel geometry is stored as fractions of the canvas, so these defaults hold
 * their proportions on any display. `minW`/`minH` stop a panel being resized
 * into something unreadable. On narrow screens panels size to their content,
 * except where `stackedHeight` sets a floor.
 */
const PANELS = [
  { id: 'ticker', defaultRect: { x: 0,    y: 0,    w: 0.66, h: 0.16 }, minW: 300, minH: 96 },
  { id: 'chart',  defaultRect: { x: 0,    y: 0.17, w: 0.66, h: 0.83 }, minW: 320, minH: 220, stackedHeight: 340 },
  { id: 'swap',   defaultRect: { x: 0.67, y: 0,    w: 0.33, h: 0.60 }, minW: 300, minH: 300 },
  { id: 'trades', defaultRect: { x: 0.67, y: 0.61, w: 0.33, h: 0.39 }, minW: 260, minH: 160 },
]

const TIMEFRAMES = ['1m', '5m', '1H', '1D']

const RECENT_TRADES = [
  { side: 'BUY',  size: '0.42 SOL', time: '14:02:11' },
  { side: 'SELL', size: '1.50 SOL', time: '14:02:10' },
  { side: 'BUY',  size: '12.0 SOL', time: '14:02:08' },
  { side: 'SELL', size: '0.10 SOL', time: '14:02:04' },
  { side: 'BUY',  size: '3.20 SOL', time: '14:01:58' },
  { side: 'BUY',  size: '0.08 SOL', time: '14:01:51' },
]

const MINT = 'So11111111111111111111111111111111111111112'

export default function TradingTerminal() {
  const { ready, authenticated, user, login, logout } = usePrivy()
  const { wallets } = useWallets()
  const [copied, setCopied] = useState(false)
  const [signingStatus, setSigningStatus] = useState(null)
  const [selectedPreset, setSelectedPreset] = useState(0.5)
  const [customSol, setCustomSol] = useState('')
  const [jitoTip, setJitoTip] = useState(0.001)
  const [slippage, setSlippage] = useState(0.5)
  const [timeframe, setTimeframe] = useState('5m')

  // Find embedded Solana wallet if available
  const solanaWallet = wallets?.find(
    (w) => w.walletClientType === 'privy' || w.chainType === 'solana'
  ) || wallets?.[0]

  const solAddress = solanaWallet?.address || user?.wallet?.address || null

  const handleCopyAddress = () => {
    if (!solAddress) return
    navigator.clipboard.writeText(solAddress)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleExecuteSwap = async (direction = 'BUY') => {
    if (!solAddress) {
      setSigningStatus('⚠️ Connect your Privy embedded wallet first.')
      return
    }

    const amount = customSol ? parseFloat(customSol) : selectedPreset
    setSigningStatus(`Routing ${direction} ${amount} SOL via Jito...`)

    try {
      await new Promise((res) => setTimeout(res, 600))
      setSigningStatus(`Awaiting signature from ${solAddress.slice(0, 4)}...`)
      await new Promise((res) => setTimeout(res, 800))
      setSigningStatus(`✅ TX Sent: Jito Tip ${jitoTip} SOL applied.`)
    } catch (err) {
      setSigningStatus(`❌ ERROR: ${err.message}`)
    }
  }

  const shortAddress = useMemo(
    () => (solAddress ? `${solAddress.slice(0, 4)}...${solAddress.slice(-4)}` : null),
    [solAddress],
  )

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-x-hidden bg-[#050505] font-sans text-gray-300"
      style={{
        paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0px))',
        paddingLeft: 'max(0.75rem, env(safe-area-inset-left, 0px))',
        paddingRight: 'max(0.75rem, env(safe-area-inset-right, 0px))',
        paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))',
      }}
    >
      {/* ── Top bar (fixed chrome — the canvas below is what moves) ── */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-lg border border-[#222] bg-[#111] p-3 shadow-2xl">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-blue-500/30 bg-blue-500/10 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.2)]">
            <Zap className="h-5 w-5 fill-current" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-black tracking-tight text-white sm:text-xl">
              AXIOM <span className="text-blue-500">PRO</span>
            </h1>
            <p className="truncate text-[10px] font-semibold uppercase tracking-widest text-gray-500">
              Ultra-Low Latency Terminal
            </p>
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-3">
          {!ready ? (
            <div className="h-10 w-32 animate-pulse rounded-lg bg-[#222]" />
          ) : !authenticated ? (
            <button
              onClick={login}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-[0_0_20px_rgba(37,99,235,0.4)] transition-all hover:bg-blue-500 sm:px-5"
            >
              <Wallet className="h-4 w-4 shrink-0" />
              <span className="whitespace-nowrap">Connect Wallet</span>
            </button>
          ) : (
            <div className="flex min-w-0 items-center gap-2 rounded-lg border border-[#333] bg-[#1a1a1a] p-1.5 shadow-inner sm:gap-3 sm:pr-3">
              <div className="flex min-w-0 items-center gap-2 rounded bg-[#222] px-2.5 py-1.5 sm:px-3">
                <div className="h-2 w-2 shrink-0 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.8)] animate-pulse" />
                <span className="truncate font-mono text-xs font-bold text-white">
                  {shortAddress ?? 'Loading...'}
                </span>
                <button
                  onClick={handleCopyAddress}
                  aria-label="Copy wallet address"
                  className="shrink-0 text-gray-400 transition hover:text-white"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
              <button
                onClick={logout}
                aria-label="Disconnect wallet"
                className="shrink-0 rounded p-1.5 text-gray-400 transition hover:bg-red-400/10 hover:text-red-400"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Freeform workspace ── */}
      <PanelWorkspace panels={PANELS} storageKey="axiom.terminal.layout.v1">
        <Panel id="ticker" title="SOL / USDC" icon={Activity} bodyClassName="p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex min-w-0 flex-1 basis-[220px] items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1d1d1d] text-[10px] font-black text-gray-400">
                SOL
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-base font-bold text-white">
                  SOL / USDC
                  <span className="shrink-0 rounded border border-gray-700 bg-gray-800 px-2 py-0.5 text-[10px] text-gray-300">
                    RAYDIUM
                  </span>
                </div>
                <div className="truncate font-mono text-xs text-gray-500" title={MINT}>
                  {MINT}
                </div>
              </div>
            </div>

            <div className="grid flex-1 basis-[260px] grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
              <div className="min-w-0">
                <div className="mb-0.5 text-[10px] font-semibold text-gray-500">PRICE</div>
                <div className="truncate font-mono text-lg font-bold text-green-400">$184.42</div>
              </div>
              <div className="min-w-0">
                <div className="mb-0.5 text-[10px] font-semibold text-gray-500">24H CHANGE</div>
                <div className="flex items-center truncate font-mono text-lg font-bold text-green-400">
                  <ArrowUpRight className="h-4 w-4 shrink-0" /> +6.4%
                </div>
              </div>
              <div className="min-w-0">
                <div className="mb-0.5 text-[10px] font-semibold text-gray-500">VOL (24H)</div>
                <div className="truncate font-mono text-lg font-bold text-white">$42.1M</div>
              </div>
            </div>
          </div>
        </Panel>

        <Panel
          id="chart"
          title="Chart"
          icon={CandlestickChart}
          bodyClassName="flex flex-col p-2"
          actions={
            <div className="flex items-center gap-0.5 rounded bg-[#0d0d0d] p-0.5">
              {TIMEFRAMES.map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`rounded px-2 py-1 text-[10px] font-bold transition ${
                    timeframe === tf ? 'bg-blue-600/25 text-blue-400' : 'text-gray-500 hover:text-white'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
          }
        >
          <div className="relative flex min-h-[160px] flex-1 items-center justify-center overflow-hidden rounded border border-[#222] bg-[#0a0a0a]">
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:20px_20px]" />
            <div className="z-10 px-4 text-center">
              <BarChart2 className="mx-auto mb-3 h-10 w-10 text-gray-700" />
              <p className="text-sm font-semibold text-gray-500">TradingView integration pending.</p>
              <p className="mt-1 text-xs text-gray-600">Timeframe: {timeframe}</p>
            </div>
          </div>
        </Panel>

        <Panel id="trades" title="Live Trades" icon={Activity} bodyClassName="p-2">
          <div className="space-y-1 font-mono text-xs">
            {RECENT_TRADES.map((t, i) => (
              <div
                key={i}
                className={`flex items-center justify-between gap-2 rounded p-1.5 ${
                  t.side === 'BUY' ? 'bg-green-400/5 text-green-400' : 'bg-red-400/5 text-red-400'
                }`}
              >
                <span className="w-10 shrink-0 font-bold">{t.side}</span>
                <span className="truncate">{t.size}</span>
                <span className="shrink-0 text-gray-500">{t.time}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel
          id="swap"
          title="Swap Execution"
          icon={Zap}
          bodyClassName="p-4"
          actions={
            <button aria-label="Swap settings" className="p-1 text-gray-500 transition hover:text-white">
              <Settings className="h-4 w-4" />
            </button>
          }
        >
          <div className="flex flex-col gap-5">
            {/* Presets */}
            <div className="space-y-2">
              <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs font-semibold text-gray-400">
                <span>AMOUNT (SOL)</span>
                <span className="font-mono text-gray-600">Bal: 0.00 SOL</span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[0.1, 0.5, 1.0, 5.0].map((val) => (
                  <button
                    key={val}
                    onClick={() => { setSelectedPreset(val); setCustomSol('') }}
                    className={`rounded py-2 text-xs font-bold transition ${
                      selectedPreset === val && !customSol
                        ? 'bg-blue-600 text-white shadow-[0_0_10px_rgba(37,99,235,0.4)]'
                        : 'bg-[#222] text-gray-400 hover:bg-[#333] hover:text-white'
                    }`}
                  >
                    {val}
                  </button>
                ))}
              </div>
              <div className="relative">
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="Custom amount..."
                  value={customSol}
                  onChange={(e) => setCustomSol(e.target.value)}
                  className="w-full rounded-lg border border-[#333] bg-[#0a0a0a] py-2.5 pl-3 pr-14 font-mono text-sm text-white transition focus:border-blue-500 focus:outline-none focus:ring-0"
                />
                <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-bold text-gray-600">
                  SOL
                </div>
              </div>
            </div>

            {/* Config */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  Slippage (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  inputMode="decimal"
                  value={slippage}
                  onChange={(e) => setSlippage(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  className="w-full rounded border border-[#333] bg-[#0a0a0a] px-2 py-1.5 font-mono text-xs text-white focus:border-blue-500 focus:outline-none focus:ring-0"
                />
              </div>
              <div className="space-y-1.5">
                <label className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  Jito Tip <Zap className="h-3 w-3 shrink-0 text-yellow-500" />
                </label>
                <input
                  type="number"
                  step="0.001"
                  inputMode="decimal"
                  value={jitoTip}
                  onChange={(e) => setJitoTip(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  className="w-full rounded border border-[#333] bg-[#0a0a0a] px-2 py-1.5 font-mono text-xs text-yellow-500 focus:border-blue-500 focus:outline-none focus:ring-0"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2.5">
              <button
                onClick={() => handleExecuteSwap('BUY')}
                className="w-full rounded-lg bg-green-500 py-3.5 text-sm font-black uppercase tracking-widest text-black shadow-[0_0_20px_rgba(34,197,94,0.2)] transition-all hover:bg-green-400 hover:shadow-[0_0_30px_rgba(34,197,94,0.4)]"
              >
                Buy
              </button>
              <button
                onClick={() => handleExecuteSwap('SELL')}
                className="w-full rounded-lg border border-red-500/30 bg-red-500/10 py-3 text-sm font-black uppercase tracking-widest text-red-500 transition-all hover:bg-red-500/20"
              >
                Sell
              </button>
            </div>

            {signingStatus && (
              <div className="break-words rounded-lg border border-[#222] bg-[#050505] p-3 font-mono text-[11px] text-blue-400">
                &gt; {signingStatus}
              </div>
            )}
          </div>
        </Panel>
      </PanelWorkspace>
    </div>
  )
}
