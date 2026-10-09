import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Flame } from 'lucide-react'
import Sparkline, { median } from './Sparkline'
import {
  useGetTrendingMemecoinsQuery,
  useGetNewMemecoinsQuery,
} from '../../api/memecoinApi'

/**
 * The hot-tokens rail.
 *
 * Request budget: this panel issues none. Both list queries are subscribed with
 * pollingInterval 0, so it joins the cache entries TradingTerminal and the
 * discovery panel already hold — and those entries are written to directly by
 * the SSE stream (liveFeed's `list` and `launch` handlers patch
 * getTrendingMemecoins / getNewMemecoins), which is where the live market caps
 * come from. Adding an interval here would have cost real requests against the
 * shared 60/min limiter for freshness the stream already delivers.
 */

const ROWS = 14
const SAMPLES = 48      // ring buffer per token; ~24 minutes of pushes at the stream's cadence
const MIN_MOVE = 0.01   // a price that has not actually moved should not start a new sample

/* ── the plotted series ───────────────────────────────────────────────────
 * The list payload is a snapshot, not a series, so the path is built from two
 * things: the interval changes the snapshot already carries (which give three
 * real historical anchors without a single extra request), and every distinct
 * price this tab has since observed. Seeding matters — a freshly mounted rail
 * with one sample per token would have nothing to draw and no median to speak
 * of. */
function seedFrom(t) {
  const p = t.price
  if (!Number.isFinite(p) || p <= 0) return []
  const back = (pct) => (Number.isFinite(pct) && pct > -99 ? p / (1 + pct / 100) : null)
  // oldest first: 24h ago, 1h ago, 5m ago, now
  return [back(t.change24h), back(t.change1h), back(t.change5m), p].filter((v) => Number.isFinite(v) && v > 0)
}

/** Per-address price history, kept in a ref so a push does not re-render rows that did not change. */
function usePriceHistory(tokens) {
  const store = useRef(new Map())
  const [, bump] = useState(0)

  useEffect(() => {
    const m = store.current
    let changed = false
    const live = new Set()
    for (const t of tokens) {
      if (!t?.address) continue
      live.add(t.address)
      const p = t.price
      if (!Number.isFinite(p) || p <= 0) continue
      const prev = m.get(t.address)
      if (!prev) { m.set(t.address, seedFrom(t)); changed = true; continue }
      const last = prev[prev.length - 1]
      // Identical snapshots arrive constantly (a poll that changed nothing, a
      // stream push about another coin); only a real move is a new sample.
      if (last != null && Math.abs(p - last) <= Math.abs(last) * (MIN_MOVE / 100)) continue
      const next = prev.concat(p)
      m.set(t.address, next.length > SAMPLES ? next.slice(next.length - SAMPLES) : next)
      changed = true
    }
    // A token that has dropped off every list will not come back with its history intact anyway.
    for (const k of m.keys()) if (!live.has(k)) { m.delete(k); changed = true }
    if (changed) bump((n) => n + 1)
  }, [tokens])

  return store.current
}

/* ── ranking ────────────────────────────────────────────────────────────── */
const num = (v) => (Number.isFinite(v) ? v : 0)
/* "Hot" is recent movement that something is actually trading against: a 300%
 * move on $4k of liquidity is noise, and sorting on it fills the rail with dust. */
const heat = (t) =>
  (Math.abs(num(t.change5m)) * 3 + Math.abs(num(t.change1h)) * 1.5 + Math.abs(num(t.change24h)) * 0.25)
  * Math.min(1, Math.log10(Math.max(num(t.liquidity), 1_000)) / 5)

const SORTS = {
  hot: { label: 'Hot', cmp: (a, b) => heat(b) - heat(a), title: 'Biggest recent moves, discounted by how thin the pool is' },
  gain: { label: 'Gain', cmp: (a, b) => num(b.change24h) - num(a.change24h), title: 'Largest 24h gain' },
  cap: { label: 'Cap', cmp: (a, b) => num(b.marketCap) - num(a.marketCap), title: 'Largest market cap' },
}

