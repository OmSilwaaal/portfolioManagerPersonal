const express = require('express')
const router = express.Router()
const { getDb } = require('../db/schema')
const { getStockQuote } = require('../services/finnhub')
const { requireAuth } = require('../middleware/auth')

const stripe = process.env.STRIPE_SECRET_KEY
  ? require('stripe')(process.env.STRIPE_SECRET_KEY)
  : null

const TRADEABLE = new Set([
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'JPM', 'V', 'JNJ',
  'WMT', 'PG', 'UNH', 'XOM', 'BAC', 'MA', 'HD', 'CVX', 'MRK', 'LLY',
  'ABBV', 'PFE', 'KO', 'PEP', 'COST', 'TMO', 'AVGO', 'MCD', 'DIS', 'NFLX',
])

const TRADEABLE_META = {
  AAPL:  'Apple Inc.',
  MSFT:  'Microsoft Corp.',
  GOOGL: 'Alphabet Inc.',
  AMZN:  'Amazon.com Inc.',
  NVDA:  'NVIDIA Corp.',
  META:  'Meta Platforms Inc.',
  TSLA:  'Tesla Inc.',
  JPM:   'JPMorgan Chase & Co.',
  V:     'Visa Inc.',
  JNJ:   'Johnson & Johnson',
  WMT:   'Walmart Inc.',
  PG:    'Procter & Gamble Co.',
  UNH:   'UnitedHealth Group Inc.',
  XOM:   'Exxon Mobil Corp.',
  BAC:   'Bank of America Corp.',
  MA:    'Mastercard Inc.',
  HD:    'Home Depot Inc.',
  CVX:   'Chevron Corp.',
  MRK:   'Merck & Co. Inc.',
  LLY:   'Eli Lilly and Co.',
  ABBV:  'AbbVie Inc.',
  PFE:   'Pfizer Inc.',
  KO:    'Coca-Cola Co.',
  PEP:   'PepsiCo Inc.',
  COST:  'Costco Wholesale Corp.',
  TMO:   'Thermo Fisher Scientific Inc.',
  AVGO:  'Broadcom Inc.',
  MCD:   "McDonald's Corp.",
  DIS:   'Walt Disney Co.',
  NFLX:  'Netflix Inc.',
}

function ensurePortfolio(db, userId) {
  db.prepare('INSERT OR IGNORE INTO paper_portfolios (userId) VALUES (?)').run(userId)
  return db.prepare('SELECT * FROM paper_portfolios WHERE userId = ?').get(userId)
}

router.get('/portfolio', requireAuth, async (req, res, next) => {
  try {
    const db = getDb()
    const userId = req.user.id
    const portfolio = ensurePortfolio(db, userId)
    const positions = db.prepare(
      'SELECT * FROM paper_positions WHERE userId = ? AND shares > 0'
    ).all(userId)

    let totalPositionsValue = 0
    const enriched = await Promise.all(
      positions.map(async (pos) => {
        let currentPrice = null
        try {
          const quote = await getStockQuote(pos.ticker)
          currentPrice = quote.price
        } catch (_) {}

        const currentValue = currentPrice != null ? currentPrice * pos.shares : null
        const costBasis = pos.avgCost * pos.shares
        const pnl = currentValue != null ? currentValue - costBasis : null
        const pnlPct = pnl != null && costBasis !== 0 ? (pnl / costBasis) * 100 : null

        if (currentValue != null) totalPositionsValue += currentValue

        return {
          ticker: pos.ticker,
          shares: pos.shares,
          avgCost: pos.avgCost,
          currentPrice,
          currentValue,
          pnl,
          pnlPct,
        }
      })
    )

    res.json({
      cashBalance: portfolio.cashBalance,
      positions: enriched,
      totalValue: portfolio.cashBalance + totalPositionsValue,
    })
  } catch (err) {
    next(err)
  }
})

