const express = require('express')
const router = express.Router()
const { supabase } = require('../services/supabaseAdmin')
const { getStockQuote } = require('../services/finnhub')
const { requireAuth } = require('../middleware/auth')
const { isTicker } = require('../middleware/validate')

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

// Compare-and-swap on cash_balance: succeeds only if the balance is still what we read.
// Two concurrent orders can no longer both spend the same cash. Returns true if applied.
async function casCash(userId, expected, next) {
  const { data, error } = await supabase
    .from('paper_portfolios')
    .update({ cash_balance: next, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('cash_balance', expected)
    .select('user_id')
  if (error) throw error
  return (data?.length ?? 0) > 0
}

async function fetchQuoteSafe(ticker) {
  try {
    // Memecoin positions (ticker = Solana mint, case-sensitive) are priced from the memecoin data service; Finnhub
    // would upper-case the mint and return nothing, leaving a null-price row.
    const memecoinData = require('../services/memecoinData');
    if (memecoinData.isValidAddress(ticker)) {
      const t = await memecoinData.getToken(ticker);
      return t && t.price ? { ticker, price: t.price } : null;
    }
    const q = await getStockQuote(ticker)
    if (!q || q.price == null || q.price === 0) return null
    return q
  } catch (_) {
    return null
  }
}

// Realized result of closing `shares` at `price` against a position's average cost
function realizedResult(avgCost, shares, price) {
  const invested = Number(avgCost) * Number(shares)
  const proceeds = Number(price) * Number(shares)
  const pnl = proceeds - invested
  return { invested, proceeds, realizedPnl: pnl, realizedPnlPct: invested > 0 ? (pnl / invested) * 100 : 0 }
}

// The leaderboard is cached briefly (it prices every user's holdings); any trade drops the cache
let boardCache = null
const BOARD_TTL_MS = 60 * 1000

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

            // Claim the position first (concurrent GETs would otherwise each credit the same sale)
            const { data: claimed } = await supabase
              .from('paper_positions')
              .delete()
              .eq('user_id', userId)
              .eq('ticker', pos.ticker)
              .eq('shares', pos.shares)
              .select('ticker')
            if (!claimed?.length) return null // another request already sold it

            for (let attempt = 0; attempt < 3; attempt++) {
              const { data: freshPort } = await supabase
                .from('paper_portfolios')
                .select('cash_balance')
                .eq('user_id', userId)
                .single()
              const base = Number(freshPort?.cash_balance ?? 0)
              if (await casCash(userId, base, base + sellTotal)) break
              if (attempt === 2) console.error('[paper-trading] auto-sell credit failed', userId, pos.ticker, sellTotal)
            }

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

            boardCache = null
            autoSoldItems.push({
              ticker: pos.ticker,
              reason: hitTP ? 'target_price' : 'stop_loss',
              price: currentPrice,
              shares: pos.shares,
              avgCost: pos.avg_cost,
              ...realizedResult(pos.avg_cost, pos.shares, currentPrice),
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
    if (!isTicker(ticker)) return res.status(400).json({ error: 'Invalid ticker symbol' })
    if (typeof shares !== 'number' || !Number.isFinite(shares) || shares <= 0) {
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

    // Deduct cash atomically (fails if a concurrent order changed the balance)
    if (!(await casCash(userId, portfolio.cash_balance, Number(portfolio.cash_balance) - total))) {
      return res.status(409).json({ error: 'Your balance changed while placing this order. Please try again.' })
    }

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

    boardCache = null
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
    if (!isTicker(ticker)) return res.status(400).json({ error: 'Invalid ticker symbol' })
    if (typeof shares !== 'number' || !Number.isFinite(shares) || shares <= 0) {
      return res.status(400).json({ error: 'shares must be a positive number' })
    }

    const { data: position } = await supabase
      .from('paper_positions')
      .select('shares, avg_cost')
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

    const currentCash = Number(portfolio?.cash_balance ?? 0)

    // Claim the shares first, conditioned on the share count we read — a concurrent sell of the
    // same shares matches zero rows and is rejected instead of double-crediting cash.
    const remaining = Number(position.shares) - shares
    const posQuery = remaining <= 0
      ? supabase.from('paper_positions').delete()
      : supabase.from('paper_positions').update({ shares: remaining, updated_at: new Date().toISOString() })
    const { data: claimed, error: posErr } = await posQuery
      .eq('user_id', userId)
      .eq('ticker', ticker)
      .eq('shares', position.shares)
      .select('ticker')
    if (posErr) throw posErr
    if (!claimed?.length) {
      return res.status(409).json({ error: 'Your position changed while placing this order. Please try again.' })
    }

    // Credit cash; on a (rare) cash race retry once against the fresh balance so proceeds aren't lost
    if (!(await casCash(userId, currentCash, currentCash + total))) {
      const { data: fresh } = await supabase.from('paper_portfolios').select('cash_balance').eq('user_id', userId).single()
      const base = Number(fresh?.cash_balance ?? 0)
      if (!(await casCash(userId, base, base + total))) {
        console.error('[paper-trading] failed to credit sell proceeds', userId, ticker, total)
        return res.status(409).json({ error: 'Could not settle this order. Please check your portfolio and try again.' })
      }
    }

    // Record transaction
    const { error: txErr } = await supabase
      .from('paper_transactions')
      .insert({ user_id: userId, type: 'sell', ticker, shares, price, total })
    if (txErr) throw txErr

    boardCache = null
    res.json({
      success: true, ticker, shares, price, total,
      avgCost: Number(position.avg_cost),
      ...realizedResult(position.avg_cost, shares, price),
    })
  } catch (err) {
    next(err)
  }
})

router.patch('/positions/:ticker', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user.id
    const ticker = req.params.ticker.toUpperCase()
    if (!isTicker(ticker)) return res.status(400).json({ error: 'Invalid ticker symbol' })
    const { targetPrice, stopLoss } = req.body ?? {}

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

// Never publish an email: stored display names may predate that rule, so anything with an "@" is dropped
const cleanName = (n) => (typeof n === 'string' && n.trim() && !n.includes('@') ? n.trim().slice(0, 80) : null)

async function buildBoard() {
  const STARTING_BALANCE = 500

  const [{ data: portfolios, error: portErr }, { data: allPositions }, { data: deposits }, { data: profiles }] =
    await Promise.all([
      supabase.from('paper_portfolios').select('user_id, cash_balance'),
      supabase.from('paper_positions').select('user_id, ticker, shares, avg_cost').gt('shares', 0),
      supabase.from('paper_transactions').select('user_id, total').eq('type', 'deposit'),
      supabase.from('profiles').select('user_id, username, display_name, avatar_url'),
    ])
  if (portErr) throw portErr

  // One quote per distinct ticker across all users; falls back to cost basis when a quote is unavailable
  const tickers = [...new Set((allPositions ?? []).map((p) => p.ticker))].slice(0, 40)
  const prices = {}
  await Promise.all(tickers.map(async (t) => {
    const q = await fetchQuoteSafe(t)
    if (q) prices[t] = q.price
  }))

  const byUser = (rows) => {
    const m = new Map()
    for (const r of rows ?? []) {
      if (!m.has(r.user_id)) m.set(r.user_id, [])
      m.get(r.user_id).push(r)
    }
    return m
  }
  const positionsBy = byUser(allPositions)
  const depositsBy = byUser(deposits)
  const profileBy = new Map((profiles ?? []).map((p) => [p.user_id, p]))

  const board = portfolios.map((p) => {
    const positions = positionsBy.get(p.user_id) ?? []
    const positionsValue = positions.reduce(
      (sum, pos) => sum + Number(pos.shares) * (prices[pos.ticker] ?? Number(pos.avg_cost)),
      0
    )
    const totalValue = Number(p.cash_balance) + positionsValue
    const extraDeposits = (depositsBy.get(p.user_id) ?? []).reduce((sum, t) => sum + Number(t.total), 0)
    const tradingPnl = totalValue - STARTING_BALANCE - extraDeposits
    const profile = profileBy.get(p.user_id)
    const avatar = profile?.avatar_url
    return {
      userId: p.user_id,
      username: profile?.username ?? null,
      displayName: cleanName(profile?.display_name),
      // Uploaded photos are inline data URLs (tens of KB each) — only plain links are worth sending 50 times over
      avatarUrl: typeof avatar === 'string' && /^https?:\/\//i.test(avatar) ? avatar : null,
      totalValue,
      tradingPnl,
      returnPct: (tradingPnl / STARTING_BALANCE) * 100,
      positionCount: positions.length,
    }
  })

  board.sort((a, b) => b.returnPct - a.returnPct)
  board.forEach((e, i) => { e.rank = i + 1 })
  return board
}

router.get('/leaderboard', requireAuth, async (req, res, next) => {
  try {
    if (!boardCache || Date.now() - boardCache.at > BOARD_TTL_MS) {
      boardCache = { at: Date.now(), board: await buildBoard() }
    }
    const { board } = boardCache
    res.json({
      leaderboard: board.slice(0, 50),
      totalTraders: board.length,
      me: board.find((e) => e.userId === req.user.id) ?? null,
    })
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
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'

    if (!stripe) {
      // Without Stripe this would hand out free paper cash — only ever allowed in local development
      if (process.env.NODE_ENV === 'production') {
        return res.status(503).json({ error: 'Payments are not configured.' })
      }
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
      success_url: `${frontendUrl}/paper-trading?payment=success`,
      cancel_url: `${frontendUrl}/paper-trading?payment=cancelled`,
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
    return res.status(400).json({ error: 'Webhook signature verification failed' })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object
    const userId = session.metadata?.userId
    const units = parseInt(session.metadata?.units, 10)

    if (session.payment_status !== 'paid') return res.json({ received: true })
    if (!userId || !Number.isInteger(units) || units < 1 || units > 20) {
      console.error('[paper-trading] webhook: bad metadata on session', session.id)
      return res.json({ received: true })
    }
    const paperCashCredited = units * 500

    try {
      // Idempotency: flip pending -> completed exactly once. Stripe retries / duplicate deliveries
      // find nothing pending and are acknowledged without crediting again.
      const { data: claimed, error: claimErr } = await supabase
        .from('paper_cash_purchases')
        .update({ status: 'completed' })
        .eq('stripe_session_id', session.id)
        .eq('status', 'pending')
        .select('id')
      if (claimErr) throw claimErr
      if (!claimed?.length) return res.json({ received: true })

      try {
        await ensurePortfolio(userId)
        for (let attempt = 0; ; attempt++) {
          const { data: fresh } = await supabase.from('paper_portfolios').select('cash_balance').eq('user_id', userId).single()
          const base = Number(fresh?.cash_balance ?? 0)
          if (await casCash(userId, base, base + paperCashCredited)) break
          if (attempt >= 4) throw new Error('cash balance contention')
        }
        await supabase.from('paper_transactions').insert({ user_id: userId, type: 'deposit', total: paperCashCredited })
      } catch (creditErr) {
        // Roll the claim back so Stripe's retry can credit it
        await supabase.from('paper_cash_purchases').update({ status: 'pending' }).eq('stripe_session_id', session.id)
        throw creditErr
      }
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