export default function HotTokens({ selected, onSelect, fmt, Avatar }) {
  const { fmtUsd, fmtPrice, fmtPct, pctColor, safeText } = fmt
  const [sort, setSort] = useState('hot')

  // pollingInterval 0 on purpose — see the note at the top of this file.
  const trending = useGetTrendingMemecoinsQuery(undefined, { pollingInterval: 0 })
  const fresh = useGetNewMemecoinsQuery(undefined, { pollingInterval: 0 })

  const merged = useMemo(() => {
    const by = new Map()
    for (const t of [...(Array.isArray(trending.data) ? trending.data : []), ...(Array.isArray(fresh.data) ? fresh.data : [])]) {
      if (t?.address && !by.has(t.address)) by.set(t.address, t)
    }
    return [...by.values()]
  }, [trending.data, fresh.data])

  const history = usePriceHistory(merged)
  const rows = useMemo(() => [...merged].sort(SORTS[sort].cmp).slice(0, ROWS), [merged, sort])

  const loading = (trending.isLoading && fresh.isLoading) || (merged.length === 0 && (trending.isFetching || fresh.isFetching))

  return (
    <section className="t-panel flex h-[320px] min-w-0 flex-col overflow-hidden lg:h-full lg:min-h-0">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <Flame className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--ochre-300)' }} />
        <span className="t-label" style={{ display: 'inline' }}>Hot tokens</span>
        <div role="tablist" className="ml-auto flex items-center gap-1">
          {Object.entries(SORTS).map(([k, s]) => (
            <button
              key={k}
              role="tab"
              aria-selected={sort === k}
              title={s.title}
              onClick={() => setSort(k)}
              className="t-tab t-tab-sm"
            >{s.label}</button>
          ))}
        </div>
      </div>

      <div className="t-rule min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="t-hot-row animate-pulse">
              <div className="h-3 w-full" style={{ background: 'var(--on-ink-2)' }} />
              <div className="mt-2 h-3 w-2/3" style={{ background: 'var(--on-ink-2)' }} />
            </div>
          ))
        ) : rows.length === 0 ? (
          <p className="p-4 text-center text-xs" style={{ color: 'var(--on-ink-text-3)' }}>No tokens on the wire yet.</p>
        ) : rows.map((t) => {
          const series = history.get(t.address) || []
          const med = median(series)
          const ch24 = t.change24h ?? t.change1h
          return (
            <button
              key={t.address}
              onClick={() => onSelect(t.address)}
              aria-current={t.address === selected ? 'true' : undefined}
              className="t-hot-row"
              title={[
                `${safeText(t.symbol)} — ${safeText(t.name, 48)}`,
                `Market cap ${fmtUsd(t.marketCap)}`,
                `Volume 24h ${fmtUsd(t.volume24h)}`,
                `Liquidity ${fmtUsd(t.liquidity)}`,
                med != null ? `Median of the ${series.length} plotted prices ${fmtPrice(med)}` : null,
              ].filter(Boolean).join('\n')}
            >
              <div className="t-hot-line">
                <span className="t-hot-head">
                  <Avatar token={t} size={18} />
                  <span className="t-hot-sym">{safeText(t.symbol, 10)}</span>
                </span>
                <span className="t-hot-cap" title="Live market cap">{fmtUsd(t.marketCap)}</span>
              </div>
              <div className="t-hot-line t-hot-sub">
                <span>{fmtPrice(t.price)}</span>
                {t.volume24h != null && <span className="t-hot-vol" title="24h volume">V {fmtUsd(t.volume24h)}</span>}
                <span className={`font-bold ${pctColor(ch24)}`}>{fmtPct(ch24)}</span>
              </div>
              <div className="t-hot-line t-hot-foot">
                <Sparkline
                  values={series}
                  width={120}
                  height={20}
                  className="t-hot-spark"
                  title={med != null
                    ? `${series.length} prices, median ${fmtPrice(med)} (dashed)`
                    : 'not enough price samples yet'}
                />
                <span className="t-hot-deltas">
                  <span className={pctColor(t.change5m)}>5m {fmtPct(t.change5m)}</span>
                  <span className={pctColor(t.change1h)}>1h {fmtPct(t.change1h)}</span>
                </span>
              </div>
            </button>
          )
        })}
      </div>

      <p className="t-rule t-fineprint px-3 py-2">
        Market caps are live. The dashed line is the median of the prices plotted beside it. Not financial advice.
      </p>
    </section>
  )
}
