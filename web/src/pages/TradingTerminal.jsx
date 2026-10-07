import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { usePrivy } from '@privy-io/react-auth'
import {
  Zap, Wallet, LogIn, LogOut, Search, Copy, Check, RefreshCw, AlertTriangle,
  ArrowUpRight, ArrowDownRight, Flame, Sparkles, Rocket, X, Loader2, Radar,
  RotateCcw,
} from 'lucide-react'
import MemeChart from '../components/MemeChart'
import { useGetPortfolioQuery } from '../api/paperTradingApi'
import {
  useGetTrendingMemecoinsQuery,
  useGetNewMemecoinsQuery,
  useSearchMemecoinsQuery,
  useGetMemecoinQuery,
  useGetMemecoinOhlcvQuery,
  useGetMemecoinTradesQuery,
  useGetMemecoinSignalsQuery,
  useGetMemecoinSignalQuery,
  useGetRadarSignalsQuery,
  useGetMemePositionsQuery,
  useGetMemeHistoryQuery,
  useQuoteMemecoinMutation,
  useTradeMemecoinMutation,
  isMockData,
  usePoll,
  useRateLimited,
  rateLimitedUntil,
} from '../api/memecoinApi'
import PanelWorkspace from '../components/terminal/PanelWorkspace'
import WorkspacePanel from '../components/terminal/Panel'

/* ─── Helpers ────────────────────────────────────────────────────────────── */
const ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
const TIMEFRAMES = ['1m', '5m', '15m', '1h']
const SOL_PRESETS = [0.1, 0.5, 1, 2.5, 5]
const SELL_PCTS = [25, 50, 75, 100]
const HISTORY_PAGE = 25
// Poll intervals (ms). Global /api limiter is 60 req/min per IP and is shared with the rest of the app, so every
// poller is slow, only runs while its panel is visible/needed, and is paused when the tab is hidden or on a 429
// (see usePoll in memecoinApi). Upstream caches: token 10s, trades 8s, ohlcv 10-20s, lists 30s, signals 45s.
const POLL = { detail: 10_000, signal: 30_000, radar: 20_000, lists: 30_000, signals: 60_000, trades: 10_000, positions: 30_000 }
const CHART_POLL = { '1m': 15_000, '5m': 30_000, '15m': 60_000, '1h': 120_000 }

// Untrusted token text (names/symbols come from third parties). React renders it as text, never HTML; this also
// removes bidi/zero-width/control characters and caps the length so it cannot spoof or break the layout.
const UNSAFE_TEXT = /[\p{Cc}\p{Cf}\p{Co}\p{Zl}\p{Zp}]/gu
function safeText(v, max = 32) {
  if (typeof v !== 'string' && typeof v !== 'number') return ''
  return Array.from(String(v).slice(0, max * 4).replace(/\s+/g, ' ').replace(UNSAFE_TEXT, '').normalize('NFKC').trim()).slice(0, max).join('')
}

const short = (a, n = 4) => (a ? `${a.slice(0, n)}...${a.slice(-n)}` : '')

function fmtUsd(n) {
  if (n == null || isNaN(n)) return '--'
  const a = Math.abs(n)
  if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (a >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (a >= 1e3) return `$${(n / 1e3).toFixed(1)}K`
  return `$${n.toFixed(2)}`
}
function fmtPrice(p) {
  if (p == null || isNaN(p)) return '--'
  if (p >= 1) return `$${p.toFixed(2)}`
  if (p >= 0.01) return `$${p.toFixed(4)}`
  return `$${Number(p.toPrecision(3)).toString().includes('e') ? p.toExponential(2) : p.toPrecision(3)}`
}
function fmtNum(n) {
  if (n == null || isNaN(n)) return '--'
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })
}
function fmtAge(min) {
  if (min == null) return ''
  if (min < 60) return `${Math.round(min)}m`
  if (min < 1440) return `${Math.floor(min / 60)}h`
  return `${Math.floor(min / 1440)}d`
}
function timeAgo(ts) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  return `${Math.floor(s / 3600)}h`
}
const errMsg = (e) => e?.status === 429
  ? 'Slow down: too many requests. Live updates are paused for a moment.'
  : e?.data?.error || e?.data?.message || e?.error || (e?.status ? `Request failed (${e.status})` : 'Request failed')
const pctColor = (v) => (v == null ? 'text-[#a39d8d]' : v >= 0 ? 'text-[#7ea968]' : 'text-[#d35c4a]')
const fmtPct = (v) => (v == null || isNaN(v) ? '--' : `${v >= 0 ? '+' : ''}${Number(v).toFixed(2)}%`)

const newOrderId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`)
const fmtTokens = (n) => (n == null || isNaN(n) ? '--' : Math.abs(n) >= 1 ? fmtNum(n) : Number(n).toPrecision(3))

/* ─── Small UI primitives ────────────────────────────────────────────────── */
const Skel = ({ className = '' }) => <div className={`bg-white/[0.06] animate-pulse rounded-lg ${className}`} />

function ErrorBox({ error, onRetry, label = 'Failed to load' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-4 text-center text-xs text-[#a39d8d]">
      <AlertTriangle className="w-5 h-5 text-[#d6b87a]" />
      <div>{label}</div>
      <div className="text-[10px] text-[#555143] break-words max-w-full">{errMsg(error)}</div>
      {onRetry && error?.status !== 429 && (
        <button onClick={onRetry} className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/5 hover:bg-[#9eae84]/15 text-[#9eae84] transition">
          <RefreshCw className="w-3 h-3" /> Retry
        </button>
      )}
    </div>
  )
}

/* Glass panel: translucent surface, soft lift shadow, hairline top highlight. No hard edges —
 * depth comes from the shadow + a vertical gradient fill instead of a border. */
function Panel({ className = '', tint = 'from-white/[0.05] to-white/[0.015]', children }) {
  return (
    <section
      className={`relative min-w-0 overflow-hidden rounded-[28px] bg-[#121212]/60 bg-gradient-to-b ${tint} backdrop-blur-2xl shadow-[0_30px_70px_-30px_rgba(0,0,0,0.85)] before:content-[''] before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent ${className}`}
    >
      {children}
    </section>
  )
}

