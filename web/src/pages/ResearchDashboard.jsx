import React, { useState } from 'react'
import { Activity, AlertTriangle, CheckCircle2, CircleDashed, FlaskConical, Loader2, RefreshCw } from 'lucide-react'
import {
  useGetResearchStatusQuery,
  useGetResearchCombinedQuery,
  useGetResearchReportQuery,
  useRunResearchEvalMutation,
  useGetWinnerFirstQuery,
  useRunWinnerFirstMutation,
  useGetWalletDiscoveryQuery,
} from '../api/researchApi'

/* ─── Helpers ────────────────────────────────────────────────────────────── */
const pct = (x, d = 1) => (x == null || Number.isNaN(x) ? '—' : `${(x * 100).toFixed(d)}%`)
const num = (x) => (x == null ? '—' : Number(x).toLocaleString())
const ago = (ts) => {
  if (!ts) return 'never'
  const s = Math.max(0, Date.now() / 1000 - ts)
  if (s < 90) return `${Math.round(s)}s ago`
  if (s < 5400) return `${Math.round(s / 60)}m ago`
  if (s < 129600) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}
const hLabel = (m) => (m >= 60 ? `${m / 60}h` : `${m}m`)

const VERDICTS = {
  INSUFFICIENT_DATA: { label: 'Insufficient data', cls: 'text-[#a1a1aa] border-[#3f3f46] bg-[#1a1a1a]', Icon: CircleDashed },
  NO_EDGE: { label: 'No edge detected', cls: 'text-red-400 border-red-500/30 bg-red-500/10', Icon: AlertTriangle },
  POSSIBLE_EDGE: { label: 'Possible edge (unproven)', cls: 'text-green-400 border-green-500/30 bg-green-500/10', Icon: CheckCircle2 },
  CANDIDATES_PERSIST: { label: 'Candidates persisted (unproven)', cls: 'text-green-400 border-green-500/30 bg-green-500/10', Icon: CheckCircle2 },
  NO_PERSISTENCE_DETECTED: { label: 'No persistence detected', cls: 'text-red-400 border-red-500/30 bg-red-500/10', Icon: AlertTriangle },
  MOSTLY_REACTIVE: { label: 'Mostly reactive (chasing moves)', cls: 'text-orange-400 border-orange-500/30 bg-orange-500/10', Icon: AlertTriangle },
  EDGE_NOT_STABLE: { label: 'Edge not stable', cls: 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10', Icon: AlertTriangle },
}

function Panel({ title, right, children, className = '' }) {
  return (
    <section className={`bg-[#141414] border border-[#1f1f1f] rounded-md min-w-0 ${className}`}>
      {title && (
        <header className="flex items-center justify-between px-4 py-2.5 border-b border-[#1f1f1f]">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#a1a1aa]">{title}</h2>
          {right}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}

function Stat({ label, value, sub }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-[#6b7280]">{label}</p>
      <p className="text-xl font-semibold text-white tabular-nums">{value}</p>
      {sub && <p className="text-xs text-[#6b7280] truncate">{sub}</p>}
    </div>
  )
}

/* ─── Combined (radar + baseline) sections ───────────────────────────────── */
// What is missing/disabled, and the exact env setting that fixes each.
function buildFixes(c) {
  const flags = c?.collectors?.flags || {}
  const keys = c?.collectors?.keys || {}
  const fixes = []
  if (!c?.radarStatus?.enabled) fixes.push({ what: 'Radar (the main signal engine) is off', fix: 'Set ENABLE_RADAR=true' })
  else if (c.radarStatus.error) fixes.push({ what: `Radar is on but failing: ${c.radarStatus.error}`, fix: 'Check server logs and RADAR_DB_PATH' })
  if (!flags.SNAPSHOT_COLLECTOR) fixes.push({ what: 'Market snapshot collector is off (needed for the activity-v0 baseline)', fix: 'Set SNAPSHOT_COLLECTOR=1' })
  if (!flags.SMART_MONEY_COLLECTOR) fixes.push({ what: 'Smart-money wallet collector is off', fix: 'Set SMART_MONEY_COLLECTOR=1 and HELIUS_API_KEY or BIRDEYE_API_KEY' })
  else if (!keys.walletProvider) fixes.push({ what: 'Smart-money collector has no data provider', fix: 'Set HELIUS_API_KEY or BIRDEYE_API_KEY' })
  const discoveryFlags = ['SMART_MONEY_BIRDEYE_LB', 'SMART_MONEY_WINNER_BACKBUY', 'SMART_MONEY_SEEDS', 'SMART_MONEY_FOMOAPI', 'SMART_MONEY_SOLANATRACKER']
  if (flags.SMART_MONEY_COLLECTOR && !discoveryFlags.some((k) => flags[k])) {
    fixes.push({ what: 'No on-chain top-earner discovery source is switched on (these need no social data)', fix: 'Set SMART_MONEY_BIRDEYE_LB=1, SMART_MONEY_WINNER_BACKBUY=1 or SMART_MONEY_SEEDS=1' })
  }
  if (!flags.SOCIAL_COLLECTOR) fixes.push({ what: 'Social collector is off', fix: 'Set SOCIAL_COLLECTOR=1 and X_BEARER_TOKEN (or TWITTERAPI_IO_KEY)' })
  else if (!keys.x && !keys.telegram) fixes.push({ what: 'Social collector has no X or Telegram key', fix: 'Set X_BEARER_TOKEN (or TWITTERAPI_IO_KEY)' })
  if (!flags.EVAL_JOB) fixes.push({ what: 'Hourly baseline evaluation is off', fix: 'Set EVAL_JOB=1' })
  return fixes
}

function OverallCard({ combined }) {
  const o = combined.overall
  const v = VERDICTS[o?.verdict] || VERDICTS.INSUFFICIENT_DATA
  const Icon = v.Icon
  const days = combined.radarStatus?.daysOfData ?? 0
  const f = o?.facts || {}
  const fixes = buildFixes(combined)
  return (
    <Panel title="Does it work yet?">
      <div className={`inline-flex items-center gap-2 px-3 py-1.5 border rounded-md text-sm font-semibold ${v.cls}`}>
        <Icon size={16} /> {v.label}
      </div>
      <p className="text-sm text-[#d4d4d8] mt-3 leading-relaxed">{o?.headline}</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
        <Stat label="Days collected" value={days.toFixed(1)} sub={`need ${f.minDays ?? 7}+`} />
        <Stat label="Tokens with history" value={num(f.tokens)} sub={`need ${f.minTokens ?? 100}+`} />
        <Stat label="Test-slice trades" value={f.testSlice ? num(f.testSlice.n) : '—'} sub="held-out, never tuned on" />
        <Stat label="Signals chasing a pump" value={pct(f.shareReactive, 0)} sub="lower is better" />
      </div>
      {o?.reasons?.length > 0 && (
        <ul className="mt-4 space-y-1 text-sm text-[#a1a1aa] list-disc pl-5">
          {o.reasons.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      )}
      <p className="text-xs text-[#6b7280] mt-3">
        Beats the simple "highest volume" pick: {f.beatsVolumeBaseline == null ? 'unknown yet' : f.beatsVolumeBaseline ? 'yes' : 'no'}.
        This page never reports a proven edge; the best it can say is "possible, unproven".
      </p>
      {fixes.length > 0 && (
        <div className="mt-4 border-t border-[#1f1f1f] pt-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#a1a1aa] mb-2">What is missing or switched off</p>
          <ul className="space-y-1.5">
            {fixes.map((x) => (
              <li key={x.what} className="flex gap-2 text-sm text-yellow-300/90">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>{x.what}. <code className="text-white bg-[#0a0a0a] border border-[#1f1f1f] rounded px-1.5 py-0.5 text-xs">{x.fix}</code></span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  )
}

function RadarResults({ radar }) {
  if (!radar || radar.enabled === false) {
    return <Panel title="Radar results"><p className="text-sm text-[#a1a1aa]">Radar is off, so there are no results. Set ENABLE_RADAR=true on the server.</p></Panel>
  }
  if (radar.error) {
    return <Panel title="Radar results"><p className="text-sm text-red-400">Radar report failed: {radar.error}</p></Panel>
  }
  const rows = [...(radar.results || [])].sort((a, b) => (a.window === b.window ? 0 : a.window === 'test' ? -1 : 1))
  const cell = 'py-1.5 pr-4 text-right'
  return (
    <Panel title="Radar results (forward returns, paper trades)">
      <p className="text-xs text-[#6b7280] mb-3">
        Paper trades after fees and slippage, one entry per token. "test" rows are the held-out final slice and are the only fair
        read for the fitted model; "all" rows are hand-set models. A check mark means it beat random picks even after correcting for
        how many things were tried ({radar.comparisons} comparisons). Reactive % is how many signals fired after a 20%+ run-up.
        {radar.fit?.status && radar.fit.status !== 'ok' && <> Fitted model: {radar.fit.status}{radar.fit.reason ? ` (${radar.fit.reason})` : ''}.</>}
      </p>
      {rows.length === 0 ? <p className="text-sm text-[#a1a1aa]">No results yet.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[#6b7280]">
                {['Window', 'Model', 'Hold', 'Trades', 'Win %', 'Mean', 'Median', 'Worst 10%', 'Rug %', 'Random mean', 'p', 'Reactive %'].map((h, i) => (
                  <th key={h} className={`py-1 pr-4 font-medium ${i > 2 ? 'text-right' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-[#1f1f1f]">
                  <td className="py-1.5 pr-4 text-white">{r.window}</td>
                  <td className="py-1.5 pr-4 text-white">{r.model}</td>
                  <td className="py-1.5 pr-4 text-[#a1a1aa]">{r.strategy}</td>
                  <td className={`${cell} text-[#a1a1aa]`}>{r.n}</td>
                  <td className={`${cell} text-[#a1a1aa]`}>{pct(r.winRate, 0)}</td>
                  <td className={`${cell} ${r.mean >= 0 ? 'text-green-400' : 'text-red-400'}`}>{pct(r.mean)}</td>
                  <td className={`${cell} text-[#a1a1aa]`}>{pct(r.median)}</td>
                  <td className={`${cell} text-[#a1a1aa]`}>{pct(r.p10, 0)}</td>
                  <td className={`${cell} text-[#a1a1aa]`}>{pct(r.rugRate, 0)}</td>
                  <td className={`${cell} text-[#a1a1aa]`}>{pct(r.baseline?.meanOfMeans)}</td>
                  <td className={`${cell} text-[#a1a1aa]`}>{r.pVsRandom == null ? '—' : r.pVsRandom.toFixed(3)}{r.significantAfterCorrection ? ' ✓' : ''}</td>
                  <td className={`${cell} text-[#a1a1aa]`}>{r.precedence ? pct(r.precedence.shareReactive, 0) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {radar.caveats?.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-[#6b7280] list-disc pl-5">
          {radar.caveats.map((c, i) => <li key={i}>{c}</li>)}
        </ul>
      )}
    </Panel>
  )
}

function CollectorCounts({ collectors }) {
  const tables = collectors?.tables
  if (!tables) return null
  return (
    <Panel title="Wallet and social collectors (row counts)">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {Object.entries(tables).map(([t, v]) => (
          <Stat key={t} label={t} value={num(v.rows)} sub={v.exists ? (v.rows ? 'collecting' : 'empty') : 'not created / collector never ran'} />
        ))}
      </div>
    </Panel>
  )
}

/* ─── Sections ───────────────────────────────────────────────────────────── */
function CollectionStatus({ status }) {
  const days = status.daysOfData || 0
  return (
    <Panel title="Data collection">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
        <Stat label="Days collected" value={days.toFixed(1)} sub={days < 7 ? 'aim for 7+ days' : 'enough time span'} />
        <Stat label="Tokens" value={num(status.tokens)} />
        <Stat label="Market snapshots" value={num(status.snapshots)} />
        <Stat label="Signals logged" value={num(status.signals)} />
        <Stat label="Outcomes measured" value={num(status.outcomes)} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-[#6b7280]">
              <th className="py-1 pr-4 font-medium">Collector / table</th>
              <th className="py-1 pr-4 font-medium text-right">Rows</th>
              <th className="py-1 font-medium text-right">Last write</th>
            </tr>
          </thead>
          <tbody>
            {status.collectors.map((c) => (
              <tr key={c.table} className="border-t border-[#1f1f1f]">
                <td className="py-1.5 pr-4 text-white">
                  <span className={`inline-block w-2 h-2 rounded-full mr-2 ${c.hasData ? 'bg-green-400' : 'bg-[#3f3f46]'}`} />
                  {c.table}
                </td>
                <td className="py-1.5 pr-4 text-right tabular-nums text-[#a1a1aa]">{num(c.rows)}</td>
                <td className="py-1.5 text-right text-[#a1a1aa]">{c.hasData ? ago(c.lastTs) : 'no data'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!status.evalJobEnabled && (
        <p className="text-xs text-[#6b7280] mt-3">Hourly evaluation job is off (set EVAL_JOB=1 on the server). Reports can still be run manually.</p>
      )}
    </Panel>
  )
}

function VerdictCard({ report, onRun, running, secret, setSecret, runError }) {
  const v = VERDICTS[report?.verdict] || VERDICTS.INSUFFICIENT_DATA
  const Icon = v.Icon
  return (
    <Panel
      title="Does this signal work?"
      right={report && <span className="text-xs text-[#6b7280]">report {ago(report.created_ts)}</span>}
    >
      {report ? (
        <>
          <div className={`inline-flex items-center gap-2 px-3 py-1.5 border rounded-md text-sm font-semibold ${v.cls}`}>
            <Icon size={16} /> {v.label}
          </div>
          <p className="text-xs text-[#6b7280] mt-2">
            Model {report.primaryModel} · {hLabel(report.primaryHorizonMin)} horizon · headline verdict only
          </p>
          <p className="text-sm text-[#d4d4d8] mt-3 leading-relaxed">{report.summary}</p>
        </>
      ) : (
        <p className="text-sm text-[#a1a1aa]">No report generated yet. Run an evaluation below, or wait for the hourly job.</p>
      )}
      <div className="flex flex-wrap items-center gap-2 mt-4">
        <input
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="admin secret (if required)"
          className="bg-[#0a0a0a] border border-[#1f1f1f] rounded px-2 py-1.5 text-xs text-white placeholder-[#6b7280] w-52"
        />
        <button
          onClick={onRun}
          disabled={running}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-[#2a2a2a] text-white hover:bg-[#1f1f1f] disabled:opacity-50"
        >
          {running ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Run evaluation now
        </button>
        {runError && <span className="text-xs text-red-400">{runError}</span>}
      </div>
    </Panel>
  )
}

function Warnings({ report }) {
  const items = [...(report?.warnings || []), ...(report?.headline?.reasons || []).filter(() => report?.verdict === 'INSUFFICIENT_DATA')]
  if (!items.length) return null
  return (
    <Panel title="Warnings">
      <ul className="space-y-1.5">
        {items.map((w, i) => (
          <li key={i} className="flex gap-2 text-sm text-yellow-300/90">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" /> <span>{w}</span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

function PrecisionTable({ ev }) {
  if (!ev || !ev.n) return <p className="text-sm text-[#a1a1aa]">No scored outcomes yet.</p>
  const rows = Object.values(ev.cutoffs || {})
  const base = ev.baselines
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-[#6b7280]">
            <th className="py-1 pr-4 font-medium">Picks</th>
            <th className="py-1 pr-4 font-medium text-right">N</th>
            <th className="py-1 pr-4 font-medium text-right">Precision</th>
            <th className="py-1 pr-4 font-medium text-right">Recall</th>
            <th className="py-1 pr-4 font-medium text-right">Lift</th>
            <th className="py-1 font-medium text-right">Mean net return</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {rows.map((b) => (
            <tr key={b.frac} className="border-t border-[#1f1f1f]">
              <td className="py-1.5 pr-4 text-white">Signal top {pct(b.frac, 0)}</td>
              <td className="py-1.5 pr-4 text-right text-[#a1a1aa]">{b.k}</td>
              <td className="py-1.5 pr-4 text-right text-white">{pct(b.precision)}</td>
              <td className="py-1.5 pr-4 text-right text-[#a1a1aa]">{pct(b.recall)}</td>
              <td className="py-1.5 pr-4 text-right text-white">{b.lift == null ? '—' : `${b.lift.toFixed(2)}x`}</td>
              <td className={`py-1.5 text-right ${b.meanNet >= 0 ? 'text-green-400' : 'text-red-400'}`}>{pct(b.meanNet)}</td>
            </tr>
          ))}
          {base?.volume5m && (
            <tr className="border-t border-[#1f1f1f]">
              <td className="py-1.5 pr-4 text-[#a1a1aa]">Baseline: highest 5m volume</td>
              <td className="py-1.5 pr-4 text-right text-[#a1a1aa]">{base.volume5m.k}</td>
              <td className="py-1.5 pr-4 text-right text-[#a1a1aa]">{pct(base.volume5m.precision)}</td>
              <td className="py-1.5 pr-4 text-right text-[#a1a1aa]">{pct(base.volume5m.recall)}</td>
              <td className="py-1.5 pr-4 text-right text-[#a1a1aa]">{base.volume5m.lift == null ? '—' : `${base.volume5m.lift.toFixed(2)}x`}</td>
              <td className="py-1.5 text-right text-[#a1a1aa]">{pct(base.volume5m.meanNet)}</td>
            </tr>
          )}
          {base?.random && (
            <tr className="border-t border-[#1f1f1f]">
              <td className="py-1.5 pr-4 text-[#a1a1aa]">Baseline: random picks (95th pct)</td>
              <td className="py-1.5 pr-4 text-right text-[#a1a1aa]">{base.random.k}</td>
              <td className="py-1.5 pr-4 text-right text-[#a1a1aa]">{pct(base.random.expectedPrecision)} ({pct(base.random.precisionP95)})</td>
              <td className="py-1.5 pr-4 text-right text-[#a1a1aa]">—</td>
              <td className="py-1.5 pr-4 text-right text-[#a1a1aa]">1.00x</td>
              <td className="py-1.5 text-right text-[#a1a1aa]">{pct(base.random.meanNet)}</td>
            </tr>
          )}
          <tr className="border-t border-[#1f1f1f]">
            <td className="py-1.5 pr-4 text-[#a1a1aa]">All signals (base rate)</td>
            <td className="py-1.5 pr-4 text-right text-[#a1a1aa]">{ev.n}</td>
            <td className="py-1.5 pr-4 text-right text-[#a1a1aa]">{pct(ev.baseRate)}</td>
            <td className="py-1.5 pr-4 text-right text-[#a1a1aa]">100%</td>
            <td className="py-1.5 pr-4 text-right text-[#a1a1aa]">1.00x</td>
            <td className="py-1.5 text-right text-[#a1a1aa]">{pct(ev.returns?.meanNet)}</td>
          </tr>
        </tbody>
      </table>
      {ev.bootstrap && (
        <p className="text-xs text-[#6b7280] mt-3">
          Precision excess over base rate (top {pct(ev.config.primaryFrac, 0)}): {pct(ev.bootstrap.precisionExcess.estimate)}
          {' '}[95% CI {pct(ev.bootstrap.precisionExcess.ci95[0])} to {pct(ev.bootstrap.precisionExcess.ci95[1])}],
          {' '}one-sided p = {ev.bootstrap.precisionExcess.pValue.toFixed(3)} (resampling whole tokens, not rows).
        </p>
      )}
      {ev.stability && (
        <p className="text-xs text-[#6b7280] mt-1">
          Stability: first half excess {pct(ev.stability.firstHalf.precisionExcess)}, second half {pct(ev.stability.secondHalf.precisionExcess)}
          {ev.stability.stable ? ' (consistent)' : ' (inconsistent or too thin)'}.
        </p>
      )}
    </div>
  )
}

function ReturnDistribution({ ev }) {
  const r = ev?.returns
  if (!r) return <p className="text-sm text-[#a1a1aa]">No data.</p>
  // five-number-ish strip on a shared scale: worst decile, median, mean, best decile
  const pts = [
    { k: 'Worst 10%', v: r.worstDecileNet },
    { k: 'Median', v: r.medianNet },
    { k: 'Mean', v: r.meanNet },
    { k: 'Best 10%', v: r.bestDecileNet },
  ]
  const lo = Math.min(-1, ...pts.map((p) => p.v))
  const hi = Math.max(0.5, ...pts.map((p) => p.v))
  const pos = (v) => `${((v - lo) / (hi - lo)) * 100}%`
  const zero = pos(0)
  const top5 = ev.cutoffs?.[String(ev.config.primaryFrac)]
  return (
    <div>
      <div className="relative h-8 bg-[#0a0a0a] border border-[#1f1f1f] rounded mb-3">
        <div className="absolute top-0 bottom-0 w-px bg-[#52525b]" style={{ left: zero }} title="0%" />
        {pts.map((p) => (
          <div key={p.k} className="absolute top-1.5 bottom-1.5 w-1.5 -ml-[3px] rounded-sm bg-white/80" style={{ left: pos(p.v) }} title={`${p.k}: ${pct(p.v)}`} />
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {pts.map((p) => (
          <Stat key={p.k} label={`${p.k} (net)`} value={pct(p.v)} />
        ))}
      </div>
      <p className="text-xs text-[#6b7280] mt-3">
        Net of {pct(ev.config.cost, 0)} assumed round-trip cost. Worst-10% average loss: {pct(r.worstDecileMeanNet)}.
        {top5 && <> Top {pct(ev.config.primaryFrac, 0)} picks: median {pct(top5.medianNet)}, worst decile {pct(top5.worstDecileNet)}.</>}
        {' '}Dead tokens (scored -100%): {pct(r.deadShare)} of outcomes.
      </p>
    </div>
  )
}

function HorizonTable({ model, primaryHorizon }) {
  if (!model) return null
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-[#6b7280]">
            <th className="py-1 pr-4 font-medium">Horizon</th>
            <th className="py-1 pr-4 font-medium text-right">Measured</th>
            <th className="py-1 pr-4 font-medium text-right">Dead</th>
            <th className="py-1 pr-4 font-medium text-right">Pending</th>
            <th className="py-1 pr-4 font-medium text-right">Top-5% lift</th>
            <th className="py-1 font-medium">Verdict</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {Object.entries(model.horizons).map(([h, d]) => {
            const b = d.evaluation.cutoffs?.['0.05']
            const vd = VERDICTS[d.evaluation.verdict] || VERDICTS.INSUFFICIENT_DATA
            return (
              <tr key={h} className="border-t border-[#1f1f1f]">
                <td className="py-1.5 pr-4 text-white">{hLabel(Number(h))}{Number(h) === primaryHorizon ? ' (headline)' : ''}</td>
                <td className="py-1.5 pr-4 text-right text-[#a1a1aa]">{d.outcomes.ok + d.outcomes.dead}</td>
                <td className="py-1.5 pr-4 text-right text-[#a1a1aa]">{d.outcomes.dead}</td>
                <td className="py-1.5 pr-4 text-right text-[#a1a1aa]">{d.outcomes.pending}</td>
                <td className="py-1.5 pr-4 text-right text-white">{b?.lift == null ? '—' : `${b.lift.toFixed(2)}x`}</td>
                <td className="py-1.5 text-xs text-[#a1a1aa]">{vd.label}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="text-xs text-[#6b7280] mt-2">Non-headline horizons are exploratory: checking many can produce lucky-looking results.</p>
    </div>
  )
}

/* ─── Page ───────────────────────────────────────────────────────────────── */
/* ─── Who mentions winners early? ───────────────────────────────────────── */
const dur = (s) => (s == null ? '—' : s >= 3600 ? `${(s / 3600).toFixed(1)}h` : `${Math.round(s / 60)}m`)
const LEVEL = { platform: 'Platform', community: 'Board / subreddit / channel', thread: 'Thread', account: 'Account' }

function WinnerFirst({ q, onRun, running, secret }) {
  const rep = q.data
  const notYet = q.isError && q.error?.status === 404
  const v = VERDICTS[rep?.verdict] || VERDICTS.INSUFFICIENT_DATA
  const Icon = v.Icon
  const shown = (rep?.sources || []).filter((s) => s.verdict !== 'INSUFFICIENT_DATA').slice(0, 15)
  const thin = (rep?.sources || []).filter((s) => s.verdict === 'INSUFFICIENT_DATA').length
  return (
    <Panel
      title="Who mentions winners early?"
      right={secret !== undefined && (
        <button onClick={onRun} disabled={running} className="text-xs text-[#a1a1aa] hover:text-white inline-flex items-center gap-1">
          {running ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Re-run
        </button>
      )}
    >
      <p className="text-xs text-[#6b7280] mb-3">
        Looks back over chatter our own collectors stored (Reddit, X, Telegram, and the optional experimental 4chan control, where only counts are kept: no 4chan text is stored or shown). A winner is a token that rose
        {rep?.config ? ` ${pct(rep.config.winnerReturn, 0)}+ within ${hLabel((rep.config.horizonSec || 0) / 60)}` : ' a lot'} after a fixed
        reference point. A mention is "early" only if it was posted strictly before that point and was already in our database.
      </p>
      {q.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-[#a1a1aa]"><Loader2 size={14} className="animate-spin" /> Loading…</div>
      ) : notYet ? (
        <p className="text-sm text-[#a1a1aa]">
          No report yet. {q.error?.data?.jobEnabled ? 'The job is enabled and will run soon.' : 'The job is off (set WINNER_FIRST_JOB=1 on the server, or run it manually).'}
        </p>
      ) : q.isError || !rep ? (
        <p className="text-sm text-red-400">Could not load the report.</p>
      ) : (
        <>
          <div className={`inline-flex items-center gap-2 border rounded-md px-3 py-1.5 text-sm ${v.cls}`}>
            <Icon size={14} /> {v.label}
          </div>
          <p className="text-sm text-[#d4d4d8] mt-3">{rep.summary}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
            <Stat label="Winners" value={num(rep.counts?.winners)} />
            <Stat label="Matched non-winners" value={num(rep.counts?.controls)} />
            <Stat label="Posts scanned" value={num(rep.counts?.postsLoaded)} />
            <Stat label="Report age" value={ago(rep.created_ts)} />
          </div>
          {shown.length > 0 && (
            <div className="overflow-x-auto mt-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-[#6b7280]">
                    <th className="py-1 pr-3 font-medium">Source</th>
                    <th className="py-1 pr-3 font-medium text-right">Led winners</th>
                    <th className="py-1 pr-3 font-medium text-right">Led non-winners</th>
                    <th className="py-1 pr-3 font-medium text-right">Lead median / 25th pct</th>
                    <th className="py-1 pr-3 font-medium text-right">Rate gap (95% CI)</th>
                    <th className="py-1 pr-3 font-medium text-right">p / BH q</th>
                    <th className="py-1 font-medium">Verdict</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {shown.map((s) => (
                    <tr key={s.key} className="border-t border-[#1f1f1f] align-top">
                      <td className="py-1.5 pr-3 text-white break-all">{s.id}<div className="text-[10px] text-[#6b7280]">{LEVEL[s.level] || s.level}</div></td>
                      <td className="py-1.5 pr-3 text-right text-[#a1a1aa]">{s.winnersPreceded}/{s.nWinners}</td>
                      <td className="py-1.5 pr-3 text-right text-[#a1a1aa]">{s.controlsPreceded}/{s.nControls}</td>
                      <td className="py-1.5 pr-3 text-right text-[#a1a1aa]">{dur(s.leadWinners?.medianSec)} / {dur(s.leadWinners?.p25Sec)}</td>
                      <td className="py-1.5 pr-3 text-right text-[#a1a1aa]">
                        {s.early ? `${pct(s.early.diff)} (${pct(s.early.ci95[0])} to ${pct(s.early.ci95[1])})` : '—'}
                      </td>
                      <td className="py-1.5 pr-3 text-right text-[#a1a1aa]">{s.early ? `${s.early.p.toFixed(3)} / ${s.early.qBH.toFixed(3)}` : '—'}</td>
                      <td className="py-1.5 text-xs text-[#a1a1aa]">{(VERDICTS[s.verdict] || VERDICTS.INSUFFICIENT_DATA).label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {thin > 0 && <p className="text-xs text-[#6b7280] mt-2">{thin} more sources have too few tokens to test and are not shown.</p>}
          <ul className="list-disc pl-5 mt-4 space-y-1 text-xs text-[#6b7280]">
            {(rep.caveats || []).map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </>
      )}
    </Panel>
  )
}

/* ─── On-chain top-earner wallet discovery ──────────────────────────────── */
const SRC_LABEL = {
  birdeye_leaderboard: 'Birdeye leaderboard',
  birdeye_gainers: 'Birdeye top gainers',
  birdeye_top_traders: 'Birdeye top traders (by volume)',
  winner_backbuyers: 'Early buyers of radar winners',
  seeds: 'Manual wallet seeds',
  seed: 'Manual wallet seeds',
  fomoapi: 'FOMO API leaderboard',
  solanatracker: 'SolanaTracker leaderboard',
  control_trending: 'Control: top traders on trending tokens',
  control_late_buyers: 'Control: late buyers of winners',
}
const rate = (x) => (x == null ? '—' : `${(x * 100).toFixed(0)}%`)

function ForwardGroup({ label, g }) {
  return (
    <tr className="border-t border-[#1f1f1f]">
      <td className="py-1.5 pr-3 text-white">{label}</td>
      <td className="py-1.5 pr-3 text-right text-[#a1a1aa]">{num(g?.evaluated)}</td>
      <td className="py-1.5 pr-3 text-right text-[#a1a1aa]">{num(g?.withForwardTrades)}</td>
      <td className="py-1.5 pr-3 text-right text-[#a1a1aa]">
        {rate(g?.positiveRate)}{g?.positiveCi95 ? ` (${rate(g.positiveCi95[0])} to ${rate(g.positiveCi95[1])})` : ''}
      </td>
      <td className="py-1.5 pr-3 text-right text-[#a1a1aa]">{g?.preWinners ? `${g.preWinnersStayedPositive}/${g.preWinners}` : '—'}</td>
      <td className="py-1.5 pr-3 text-right text-[#a1a1aa]">{pct(g?.medianPreMeanReturn)} to {pct(g?.medianPostMeanReturn)}</td>
    </tr>
  )
}

function WalletDiscovery({ q }) {
  const rep = q.data
  const fw = rep?.forward
  const v = VERDICTS[fw?.verdict] || VERDICTS.INSUFFICIENT_DATA
  const Icon = v.Icon
  return (
    <Panel title="On-chain top-earner wallets (needs no social data)">
      <p className="text-xs text-[#6b7280] mb-3">
        Wallet candidates come from Birdeye leaderboards, early buyers of tokens the radar flagged as winners, wallets you paste
        in by hand, and optional third-party leaderboards. Whatever profit a leaderboard claims is ignored: every wallet is
        re-scored from its own on-chain trades with the same out-of-sample (holdout) rule, and only wallets that pass it can
        ever produce a smart-money signal.
      </p>
      {q.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-[#a1a1aa]"><Loader2 size={14} className="animate-spin" /> Loading…</div>
      ) : q.isError || !rep ? (
        <p className="text-sm text-red-400">Could not load wallet discovery.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[#6b7280]">
                  <th className="py-1 pr-3 font-medium">Source</th>
                  <th className="py-1 pr-3 font-medium">Switch</th>
                  <th className="py-1 pr-3 font-medium">Status</th>
                  <th className="py-1 font-medium text-right">Last run</th>
                </tr>
              </thead>
              <tbody>
                {(rep.sources || []).map((s) => (
                  <tr key={s.name} className="border-t border-[#1f1f1f] align-top">
                    <td className="py-1.5 pr-3 text-white">{SRC_LABEL[s.name] || s.name}</td>
                    <td className="py-1.5 pr-3"><code className="text-xs text-[#a1a1aa]">{s.flag}</code></td>
                    <td className={`py-1.5 pr-3 text-xs ${s.enabled ? 'text-green-400' : 'text-[#a1a1aa]'}`}>{s.enabled ? 'on' : `off: ${s.reason || ''}`}</td>
                    <td className="py-1.5 text-right text-[#a1a1aa]">{s.lastRunTs ? ago(s.lastRunTs) : 'never'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rep.budget && (
            <p className="text-xs text-[#6b7280] mt-2">
              Birdeye requests today (UTC): {num(rep.budget.used)} of {num(rep.budget.limit)} allowed (hard cap, kept across restarts; the free tier is about 200 a day).
            </p>
          )}

          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#a1a1aa] mt-5 mb-2">What was found, and what survived re-scoring</h3>
          {rep.perSource.length === 0 ? (
            <p className="text-sm text-[#a1a1aa]">No candidates yet.{!rep.collectorEnabled && ' The smart-money collector is off (SMART_MONEY_COLLECTOR=1).'}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-[#6b7280]">
                    <th className="py-1 pr-3 font-medium">Source</th>
                    <th className="py-1 pr-3 font-medium text-right">Wallets found</th>
                    <th className="py-1 pr-3 font-medium text-right">Re-scored</th>
                    <th className="py-1 pr-3 font-medium text-right">Passed holdout</th>
                    <th className="py-1 font-medium text-right">Smart (score 0.5+)</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {rep.perSource.map((p) => (
                    <tr key={`${p.role}:${p.source}`} className="border-t border-[#1f1f1f]">
                      <td className="py-1.5 pr-3 text-white">
                        {SRC_LABEL[p.source] || p.source}
                        <div className="text-[10px] text-[#6b7280]">{p.role === 'control' ? 'random control (not picked for performance)' : p.survivor ? 'leaderboard survivor' : 'candidate'}</div>
                      </td>
                      <td className="py-1.5 pr-3 text-right text-[#a1a1aa]">{num(p.wallets)}</td>
                      <td className="py-1.5 pr-3 text-right text-[#a1a1aa]">{num(p.scored)}</td>
                      <td className="py-1.5 pr-3 text-right text-[#a1a1aa]">{num(p.passedHoldout)}</td>
                      <td className="py-1.5 text-right text-[#a1a1aa]">{num(p.smart)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#a1a1aa] mt-5 mb-2">
            Do leaderboard wallets keep winning? (next {rep.forwardDays} days vs random control wallets)
          </h3>
          <div className={`inline-flex items-center gap-2 border rounded-md px-3 py-1.5 text-sm ${v.cls}`}>
            <Icon size={14} /> {v.label}
          </div>
          <p className="text-sm text-[#d4d4d8] mt-3">{fw?.text}</p>
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[#6b7280]">
                  <th className="py-1 pr-3 font-medium">Group</th>
                  <th className="py-1 pr-3 font-medium text-right">Measured</th>
                  <th className="py-1 pr-3 font-medium text-right">3+ later trades</th>
                  <th className="py-1 pr-3 font-medium text-right">Stayed profitable (95% range)</th>
                  <th className="py-1 pr-3 font-medium text-right">Winners before, still winning</th>
                  <th className="py-1 pr-3 font-medium text-right">Typical trade return before to after</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                <ForwardGroup label="Leaderboard / seed / back-buyer wallets" g={fw?.candidates} />
                <ForwardGroup label="Random control wallets" g={fw?.control} />
              </tbody>
            </table>
          </div>
          {fw?.pCandidatesVsControl != null && (
            <p className="text-xs text-[#6b7280] mt-2">One-sided p-value, candidates better than control: {fw.pCandidatesVsControl.toFixed(3)} (exploratory; many comparisons are possible).</p>
          )}
          <ul className="list-disc pl-5 mt-4 space-y-1 text-xs text-[#6b7280]">
            {(rep.caveats || []).map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </>
      )}
    </Panel>
  )
}

export default function ResearchDashboard() {
  const status = useGetResearchStatusQuery(undefined, { pollingInterval: 60000 })
  const reportQ = useGetResearchReportQuery(undefined, { pollingInterval: 60000 })
  const combined = useGetResearchCombinedQuery(undefined, { pollingInterval: 300000 })
  const [run, runState] = useRunResearchEvalMutation()
  const wfQ = useGetWinnerFirstQuery(undefined, { pollingInterval: 300000 })
  const [runWf, wfState] = useRunWinnerFirstMutation()
  const wdQ = useGetWalletDiscoveryQuery(undefined, { pollingInterval: 300000 })
  const [secret, setSecret] = useState('')
  const [runError, setRunError] = useState('')

  const report = reportQ.data
  const model = report?.models?.[report.primaryModel]

  const onRun = async () => {
    setRunError('')
    try {
      await run(secret).unwrap()
      reportQ.refetch()
      status.refetch()
      combined.refetch()
    } catch (e) {
      setRunError(e?.status === 403 ? 'Not authorised (admin secret)' : 'Run failed')
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center gap-2">
        <FlaskConical size={20} className="text-[#a1a1aa]" />
        <h1 className="text-xl font-semibold text-white">Signal research</h1>
        <Activity size={14} className="text-[#6b7280]" />
      </div>
      <p className="text-sm text-[#a1a1aa]">
        An honest check of whether the unusual-activity score predicts which memecoins go up. This page never claims a
        proven edge, and it declines to give a verdict until there is enough data.
      </p>

      {combined.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-[#a1a1aa]"><Loader2 size={14} className="animate-spin" /> Running the radar report (can take a moment)…</div>
      ) : combined.isError ? (
        <Panel><p className="text-sm text-red-400">Could not load the combined research view.</p></Panel>
      ) : (
        <>
          <OverallCard combined={combined.data} />
          <RadarResults radar={combined.data.radar} />
        </>
      )}

      <h2 className="text-sm font-semibold text-white pt-2">Baseline: activity-v0 score (comparison only)</h2>

      <VerdictCard report={report} onRun={onRun} running={runState.isLoading} secret={secret} setSecret={setSecret} runError={runError} />
      <Warnings report={report} />

      {report && (
        <>
          <Panel title={`Precision & lift vs baselines (${hLabel(report.primaryHorizonMin)} horizon)`}>
            <p className="text-xs text-[#6b7280] mb-3">
              Success = net return above +{pct(report.headline.config.successThreshold, 0)} after {pct(report.headline.config.cost, 0)} round-trip cost.
            </p>
            <PrecisionTable ev={report.headline} />
          </Panel>
          <Panel title="Forward-return distribution">
            <ReturnDistribution ev={report.headline} />
          </Panel>
          <Panel title="All horizons">
            <HorizonTable model={model} primaryHorizon={report.primaryHorizonMin} />
          </Panel>
          {model && Object.keys(model.components).length > 0 && (
            <Panel title="Feature-group ablation (exploratory)">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-[#6b7280]">
                      <th className="py-1 pr-4 font-medium">Score used</th>
                      <th className="py-1 pr-4 font-medium text-right">Top-5% precision</th>
                      <th className="py-1 pr-4 font-medium text-right">Lift</th>
                      <th className="py-1 font-medium">Verdict</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {Object.entries(model.components).map(([name, c]) => {
                      const b = c.cutoffs?.['0.05']
                      return (
                        <tr key={name} className="border-t border-[#1f1f1f]">
                          <td className="py-1.5 pr-4 text-white">{name}</td>
                          <td className="py-1.5 pr-4 text-right text-[#a1a1aa]">{pct(b?.precision)}</td>
                          <td className="py-1.5 pr-4 text-right text-[#a1a1aa]">{b?.lift == null ? '—' : `${b.lift.toFixed(2)}x`}</td>
                          <td className="py-1.5 text-xs text-[#a1a1aa]">{(VERDICTS[c.verdict] || VERDICTS.INSUFFICIENT_DATA).label}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
          <p className="text-xs text-[#6b7280]">{report.methodology}</p>
        </>
      )}

      <WalletDiscovery q={wdQ} />

      <WinnerFirst
        q={wfQ}
        running={wfState.isLoading}
        secret={secret}
        onRun={async () => { try { await runWf(secret).unwrap(); wfQ.refetch() } catch (e) { /* surfaced by the empty state */ } }}
      />

      {status.isLoading ? null : status.isError ? (
        <Panel><p className="text-sm text-red-400">Could not load collection status.</p></Panel>
      ) : (
        <CollectionStatus status={status.data} />
      )}
      {combined.data && <CollectorCounts collectors={combined.data.collectors} />}
    </div>
  )
}
