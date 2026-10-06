import { useEffect, useRef } from 'react'
import { createChart, CandlestickSeries, HistogramSeries, ColorType, CrosshairMode } from 'lightweight-charts'

const UP = '#7ea968'
const DOWN = '#d35c4a'

function precisionFor(price) {
  if (!price || price >= 1) return 4
  return Math.min(12, Math.max(4, Math.ceil(-Math.log10(price)) + 3))
}

/**
 * Candlestick + volume chart (lightweight-charts v5).
 * candles: [{ time (unix seconds), open, high, low, close, volume }]
 * fitKey: change to re-fit the visible range (token / timeframe switch).
 */
export default function MemeChart({ candles, fitKey }) {
  const hostRef = useRef(null)
  const apiRef = useRef({})

  useEffect(() => {
    const chart = createChart(hostRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: '#0b0b0b' },
        textColor: '#a39d8d',
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 11,
      },
      grid: { vertLines: { color: 'rgba(255,255,255,0.03)' }, horzLines: { color: 'rgba(255,255,255,0.03)' } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#1f1f1f' },
      timeScale: { borderColor: '#1f1f1f', timeVisible: true, secondsVisible: false },
    })
    const candle = chart.addSeries(CandlestickSeries, {
      upColor: UP, downColor: DOWN, borderUpColor: UP, borderDownColor: DOWN, wickUpColor: UP, wickDownColor: DOWN,
    })
    const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'vol' })
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })
    apiRef.current = { chart, candle, volume }
    return () => { chart.remove(); apiRef.current = {} }
  }, [])

  useEffect(() => {
    const { chart, candle, volume } = apiRef.current
    if (!chart || !candles?.length) return
    const sorted = [...candles].sort((a, b) => a.time - b.time)
    const p = precisionFor(sorted[sorted.length - 1].close)
    candle.applyOptions({ priceFormat: { type: 'price', precision: p, minMove: Math.pow(10, -p) } })
    candle.setData(sorted.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })))
    volume.setData(sorted.map((c) => ({
      time: c.time, value: c.volume || 0, color: c.close >= c.open ? 'rgba(126,169,104,0.45)' : 'rgba(211,92,74,0.45)',
    })))
  }, [candles])

  useEffect(() => {
    apiRef.current.chart?.timeScale().fitContent()
  }, [fitKey, !!candles?.length]) // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={hostRef} className="w-full h-full" />
}