function Tabs({ tabs, value, onChange }) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto no-scrollbar rounded-full bg-black/25 p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full whitespace-nowrap transition-all ${
            value === t.id
              ? 'bg-[#3e4d26]/70 text-[#dce8c9] shadow-[0_4px_14px_-4px_rgba(158,174,132,0.55)]'
              : 'text-[#a39d8d] hover:text-white hover:bg-white/5'
          }`}
        >
          {t.icon}{t.label}
        </button>
      ))}
    </div>
  )
}

/* Ambient backdrop: slow drifting color blobs + hairline scan texture behind the glass panels */
function GlassBackground() {
  return (
    <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
      <div className="absolute inset-0 bg-[#070706]" />
      <div className="absolute -top-1/4 -left-1/4 w-[60vw] h-[60vw] rounded-full bg-[#3e4d26]/25 blur-[120px] animate-[auroraDriftA_24s_ease-in-out_infinite]" />
      <div className="absolute top-1/4 -right-1/4 w-[55vw] h-[55vw] rounded-full bg-[#a88847]/12 blur-[130px] animate-[auroraDriftB_28s_ease-in-out_infinite]" />
      <div className="absolute -bottom-1/3 left-1/4 w-[50vw] h-[50vw] rounded-full bg-[#803e26]/15 blur-[120px] animate-[auroraDriftC_32s_ease-in-out_infinite]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,#050504_88%)]" />
      <div
        className="absolute inset-0 opacity-[0.035] mix-blend-overlay"
        style={{ backgroundImage: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.5) 0px, rgba(255,255,255,0.5) 1px, transparent 1px, transparent 3px)' }}
      />
    </div>
  )
}

/* ─── Top bar: brand, search, wallet ─────────────────────────────────────── */
function useSolBalance(address) {
  const [bal, setBal] = useState(null)
  useEffect(() => {
    setBal(null)
    if (!address) return
    let alive = true
    fetch('https://api.mainnet-beta.solana.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [address] }),
    })
      .then((r) => r.json())
      .then((j) => { if (alive && typeof j?.result?.value === 'number') setBal(j.result.value / 1e9) })
      .catch(() => {})
    return () => { alive = false }
  }, [address])
  return bal
}

function TokenSearch({ onSelect }) {
  const [q, setQ] = useState('')
  const [dq, setDq] = useState('')
  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)

  useEffect(() => {
    const t = setTimeout(() => setDq(q.trim()), 300)
    return () => clearTimeout(t)
  }, [q])
  useEffect(() => {
    const h = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const isAddr = ADDRESS_RE.test(dq)
  const { data, isFetching, isError, error } = useSearchMemecoinsQuery(dq, { skip: dq.length < 2 })
  const results = Array.isArray(data) ? data : []

  const pick = (address) => { onSelect(address); setQ(''); setDq(''); setOpen(false) }

  return (
    <div ref={boxRef} className="relative w-full md:max-w-md">
      <form onSubmit={(e) => { e.preventDefault(); if (isAddr) pick(dq); else if (results[0]) pick(results[0].address) }}>
        <Search className="w-3.5 h-3.5 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#555143]" />
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder="Search name, symbol or contract address"
          className="w-full rounded-full bg-black/30 backdrop-blur-md pl-9 pr-9 py-2.5 text-sm text-white placeholder-[#6b6657] focus:outline-none focus:ring-2 focus:ring-[#9eae84]/25 transition"
        />
        {q && (
          <button type="button" onClick={() => { setQ(''); setDq('') }} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#555143] hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </form>
      {open && dq.length >= 2 && (
        <div className="absolute z-30 mt-2 w-full rounded-2xl bg-[#141414]/90 backdrop-blur-2xl shadow-[0_24px_60px_-20px_rgba(0,0,0,0.8)] max-h-80 overflow-y-auto overflow-hidden">
          {isAddr && (
            <button onClick={() => pick(dq)} className="w-full text-left px-3.5 py-2.5 text-xs hover:bg-white/5 bg-gradient-to-b from-white/[0.04] to-transparent text-[#d6b87a]">
              Open contract {short(dq, 6)}
            </button>
          )}
          {isFetching && <div className="p-3 space-y-2"><Skel className="h-4 w-full" /><Skel className="h-4 w-3/4" /></div>}
          {!isFetching && isError && !isAddr && <ErrorBox error={error} label="Search failed" />}
          {!isFetching && !isError && results.length === 0 && !isAddr && (
            <div className="p-3 text-xs text-[#a39d8d]">No tokens found for "{dq}"</div>
          )}
          {!isFetching && results.map((t) => (
            <button key={t.address} onClick={() => pick(t.address)} className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-xs hover:bg-white/5 text-left">
              <span className="truncate"><span className="font-bold text-white">{safeText(t.symbol)}</span> <span className="text-[#a39d8d]">{safeText(t.name, 48)}</span></span>
              <span className="text-[#555143] shrink-0">{fmtUsd(t.marketCap)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function TopBar({ onSelect, solAddress, solBalance, paperCash, onResetLayout }) {
  const { ready, authenticated, login, logout } = usePrivy()
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    if (!solAddress) return
    try { await navigator.clipboard.writeText(solAddress); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* clipboard blocked */ }
  }

  return (
    <header className="relative z-10 flex flex-col md:flex-row md:items-center gap-2.5 md:gap-4 px-4 py-3 bg-black/30 backdrop-blur-xl">
      <div className="flex items-center gap-2.5 shrink-0">
        <div className="p-2 rounded-xl bg-gradient-to-br from-[#3e4d26] to-[#1f2910] text-[#9eae84] shadow-[0_0_20px_-4px_rgba(158,174,132,0.6)]">
          <Zap className="w-4 h-4" />
        </div>
        <h1 className="text-sm font-bold font-display tracking-tight text-white">AXIOM TERMINAL</h1>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#d6b87a]/15 text-[#d6b87a] uppercase tracking-wider">Paper</span>
      </div>

      <TokenSearch onSelect={onSelect} />

      <div className="flex items-center gap-2 md:ml-auto text-xs flex-wrap">
        <div className="px-3 py-1.5 rounded-full bg-white/5 backdrop-blur-md" title="Paper-trading cash balance">
          <span className="text-[#555143] mr-1">PAPER</span>
          <span className="text-white font-bold">{paperCash == null ? '--' : fmtUsd(paperCash)}</span>
        </div>
        <button onClick={onResetLayout} title="Reset panel layout" className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-[#a39d8d] hover:text-white backdrop-blur-md transition">
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
        {!ready ? (
          <Skel className="h-8 w-28 rounded-full" />
        ) : !authenticated ? (
          <button onClick={login} className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-gradient-to-r from-[#3e4d26] to-[#566838] hover:brightness-110 text-white font-semibold shadow-[0_8px_24px_-8px_rgba(158,174,132,0.5)] transition">
            <LogIn className="w-3.5 h-3.5" /> Connect Wallet
          </button>
        ) : (
          <div className="flex items-center gap-2 rounded-full bg-white/5 backdrop-blur-md px-3 py-1.5">
            <Wallet className="w-3.5 h-3.5 text-[#9eae84]" />
            {solAddress ? (
              <>
                <span className="font-bold text-white">{short(solAddress)}</span>
                <span className="text-[#d6b87a]">{solBalance == null ? '-- SOL' : `${solBalance.toFixed(3)} SOL`}</span>
                <button onClick={copy} title="Copy address" className="text-[#a39d8d] hover:text-white">
                  {copied ? <Check className="w-3.5 h-3.5 text-[#7ea968]" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </>
            ) : (
              <span className="text-[#a39d8d] flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> No Solana wallet yet</span>
            )}
            <button onClick={logout} title="Disconnect" className="text-[#a39d8d] hover:text-[#d35c4a]"><LogOut className="w-3.5 h-3.5" /></button>
          </div>
        )}
      </div>
    </header>
  )
}

/* ─── Unusual-activity signal (not a prediction) ─────────────────────────── */
const SIGNAL_CAPTION = 'Unusual-activity score from price/volume. Not a prediction or financial advice.'
const RADAR_CAPTION = 'Radar activity/risk score (hand-set model, not validated). Not a prediction or financial advice.'
const SOURCE_LABEL = { radar: 'Radar', 'activity-v0': 'Activity v0' }
const captionFor = (sig) => (sig?.source === 'radar' ? RADAR_CAPTION : SIGNAL_CAPTION)
const RADAR_OFF_HINT = 'Radar is off. Set ENABLE_RADAR=true on the backend to see new launches.'
const LEVEL_STYLE = {
  QUIET: { text: 'text-[#a39d8d]', chip: 'bg-[#555143]/20', bar: 'bg-[#555143]' },
  WARMING: { text: 'text-[#d6b87a]', chip: 'bg-[#d6b87a]/15', bar: 'bg-[#d6b87a]' },
  ACTIVE: { text: 'text-[#9eae84]', chip: 'bg-[#9eae84]/15', bar: 'bg-[#9eae84]' },
  HOT: { text: 'text-[#d35c4a]', chip: 'bg-[#d35c4a]/15', bar: 'bg-[#d35c4a]' },
}
const COMPONENT_LABELS = {
  volume_accel: 'Volume vs typical',
  price_accel: 'Price move vs own volatility',
  buy_sell_imbalance: 'Buy/sell imbalance',
  realized_vol: 'Realized volatility',
  liquidity_delta: 'Liquidity change',
  rank_vs_cohort: 'Rank vs new launches',
  buy_pressure: 'Buy pressure',
  txn_accel: 'Transaction acceleration',
  price_momentum: 'Price momentum (15m)',
  curve_progress: 'Bonding-curve progress',
  market_regime: 'Market buy pressure',
  calm_price: 'Price calmness',
}

function SourceTag({ source }) {
  if (!source) return null
  return (
    <span className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded-full uppercase tracking-wider ${source === 'radar' ? 'text-[#9eae84] bg-[#9eae84]/10' : 'text-[#555143] bg-white/5'}`}
      title={`Score source: ${SOURCE_LABEL[source] || source}`}>{source === 'radar' ? 'radar' : 'v0'}</span>
  )
}

