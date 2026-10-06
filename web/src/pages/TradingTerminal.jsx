import React, { useState } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { 
  Zap, 
  LogOut, 
  ArrowUpRight, 
  ArrowDownRight, 
  Copy, 
  Check, 
  Settings,
  Activity,
  BarChart2,
  Wallet
} from 'lucide-react'

export default function TradingTerminal() {
  const { ready, authenticated, user, login, logout } = usePrivy()
  const { wallets } = useWallets()
  const [copied, setCopied] = useState(false)
  const [signingStatus, setSigningStatus] = useState(null)
  const [selectedPreset, setSelectedPreset] = useState(0.5)
  const [customSol, setCustomSol] = useState('')
  const [jitoTip, setJitoTip] = useState(0.001)
  const [slippage, setSlippage] = useState(0.5)
  const [activeTab, setActiveTab] = useState('chart')

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
      alert('Please connect your Privy embedded wallet first.')
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

  return (
    <div className="min-h-screen bg-[#050505] text-gray-300 font-sans p-2 md:p-4">
      {/* ── Top Navbar ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between bg-[#111] border border-[#222] rounded-lg p-3 mb-4 shadow-2xl">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center w-10 h-10 bg-blue-500/10 rounded border border-blue-500/30 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.2)]">
            <Zap className="w-5 h-5 fill-current" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
              AXIOM <span className="text-blue-500">PRO</span>
            </h1>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold">
              Ultra-Low Latency Terminal
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-4 md:mt-0">
          {!ready ? (
            <div className="h-10 w-32 bg-[#222] animate-pulse rounded-lg" />
          ) : !authenticated ? (
            <button
              onClick={login}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-lg transition-all shadow-[0_0_20px_rgba(37,99,235,0.4)]"
            >
              <Wallet className="w-4 h-4" />
              Connect Wallet
            </button>
          ) : (
            <div className="flex items-center gap-3 bg-[#1a1a1a] border border-[#333] rounded-lg p-1.5 pr-3 shadow-inner">
              <div className="px-3 py-1.5 bg-[#222] rounded flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.8)]" />
                <span className="text-xs font-mono font-bold text-white">
                  {solAddress ? `${solAddress.slice(0, 4)}...${solAddress.slice(-4)}` : 'Loading...'}
                </span>
                <button onClick={handleCopyAddress} className="text-gray-400 hover:text-white transition ml-1">
                  {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <button
                onClick={logout}
                className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-400/10 rounded transition"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Main Layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        
        {/* Left Column: Chart & Feed */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          
          {/* Ticker Header */}
          <div className="bg-[#111] border border-[#222] rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img src="https://cryptologos.cc/logos/solana-sol-logo.png" alt="SOL" className="w-8 h-8 rounded-full" />
              <div>
                <div className="text-lg font-bold text-white flex items-center gap-2">
                  SOL / USDC
                  <span className="text-[10px] px-2 py-0.5 bg-gray-800 text-gray-300 rounded border border-gray-700">RAYDIUM</span>
                </div>
                <div className="text-xs text-gray-500 font-mono">So11111111111111111111111111111111111111112</div>
              </div>
            </div>
            
            <div className="flex items-center gap-8">
              <div>
                <div className="text-xs text-gray-500 font-semibold mb-1">PRICE</div>
                <div className="text-xl font-bold text-green-400 font-mono">$184.42</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 font-semibold mb-1">24H CHANGE</div>
                <div className="text-lg font-bold text-green-400 font-mono flex items-center">
                  <ArrowUpRight className="w-4 h-4" /> +6.4%
                </div>
              </div>
              <div className="hidden sm:block">
                <div className="text-xs text-gray-500 font-semibold mb-1">VOL (24H)</div>
                <div className="text-lg font-bold text-white font-mono">$42.1M</div>
              </div>
            </div>
          </div>

          {/* Chart Area Placeholder */}
          <div className="bg-[#111] border border-[#222] rounded-lg p-1 flex-1 min-h-[400px] flex flex-col">
            <div className="flex items-center gap-1 border-b border-[#222] p-2">
              <button className={`px-4 py-1.5 text-xs font-bold rounded ${activeTab === 'chart' ? 'bg-blue-600/20 text-blue-400' : 'text-gray-400 hover:text-white'}`} onClick={() => setActiveTab('chart')}>
                <BarChart2 className="w-3 h-3 inline mr-1.5"/> CHART
              </button>
              <button className={`px-4 py-1.5 text-xs font-bold rounded ${activeTab === 'feed' ? 'bg-blue-600/20 text-blue-400' : 'text-gray-400 hover:text-white'}`} onClick={() => setActiveTab('feed')}>
                <Activity className="w-3 h-3 inline mr-1.5"/> LIVE TRADES
              </button>
            </div>
            
            <div className="flex-1 flex items-center justify-center bg-[#0a0a0a] m-2 rounded border border-[#222] relative overflow-hidden">
              {/* Fake Chart Grid Background */}
              <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:20px_20px]" />
              
              {activeTab === 'chart' ? (
                <div className="text-center z-10">
                  <Activity className="w-12 h-12 text-gray-700 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-gray-500">TradingView integration pending.</p>
                </div>
              ) : (
                <div className="w-full h-full p-4 overflow-y-auto font-mono text-xs z-10 space-y-1">
                  <div className="flex justify-between text-green-400 bg-green-400/5 p-1 rounded"><span className="w-16">BUY</span><span>0.42 SOL</span><span className="text-gray-500">14:02:11</span></div>
                  <div className="flex justify-between text-red-400 bg-red-400/5 p-1 rounded"><span className="w-16">SELL</span><span>1.50 SOL</span><span className="text-gray-500">14:02:10</span></div>
                  <div className="flex justify-between text-green-400 bg-green-400/5 p-1 rounded"><span className="w-16">BUY</span><span>12.0 SOL</span><span className="text-gray-500">14:02:08</span></div>
                  <div className="flex justify-between text-red-400 bg-red-400/5 p-1 rounded"><span className="w-16">SELL</span><span>0.10 SOL</span><span className="text-gray-500">14:02:04</span></div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Execution Panel */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          <div className="bg-[#111] border border-[#222] rounded-lg p-5 flex flex-col gap-6 relative overflow-hidden">
            {/* Glow effect */}
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-blue-600/10 blur-3xl rounded-full pointer-events-none" />

            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black text-white flex items-center gap-2">
                SWAP EXECUTION
              </h2>
              <Settings className="w-4 h-4 text-gray-500 cursor-pointer hover:text-white transition" />
            </div>

            {/* Presets */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-gray-400 font-semibold">
                <span>AMOUNT (SOL)</span>
                <span className="text-gray-600 font-mono">Bal: 0.00 SOL</span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[0.1, 0.5, 1.0, 5.0].map((val) => (
                  <button
                    key={val}
                    onClick={() => { setSelectedPreset(val); setCustomSol(''); }}
                    className={`py-2 text-xs font-bold rounded transition ${
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
                  placeholder="Custom amount..."
                  value={customSol}
                  onChange={(e) => setCustomSol(e.target.value)}
                  className="w-full bg-[#0a0a0a] border border-[#333] rounded-lg px-3 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-blue-500 transition mt-2"
                />
                <div className="absolute right-3 top-5 text-xs font-bold text-gray-600">SOL</div>
              </div>
            </div>

            {/* Sliders / Config */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Slippage (%)</label>
                <div className="flex items-center bg-[#0a0a0a] border border-[#333] rounded px-2 py-1.5">
                  <input
                    type="number"
                    step="0.1"
                    value={slippage}
                    onChange={(e) => setSlippage(parseFloat(e.target.value))}
                    className="w-full bg-transparent text-xs font-mono text-white focus:outline-none"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider flex items-center gap-1">
                  Jito Tip <Zap className="w-3 h-3 text-yellow-500" />
                </label>
                <div className="flex items-center bg-[#0a0a0a] border border-[#333] rounded px-2 py-1.5">
                  <input
                    type="number"
                    step="0.001"
                    value={jitoTip}
                    onChange={(e) => setJitoTip(parseFloat(e.target.value))}
                    className="w-full bg-transparent text-xs font-mono text-yellow-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-3 mt-2">
              <button
                onClick={() => handleExecuteSwap('BUY')}
                className="w-full py-4 bg-green-500 hover:bg-green-400 text-black text-sm font-black uppercase tracking-widest rounded-lg transition-all shadow-[0_0_20px_rgba(34,197,94,0.2)] hover:shadow-[0_0_30px_rgba(34,197,94,0.4)]"
              >
                Buy
              </button>
              <button
                onClick={() => handleExecuteSwap('SELL')}
                className="w-full py-3 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30 text-sm font-black uppercase tracking-widest rounded-lg transition-all"
              >
                Sell
              </button>
            </div>

            {/* Console Log */}
            {signingStatus && (
              <div className="bg-[#050505] border border-[#222] rounded-lg p-3 text-[11px] font-mono text-blue-400 break-words mt-2">
                &gt; {signingStatus}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
