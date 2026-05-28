const express = require('express')
const router = express.Router()
const { requireAuth } = require('../middleware/auth')
const { supabase } = require('../services/supabaseAdmin')

const stripe = process.env.STRIPE_SECRET_KEY
  ? require('stripe')(process.env.STRIPE_SECRET_KEY)
  : null

// POST /api/stripe/pro-checkout — create a Stripe checkout session for Pro
router.post('/pro-checkout', requireAuth, async (req, res) => {
  if (!stripe || !process.env.STRIPE_PRO_PRICE_ID) {
    return res.status(503).json({ error: true, message: 'Payments not configured yet.' })
  }

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: process.env.STRIPE_PRO_PRICE_ID, quantity: 1 }],
      client_reference_id: req.user.id,
      customer_email: req.user.email,
      success_url: `${frontendUrl}/settings?upgraded=1`,
      cancel_url: `${frontendUrl}/pricing`,
      metadata: { userId: req.user.id },
    })

    res.json({ url: session.url })
  } catch (err) {
    console.error('stripe pro-checkout', err)
    res.status(500).json({ error: true, message: 'Failed to create checkout session.' })
  }
})

// POST /api/stripe/redeem-code — validate a promo code server-side and grant Pro
router.post('/redeem-code', requireAuth, async (req, res) => {
  const { code } = req.body
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: true, message: 'No code provided.' })
  }

  const validCode = process.env.PROMO_CODE
  if (!validCode) {
    return res.status(503).json({ error: true, message: 'Promo codes not configured.' })
  }

  if (code.trim().toUpperCase() !== validCode.trim().toUpperCase()) {
    return res.status(400).json({ error: true, message: 'Invalid code. Please check and try again.' })
  }

  const { error } = await supabase.auth.admin.updateUserById(req.user.id, {
    app_metadata: { isPro: true },
  })
  if (error) {
    console.error('[stripe] redeem-code failed to set isPro', req.user.id, error)
    return res.status(500).json({ error: true, message: 'Something went wrong. Please try again.' })
  }

  res.json({ success: true })
})

// GET /api/stripe/status — sanity check (no auth needed)
router.get('/status', (req, res) => {
  res.json({
    stripeConfigured: !!stripe,
    priceIdConfigured: !!process.env.STRIPE_PRO_PRICE_ID,
    webhookSecretConfigured: !!process.env.STRIPE_PRO_WEBHOOK_SECRET,
  })
})

// POST /api/stripe/pro-webhook — Stripe sends events here
router.post('/pro-webhook', async (req, res) => {
  console.log('[stripe] webhook received, event type will follow after sig check')

  if (!stripe) {
    console.warn('[stripe] webhook hit but Stripe not initialised — check STRIPE_SECRET_KEY')
    return res.sendStatus(200)
  }

  if (!process.env.STRIPE_PRO_WEBHOOK_SECRET) {
    console.warn('[stripe] STRIPE_PRO_WEBHOOK_SECRET not set — cannot verify signature')
    return res.status(400).send('Webhook secret not configured')
  }

  let event
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers['stripe-signature'],
      process.env.STRIPE_PRO_WEBHOOK_SECRET,
    )
  } catch (err) {
    console.error('[stripe] signature check failed:', err.message)
    return res.status(400).send(`Webhook error: ${err.message}`)
  }

  console.log('[stripe] event verified:', event.type)

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object
    const userId = session.client_reference_id || session.metadata?.userId
    console.log('[stripe] checkout completed, userId:', userId)
    if (userId) {
      const { error } = await supabase.auth.admin.updateUserById(userId, {
        app_metadata: { isPro: true, stripeCustomerId: session.customer },
      })
      if (error) {
        console.error('[stripe] failed to set isPro on user', userId, error)
      } else {
        console.log('[stripe] user', userId, 'marked as Pro ✓')
      }
    } else {
      console.warn('[stripe] checkout.session.completed received but no userId found in session')
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object
    console.log('[stripe] subscription cancelled, customer:', sub.customer)
    const { data: listData } = await supabase.auth.admin.listUsers({ perPage: 1000 })
    const user = listData?.users?.find((u) => u.app_metadata?.stripeCustomerId === sub.customer)
    if (user) {
      await supabase.auth.admin.updateUserById(user.id, {
        app_metadata: { isPro: false, stripeCustomerId: sub.customer },
      })
      console.log('[stripe] user', user.id, 'downgraded from Pro')
    } else {
      console.warn('[stripe] could not find user for cancelled customer:', sub.customer)
    }
  }

  res.sendStatus(200)
})

module.exports = { router }
