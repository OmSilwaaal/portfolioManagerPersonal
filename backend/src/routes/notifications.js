const express = require('express')
const router = express.Router()
const axios = require('axios')
const NodeCache = require('node-cache')
const { requireAuth } = require('../middleware/auth')

const alertCache = new NodeCache({ stdTTL: 300 })

// GET /api/notifications/price-alerts?tickers=AAPL,TSLA
router.get('/price-alerts', requireAuth, async (req, res) => {
  const { tickers } = req.query
  if (!tickers) return res.json({ alerts: [] })

  const tickerList = tickers.split(',').map(t => t.trim().toUpperCase()).filter(Boolean).slice(0, 20)
  const token = process.env.FINNHUB_API_KEY
  if (!token) return res.json({ alerts: [] })

  const alerts = []

  await Promise.allSettled(tickerList.map(async (ticker) => {
    const cacheKey = `alert_${ticker}`
    const cached = alertCache.get(cacheKey)
    if (cached !== undefined) {
      if (cached) alerts.push(cached)
      return
    }

    try {
      // Get basic quote
      const [quoteResp, metricResp] = await Promise.allSettled([
        axios.get('https://finnhub.io/api/v1/quote', { params: { symbol: ticker, token }, timeout: 6000 }),
        axios.get('https://finnhub.io/api/v1/stock/metric', { params: { symbol: ticker, metric: 'all', token }, timeout: 6000 }),
      ])

      const quote = quoteResp.status === 'fulfilled' ? quoteResp.value.data : null
      const metrics = metricResp.status === 'fulfilled' ? metricResp.value.data?.metric : null

      if (!quote || !quote.c) { alertCache.set(cacheKey, null); return }

      const price = quote.c
      const high52 = metrics?.['52WeekHigh'] || null
      const low52 = metrics?.['52WeekLow'] || null

      let alert = null
      if (high52 && price >= high52 * 0.995) {
        alert = { ticker, type: 'ATH', price, level: high52, message: `${ticker} is at a 52-week high of $${price.toFixed(2)}` }
      } else if (low52 && price <= low52 * 1.005) {
        alert = { ticker, type: 'ATL', price, level: low52, message: `${ticker} is at a 52-week low of $${price.toFixed(2)}` }
      }

      alertCache.set(cacheKey, alert)
      if (alert) alerts.push(alert)
    } catch (err) {
      alertCache.set(cacheKey, null)
    }
  }))

  res.json({ alerts })
})

module.exports = router
