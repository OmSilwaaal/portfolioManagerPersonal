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

// POST /api/stripe/pro-webhook — Stripe sends events here
router.post('/pro-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe) return res.sendStatus(200)

  let event
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers['stripe-signature'],
      process.env.STRIPE_PRO_WEBHOOK_SECRET,
    )
  } catch (err) {
    console.error('stripe webhook sig check failed', err.message)
    return res.status(400).send(`Webhook error: ${err.message}`)
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object
    const userId = session.client_reference_id || session.metadata?.userId
    if (userId) {
      const { error } = await supabase.auth.admin.updateUserById(userId, {
        user_metadata: { isPro: true },
      })
      if (error) console.error('stripe webhook: failed to set isPro', error)
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object
    // Look up user by customer ID
    const { data: sessions } = await supabase.auth.admin.listUsers()
    const user = sessions?.users?.find((u) => u.user_metadata?.stripeCustomerId === sub.customer)
    if (user) {
      await supabase.auth.admin.updateUserById(user.id, { user_metadata: { isPro: false } })
    }
  }

  res.sendStatus(200)
})

module.exports = { router }