function FlagBadge({ f }) {
  const danger = f.severity === 'danger'
  return (
    <span title={f.detail} className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full backdrop-blur-sm ${danger ? 'text-[#d35c4a] bg-[#d35c4a]/15' : 'text-[#d6b87a] bg-[#d6b87a]/15'}`}>
      <AlertTriangle className="w-3 h-3" />{f.label}
    </span>
  )
}

function SignalBadge({ sig }) {
  if (!sig) return null
  const st = LEVEL_STYLE[sig.level] || LEVEL_STYLE.QUIET
  const low = sig.confidence != null && sig.confidence < 0.5
  return (
    <span
      title={`${SOURCE_LABEL[sig.source] || 'Activity'} score ${sig.score} (${sig.level})${low ? ', low confidence' : ''}. Not a prediction.`}
      className={`shrink-0 min-w-[28px] text-center px-1.5 py-0.5 rounded-full text-[10px] font-bold ${st.text} ${st.chip} ${low ? 'opacity-60' : ''}`}
    >{Math.round(sig.score)}</span>
  )
}

function SignalPanel({ address }) {
  const q = useGetMemecoinSignalQuery(address, { skip: !address, pollingInterval: usePoll(POLL.signal) })
  const sig = q.data
  const st = LEVEL_STYLE[sig?.level] || LEVEL_STYLE.QUIET
  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[11px] text-[#8a8574] uppercase tracking-wide">Activity signal</span>
        <SourceTag source={sig?.source} />
        {q.isFetching && !q.isLoading && <Loader2 className="w-3 h-3 animate-spin text-[#555143]" />}
      </div>
      {q.isLoading ? (
        <Skel className="h-12 w-full" />
      ) : q.isError ? (
        <ErrorBox error={q.error} onRetry={q.refetch} label="Signal unavailable" />
      ) : sig ? (
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <div className="shrink-0">
            <div className={`text-2xl font-bold leading-none ${st.text}`}>{Math.round(sig.score)}<span className="text-[10px] text-[#555143]">/100</span></div>
            <div className={`text-[10px] font-bold tracking-wider ${st.text}`}>{sig.level}</div>
            <div className="text-[10px] text-[#555143]">confidence {Math.round((sig.confidence ?? 0) * 100)}%{sig.mode === 'list-only' ? ' (list data only)' : ''}</div>
            {sig.source === 'radar' && sig.radar && (
              <div className="text-[10px] text-[#555143]">
                {sig.radar.launch?.state}{sig.radar.launch?.ageMin != null ? ` · ${fmtAge(sig.radar.launch.ageMin)}` : ''}
                {sig.radar.passesSafetyGate ? ' · gate ok' : ' · gate failed'}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-[180px] space-y-1.5">
            {Object.entries(sig.components || {}).map(([k, c]) => (
              <div key={k} className="flex items-center gap-2 text-[10px] text-[#a39d8d]">
                <span className="w-36 shrink-0 truncate">{COMPONENT_LABELS[k] || k}</span>
                <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                  {c.score != null && <div className={`h-full rounded-full ${st.bar}`} style={{ width: `${c.score}%` }} />}
                </div>
                <span className="w-7 text-right text-[#555143]">{c.score != null ? Math.round(c.score) : 'n/a'}</span>
              </div>
            ))}
          </div>
          {sig.riskFlags?.length > 0 && (
            <div className="w-full flex flex-wrap gap-1.5">
              {sig.riskFlags.map((f) => <FlagBadge key={f.code} f={{ severity: 'danger', ...f }} />)}
            </div>
          )}
        </div>
      ) : null}
      <div className="mt-1.5 text-[10px] text-[#555143] italic">{captionFor(sig)}</div>
    </div>
  )
}

/* ─── Discovery columns ──────────────────────────────────────────────────── */
// Compact multi-timeframe trend indicator for a discovery row. Real per-row OHLCV would mean one
// extra request per visible token (list can show 40) against a shared 60req/min limiter, so this is
// built from the interval deltas the list endpoints already return — a shape, not a tick chart.
function MiniTrend({ points }) {
  const known = points.map((p) => p.value).filter((v) => v != null)
  if (known.length === 0) return null
  const max = Math.max(0.5, ...known.map((v) => Math.abs(v)))
  return (
    <div
      className="flex items-end gap-0.5 h-5 w-5 shrink-0"
      title={points.map((p) => `${p.label} ${p.value == null ? 'n/a' : fmtPct(p.value)}`).join(' · ')}
    >
      {points.map((p, i) => {
        const v = p.value
        const h = v == null ? 20 : Math.max(20, Math.min(100, (Math.abs(v) / max) * 100))
        return (
          <div
            key={i}
            className="flex-1 rounded-full"
            style={{ height: `${h}%`, background: v == null ? 'rgba(255,255,255,0.12)' : v >= 0 ? '#7ea968' : '#d35c4a' }}
          />
        )
      })}
    </div>
  )
}

function TokenRow({ t, active, onSelect, sig }) {
  return (
    <button
      onClick={() => onSelect(t.address)}
      className={`block text-left mx-2 my-1 px-3 py-2.5 rounded-xl transition w-[calc(100%-1rem)] ${active ? 'bg-[#9eae84]/10 ring-1 ring-[#9eae84]/40' : 'hover:bg-white/5'}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex items-center gap-2">
          <div className="w-9 h-9 shrink-0 rounded-full bg-white/5 ring-1 ring-white/10 text-[11px] flex items-center justify-center font-bold text-[#9eae84] overflow-hidden">
            {t.image ? <img src={t.image} alt="" className="w-full h-full object-cover" loading="lazy" /> : safeText(t.symbol || '?', 4).slice(0, 2)}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-white flex items-center gap-1.5"><SignalBadge sig={sig} /><SourceTag source={sig?.source} /><span className="truncate">{safeText(t.symbol)} <span className="font-normal text-[#b3ad9d]">{safeText(t.name, 48)}</span></span></div>
            <div className="text-[11px] text-[#6b6657]">{short(t.address)}{t.ageMinutes != null && ` · ${fmtAge(t.ageMinutes)}`}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <MiniTrend points={[{ label: '5m', value: t.change5m }, { label: '1h', value: t.change1h }, { label: '24h', value: t.change24h }]} />
          <div className="text-right">
            <div className="text-sm text-white">{fmtUsd(t.marketCap)}</div>
            <div className={`text-[11px] font-semibold ${pctColor(t.change24h ?? t.change1h)}`}>{fmtPct(t.change24h ?? t.change1h)}</div>
          </div>
        </div>
      </div>
      <div className="flex gap-3 mt-1.5 text-[11px] text-[#6b6657]">
        <span>V {fmtUsd(t.volume24h)}</span><span>L {fmtUsd(t.liquidity)}</span>{t.holders != null && <span>H {fmtNum(t.holders)}</span>}
      </div>
      {t.bondingProgress != null && (
        <div className="mt-1.5 h-1 rounded-full bg-white/10 overflow-hidden"><div className="h-full rounded-full bg-[#9eae84]" style={{ width: `${Math.min(100, t.bondingProgress)}%` }} /></div>
      )}
    </button>
  )
}

function RadarRow({ s, active, onSelect }) {
  const flags = s.riskFlags || []
  const danger = flags.filter((f) => f.severity === 'danger')
  const warn = flags.filter((f) => f.severity !== 'danger')
  const p = s.promo || {}
  const l = s.launch || {}
  const sig = s.score != null ? s : null
  return (
    <button
      onClick={() => onSelect(s.address)}
      className={`block text-left mx-2 my-1 px-3 py-2.5 rounded-xl transition w-[calc(100%-1rem)] ${active ? 'bg-[#9eae84]/10 ring-1 ring-[#9eae84]/40' : 'hover:bg-white/5'}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-bold text-white flex items-center gap-1.5">
            {sig ? <SignalBadge sig={sig} /> : <span className="shrink-0 min-w-[28px] text-center px-1.5 py-0.5 rounded-full text-[10px] bg-white/5 text-[#555143]" title="No market snapshot yet">new</span>}
            <SourceTag source="radar" />
            <span className="truncate">{safeText(s.symbol) || '?'} <span className="font-normal text-[#b3ad9d]">{safeText(s.name, 48)}</span></span>
          </div>
          <div className="text-[11px] text-[#6b6657]">{short(s.address)} · {fmtAge(l.ageMin)} · {l.state}{l.curveProgress != null ? ` ${Math.round(Math.min(l.curveProgress, 1) * 100)}%` : ''}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <MiniTrend points={[
            { label: '5m', value: s.features?.price_chg_5m != null ? s.features.price_chg_5m * 100 : null },
            { label: '15m', value: s.features?.price_chg_15m != null ? s.features.price_chg_15m * 100 : null },
            { label: '60m', value: s.features?.price_chg_60m != null ? s.features.price_chg_60m * 100 : null },
          ]} />
          <div className="text-right">
            <div className="text-sm text-white">{fmtUsd(s.market?.fdv)}</div>
            <div className={`text-[11px] font-semibold ${pctColor(s.features?.price_chg_15m != null ? s.features.price_chg_15m * 100 : null)}`}>{s.features?.price_chg_15m != null ? `${fmtPct(s.features.price_chg_15m * 100)} 15m` : '--'}</div>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-1.5">
        {danger.map((f) => <FlagBadge key={f.code} f={f} />)}
        {warn.map((f) => <FlagBadge key={f.code} f={f} />)}
        {s.passesSafetyGate && <span className="text-[10px] px-2 py-0.5 rounded-full text-[#7ea968] bg-[#7ea968]/15" title="Passed the radar safety gate (authorities, holder concentration, insiders, creator history)">vetted</span>}
        {p.boostTotal > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full text-[#d6b87a] bg-[#d6b87a]/15" title="Paid DexScreener boost">boost</span>}
        {p.hasProfile && <span className="text-[10px] px-2 py-0.5 rounded-full text-[#a39d8d] bg-white/5" title="Paid DexScreener profile">profile</span>}
        {p.cto && <span className="text-[10px] px-2 py-0.5 rounded-full text-[#a39d8d] bg-white/5" title="Community takeover">CTO</span>}
        {p.twitter && <span className="text-[10px] px-2 py-0.5 rounded-full text-[#555143] bg-white/5">X</span>}
        {p.telegram && <span className="text-[10px] px-2 py-0.5 rounded-full text-[#555143] bg-white/5">TG</span>}
        {p.website && <span className="text-[10px] px-2 py-0.5 rounded-full text-[#555143] bg-white/5">web</span>}
      </div>
    </button>
  )
}

function RadarList({ selected, onSelect }) {
  const [sort, setSort] = useState('new')
  const q = useGetRadarSignalsQuery({ sort, limit: 40 }, { pollingInterval: usePoll(POLL.radar) })
  const d = q.data
  return (
    <>
      <div className="px-3 py-2 flex items-center gap-2 text-[10px] text-[#a39d8d]" title={RADAR_CAPTION}>
        <span>Radar</span>
        <select value={sort} onChange={(e) => setSort(e.target.value)} className="rounded-full bg-black/30 text-[10px] px-2.5 py-1">
          <option value="new">Newest launches</option>
          <option value="score">Top score</option>
        </select>
        {q.isFetching && !q.isLoading && <Loader2 className="w-3 h-3 animate-spin text-[#555143]" />}
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        {q.isLoading ? (
          Array.from({ length: 6 }).map((_, i) => <div key={i} className="mx-2 my-1 px-3 py-2.5 space-y-1.5"><Skel className="h-7 w-full" /><Skel className="h-2 w-2/3" /></div>)
        ) : q.isError ? (
          <ErrorBox error={q.error} onRetry={q.refetch} label="Radar feed unavailable" />
        ) : d && d.enabled === false ? (
          <div className="p-4 text-xs text-[#a39d8d] text-center space-y-1">
            <div>{RADAR_OFF_HINT}</div>
            {d.reason && <div className="text-[10px] text-[#555143]">{d.reason}</div>}
          </div>
        ) : !d?.signals?.length ? (
          <div className="p-4 text-xs text-[#a39d8d] text-center">No radar tokens yet.</div>
        ) : (
          d.signals.map((s) => <RadarRow key={s.address} s={s} active={s.address === selected} onSelect={onSelect} />)
        )}
      </div>
      <div className="px-3 py-2 text-[10px] text-[#555143] italic">{RADAR_CAPTION}</div>
    </>
  )
}

function DiscoveryPanel({ selected, onSelect }) {
  const [tab, setTab] = useState('radar')
  // The default (Radar) tab does not need these lists, so they only poll while another tab is open.
  const listPoll = usePoll(tab === 'radar' ? 0 : POLL.lists)
  const sigPoll = usePoll(POLL.signals)
  const trending = useGetTrendingMemecoinsQuery(undefined, { pollingInterval: listPoll })
  const fresh = useGetNewMemecoinsQuery(undefined, { pollingInterval: listPoll })

  const finalStretch = useMemo(() => {
    const all = [...(fresh.data || []), ...(trending.data || [])]
    const seen = new Set()
    return all
      .filter((t) => t.bondingProgress != null && t.bondingProgress >= 60 && !seen.has(t.address) && seen.add(t.address))
      .sort((a, b) => b.bondingProgress - a.bondingProgress)
  }, [fresh.data, trending.data])

  const [sortBy, setSortBy] = useState('default')
  const [minLevel, setMinLevel] = useState(0)
  const sigNew = useGetMemecoinSignalsQuery('new', { skip: tab === 'radar', pollingInterval: sigPoll })
  const sigTrend = useGetMemecoinSignalsQuery('trending', { skip: tab === 'radar', pollingInterval: sigPoll })
  const sigMap = useMemo(() => {
    const m = new Map()
    for (const s of [...(sigNew.data || []), ...(sigTrend.data || [])]) m.set(s.address, s)
    return m
  }, [sigNew.data, sigTrend.data])
  const sigFailed = sigNew.isError && sigTrend.isError

  const q = tab === 'new' ? fresh : tab === 'trending' ? trending : { ...trending, data: finalStretch, isLoading: trending.isLoading && fresh.isLoading }
  const rawList = Array.isArray(q.data) ? q.data : []
  const list = useMemo(() => {
    let l = rawList
    if (minLevel > 0) l = l.filter((t) => (sigMap.get(t.address)?.score ?? -1) >= minLevel)
    if (sortBy === 'score') l = [...l].sort((a, b) => (sigMap.get(b.address)?.score ?? -1) - (sigMap.get(a.address)?.score ?? -1))
    return l
  }, [rawList, sigMap, sortBy, minLevel])

  return (
    <Panel className="flex flex-col h-[420px] lg:h-full lg:min-h-0">
      <div className="px-3 pt-3 pb-2 flex items-center justify-between gap-2">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'radar', label: 'Radar', icon: <Radar className="w-3 h-3" /> },
            { id: 'new', label: 'New Pairs', icon: <Sparkles className="w-3 h-3" /> },
            { id: 'final', label: 'Final Stretch', icon: <Rocket className="w-3 h-3" /> },
            { id: 'trending', label: 'Trending', icon: <Flame className="w-3 h-3" /> },
          ]}
        />
        {isMockData(q.data) && <span className="text-[9px] px-2 py-0.5 rounded-full bg-[#d6b87a]/15 text-[#d6b87a] shrink-0">MOCK</span>}
      </div>
      {tab === 'radar' ? <RadarList selected={selected} onSelect={onSelect} /> : (<>
      <div className="px-3 py-2 flex items-center gap-2 text-[10px] text-[#a39d8d]" title={SIGNAL_CAPTION}>
        <span>Activity</span>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="rounded-full bg-black/30 text-[10px] px-2.5 py-1">
          <option value="default">Default order</option>
          <option value="score">Sort by score</option>
        </select>
        <select value={minLevel} onChange={(e) => setMinLevel(Number(e.target.value))} className="rounded-full bg-black/30 text-[10px] px-2.5 py-1">
          <option value={0}>All</option>
          <option value={25}>Warming+ (25)</option>
          <option value={50}>Active+ (50)</option>
          <option value={75}>Hot (75)</option>
        </select>
        {(sigNew.isLoading || sigTrend.isLoading) && <Loader2 className="w-3 h-3 animate-spin text-[#555143]" />}
        {sigFailed && <span className="text-[#d6b87a]" title="Signals could not be loaded">scores unavailable</span>}
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        {q.isLoading ? (
          Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="mx-2 my-1 px-3 py-2.5 space-y-1.5"><Skel className="h-7 w-full" /><Skel className="h-2 w-2/3" /></div>
          ))
        ) : q.isError ? (
          <ErrorBox error={q.error} onRetry={q.refetch} label="Could not load tokens" />
        ) : list.length === 0 ? (
          <div className="p-4 text-xs text-[#a39d8d] text-center">{minLevel > 0 && rawList.length > 0 ? 'No tokens match the activity filter (scores may still be loading).' : tab === 'final' ? 'No tokens close to migration right now.' : 'No tokens yet.'}</div>
        ) : (
          list.map((t) => <TokenRow key={t.address} t={t} active={t.address === selected} onSelect={onSelect} sig={sigMap.get(t.address)} />)
        )}
      </div>
      </>)}
    </Panel>
  )
}

/* ─── Token header + chart ───────────────────────────────────────────────── */
function Stat({ label, value, className = '' }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-[#6b6657] uppercase">{label}</div>
      <div className={`text-sm font-bold truncate ${className || 'text-white'}`}>{value}</div>
    </div>
  )
}

function TokenHeader({ q }) {
  const t = q.data
  // Stale-while-revalidate: a transient poll error only blanks the header if we never had data at all.
  if (!t && q.isLoading) return <div className="p-3 grid grid-cols-3 md:grid-cols-6 gap-3">{Array.from({ length: 6 }).map((_, i) => <Skel key={i} className="h-8" />)}</div>
  if (!t && q.isError) return <ErrorBox error={q.error} onRetry={q.refetch} label="Could not load token" />
  if (!t) return null
  const ch = t.change24h ?? t.change1h
  return (
    <div className="p-4 flex flex-wrap items-center gap-x-6 gap-y-2">
      <div className="min-w-0">
        <div className="text-base font-bold text-white font-display">{safeText(t.symbol)} <span className="text-[#a39d8d] font-normal text-sm">{safeText(t.name, 48)}</span></div>
        <div className="text-[11px] text-[#6b6657]">{short(t.address, 6)}</div>
      </div>
      <div>
        <div className="text-xl font-bold text-white leading-none">{fmtPrice(t.price)}</div>
        <div className={`text-xs flex items-center ${pctColor(ch)}`}>
          {ch != null && (ch >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />)}{fmtPct(ch)}
        </div>
      </div>
      <Stat label="MCap" value={fmtUsd(t.marketCap)} />
      <Stat label="Liquidity" value={fmtUsd(t.liquidity)} />
      <Stat label="Volume 24h" value={fmtUsd(t.volume24h)} />
      <Stat label="Holders" value={fmtNum(t.holders)} />
      {t.change1h != null && <Stat label="1h" value={fmtPct(t.change1h)} className={pctColor(t.change1h)} />}
      {isMockData(t) && <span className="text-[9px] px-2 py-0.5 rounded-full bg-[#d6b87a]/15 text-[#d6b87a]">MOCK DATA</span>}
      {q.isError && <span className="text-[9px] px-2 py-0.5 rounded-full bg-[#d6b87a]/15 text-[#d6b87a]" title="Showing the last known values; reconnecting">reconnecting</span>}
    </div>
  )
}

function ChartPanel({ address }) {
  const [tf, setTf] = useState('1m')
  const q = useGetMemecoinOhlcvQuery({ address, tf }, { skip: !address, pollingInterval: usePoll(CHART_POLL[tf]) })
  const candles = Array.isArray(q.data) ? q.data : []

  return (
    <div className="flex flex-col h-[340px] lg:h-full lg:min-h-0">
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="flex items-center gap-1 rounded-full bg-black/30 p-1">
          {TIMEFRAMES.map((x) => (
            <button
              key={x}
              onClick={() => setTf(x)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all ${tf === x ? 'bg-[#3e4d26]/70 text-white shadow-[0_0_0_1px_rgba(158,174,132,0.35),0_4px_14px_-4px_rgba(158,174,132,0.55)]' : 'text-[#a39d8d] hover:text-white hover:bg-white/5'}`}
            >{x}</button>
          ))}
        </div>
        {q.isFetching && !q.isLoading && <Loader2 className="w-3 h-3 ml-1 animate-spin text-[#555143]" />}
        {isMockData(q.data) && <span className="ml-auto text-[9px] px-2 py-0.5 rounded-full bg-[#d6b87a]/15 text-[#d6b87a]">MOCK</span>}
      </div>
      <div className="relative flex-1 min-h-0">
        {!address ? (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-[#6b6657]">Select a token to load its chart</div>
        ) : candles.length > 0 ? (
          // Stale-while-revalidate: once we have candles, keep showing them through a transient poll
          // error instead of swapping to a full error box (that was the main source of "chart unavailable" flicker).
          <>
            <MemeChart candles={candles} fitKey={`${address}:${tf}`} />
            {q.isError && (
              <span className="absolute top-2 right-2 text-[9px] px-2 py-0.5 rounded-full bg-[#d6b87a]/15 text-[#d6b87a] backdrop-blur-sm">reconnecting</span>
            )}
          </>
        ) : q.isLoading ? (
          <Skel className="absolute inset-0" />
        ) : q.isError ? (
          <div className="absolute inset-0 flex items-center justify-center"><ErrorBox error={q.error} onRetry={q.refetch} label="Chart unavailable" /></div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-[#6b6657]">No candle data yet for this token</div>
        )}
      </div>
    </div>
  )
}

