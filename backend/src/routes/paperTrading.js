const express = require('express')
const router = express.Router()
const { getDb } = require('../db/schema')
const { getStockQuote } = require('../services/finnhub')
const { requireAuth } = require('../middleware/auth')

const stripe = process.env.STRIPE_SECRET_KEY
  ? require('stripe')(process.env.STRIPE_SECRET_KEY)
  : null

function ensurePortfolio(db, userId) {
  db.prepare('INSERT OR IGNORE INTO paper_portfolios (userId, cashBalance) VALUES (?, 500)').run(userId)
  return db.prepare('SELECT * FROM paper_portfolios WHERE userId = ?').get(userId)
}

async function fetchQuoteSafe(ticker) {
  try {
    const q = await getStockQuote(ticker)
    if (!q || q.price == null || q.price === 0) return null
    return q
  } catch (_) {
    return null
  }
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
    const autoSoldItems = []

    const enriched = await Promise.all(
      positions.map(async (pos) => {
        const quote = await fetchQuoteSafe(pos.ticker)
        const currentPrice = quote?.price ?? null

        // Auto-sell on TP/SL hit
        if (currentPrice != null) {
          const hitTP = pos.targetPrice != null && currentPrice >= pos.targetPrice
          const hitSL = pos.stopLoss != null && currentPrice <= pos.stopLoss
          if (hitTP || hitSL) {
            const sellTotal = currentPrice * pos.shares
            db.transaction(() => {
              db.prepare(
                "UPDATE paper_portfolios SET cashBalance = cashBalance + ?, updatedAt = datetime('now') WHERE userId = ?"
              ).run(sellTotal, userId)
              db.prepare('DELETE FROM paper_positions WHERE userId = ? AND ticker = ?').run(userId, pos.ticker)
              db.prepare(
                "INSERT INTO paper_transactions (userId, type, ticker, shares, price, total) VALUES (?, 'sell', ?, ?, ?, ?)"
              ).run(userId, pos.ticker, pos.shares, currentPrice, sellTotal)
            })()
            autoSoldItems.push({ ticker: pos.ticker, reason: hitTP ? 'target_price' : 'stop_loss', price: currentPrice })
            return null
          }
        }

        const currentValue = currentPrice != null ? currentPrice * pos.shares : null
        const costBasis = pos.avgCost * pos.shares
        const pnl = currentValue != null ? currentValue - costBasis : null
        const pnlPct = pnl != null && costBasis !== 0 ? (pnl / costBasis) * 100 : null

        if (currentValue != null) totalPositionsValue += currentValue

        return {
          ticker: pos.ticker,
          shares: pos.shares,
          avgCost: pos.avgCost,
          targetPrice: pos.targetPrice,
          stopLoss: pos.stopLoss,
          currentPrice,
          currentValue,
          pnl,
          pnlPct,
        }
      })
    )

    // Refresh cash after potential auto-sells
    const freshPortfolio = db.prepare('SELECT * FROM paper_portfolios WHERE userId = ?').get(userId)

    res.json({
      cashBalance: freshPortfolio.cashBalance,
      positions: enriched.filter(Boolean),
      totalValue: freshPortfolio.cashBalance + totalPositionsValue,
      autoSold: autoSoldItems,
    })
  } catch (err) {
    next(err)
  }
})