router.post('/buy', requireAuth, async (req, res, next) => {
  try {
    const db = getDb()
    const userId = req.user.id
    let { ticker, shares } = req.body

    if (typeof ticker !== 'string') {
      return res.status(400).json({ error: 'ticker must be a string' })
    }
    ticker = ticker.toUpperCase()
    if (!TRADEABLE.has(ticker)) {
      return res.status(400).json({ error: `${ticker} is not a tradeable stock` })
    }
    if (typeof shares !== 'number' || shares <= 0) {
      return res.status(400).json({ error: 'shares must be a positive number' })
    }
    if (shares > 10000) {
      return res.status(400).json({ error: 'Cannot buy more than 10,000 shares in a single order' })
    }

    const quote = await getStockQuote(ticker)
    const price = quote.price
    const total = price * shares

    const portfolio = ensurePortfolio(db, userId)
    if (portfolio.cashBalance < total) {
      return res.status(400).json({
        error: 'Insufficient cash balance',
        required: total,
        available: portfolio.cashBalance,
      })
    }

    db.transaction(() => {
      db.prepare(
        'UPDATE paper_portfolios SET cashBalance = cashBalance - ?, updatedAt = datetime(\'now\') WHERE userId = ?'
      ).run(total, userId)

      const existing = db.prepare(
        'SELECT shares, avgCost FROM paper_positions WHERE userId = ? AND ticker = ?'
      ).get(userId, ticker)

      if (existing) {
        const newShares = existing.shares + shares
        const newAvgCost = (existing.avgCost * existing.shares + price * shares) / newShares
        db.prepare(
          'UPDATE paper_positions SET shares = ?, avgCost = ?, updatedAt = datetime(\'now\') WHERE userId = ? AND ticker = ?'
        ).run(newShares, newAvgCost, userId, ticker)
      } else {
        db.prepare(
          'INSERT INTO paper_positions (userId, ticker, shares, avgCost) VALUES (?, ?, ?, ?)'
        ).run(userId, ticker, shares, price)
      }

      db.prepare(
        'INSERT INTO paper_transactions (userId, type, ticker, shares, price, total) VALUES (?, \'buy\', ?, ?, ?, ?)'
      ).run(userId, ticker, shares, price, total)
    })()

    res.json({ success: true, ticker, shares, price, total })
  } catch (err) {
    next(err)
  }
})

router.post('/sell', requireAuth, async (req, res, next) => {
  try {
    const db = getDb()
    const userId = req.user.id
    let { ticker, shares } = req.body

    if (typeof ticker !== 'string') {
      return res.status(400).json({ error: 'ticker must be a string' })
    }
    ticker = ticker.toUpperCase()
    if (!TRADEABLE.has(ticker)) {
      return res.status(400).json({ error: `${ticker} is not a tradeable stock` })
    }
    if (typeof shares !== 'number' || shares <= 0) {
      return res.status(400).json({ error: 'shares must be a positive number' })
    }

    const position = db.prepare(
      'SELECT shares FROM paper_positions WHERE userId = ? AND ticker = ?'
    ).get(userId, ticker)

    if (!position || position.shares < shares) {
      return res.status(400).json({
        error: 'Insufficient shares',
        held: position ? position.shares : 0,
        requested: shares,
      })
    }

    const quote = await getStockQuote(ticker)
    const price = quote.price
    const total = price * shares

    db.transaction(() => {
      db.prepare(
        'UPDATE paper_portfolios SET cashBalance = cashBalance + ?, updatedAt = datetime(\'now\') WHERE userId = ?'
      ).run(total, userId)

      const remaining = position.shares - shares
      if (remaining === 0) {
        db.prepare(
          'DELETE FROM paper_positions WHERE userId = ? AND ticker = ?'
        ).run(userId, ticker)
      } else {
        db.prepare(
          'UPDATE paper_positions SET shares = ?, updatedAt = datetime(\'now\') WHERE userId = ? AND ticker = ?'
        ).run(remaining, userId, ticker)
      }

      db.prepare(
        'INSERT INTO paper_transactions (userId, type, ticker, shares, price, total) VALUES (?, \'sell\', ?, ?, ?, ?)'
      ).run(userId, ticker, shares, price, total)
    })()

    res.json({ success: true, ticker, shares, price, total })
  } catch (err) {
    next(err)
  }
})

