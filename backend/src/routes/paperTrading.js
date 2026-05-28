const express = require('express')
const router = express.Router()
const { supabase } = require('../services/supabaseAdmin')
const { getStockQuote } = require('../services/finnhub')
const { requireAuth } = require('../middleware/auth')

const stripe = process.env.STRIPE_SECRET_KEY
  ? require('stripe')(process.env.STRIPE_SECRET_KEY)
  : null

async function ensurePortfolio(userId) {
  const { data: existing } = await supabase
    .from('paper_portfolios')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (existing) return existing

  const { data: created, error } = await supabase
    .from('paper_portfolios')
    .insert({ user_id: userId, cash_balance: 500 })
    .select()
    .single()

  if (error) throw error
  return created
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
    const userId = req.user.id
    const portfolio = await ensurePortfolio(userId)

    const { data: positions, error: posErr } = await supabase
      .from('paper_positions')
      .select('*')
      .eq('user_id', userId)
      .gt('shares', 0)
    if (posErr) throw posErr

    let totalPositionsValue = 0
    const autoSoldItems = []

    const enriched = await Promise.all(
      positions.map(async (pos) => {
        const quote = await fetchQuoteSafe(pos.ticker)
        const currentPrice = quote?.price ?? null

        // Auto-sell on TP/SL hit
        if (currentPrice != null) {
          const hitTP = pos.target_price != null && currentPrice >= pos.target_price
          const hitSL = pos.stop_loss != null && currentPrice <= pos.stop_loss
          if (hitTP || hitSL) {
            const sellTotal = currentPrice * pos.shares

            // Fetch fresh cash balance before updating
            const { data: freshPort } = await supabase
              .from('paper_portfolios')
              .select('cash_balance')
              .eq('user_id', userId)
              .single()

            const newCash = (freshPort?.cash_balance ?? portfolio.cash_balance) + sellTotal

            await supabase
              .from('paper_portfolios')
              .update({ cash_balance: newCash, updated_at: new Date().toISOString() })
              .eq('user_id', userId)

            await supabase
              .from('paper_positions')
              .delete()
              .eq('user_id', userId)
              .eq('ticker', pos.ticker)

            await supabase
              .from('paper_transactions')
              .insert({
                user_id: userId,
                type: 'sell',
                ticker: pos.ticker,
                shares: pos.shares,
                price: currentPrice,
                total: sellTotal,
              })

            autoSoldItems.push({
              ticker: pos.ticker,
              reason: hitTP ? 'target_price' : 'stop_loss',
              price: currentPrice,
            })
            return null
          }
        }

        const currentValue = currentPrice != null ? currentPrice * pos.shares : null
        const costBasis = pos.avg_cost * pos.shares
        const pnl = currentValue != null ? currentValue - costBasis : null
        const pnlPct = pnl != null && costBasis !== 0 ? (pnl / costBasis) * 100 : null

        if (currentValue != null) totalPositionsValue += currentValue

        return {
          ticker: pos.ticker,
          shares: pos.shares,
          avgCost: pos.avg_cost,
          targetPrice: pos.target_price,
          stopLoss: pos.stop_loss,
          currentPrice,
          currentValue,
          pnl,
          pnlPct,
        }
      })
    )

    // Refresh cash after potential auto-sells
    const { data: freshPortfolio } = await supabase
      .from('paper_portfolios')
      .select('cash_balance')
      .eq('user_id', userId)
      .single()

    const cashBalance = freshPortfolio?.cash_balance ?? portfolio.cash_balance

    res.json({
      cashBalance,
      positions: enriched.filter(Boolean),
      totalValue: cashBalance + totalPositionsValue,
      autoSold: autoSoldItems,
    })
  } catch (err) {
    next(err)
  }
})

