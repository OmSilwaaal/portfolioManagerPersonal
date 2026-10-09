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

// POST /api/stripe/redeem-code — RETIRED. Kept only to answer the existing UI politely.
//
// This used to compare a submitted string against a single shared PROMO_CODE in the
// environment and, on a match, set `app_metadata.isPro = true` — permanently, for anyone who
// ever learned that one string. That is the "admin password for free Pro" path, and it cannot
// be made safe by making the password longer:
//
//   * one constant grants a paid tier to everybody who has it, forever
//   * it is unattributable — after a leak you cannot tell who used it or what they got
//   * it cannot be revoked for one person without revoking it for everyone
//   * it leaves no audit trail, so with real money in the system there is no way to
//     reconstruct who was comped and by whom
//
// The replacement is in services/entitlements.js: a per-user `admin` role row, granted by an
// authenticated admin account, writing an `admin_audit` row and a bounded `pro_grants` row
// for every comp. See POST /api/billing/admin/pro.
//
// It now grants nothing, whatever PROMO_CODE is set to.
router.post('/redeem-code', requireAuth, (req, res) => {
  console.warn('[stripe] redeem-code was called but is retired; it grants nothing. Use /api/billing/admin/pro.')
  res.status(410).json({
    error: true,
    code: 'retired',
    message: 'Promo codes are no longer accepted. Ask an admin to apply Pro to your account.',
  })
})

// GET /api/stripe/status — sanity check (auth required: don't advertise config to the public)
router.get('/status', requireAuth, (req, res) => {
  res.json({
    stripeConfigured: !!stripe,
    priceIdConfigured: !!process.env.STRIPE_PRO_PRICE_ID,
    webhookSecretConfigured: !!process.env.STRIPE_PRO_WEBHOOK_SECRET,
  })
})

// POST /api/stripe/pro-webhook — Stripe sends events here
router.post('/pro-webhook', async (req, res) => {
  if (!stripe) {
    return res.sendStatus(200)
  }

  if (!process.env.STRIPE_PRO_WEBHOOK_SECRET) {
    console.error('[stripe] STRIPE_PRO_WEBHOOK_SECRET not set — cannot verify signature')
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

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object
    const userId = session.client_reference_id || session.metadata?.userId
    if (userId) {
      const { error } = await supabase.auth.admin.updateUserById(userId, {
        app_metadata: { isPro: true, stripeCustomerId: session.customer },
      })
      if (error) {
        console.error('[stripe] failed to set isPro on user', userId, error.message)
      }
    } else {
      console.error('[stripe] checkout.session.completed: no userId in session', session.id)
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object
    try {
      const { data: listData, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 })
      if (listError) throw listError
      const user = listData?.users?.find((u) => u.app_metadata?.stripeCustomerId === sub.customer)
      if (user) {
        const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
          app_metadata: { isPro: false, stripeCustomerId: sub.customer },
        })
        if (updateError) throw updateError
      } else {
        console.error('[stripe] subscription.deleted: no user found for customer', sub.customer)
      }
    } catch (err) {
      console.error('[stripe] subscription.deleted handler failed:', err.message)
      // Still return 200 so Stripe doesn't retry — log is sufficient for manual recovery
    }
  }

  res.sendStatus(200)
})

module.exports = { router }