router.get('/transactions', requireAuth, (req, res, next) => {
  try {
    const db = getDb()
    const userId = req.user.id
    let limit = parseInt(req.query.limit, 10)
    if (isNaN(limit) || limit < 1) limit = 30
    if (limit > 100) limit = 100

    const transactions = db.prepare(
      'SELECT * FROM paper_transactions WHERE userId = ? ORDER BY createdAt DESC LIMIT ?'
    ).all(userId, limit)

    res.json({ transactions })
  } catch (err) {
    next(err)
  }
})

router.post('/purchase-cash', requireAuth, async (req, res, next) => {
  try {
    const db = getDb()
    const userId = req.user.id
    const { units } = req.body

    if (typeof units !== 'number' || !Number.isInteger(units) || units < 1) {
      return res.status(400).json({ error: 'units must be a positive integer' })
    }
    if (units > 20) {
      return res.status(400).json({ error: 'Maximum 20 units per purchase' })
    }

    const paperCashCredited = units * 500
    const usdPaid = units * 5

    if (!stripe) {
      ensurePortfolio(db, userId)
      db.transaction(() => {
        db.prepare(
          'UPDATE paper_portfolios SET cashBalance = cashBalance + ?, updatedAt = datetime(\'now\') WHERE userId = ?'
        ).run(paperCashCredited, userId)
        db.prepare(
          'INSERT INTO paper_cash_purchases (userId, usdPaid, paperCashCredited, status) VALUES (?, ?, ?, \'completed\')'
        ).run(userId, usdPaid, paperCashCredited)
        db.prepare(
          'INSERT INTO paper_transactions (userId, type, total) VALUES (?, \'deposit\', ?)'
        ).run(userId, paperCashCredited)
      })()
      return res.json({ success: true, devMode: true, credited: paperCashCredited })
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: 500,
            product_data: {
              name: 'MarketIQ Paper Cash',
              description: `$${paperCashCredited} paper trading cash`,
            },
          },
          quantity: units,
        },
      ],
      metadata: { userId, units: String(units) },
      success_url: `${process.env.FRONTEND_URL}/paper-trading?payment=success`,
      cancel_url: `${process.env.FRONTEND_URL}/paper-trading?payment=cancelled`,
    })

    db.prepare(
      'INSERT INTO paper_cash_purchases (userId, usdPaid, paperCashCredited, stripeSessionId, status) VALUES (?, ?, ?, ?, \'pending\')'
    ).run(userId, usdPaid, paperCashCredited, session.id)

    res.json({ url: session.url })
  } catch (err) {
    next(err)
  }
})

router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe) {
    return res.status(400).json({ error: 'Stripe not configured' })
  }

  let event
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers['stripe-signature'],
      process.env.STRIPE_WEBHOOK_SECRET
    )
  } catch (err) {
    return res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object
    const userId = session.metadata.userId
    const units = parseInt(session.metadata.units, 10)
    const paperCashCredited = units * 500

    try {
      const db = getDb()
      db.transaction(() => {
        ensurePortfolio(db, userId)
        db.prepare(
          'UPDATE paper_portfolios SET cashBalance = cashBalance + ?, updatedAt = datetime(\'now\') WHERE userId = ?'
        ).run(paperCashCredited, userId)
        db.prepare(
          'UPDATE paper_cash_purchases SET status = \'completed\' WHERE stripeSessionId = ?'
        ).run(session.id)
        db.prepare(
          'INSERT INTO paper_transactions (userId, type, total) VALUES (?, \'deposit\', ?)'
        ).run(userId, paperCashCredited)
      })()
    } catch (_) {}
  }

  res.json({ received: true })
})

router.get('/stocks', (req, res) => {
  res.json(Object.entries(TRADEABLE_META).map(([ticker, name]) => ({ ticker, name })))
})

module.exports = { router, TRADEABLE, TRADEABLE_META }