/* ─── Order ticket ───────────────────────────────────────────────────────── */
function OrderTicket({ token, position }) {
  const [side, setSide] = useState('buy')
  const [amount, setAmount] = useState('0.5')
  // Exact token amount chosen via the 25/50/75/100% buttons (sell side); typing an SOL amount clears it
  const [sellPct, setSellPct] = useState(null)
  const [slippage, setSlippage] = useState('15') // percent; memecoins need wide slippage
  const [priority, setPriority] = useState('0.001') // SOL
  const [quote, setQuote] = useState(null)
  const [quoteErr, setQuoteErr] = useState(null)
  const [quoting, setQuoting] = useState(false)
  const [status, setStatus] = useState(null) // { ok, msg }
  const [getQuote] = useQuoteMemecoinMutation()
  const [trade, { isLoading: trading }] = useTradeMemecoinMutation()
  const reqId = useRef(0)
  useEffect(() => { setSellPct(null) }, [token?.address])

  const amountNum = parseFloat(amount)
  const slipNum = parseFloat(slippage)
  const heldTokens = position?.tokens > 0 ? position.tokens : 0
  const sellTokens = side === 'sell' && sellPct != null && heldTokens > 0 ? heldTokens * (sellPct / 100) : null
  const validAmount = sellTokens != null || (amountNum > 0 && isFinite(amountNum))
  const validSlip = slipNum >= 0 && slipNum <= 100
  const slippageBps = Math.round((validSlip ? slipNum : 0) * 100)
  const address = token?.address
  const orderAmount = sellTokens != null ? { amountTokens: sellTokens } : { amountSol: amountNum }

  // Debounced quote on every relevant input change
  useEffect(() => {
    setQuote(null); setQuoteErr(null)
    if (!address || !validAmount || !validSlip) { setQuoting(false); return }
    const id = ++reqId.current
    setQuoting(true)
    const t = setTimeout(async () => {
      const res = await getQuote({ address, side, ...(sellTokens != null ? { amountTokens: sellTokens } : { amountSol: amountNum }), slippageBps })
      if (id !== reqId.current) return
      setQuoting(false)
      if (res.error) setQuoteErr(errMsg(res.error)); else setQuote(res.data)
    }, 400)
    return () => clearTimeout(t)
  }, [address, side, amountNum, sellTokens, slippageBps, validAmount, validSlip, getQuote])

  const submit = async () => {
    if (!address || !validAmount || !validSlip || trading) return
    setStatus(null)
    // clientOrderId lets the server collapse an accidental double submit into one fill
    const body = { address, side, ...orderAmount, slippageBps, clientOrderId: newOrderId() }
    const res = await trade(body)
    if (res.error) { setStatus({ ok: false, msg: errMsg(res.error) }); return }
    const r = res.data || {}
    setSellPct(null)
    const what = side === 'buy' ? `${fmtUsd(r.usd)} of ${safeText(r.symbol || token.symbol)}` : `${fmtTokens(r.tokens)} ${safeText(r.symbol || token.symbol)} for ${fmtUsd(r.usd)}`
    setStatus({ ok: true, msg: `${side === 'buy' ? 'Bought' : 'Sold'} ${what} (paper)${r.realizedPnl != null ? ` · realized ${r.realizedPnl >= 0 ? '+' : '-'}${fmtUsd(Math.abs(r.realizedPnl))}` : ''}` })
  }

  const buy = side === 'buy'
  return (
    <Panel className="flex flex-col" tint={buy ? 'from-[#7ea968]/[0.08] to-transparent' : 'from-[#d35c4a]/[0.08] to-transparent'}>
      <div className="grid grid-cols-2 gap-1.5 m-3 mb-0 p-1.5 rounded-full bg-black/30">
        {['buy', 'sell'].map((s) => (
          <button
            key={s}
            onClick={() => { setSide(s); setStatus(null) }}
            className={`flex items-center justify-center gap-1.5 py-3 rounded-full text-sm font-extrabold uppercase tracking-wider transition-all ${
              side === s
                ? (s === 'buy'
                    ? 'bg-gradient-to-r from-[#3e4d26] to-[#7ea968] text-white shadow-[0_8px_26px_-6px_rgba(126,169,104,0.75)] scale-[1.02]'
                    : 'bg-gradient-to-r from-[#803e26] to-[#d35c4a] text-white shadow-[0_8px_26px_-6px_rgba(211,92,74,0.75)] scale-[1.02]')
                : 'text-[#a39d8d] hover:text-white'
            }`}
          >
            {s === 'buy' ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
            {s}
          </button>
        ))}
      </div>

      <div className="p-4 space-y-3.5">
        <div className={`text-sm truncate px-3 py-2 rounded-xl ${buy ? 'bg-[#7ea968]/10 text-[#9fc488]' : 'bg-[#d35c4a]/10 text-[#e08a7a]'}`}>
          {token ? <><span className="font-extrabold text-white">{buy ? 'Buying' : 'Selling'} {safeText(token.symbol)}</span> @ {fmtPrice(token.price)}</> : 'Select a token to trade'}
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] text-[#8a8574] uppercase tracking-wide">Amount (SOL)</label>
          <div className="grid grid-cols-5 gap-1.5">
            {SOL_PRESETS.map((v) => (
              <button key={v} onClick={() => { setAmount(String(v)); setSellPct(null) }}
                className={`py-1.5 rounded-lg text-[11px] font-bold transition ${amountNum === v ? 'bg-[#3e4d26]/70 text-white shadow-[0_0_0_1px_rgba(158,174,132,0.3)]' : 'bg-black/30 text-[#a39d8d] hover:bg-white/10'}`}>
                {v}
              </button>
            ))}
          </div>
          <input type="number" min="0" step="any" value={sellTokens != null ? '' : amount} onChange={(e) => { setAmount(e.target.value); setSellPct(null) }} placeholder={sellTokens != null ? `${sellPct}% of position (${fmtTokens(sellTokens)})` : 'Custom amount'}
            className="w-full rounded-xl bg-black/30 backdrop-blur-md px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-[#9eae84]/25 transition" />
          {!buy && (
            <div className="grid grid-cols-4 gap-1.5">
              {SELL_PCTS.map((p) => (
                <button key={p} disabled={!heldTokens}
                  onClick={() => setSellPct(p)}
                  className="py-1.5 rounded-lg text-[11px] text-[#a39d8d] bg-black/30 hover:bg-[#d35c4a]/15 hover:text-white disabled:opacity-40 disabled:hover:bg-black/30 disabled:hover:text-[#a39d8d] transition">
                  {p}%
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="text-[11px] text-[#8a8574] uppercase tracking-wide">Slippage (%)</label>
            <input type="number" min="0" max="100" step="0.5" value={slippage} onChange={(e) => setSlippage(e.target.value)}
              className={`w-full rounded-xl bg-black/30 backdrop-blur-md px-3 py-1.5 text-xs text-[#9eae84] focus:outline-none focus:ring-2 transition ${validSlip ? 'focus:ring-[#9eae84]/25' : 'ring-2 ring-[#d35c4a]/60'}`} />
          </div>
          <div>
            <label className="text-[11px] text-[#8a8574] uppercase tracking-wide">Priority fee (SOL)</label>
            <input type="number" min="0" step="0.0005" value={priority} onChange={(e) => setPriority(e.target.value)}
              className="w-full rounded-xl bg-black/30 backdrop-blur-md px-3 py-1.5 text-xs text-[#d6b87a] focus:outline-none focus:ring-2 focus:ring-[#9eae84]/25 transition" />
          </div>
        </div>

        {/* Quote */}
        <div className="rounded-xl bg-black/30 backdrop-blur-md p-3 text-[11px] space-y-1.5 min-h-[68px]">
          {quoting ? (
            <><Skel className="h-3 w-full" /><Skel className="h-3 w-2/3" /><Skel className="h-3 w-1/2" /></>
          ) : quoteErr ? (
            <div className="text-[#d35c4a] break-words">Quote failed: {quoteErr}</div>
          ) : quote ? (
            <>
              <Row k={buy ? 'You receive' : 'You receive (SOL)'} v={fmtNum(buy ? quote.tokens : quote.amountSol)} />
              <Row k="Min received" v={fmtNum(quote.minReceived)} />
              <Row k="Price impact" v={quote.priceImpactPct != null ? `${Number(quote.priceImpactPct).toFixed(2)}%` : '--'} warn={quote.priceImpactPct > 5} />
              {quote.feeSol != null && <Row k="Fee" v={`${quote.feeSol} SOL`} />}
              {isMockData(quote) && <div className="text-[9px] text-[#d6b87a]">MOCK QUOTE</div>}
            </>
          ) : (
            <div className="text-[#555143]">{!token ? 'Pick a token' : !validAmount ? 'Enter an amount' : !validSlip ? 'Slippage must be 0-100%' : ''}</div>
          )}
        </div>

        <button
          onClick={submit}
          disabled={!token || !validAmount || !validSlip || trading}
          className={`w-full py-3.5 rounded-full text-sm font-extrabold uppercase tracking-wider flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none ${
            buy
              ? 'bg-gradient-to-r from-[#3e4d26] to-[#7ea968] hover:brightness-110 text-white shadow-[0_14px_36px_-10px_rgba(126,169,104,0.8)]'
              : 'bg-gradient-to-r from-[#803e26] to-[#d35c4a] hover:brightness-110 text-white shadow-[0_14px_36px_-10px_rgba(211,92,74,0.8)]'
          }`}
        >
          {trading ? <Loader2 className="w-4 h-4 animate-spin" /> : buy ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
          {trading ? 'Submitting...' : `${buy ? 'Buy' : 'Sell'} ${token?.symbol || ''}`}
        </button>

        {status && (
          <div className={`p-2.5 rounded-xl text-xs font-semibold backdrop-blur-md break-words ${status.ok ? 'text-[#9fc488] bg-[#1f2910]/60' : 'text-[#e08a7a] bg-[#803e26]/30'}`}>
            {status.msg}
          </div>
        )}
        <p className="text-[11px] text-[#6b6657] leading-snug">Orders execute through the paper-trading system. No real funds move.</p>
      </div>
    </Panel>
  )
}

function Row({ k, v, warn }) {
  return <div className="flex justify-between gap-2"><span className="text-[#555143]">{k}</span><span className={warn ? 'text-[#d35c4a]' : 'text-white'}>{v}</span></div>
}

/* ─── Bottom tabs ────────────────────────────────────────────────────────── */
function Table({ head, children, empty }) {
  return (
    <div className="overflow-auto h-full">
      <table className="w-full text-xs min-w-[480px]">
        <thead className="sticky top-0 bg-[#141414]/90 backdrop-blur-md text-[#555143] uppercase">
          <tr>{head.map((h) => <th key={h} className="text-left font-normal px-3 py-2 whitespace-nowrap">{h}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
      {empty}
    </div>
  )
}
const Empty = ({ text }) => <div className="p-6 text-center text-xs text-[#555143]">{text}</div>

const fmtUsdSigned = (n) => (n == null || isNaN(n) ? '--' : `${n >= 0 ? '+' : '-'}${fmtUsd(Math.abs(n))}`)

function HistoryTab({ onSelect }) {
  const [page, setPage] = useState(0)
  const q = useGetMemeHistoryQuery({ limit: HISTORY_PAGE, offset: page * HISTORY_PAGE })
  const items = q.data?.items || []
  const total = q.data?.total ?? 0
  if (q.isLoading) return <div className="p-3 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skel key={i} className="h-4 w-full" />)}</div>
  if (q.isError) return <ErrorBox error={q.error} onRetry={q.refetch} label="Trade history unavailable" />
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0">
        <Table head={['Time', 'Token', 'Side', 'Qty', 'Price', 'Total']} empty={items.length === 0 && <Empty text="No memecoin trades yet." />}>
          {items.map((f) => (
            <tr key={f.id} onClick={() => onSelect(f.address)} className="odd:bg-white/[0.025] hover:bg-white/10 cursor-pointer transition-colors">
              <td className="px-3 py-1.5 text-[#a39d8d]" title={f.createdAt}>{f.createdAt ? `${timeAgo(Date.parse(f.createdAt))} ago` : '--'}</td>
              <td className="px-3 py-1.5 font-bold text-white">{safeText(f.symbol)}</td>
              <td className={`px-3 py-1.5 uppercase ${f.type === 'buy' ? 'text-[#7ea968]' : 'text-[#d35c4a]'}`}>{f.type}</td>
              <td className="px-3 py-1.5">{fmtTokens(f.tokens)}</td>
              <td className="px-3 py-1.5">{fmtPrice(f.price)}</td>
              <td className="px-3 py-1.5">{fmtUsd(f.totalUsd)}</td>
            </tr>
          ))}
        </Table>
      </div>
      {total > HISTORY_PAGE && (
        <div className="flex items-center justify-between gap-2 px-3 py-1 text-[10px] text-[#a39d8d]">
          <button disabled={page === 0 || q.isFetching} onClick={() => setPage((p) => Math.max(0, p - 1))} className="px-2 py-0.5 disabled:opacity-40">Newer</button>
          <span>{page * HISTORY_PAGE + 1}-{Math.min(total, page * HISTORY_PAGE + items.length)} of {total}</span>
          <button disabled={!q.data?.hasMore || q.isFetching} onClick={() => setPage((p) => p + 1)} className="px-2 py-0.5 disabled:opacity-40">Older</button>
        </div>
      )}
    </div>
  )
}

function PositionsTab({ q, onSelect }) {
  const positions = q.data?.positions || []
  if (q.isLoading) return <div className="p-3 space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skel key={i} className="h-4 w-full" />)}</div>
  if (q.isError && !q.data) return <ErrorBox error={q.error} onRetry={q.refetch} label="Positions unavailable" />
  const t = q.data?.totals
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0">
        <Table head={['Token', 'Qty', 'Avg price', 'Price', 'Cost', 'Value', 'PnL']} empty={positions.length === 0 && <Empty text="No open positions. Buy a token to get started." />}>
          {positions.map((p) => (
            <tr key={p.address} onClick={() => onSelect(p.address)} className="odd:bg-white/[0.025] hover:bg-white/10 cursor-pointer transition-colors">
              <td className="px-3 py-1.5 font-bold text-white">{safeText(p.symbol)}</td>
              <td className="px-3 py-1.5">{fmtTokens(p.tokens)}</td>
              <td className="px-3 py-1.5">{fmtPrice(p.avgCost)}</td>
              <td className="px-3 py-1.5">{p.currentPrice == null ? <span title="Live price unavailable" className="text-[#d6b87a]">n/a</span> : fmtPrice(p.currentPrice)}</td>
              <td className="px-3 py-1.5">{fmtUsd(p.costUsd)}</td>
              <td className="px-3 py-1.5">{fmtUsd(p.value)}</td>
              <td className={`px-3 py-1.5 whitespace-nowrap ${pctColor(p.pnlPct)}`}>{p.pnl == null ? '--' : `${fmtUsdSigned(p.pnl)} (${fmtPct(p.pnlPct)})`}</td>
            </tr>
          ))}
        </Table>
      </div>
      {positions.length > 0 && t && (
        <div className="flex items-center justify-between gap-2 px-3 py-1 text-[10px] text-[#a39d8d]">
          <span>Open value {fmtUsd(t.valueUsd)}{t.unpriced > 0 ? ` (+${t.unpriced} unpriced)` : ''}</span>
          <span className={pctColor(t.pnlPct)}>Unrealized {fmtUsdSigned(t.pnl)} ({fmtPct(t.pnlPct)})</span>
        </div>
      )}
    </div>
  )
}

function BottomPanel({ address, positionsQuery, onSelect }) {
  const [tab, setTab] = useState('positions')
  // Live trades only poll while that tab is open
  const trades = useGetMemecoinTradesQuery(address, { skip: !address || tab !== 'live', pollingInterval: usePoll(POLL.trades) })
  const list = Array.isArray(trades.data) ? trades.data : []
  const count = positionsQuery.data?.positions?.length

  return (
    <Panel className="flex flex-col h-[300px] lg:h-full lg:min-h-0">
      <div className="px-3 pt-3 pb-2">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'positions', label: count != null ? `Positions (${count})` : 'Positions' },
            { id: 'orders', label: 'Orders' },
            { id: 'history', label: 'History' },
            { id: 'live', label: 'Live Trades' },
          ]}
        />
      </div>
      <div className="flex-1 min-h-0">
        {tab === 'positions' && <PositionsTab q={positionsQuery} onSelect={onSelect} />}
        {tab === 'orders' && <Empty text="No open orders. Market orders fill instantly; limit orders are not supported yet." />}
        {tab === 'history' && <HistoryTab onSelect={onSelect} />}
        {tab === 'live' && (
          !address ? <Empty text="Select a token to see live trades." />
          : trades.isLoading ? <div className="p-3 space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skel key={i} className="h-4 w-full" />)}</div>
          : trades.isError ? <ErrorBox error={trades.error} onRetry={trades.refetch} label="Live trades unavailable" />
          : (
            <Table head={['Age', 'Side', 'Size', 'Price', 'Maker']} empty={list.length === 0 && <Empty text="No trades yet for this token." />}>
              {list.map((t, i) => (
                <tr key={t.id ?? t.signature ?? i} className="odd:bg-white/[0.025] hover:bg-white/10 transition-colors">
                  <td className="px-3 py-1 text-[#a39d8d]">{t.timestamp ? timeAgo(t.timestamp) : '--'}</td>
                  <td className={`px-3 py-1 uppercase font-bold ${t.side === 'buy' ? 'text-[#7ea968]' : 'text-[#d35c4a]'}`}>{t.side}</td>
                  <td className="px-3 py-1">{t.amountSol != null ? `${fmtNum(t.amountSol)} SOL` : fmtUsd(t.amountUsd)}</td>
                  <td className="px-3 py-1">{fmtPrice(t.price)}</td>
                  <td className="px-3 py-1 text-[#555143]">{short(t.maker)}</td>
                </tr>
              ))}
            </Table>
          )
        )}
      </div>
    </Panel>
  )
}

/* Shown while the API is rate limiting us; all pollers pause until the window closes */
function SlowDownBanner() {
  const limited = useRateLimited()
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!limited) return undefined
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [limited])
  if (!limited) return null
  const secs = Math.max(0, Math.ceil((rateLimitedUntil() - now) / 1000))
  return (
    <div role="status" className="relative z-10 flex items-center gap-2 px-3 py-1.5 text-[11px] text-[#d6b87a] bg-[#d6b87a]/15 backdrop-blur-md">
      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
      <span>Slow down: too many requests. Live updates are paused and will resume automatically{secs > 0 ? ` in ~${secs}s` : ''}.</span>
    </div>
  )
}

/* ─── Customizable layout ────────────────────────────────────────────────── */
// Panels float freely on a bounded canvas: drag by the grip, resize from any
// edge or corner, lock to freeze everything. Geometry is stored as fractions of
// the canvas so an arrangement keeps its proportions across displays.
const LAYOUT_KEY = 'axiom_layout_v2'

const PANELS = [
  { id: 'discovery', defaultRect: { x: 0,     y: 0,    w: 0.21, h: 1    }, minW: 240, minH: 240, stackedHeight: 380 },
  { id: 'chart',     defaultRect: { x: 0.215, y: 0,    w: 0.57, h: 0.62 }, minW: 340, minH: 260, stackedHeight: 460 },
  { id: 'bottom',    defaultRect: { x: 0.215, y: 0.63, w: 0.57, h: 0.37 }, minW: 340, minH: 180, stackedHeight: 320 },
  { id: 'order',     defaultRect: { x: 0.79,  y: 0,    w: 0.21, h: 1    }, minW: 260, minH: 320 },
]

// The shell only pins itself to the viewport height at `lg`, which with the
// 200px sidebar and page padding lands the canvas at ~800px. Matching that here
// keeps "freeform" and "full-height canvas" switching on at the same width.
const FREEFORM_MIN_CANVAS_WIDTH = 800

/* ─── Page ───────────────────────────────────────────────────────────────── */
export default function TradingTerminal() {
  const [params, setParams] = useSearchParams()
  // Solana address from the Privy user's linked accounts (avoids the optional-peer-dep
  // heavy '@privy-io/react-auth/solana' entry). Embedded or external, chainType 'solana'.
  const { user } = usePrivy()
  const solAddress = user?.linkedAccounts?.find((a) => a.type === 'wallet' && a.chainType === 'solana')?.address || null
  const solBalance = useSolBalance(solAddress)
  const { data: portfolio } = useGetPortfolioQuery()
  // Initial load only (just to pick a default token); DiscoveryPanel owns list polling
  const trending = useGetTrendingMemecoinsQuery(undefined)
  const fresh = useGetNewMemecoinsQuery(undefined)
  // Server-side positions (Supabase paper_positions), refreshed on every trade via tag invalidation
  const positionsQuery = useGetMemePositionsQuery(undefined, { pollingInterval: usePoll(POLL.positions) })

  const urlToken = params.get('token')
  const defaultToken = trending.data?.[0]?.address || fresh.data?.[0]?.address || null
  const address = urlToken || defaultToken

  const select = useCallback((a) => setParams({ token: a }, { replace: true }), [setParams])
  const detail = useGetMemecoinQuery(address, { skip: !address, pollingInterval: usePoll(POLL.detail) })

  // Keep trading on the last good snapshot through a transient poll error rather than blanking the ticket
  const token = detail.data ?? null
  const position = positionsQuery.data?.positions?.find((p) => p.address === address)

  // Lets the top bar's reset button drive the workspace's own layout state.
  const workspace = useRef(null)

  return (
    <div className="relative flex flex-col text-[#f0ebe0] font-mono lg:h-screen lg:overflow-hidden">
      <GlassBackground />

      <SlowDownBanner />
      <TopBar
        onSelect={select}
        solAddress={solAddress}
        solBalance={solBalance}
        paperCash={portfolio?.cashBalance ?? null}
        onResetLayout={() => workspace.current?.reset()}
      />

      <div className="relative z-10 flex min-h-0 flex-1 flex-col p-3">
        <PanelWorkspace
          panels={PANELS}
          storageKey={LAYOUT_KEY}
          controls={workspace}
          surface=""
          showGrid={false}
          freeformMinWidth={FREEFORM_MIN_CANVAS_WIDTH}
          accent="#9eae84"
        >
          <WorkspacePanel id="discovery" bare>
            <DiscoveryPanel selected={address} onSelect={select} />
          </WorkspacePanel>

          <WorkspacePanel id="chart" bare>
            <Panel className="flex flex-col h-full min-h-0">
              <TokenHeader q={detail} />
              {address && <SignalPanel address={address} />}
              <ChartPanel address={address} />
            </Panel>
          </WorkspacePanel>

          <WorkspacePanel id="bottom" bare>
            <BottomPanel address={address} positionsQuery={positionsQuery} onSelect={select} />
          </WorkspacePanel>

          <WorkspacePanel id="order" bare>
            <OrderTicket token={token} position={position} />
          </WorkspacePanel>
        </PanelWorkspace>
      </div>
    </div>
  )
}
