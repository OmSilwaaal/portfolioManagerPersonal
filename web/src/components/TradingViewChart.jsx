import { useEffect, useRef } from 'react'

/* ─── Symbol mapping ─────────────────────────────────────────────────────── */
const CRYPTO_SET = new Set([
  'BTC','ETH','SOL','DOGE','XRP','ADA','AVAX','MATIC','DOT','LINK',
  'BNB','LTC','ATOM','NEAR','FTM','ALGO','SAND','MANA','AXS','SHIB',
  'UNI','AAVE','CRV','LDO','ARB','OP','INJ','SEI','TIA',
])

function toTVSymbol(ticker) {
  const t = ticker.toUpperCase()
  if (CRYPTO_SET.has(t)) return `BINANCE:${t}USDT`
  // Stocks — TradingView auto-resolves exchange from ticker alone
  return t
}

/* ─── Singleton script loader — injects tv.js only once ─────────────────── */
let tvReady = null
function loadTV() {
  if (window.TradingView) return Promise.resolve()
  if (!tvReady) {
    tvReady = new Promise((resolve) => {
      const s = document.createElement('script')
      s.src = 'https://s3.tradingview.com/tv.js'
      s.async = true
      s.onload = resolve
      document.head.appendChild(s)
    })
  }
  return tvReady
}

let uid = 0

/* ─── Component ──────────────────────────────────────────────────────────── */
export default function TradingViewChart({ ticker, height = 440, interval = 'D' }) {
  const idRef = useRef(null)
  if (!idRef.current) idRef.current = `tv_chart_${++uid}`

  useEffect(() => {
    let alive = true

    loadTV().then(() => {
      if (!alive || !window.TradingView) return
      const el = document.getElementById(idRef.current)
      if (!el) return
      el.innerHTML = '' // clear any prior iframe on ticker change

      new window.TradingView.widget({
        autosize:            true,
        height,
        symbol:              toTVSymbol(ticker),
        interval,
        timezone:            'Etc/UTC',
        theme:               'dark',
        style:               '1',       // candlestick
        locale:              'en',
        toolbar_bg:          '#0a0a0a',
        enable_publishing:   false,
        allow_symbol_change: true,
        save_image:          false,
        hide_volume:         false,
        container_id:        idRef.current,
        // Match the app's dark monochrome palette
        overrides: {
          'paneProperties.background':            '#0a0a0a',
          'paneProperties.backgroundType':        'solid',
          'paneProperties.gridLinesMode':         'both',
          'paneProperties.horzGridProperties.color': 'rgba(255,255,255,0.04)',
          'paneProperties.vertGridProperties.color': 'rgba(255,255,255,0.04)',
          'scalesProperties.textColor':           'rgba(255,255,255,0.3)',
          'scalesProperties.lineColor':           'rgba(255,255,255,0.06)',
          'candleStyle.upColor':                  '#e5e5e5',
          'candleStyle.downColor':                '#555555',
          'candleStyle.wickUpColor':              '#e5e5e5',
          'candleStyle.wickDownColor':            '#555555',
          'candleStyle.borderUpColor':            '#e5e5e5',
          'candleStyle.borderDownColor':          '#555555',
          'volumePaneSize':                       'small',
        },
      })
    })

    return () => { alive = false }
  }, [ticker, interval])

  return (
    <div className="rounded-xl overflow-hidden" style={{ height }}>
      <div id={idRef.current} style={{ height: '100%' }} />
    </div>
  )
}
