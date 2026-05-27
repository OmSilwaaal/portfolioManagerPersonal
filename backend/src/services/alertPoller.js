const { getAllAlerts, markAlertTriggered } = require('../db/queries')
const { getStockQuote } = require('./finnhub')

async function checkAlerts() {
  let alerts
  try {
    alerts = getAllAlerts().filter((a) => !a.triggered)
  } catch {
    return
  }
  if (!alerts.length) return

  const tickers = [...new Set(alerts.map((a) => a.ticker))]
  const prices = {}

  for (const ticker of tickers) {
    try {
      const quote = await getStockQuote(ticker)
      if (quote?.price != null) prices[ticker] = quote.price
    } catch {
      // skip tickers that fail — don't crash the whole poll cycle
    }
  }

  for (const alert of alerts) {
    const price = prices[alert.ticker]
    if (price == null) continue
    const hit =
      alert.direction === 'above' ? price >= alert.targetPrice : price <= alert.targetPrice
    if (hit) {
      try {
        markAlertTriggered(alert.id)
        console.log(
          `[alerts] triggered: ${alert.ticker} ${alert.direction} $${alert.targetPrice} (now $${price.toFixed(2)})`
        )
      } catch (err) {
        console.error('[alerts] failed to mark triggered:', err.message)
      }
    }
  }
}

function startAlertPoller(intervalMs = 5 * 60 * 1000) {
  if (!process.env.FINNHUB_API_KEY) {
    console.warn('[alerts] FINNHUB_API_KEY not set — price alert polling disabled')
    return
  }
  checkAlerts()
  setInterval(checkAlerts, intervalMs)
  console.log(`[alerts] poller started, checking every ${intervalMs / 1000}s`)
}

module.exports = { startAlertPoller }
