import { useState } from 'react'
import { useGetPriceAlertsQuery } from '../api/notificationsApi'

const DISMISS_KEY = 'miq_dismissed_alerts'

function getDismissed() {
  try { return new Set(JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]')) } catch { return new Set() }
}
function addDismissed(key) {
  const s = getDismissed(); s.add(key); localStorage.setItem(DISMISS_KEY, JSON.stringify([...s]))
}

export default function PriceAlertBanner({ tickers }) {
  const { data } = useGetPriceAlertsQuery(tickers, { skip: !tickers, pollingInterval: 300000 })
  const [dismissed, setDismissed] = useState(getDismissed)
  const today = new Date().toDateString()

  const alerts = (data?.alerts || []).filter(a => {
    const key = `${a.ticker}_${a.type}_${today}`
    return !dismissed.has(key)
  })

  const dismiss = (alert) => {
    const key = `${alert.ticker}_${alert.type}_${today}`
    addDismissed(key)
    setDismissed(getDismissed())
  }

  if (!alerts.length) return null

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-xs">
      {alerts.map(alert => (
        <div
          key={`${alert.ticker}_${alert.type}`}
          className="flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl"
          style={{
            background: alert.type === 'ATH' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
            border: alert.type === 'ATH' ? '1px solid rgba(16,185,129,0.4)' : '1px solid rgba(239,68,68,0.4)',
            backdropFilter: 'blur(16px)',
          }}
        >
          <span className="text-lg">{alert.type === 'ATH' ? '🚀' : '📉'}</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-white">{alert.ticker} — {alert.type === 'ATH' ? '52-Week High' : '52-Week Low'}</p>
            <p className="text-[11px] text-white/60">${alert.price?.toFixed(2)}</p>
          </div>
          <button onClick={() => dismiss(alert)} className="text-white/30 hover:text-white/70 transition-colors text-sm">✕</button>
        </div>
      ))}
    </div>
  )
}
