import { useEffect, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import {
  createChart, CandlestickSeries, HistogramSeries, LineSeries, ColorType, CrosshairMode, LineStyle, createSeriesMarkers,
} from 'lightweight-charts'
import { MousePointer2, TrendingUp, Minus, MessageSquarePlus, Eraser } from 'lucide-react'

// Chart colours live in the canvas, so they can't use CSS variables: one palette per theme.
const PALETTES = {
  dark: { bg: '#070704', text: '#b4afa4', grid: 'rgba(240,235,224,0.06)', border: '#2b2819', up: '#8cb874', down: '#dd6a56', volUp: 'rgba(140,184,116,0.45)', volDown: 'rgba(221,106,86,0.45)' },
  light: { bg: '#e6e5df', text: '#55554f', grid: 'rgba(17,17,16,0.08)', border: '#cfcdc2', up: '#2f7a3a', down: '#b3392a', volUp: 'rgba(47,122,58,0.4)', volDown: 'rgba(179,57,42,0.4)' },
}
const ACCENT = '#d6b87a'

// A handful of candles stretched to fill the pane via fitContent() render as oversized blocks.
// Below this count, use a fixed, readable candle width and anchor to the latest bar instead.
const DENSE_THRESHOLD = 40
const FIXED_BAR_SPACING = 10

const TOOLS = [
  { id: 'cursor', icon: MousePointer2, label: 'Cursor' },
  { id: 'trend', icon: TrendingUp, label: 'Trend line (click two points)' },
  { id: 'hline', icon: Minus, label: 'Horizontal line' },
  { id: 'note', icon: MessageSquarePlus, label: 'Note' },
]

// candleMerge keeps the series ascending, but this component is also handed data
// straight from the API, so the cheap check earns the right to skip the sort.
function isAscending(list) {
  for (let i = 1; i < list.length; i++) if (list[i].time < list[i - 1].time) return false
  return true
}

function precisionFor(price) {
  if (!price || price >= 1) return 4
  return Math.min(12, Math.max(4, Math.ceil(-Math.log10(price)) + 3))
}

/**
 * Candlestick + volume chart (lightweight-charts v5), with a small drawing toolbar
 * (trend line, horizontal line, note) built on the library's own primitives so marks stay
 * correctly positioned on pan/zoom instead of drifting like a manually-positioned overlay would.
 * candles: [{ time (unix seconds), open, high, low, close, volume }]
 * fitKey: change to re-fit the visible range and clear drawings (token / timeframe switch).
 */
export default function MemeChart({ candles, fitKey }) {
  const hostRef = useRef(null)
  const apiRef = useRef({})
  const drawRef = useRef({ lines: [], priceLines: [], markers: [], pending: null })
  const appliedRef = useRef(null)      // what the series currently holds, so a tick can be an update()
  const precisionRef = useRef(null)
  const positionedRef = useRef(null)   // the fitKey the view was last positioned for
  const [mode, setMode] = useState('cursor')
  const isDark = useSelector((s) => s.theme.isDark)
  const pal = PALETTES[isDark ? 'dark' : 'light']
  const palRef = useRef(pal)
  palRef.current = pal
  const modeRef = useRef(mode)
  useEffect(() => { modeRef.current = mode }, [mode])

  useEffect(() => {
    const chart = createChart(hostRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: palRef.current.bg },
        textColor: palRef.current.text,
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 11,
      },
      grid: { vertLines: { color: palRef.current.grid }, horzLines: { color: palRef.current.grid } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: palRef.current.border },
      timeScale: { borderColor: palRef.current.border, timeVisible: true, secondsVisible: false },
    })
    const candle = chart.addSeries(CandlestickSeries, {
      upColor: palRef.current.up, downColor: palRef.current.down, borderUpColor: palRef.current.up, borderDownColor: palRef.current.down, wickUpColor: palRef.current.up, wickDownColor: palRef.current.down,
    })
    const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'vol' })
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })
    const markersApi = createSeriesMarkers(candle, [])
    apiRef.current = { chart, candle, volume, markersApi }

    const handleClick = (param) => {
      const m = modeRef.current
      if (m === 'cursor' || !param.point || param.time == null) return
      const price = candle.coordinateToPrice(param.point.y)
      if (price == null) return
      if (m === 'hline') {
        const pl = candle.createPriceLine({
          price, color: ACCENT, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: price.toPrecision(4),
        })
        drawRef.current.priceLines.push(pl)
      } else if (m === 'trend') {
        if (!drawRef.current.pending) {
          drawRef.current.pending = { time: param.time, value: price }
        } else {
          const a = drawRef.current.pending
          const b = { time: param.time, value: price }
          const [p1, p2] = a.time <= b.time ? [a, b] : [b, a]
          drawRef.current.pending = null
          if (p1.time === p2.time) return
          const line = chart.addSeries(LineSeries, { color: ACCENT, lineWidth: 2, lastValueVisible: false, priceLineVisible: false })
          line.setData([p1, p2])
          drawRef.current.lines.push(line)
        }
      } else if (m === 'note') {
        const text = window.prompt('Note (short):')
        if (text && text.trim()) {
          const next = [...drawRef.current.markers, {
            time: param.time, position: 'aboveBar', color: ACCENT, shape: 'circle', text: text.trim().slice(0, 40),
          }]
          drawRef.current.markers = next
          markersApi.setMarkers(next)
        }
      }
    }
    chart.subscribeClick(handleClick)

    return () => {
      chart.unsubscribeClick(handleClick)
      chart.remove()
      apiRef.current = {}
    }
  }, [])

  useEffect(() => {
    const { chart, candle, volume } = apiRef.current
    if (!chart || !candles?.length) return

    // setData() replaces the whole dataset, so using it for a live tick costs a
    // copy, a sort and two full maps every time a single price moves — and the
    // series is rebuilt under the user's cursor. The library has update() for
    // exactly this, which is why the cheap cases below are detected first.
    const prev = appliedRef.current
    const last = candles[candles.length - 1]
    const bar = ({ time, open, high, low, close }) => ({ time, open, high, low, close })
    const vol = (c) => ({ time: c.time, value: c.volume || 0, color: c.close >= c.open ? pal.volUp : pal.volDown })
    // lightweight-charts throws "Value is null" out of setData on a bar with a missing price, which
    // takes the whole terminal down with it. Upstream OHLCV does occasionally carry a null, and a
    // chart is not the place to find out: anything unusable is dropped before the library sees it.
    const usable = (c) => c
      && Number.isFinite(c.time)
      && Number.isFinite(c.open) && Number.isFinite(c.high)
      && Number.isFinite(c.low) && Number.isFinite(c.close)

    // Price precision is derived from the latest close, and re-applying it is not
    // free, so it is only pushed when it actually changes.
    const p = precisionFor(Number.isFinite(last.close) ? last.close : candles.find(usable)?.close)
    if (p !== precisionRef.current) {
      precisionRef.current = p
      candle.applyOptions({ priceFormat: { type: 'price', precision: p, minMove: Math.pow(10, -p) } })
    }

    const sameSeries = prev && prev.fitKey === fitKey && prev.palette === pal && prev.first === candles[0].time
    // The newest bucket moved in place: one point, not a dataset.
    if (sameSeries && candles.length === prev.len && last.time === prev.last) {
      if (!usable(last)) return
      candle.update(bar(last))
      volume.update(vol(last))
    // A bucket closed and a new one opened: settle the old one, then append.
    } else if (sameSeries && candles.length === prev.len + 1 && candles[candles.length - 2].time === prev.last) {
      const settled = candles[candles.length - 2]
      if (!usable(settled) || !usable(last)) return
      candle.update(bar(settled))
      volume.update(vol(settled))
      candle.update(bar(last))
      volume.update(vol(last))
    } else {
      // Anything else — a new token, a timeframe change, backfilled history, a
      // theme flip — is a genuine replacement, and update() cannot express it.
      const clean = candles.filter(usable)
      const sorted = isAscending(clean) ? clean : [...clean].sort((a, b) => a.time - b.time)
      candle.setData(sorted.map(bar))
      volume.setData(sorted.map(vol))
    }
    appliedRef.current = { len: candles.length, first: candles[0].time, last: last.time, palette: pal, fitKey }
  }, [candles, pal, fitKey])

  // Switching theme restyles the live chart instead of rebuilding it.
  useEffect(() => {
    const { chart, candle } = apiRef.current
    if (!chart) return
    chart.applyOptions({
      layout: { background: { type: ColorType.Solid, color: pal.bg }, textColor: pal.text },
      grid: { vertLines: { color: pal.grid }, horzLines: { color: pal.grid } },
      rightPriceScale: { borderColor: pal.border },
      timeScale: { borderColor: pal.border },
    })
    candle.applyOptions({ upColor: pal.up, downColor: pal.down, borderUpColor: pal.up, borderDownColor: pal.down, wickUpColor: pal.up, wickDownColor: pal.down })
  }, [pal])

  // Position the view on a token/timeframe switch and when the first data lands —
  // but never again. This used to run on every change of candles.length, so each
  // new bar yanked the view back and undid whatever the user had panned or
  // zoomed to. lightweight-charts already follows new bars on its own while the
  // view is at the right edge, and leaves it alone when it is not.
  useEffect(() => {
    const { chart } = apiRef.current
    if (!chart || !candles?.length || positionedRef.current === fitKey) return
    positionedRef.current = fitKey
    const ts = chart.timeScale()
    if (candles.length < DENSE_THRESHOLD) {
      ts.applyOptions({ barSpacing: FIXED_BAR_SPACING, rightOffset: 4 })
      ts.scrollToRealTime()
    } else {
      ts.fitContent()
    }
  }, [fitKey, candles?.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Token / timeframe switch: clear drawings from the previous chart instead of carrying them over.
  useEffect(() => {
    const { chart, candle, markersApi } = apiRef.current
    if (!chart) return
    drawRef.current.lines.forEach((l) => chart.removeSeries(l))
    drawRef.current.priceLines.forEach((pl) => candle.removePriceLine(pl))
    drawRef.current.lines = []
    drawRef.current.priceLines = []
    drawRef.current.markers = []
    drawRef.current.pending = null
    markersApi?.setMarkers([])
  }, [fitKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const clearDrawings = () => {
    const { chart, candle, markersApi } = apiRef.current
    if (!chart) return
    drawRef.current.lines.forEach((l) => chart.removeSeries(l))
    drawRef.current.priceLines.forEach((pl) => candle.removePriceLine(pl))
    drawRef.current.lines = []
    drawRef.current.priceLines = []
    drawRef.current.markers = []
    drawRef.current.pending = null
    markersApi?.setMarkers([])
  }

  return (
    <div className="relative w-full h-full">
      <div ref={hostRef} className="w-full h-full" />
      <div className="t-panel absolute top-2 left-2 flex items-center gap-1 p-1">
        {TOOLS.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            title={label}
            onClick={() => { drawRef.current.pending = null; setMode(id) }}
            className={`t-btn p-1.5 ${mode === id ? 't-on' : ''}`} aria-pressed={mode === id}
          >
            <Icon className="w-3.5 h-3.5" />
          </button>
        ))}
        <button title="Clear drawings" aria-label="Clear drawings" onClick={clearDrawings} className="t-btn p-1.5">
          <Eraser className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
