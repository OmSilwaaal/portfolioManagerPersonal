import React, { useState, useEffect } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { Keypair, Transaction, SystemProgram, PublicKey } from '@solana/web3.js'
import { 
  Zap, 
  ShieldCheck, 
  Wallet, 
  LogIn, 
  LogOut, 
  TrendingUp, 
  ArrowUpRight, 
  ArrowDownRight, 
  Activity, 
  Settings, 
  Copy, 
  Check, 
  ExternalLink,
  Cpu,
  Layers,
  Flame
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
  const [activeTab, setActiveTab] = useState('raydium')

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

  // Phase 1 Placeholder: Sign & Execution function handler
  const handleExecuteSwap = async (direction = 'BUY') => {
    if (!solAddress) {
      alert('Please connect your Privy embedded wallet first.')
      return
    }

    const amount = customSol ? parseFloat(customSol) : selectedPreset
    setSigningStatus(`Preparing ${direction} transaction of ${amount} SOL via Helius/Jito...`)

    try {
      // Simulate transaction build & signature request (Phase 1 scaffolding)
      await new Promise((res) => setTimeout(res, 800))
      
      setSigningStatus(`Requesting embedded wallet signature for ${solAddress.slice(0, 6)}...${solAddress.slice(-4)}`)
      await new Promise((res) => setTimeout(res, 1200))

      setSigningStatus(`SUCCESS: Mock transaction signed! Jito Tip: ${jitoTip} SOL attached. Ready for Phase 4 Helius dispatch.`)
    } catch (err) {
      console.error('Signing error:', err)
      setSigningStatus(`ERROR: ${err.message || 'Failed to sign transaction'}`)
    }
  }

  return (
    <div className="min-h-screen bg-[#0b0b0b] text-[#f0ebe0] font-mono p-4 md:p-6 space-y-6">
      {/* Terminal Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-[#1f1f1f] pb-4 gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#1f2910] border border-[#3e4d26] text-[#9eae84]">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold font-display tracking-tight text-white">AXIOM TERMINAL</h1>
              <span className="text-xs px-2 py-0.5 bg-[#3e4d26]/30 text-[#9eae84] border border-[#3e4d26] uppercase tracking-wider">
                gRPC + Jito Engine
              </span>
            </div>
            <p className="text-xs text-[#a39d8d]">Low-Latency Solana DEX Execution & Yellowstone gRPC Stream</p>
          </div>
        </div>

        {/* Auth / Embedded Wallet Bar */}
        <div className="flex items-center gap-3">
          {!ready ? (
            <div className="h-9 w-32 bg-[#141414] animate-pulse rounded" />
          ) : !authenticated ? (
            <button
              onClick={login}
              className="flex items-center gap-2 px-4 py-2 bg-[#3e4d26] hover:bg-[#566838] text-white text-sm font-semibold transition-all border border-[#9eae84]/30 shadow-lg"
            >
              <LogIn className="w-4 h-4" />
              <span>Connect Privy Wallet</span>
            </button>
          ) : (
            <div className="flex items-center gap-2 bg-[#141414] border border-[#25231d] px-3 py-1.5">
              <div className="w-2 h-2 rounded-full bg-[#7ea968] animate-ping" />
              <div className="text-xs">
                <div className="text-[#a39d8d] text-[10px]">SOLANA EMBEDDED WALLET</div>
                <div className="font-bold text-white flex items-center gap-1.5">
                  {solAddress ? `${solAddress.slice(0, 4)}...${solAddress.slice(-4)}` : 'Generating...'}
                  <button onClick={handleCopyAddress} className="text-[#a39d8d] hover:text-white transition">
                    {copied ? <Check className="w-3.5 h-3.5 text-[#7ea968]" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
              <button
                onClick={logout}
                title="Disconnect"
                className="ml-2 p-1 text-[#a39d8d] hover:text-[#d35c4a] transition"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Terminal Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Live Feed / Orderbook (gRPC pipeline placeholder) */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-[#141414] border border-[#1f1f1f] p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-[#25231d] pb-3">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setActiveTab('raydium')}
                  className={`text-xs font-bold uppercase tracking-wider pb-1 border-b-2 transition ${
                    activeTab === 'raydium' ? 'border-[#9eae84] text-[#9eae84]' : 'border-transparent text-[#a39d8d]'
                  }`}
                >
                  Raydium V4 Stream
                </button>
                <button
                  onClick={() => setActiveTab('pump')}
                  className={`text-xs font-bold uppercase tracking-wider pb-1 border-b-2 transition ${
                    activeTab === 'pump' ? 'border-[#9eae84] text-[#9eae84]' : 'border-transparent text-[#a39d8d]'
                  }`}
                >
                  Pump.fun Bonding Curve
                </button>
              </div>
              <div className="flex items-center gap-2 text-xs text-[#a39d8d]">
                <Cpu className="w-3.5 h-3.5 text-[#9eae84]" />
                <span>Yellowstone gRPC: <span className="text-[#7ea968]">Ready</span></span>
              </div>
            </div>

            {/* Price Header Banner */}
            <div className="flex items-center justify-between bg-[#0b0b0b] p-3 border border-[#25231d]">
              <div>
                <span className="text-xs text-[#a39d8d]">PAIR</span>
                <div className="text-base font-bold text-white font-display">SOL / USDC (Raydium)</div>
              </div>
              <div>
                <span className="text-xs text-[#a39d8d]">LAST PRICE</span>
                <div className="text-base font-bold text-[#7ea968]">$184.42</div>
              </div>
              <div>
                <span className="text-xs text-[#a39d8d]">24H DELTA</span>
                <div className="text-base font-bold text-[#7ea968] flex items-center">
                  <ArrowUpRight className="w-4 h-4" /> +6.4%
                </div>
              </div>
              <div>
                <span className="text-xs text-[#a39d8d]">EST. SPEED</span>
                <div className="text-base font-bold text-[#d6b87a]">&lt; 150ms</div>
              </div>
            </div>

            {/* Live Stream Output Placeholder */}
            <div className="space-y-2">
              <div className="text-xs font-bold text-[#a39d8d] uppercase tracking-wider flex items-center justify-between">
                <span>Yellowstone gRPC Account Updates (Upstash Redis Cache)</span>
                <span className="text-[10px] text-[#555143]">Triton gRPC Gateway</span>
              </div>
              <div className="bg-[#070707] border border-[#1f1f1f] p-3 h-64 overflow-y-auto space-y-1 text-xs text-[#a39d8d]">
                <div className="text-[#555143]">[SYSTEM] Initializing Yellowstone gRPC subscription filter...</div>
                <div className="text-[#555143]">[PROGRAM] Filter set to Raydium V4 (675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8)</div>
                <div className="text-[#9eae84]">[GRPC RECV] Account Update slot 284910291 | Pool: 58oQm... | Res: 1420.4 SOL / 262,100 USDC</div>
                <div className="text-[#9eae84]">[GRPC RECV] Account Update slot 284910292 | Pool: 58oQm... | Res: 1421.1 SOL / 261,980 USDC</div>
                <div className="text-[#d6b87a]">[REDIS] Cached state update to Upstash pipeline (Latency: 12ms)</div>
                <div className="text-[#9eae84]">[GRPC RECV] Account Update slot 284910295 | Pool: 58oQm... | Res: 1419.8 SOL / 262,250 USDC</div>
                <div className="text-[#7ea968]">[SWAP EVENT] Large Swap Detected: 45.0 SOL -&gt; USDC</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Execution Order Entry */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-[#141414] border border-[#1f1f1f] p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-[#25231d] pb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-[#9eae84] flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-[#d35c4a]" /> Instant Swap Order
              </span>
              <span className="text-[10px] px-1.5 py-0.5 bg-[#d35c4a]/20 text-[#d35c4a] border border-[#d35c4a]/40">
                MEV-Bypass Active
              </span>
            </div>

            {/* Preset Amount Selector */}
            <div className="space-y-1.5">
              <label className="text-xs text-[#a39d8d]">SELECT TRADE AMOUNT (SOL)</label>
              <div className="grid grid-cols-4 gap-2">
                {[0.1, 0.5, 1.0, 2.5].map((val) => (
                  <button
                    key={val}
                    onClick={() => {
                      setSelectedPreset(val)
                      setCustomSol('')
                    }}
                    className={`py-1.5 text-xs font-bold border transition ${
                      selectedPreset === val && !customSol
                        ? 'bg-[#3e4d26] text-white border-[#9eae84]'
                        : 'bg-[#0b0b0b] text-[#a39d8d] border-[#25231d] hover:border-[#555143]'
                    }`}
                  >
                    {val} SOL
                  </button>
                ))}
              </div>
              <input
                type="number"
                placeholder="Custom SOL Amount..."
                value={customSol}
                onChange={(e) => setCustomSol(e.target.value)}
                className="w-full bg-[#0b0b0b] border border-[#25231d] px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#9eae84]"
              />
            </div>

            {/* Execution Config */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <label className="text-[10px] text-[#a39d8d]">JITO TIP (SOL)</label>
                <input
                  type="number"
                  step="0.001"
                  value={jitoTip}
                  onChange={(e) => setJitoTip(parseFloat(e.target.value))}
                  className="w-full bg-[#0b0b0b] border border-[#25231d] px-2 py-1 text-xs text-[#d6b87a]"
                />
              </div>
              <div>
                <label className="text-[10px] text-[#a39d8d]">SLIPPAGE (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={slippage}
                  onChange={(e) => setSlippage(parseFloat(e.target.value))}
                  className="w-full bg-[#0b0b0b] border border-[#25231d] px-2 py-1 text-xs text-[#9eae84]"
                />
              </div>
            </div>

            {/* Buy / Sell Trigger Buttons */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => handleExecuteSwap('BUY')}
                className="w-full py-2.5 bg-[#3e4d26] hover:bg-[#566838] text-white text-xs font-bold uppercase tracking-wider border border-[#9eae84]/40 transition"
              >
                Instant Buy
              </button>
              <button
                onClick={() => handleExecuteSwap('SELL')}
                className="w-full py-2.5 bg-[#803e26] hover:bg-[#a4583c] text-white text-xs font-bold uppercase tracking-wider border border-[#c2785a]/40 transition"
              >
                Instant Sell
              </button>
            </div>

            {/* Status Output Log */}
            {signingStatus && (
              <div className="bg-[#070707] border border-[#25231d] p-3 text-xs text-[#d6b87a] leading-relaxed break-words">
                {signingStatus}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
