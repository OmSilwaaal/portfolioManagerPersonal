import { useEffect, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import {
  createChart, CandlestickSeries, HistogramSeries, LineSeries, ColorType, CrosshairMode, LineStyle, createSeriesMarkers,
} from 'lightweight-charts'
import { MousePointer2, TrendingUp, Minus, MessageSquarePlus, Eraser } from 'lucide-react'

// Chart colours live in the canvas, so they can't use CSS variables: one palette per theme.
const PALETTES = {
  dark: { bg: '#0b0b0b', text: '#b3ad9d', grid: 'rgba(255,255,255,0.05)', border: '#2a2a28', up: '#7ea968', down: '#d35c4a', volUp: 'rgba(126,169,104,0.45)', volDown: 'rgba(211,92,74,0.45)' },
  light: { bg: '#efeee9', text: '#55554f', grid: 'rgba(17,17,16,0.08)', border: '#c9c8c1', up: '#2f7a3a', down: '#b3392a', volUp: 'rgba(47,122,58,0.4)', volDown: 'rgba(179,57,42,0.4)' },
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
    const sorted = [...candles].sort((a, b) => a.time - b.time)
    const p = precisionFor(sorted[sorted.length - 1].close)
    candle.applyOptions({ priceFormat: { type: 'price', precision: p, minMove: Math.pow(10, -p) } })
    candle.setData(sorted.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })))
    volume.setData(sorted.map((c) => ({
      time: c.time, value: c.volume || 0, color: c.close >= c.open ? pal.volUp : pal.volDown,
    })))
  }, [candles, pal])

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

  useEffect(() => {
    const { chart } = apiRef.current
    if (!chart || !candles?.length) return
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