router.post('/buy', requireAuth, async (req, res, next) => {
  try {
    const db = getDb()
    const userId = req.user.id
    let { ticker, shares, targetPrice, stopLoss } = req.body

    if (typeof ticker !== 'string' || !ticker.trim()) {
      return res.status(400).json({ error: 'ticker must be a non-empty string' })
    }
    ticker = ticker.trim().toUpperCase()
    if (typeof shares !== 'number' || shares <= 0) {
      return res.status(400).json({ error: 'shares must be a positive number' })
    }
    if (shares > 10000) {
      return res.status(400).json({ error: 'Cannot buy more than 10,000 shares in a single order' })
    }

    const quote = await fetchQuoteSafe(ticker)
    if (!quote) {
      return res.status(400).json({ error: `Could not find a valid quote for "${ticker}". Check the ticker symbol.` })
    }
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

    const tp = typeof targetPrice === 'number' && targetPrice > 0 ? targetPrice : null
    const sl = typeof stopLoss === 'number' && stopLoss > 0 ? stopLoss : null

    db.transaction(() => {
      db.prepare(
        "UPDATE paper_portfolios SET cashBalance = cashBalance - ?, updatedAt = datetime('now') WHERE userId = ?"
      ).run(total, userId)

      const existing = db.prepare(
        'SELECT shares, avgCost FROM paper_positions WHERE userId = ? AND ticker = ?'
      ).get(userId, ticker)

      if (existing) {
        const newShares = existing.shares + shares
        const newAvgCost = (existing.avgCost * existing.shares + price * shares) / newShares
        db.prepare(
          "UPDATE paper_positions SET shares = ?, avgCost = ?, targetPrice = COALESCE(?, targetPrice), stopLoss = COALESCE(?, stopLoss), updatedAt = datetime('now') WHERE userId = ? AND ticker = ?"
        ).run(newShares, newAvgCost, tp, sl, userId, ticker)
      } else {
        db.prepare(
          'INSERT INTO paper_positions (userId, ticker, shares, avgCost, targetPrice, stopLoss) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(userId, ticker, shares, price, tp, sl)
      }

      db.prepare(
        "INSERT INTO paper_transactions (userId, type, ticker, shares, price, total) VALUES (?, 'buy', ?, ?, ?, ?)"
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

    if (typeof ticker !== 'string' || !ticker.trim()) {
      return res.status(400).json({ error: 'ticker must be a non-empty string' })
    }
    ticker = ticker.trim().toUpperCase()
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

    const quote = await fetchQuoteSafe(ticker)
    if (!quote) {
      return res.status(400).json({ error: `Could not get a current quote for "${ticker}"` })
    }
    const price = quote.price
    const total = price * shares

    db.transaction(() => {
      db.prepare(
        "UPDATE paper_portfolios SET cashBalance = cashBalance + ?, updatedAt = datetime('now') WHERE userId = ?"
      ).run(total, userId)

      const remaining = position.shares - shares
      if (remaining === 0) {
        db.prepare('DELETE FROM paper_positions WHERE userId = ? AND ticker = ?').run(userId, ticker)
      } else {
        db.prepare(
          "UPDATE paper_positions SET shares = ?, updatedAt = datetime('now') WHERE userId = ? AND ticker = ?"
        ).run(remaining, userId, ticker)
      }

      db.prepare(
        "INSERT INTO paper_transactions (userId, type, ticker, shares, price, total) VALUES (?, 'sell', ?, ?, ?, ?)"
      ).run(userId, ticker, shares, price, total)
    })()

    res.json({ success: true, ticker, shares, price, total })
  } catch (err) {
    next(err)
  }
})

router.patch('/positions/:ticker', requireAuth, (req, res, next) => {
  try {
    const db = getDb()
    const userId = req.user.id
    const ticker = req.params.ticker.toUpperCase()
    const { targetPrice, stopLoss } = req.body

    const position = db.prepare('SELECT id FROM paper_positions WHERE userId = ? AND ticker = ?').get(userId, ticker)
    if (!position) {
      return res.status(404).json({ error: `No position found for ${ticker}` })
    }

    const tp = typeof targetPrice === 'number' && targetPrice > 0 ? targetPrice : null
    const sl = typeof stopLoss === 'number' && stopLoss > 0 ? stopLoss : null

    db.prepare(
      "UPDATE paper_positions SET targetPrice = ?, stopLoss = ?, updatedAt = datetime('now') WHERE userId = ? AND ticker = ?"
    ).run(tp, sl, userId, ticker)

    res.json({ success: true, ticker, targetPrice: tp, stopLoss: sl })
  } catch (err) {
    next(err)
  }
})

router.get('/leaderboard', requireAuth, (req, res, next) => {
  try {
    const db = getDb()
    const STARTING_BALANCE = 500

    const portfolios = db.prepare('SELECT * FROM paper_portfolios').all()

    const board = portfolios.map((p) => {
      const positions = db.prepare(
        'SELECT shares, avgCost FROM paper_positions WHERE userId = ? AND shares > 0'
      ).all(p.userId)
      const positionsValue = positions.reduce((s, pos) => s + pos.shares * pos.avgCost, 0)
      const totalValue = p.cashBalance + positionsValue

      // Extra cash purchased (deposits) — excluded from performance calc
      const extraDeposits = db.prepare(
        "SELECT COALESCE(SUM(total), 0) AS t FROM paper_transactions WHERE userId = ? AND type = 'deposit'"
      ).get(p.userId).t

      // Trading P&L = current value minus what they started with, ignoring top-ups
      const tradingPnl = totalValue - STARTING_BALANCE - extraDeposits
      // Return % based purely on the original $500, not purchased cash
      const returnPct = (tradingPnl / STARTING_BALANCE) * 100

      return {
        userId: p.userId,
        totalValue,
        tradingPnl,
        returnPct,
        positionCount: positions.length,
      }
    })

    // Rank by pure trading return %, not portfolio size
    board.sort((a, b) => b.returnPct - a.returnPct)

    res.json({ leaderboard: board.slice(0, 50) })
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
          "UPDATE paper_portfolios SET cashBalance = cashBalance + ?, updatedAt = datetime('now') WHERE userId = ?"
        ).run(paperCashCredited, userId)
        db.prepare(
          "INSERT INTO paper_cash_purchases (userId, usdPaid, paperCashCredited, status) VALUES (?, ?, ?, 'completed')"
        ).run(userId, usdPaid, paperCashCredited)
        db.prepare(
          "INSERT INTO paper_transactions (userId, type, total) VALUES (?, 'deposit', ?)"
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
      "INSERT INTO paper_cash_purchases (userId, usdPaid, paperCashCredited, stripeSessionId, status) VALUES (?, ?, ?, ?, 'pending')"
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
          "UPDATE paper_portfolios SET cashBalance = cashBalance + ?, updatedAt = datetime('now') WHERE userId = ?"
        ).run(paperCashCredited, userId)
        db.prepare(
          "UPDATE paper_cash_purchases SET status = 'completed' WHERE stripeSessionId = ?"
        ).run(session.id)
        db.prepare(
          "INSERT INTO paper_transactions (userId, type, total) VALUES (?, 'deposit', ?)"
        ).run(userId, paperCashCredited)
      })()
    } catch (_) {}
  }

  res.json({ received: true })
})

router.get('/stocks', (req, res) => {
  // Legacy endpoint — returns empty list; frontend now uses open ticker search
  res.json([])
})

module.exports = { router }