router.post('/buy', requireAuth, async (req, res, next) => {
  try {
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

    const portfolio = await ensurePortfolio(userId)
    if (portfolio.cash_balance < total) {
      return res.status(400).json({
        error: 'Insufficient cash balance',
        required: total,
        available: portfolio.cash_balance,
      })
    }

    const tp = typeof targetPrice === 'number' && targetPrice > 0 ? targetPrice : null
    const sl = typeof stopLoss === 'number' && stopLoss > 0 ? stopLoss : null

    // Deduct cash
    const { error: cashErr } = await supabase
      .from('paper_portfolios')
      .update({ cash_balance: portfolio.cash_balance - total, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
    if (cashErr) throw cashErr

    // Upsert position
    const { data: existing } = await supabase
      .from('paper_positions')
      .select('shares, avg_cost')
      .eq('user_id', userId)
      .eq('ticker', ticker)
      .maybeSingle()

    if (existing) {
      const newShares = Number(existing.shares) + shares
      const newAvgCost = (Number(existing.avg_cost) * Number(existing.shares) + price * shares) / newShares
      const { error: posErr } = await supabase
        .from('paper_positions')
        .update({
          shares: newShares,
          avg_cost: newAvgCost,
          target_price: tp !== null ? tp : undefined,
          stop_loss: sl !== null ? sl : undefined,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('ticker', ticker)
      if (posErr) throw posErr
    } else {
      const { error: posErr } = await supabase
        .from('paper_positions')
        .insert({
          user_id: userId,
          ticker,
          shares,
          avg_cost: price,
          target_price: tp,
          stop_loss: sl,
        })
      if (posErr) throw posErr
    }

    // Record transaction
    const { error: txErr } = await supabase
      .from('paper_transactions')
      .insert({ user_id: userId, type: 'buy', ticker, shares, price, total })
    if (txErr) throw txErr

    res.json({ success: true, ticker, shares, price, total })
  } catch (err) {
    next(err)
  }
})

router.post('/sell', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user.id
    let { ticker, shares } = req.body

    if (typeof ticker !== 'string' || !ticker.trim()) {
      return res.status(400).json({ error: 'ticker must be a non-empty string' })
    }
    ticker = ticker.trim().toUpperCase()
    if (typeof shares !== 'number' || shares <= 0) {
      return res.status(400).json({ error: 'shares must be a positive number' })
    }

    const { data: position } = await supabase
      .from('paper_positions')
      .select('shares')
      .eq('user_id', userId)
      .eq('ticker', ticker)
      .maybeSingle()

    if (!position || Number(position.shares) < shares) {
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

    // Fetch current cash
    const { data: portfolio } = await supabase
      .from('paper_portfolios')
      .select('cash_balance')
      .eq('user_id', userId)
      .single()

    const newCash = (portfolio?.cash_balance ?? 0) + total

    // Update cash balance
    const { error: cashErr } = await supabase
      .from('paper_portfolios')
      .update({ cash_balance: newCash, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
    if (cashErr) throw cashErr

    // Update or delete position
    const remaining = Number(position.shares) - shares
    if (remaining === 0) {
      const { error: delErr } = await supabase
        .from('paper_positions')
        .delete()
        .eq('user_id', userId)
        .eq('ticker', ticker)
      if (delErr) throw delErr
    } else {
      const { error: posErr } = await supabase
        .from('paper_positions')
        .update({ shares: remaining, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('ticker', ticker)
      if (posErr) throw posErr
    }

    // Record transaction
    const { error: txErr } = await supabase
      .from('paper_transactions')
      .insert({ user_id: userId, type: 'sell', ticker, shares, price, total })
    if (txErr) throw txErr

    res.json({ success: true, ticker, shares, price, total })
  } catch (err) {
    next(err)
  }
})

router.patch('/positions/:ticker', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user.id
    const ticker = req.params.ticker.toUpperCase()
    const { targetPrice, stopLoss } = req.body

    const { data: position } = await supabase
      .from('paper_positions')
      .select('id')
      .eq('user_id', userId)
      .eq('ticker', ticker)
      .maybeSingle()

    if (!position) {
      return res.status(404).json({ error: `No position found for ${ticker}` })
    }

    const tp = typeof targetPrice === 'number' && targetPrice > 0 ? targetPrice : null
    const sl = typeof stopLoss === 'number' && stopLoss > 0 ? stopLoss : null

    const { error } = await supabase
      .from('paper_positions')
      .update({ target_price: tp, stop_loss: sl, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('ticker', ticker)
    if (error) throw error

    res.json({ success: true, ticker, targetPrice: tp, stopLoss: sl })
  } catch (err) {
    next(err)
  }
})

router.get('/leaderboard', requireAuth, async (req, res, next) => {
  try {
    const STARTING_BALANCE = 500

    const { data: portfolios, error: portErr } = await supabase
      .from('paper_portfolios')
      .select('*')
    if (portErr) throw portErr

    const board = await Promise.all(
      portfolios.map(async (p) => {
        const { data: positions } = await supabase
          .from('paper_positions')
          .select('shares, avg_cost')
          .eq('user_id', p.user_id)
          .gt('shares', 0)

        const positionsValue = (positions ?? []).reduce(
          (s, pos) => s + Number(pos.shares) * Number(pos.avg_cost),
          0
        )
        const totalValue = Number(p.cash_balance) + positionsValue

        // Sum deposit transactions
        const { data: depositRows } = await supabase
          .from('paper_transactions')
          .select('total')
          .eq('user_id', p.user_id)
          .eq('type', 'deposit')

        const extraDeposits = (depositRows ?? []).reduce((s, t) => s + Number(t.total), 0)

        const tradingPnl = totalValue - STARTING_BALANCE - extraDeposits
        const returnPct = (tradingPnl / STARTING_BALANCE) * 100

        return {
          userId: p.user_id,
          totalValue,
          tradingPnl,
          returnPct,
          positionCount: (positions ?? []).length,
        }
      })
    )

    board.sort((a, b) => b.returnPct - a.returnPct)

    res.json({ leaderboard: board.slice(0, 50) })
  } catch (err) {
    next(err)
  }
})

router.get('/transactions', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user.id
    let limit = parseInt(req.query.limit, 10)
    if (isNaN(limit) || limit < 1) limit = 30
    if (limit > 100) limit = 100

    const { data: transactions, error } = await supabase
      .from('paper_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) throw error

    const mapped = (transactions ?? []).map((t) => ({
      id: t.id,
      userId: t.user_id,
      type: t.type,
      ticker: t.ticker,
      shares: t.shares,
      price: t.price,
      total: t.total,
      createdAt: t.created_at,
    }))

    res.json({ transactions: mapped })
  } catch (err) {
    next(err)
  }
})

router.post('/purchase-cash', requireAuth, async (req, res, next) => {
  try {
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
      const portfolio = await ensurePortfolio(userId)

      const { error: cashErr } = await supabase
        .from('paper_portfolios')
        .update({
          cash_balance: Number(portfolio.cash_balance) + paperCashCredited,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
      if (cashErr) throw cashErr

      const { error: purchErr } = await supabase
        .from('paper_cash_purchases')
        .insert({ user_id: userId, usd_paid: usdPaid, paper_cash_credited: paperCashCredited, status: 'completed' })
      if (purchErr) throw purchErr

      const { error: txErr } = await supabase
        .from('paper_transactions')
        .insert({ user_id: userId, type: 'deposit', total: paperCashCredited })
      if (txErr) throw txErr

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

    const { error: purchErr } = await supabase
      .from('paper_cash_purchases')
      .insert({
        user_id: userId,
        usd_paid: usdPaid,
        paper_cash_credited: paperCashCredited,
        stripe_session_id: session.id,
        status: 'pending',
      })
    if (purchErr) throw purchErr

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
      const portfolio = await ensurePortfolio(userId)

      await supabase
        .from('paper_portfolios')
        .update({
          cash_balance: Number(portfolio.cash_balance) + paperCashCredited,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)

      await supabase
        .from('paper_cash_purchases')
        .update({ status: 'completed' })
        .eq('stripe_session_id', session.id)

      await supabase
        .from('paper_transactions')
        .insert({ user_id: userId, type: 'deposit', total: paperCashCredited })
    } catch (err) {
      console.error('[paper-trading] webhook failed to credit cash for user', userId, err.message)
      // Return 500 so Stripe retries — cash must not be silently lost
      return res.status(500).json({ error: 'Failed to credit paper cash' })
    }
  }

  res.json({ received: true })
})

router.get('/stocks', (req, res) => {
  // Legacy endpoint — returns empty list; frontend now uses open ticker search
  res.json([])
})

module.exports = { router }
