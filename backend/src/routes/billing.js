// Billing: wallet address, deposits, Pro.
//
// Mounting (the lead wires this — see the report):
//   app.use('/api/billing/webhook', express.raw({ type: 'application/json' }))   // BEFORE express.json()
//   app.use('/api/billing', require('./routes/billing').router)
//
// Mounted WITHOUT a route-level requireAuth, like /api/stripe, because the webhook is
// authenticated by signature rather than by session. Every other endpoint in this file
// carries requireAuth itself; there is no handler below that reads req.user without it.
//
// Three invariants hold across this whole file:
//
//   * No endpoint reads an amount, a fee, a total or a credited balance out of a request
//     body. A client picks a tier *id* and submits a transaction *signature*; the server
//     looks the amount up or reads it off the chain. Grep for `req.body` here: it only ever
//     yields identifiers.
//   * No response and no log line contains a secret. The config endpoint returns the Stripe
//     PUBLISHABLE key and the treasury address, both of which are public by design, and the
//     `missing` list names env vars without their values.
//   * Every rail is dead unless explicitly switched on. With nothing configured the router
//     still mounts and every paying endpoint answers 503, so the server boots and behaves
//     exactly as it does today.

const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();

const { requireAuth } = require('../middleware/auth');
const { isUuid } = require('../middleware/validate');
const money = require('../services/money');
const ledger = require('../services/ledger');
const entitlements = require('../services/entitlements');
const deposits = require('../services/solanaDeposits');
const cfg = require('../services/billingConfig');

/** Lazily constructed so a server with no key never loads the SDK. */
let stripeClient;
function stripe(env = process.env) {
  if (!cfg.stripeConfig(env).enabled) return null;
  if (!stripeClient) stripeClient = require('stripe')(env.STRIPE_SECRET_KEY);
  return stripeClient;
}
router.__resetStripe = () => { stripeClient = undefined; }; // test seam

class HttpError extends Error {
  constructor(message, status = 400, code = 'invalid') { super(message); this.status = status; this.code = code; }
}

// Same shape as routes/memecoins.js: known errors map to a status, everything else is a 500
// with a generic message so an internal detail can never leak into a response body.
const h = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[billing]', req.method, req.path, err.message);
    res.status(status).json({
      error: true,
      code: err.code || (status >= 500 ? 'server_error' : 'invalid'),
      message: status >= 500 ? 'Something went wrong. Please try again.' : err.message,
    });
  }
};

// ── rate limits ───────────────────────────────────────────────────────────────
// Kept in this file rather than index.js so mounting the router is a one-liner and no
// balance-changing endpoint can be mounted without its limiter attached.
const limiter = (windowMs, max, message) => rateLimit({
  windowMs, max, standardHeaders: true, legacyHeaders: false,
  message: { error: true, code: 'rate_limited', message },
  // Per account, falling back to IP for anything unauthenticated. Limiting a shared-NAT
  // office by IP would punish innocent users; limiting by user id is the real subject.
  keyGenerator: (req) => (req.user?.id ? `u:${req.user.id}` : `ip:${req.ip}`),
});

// Creating a payment is cheap for us and expensive for an attacker to abuse, but a tight cap
// still blocks card-testing loops.
const payLimiter = limiter(60 * 60 * 1000, 20, 'Too many payment attempts. Please try again later.');
// Claiming a deposit costs an RPC call and is the endpoint someone would grind to find a
// claimable signature, so it is the tightest.
const claimLimiter = limiter(60 * 60 * 1000, 30, 'Too many deposit checks. Please try again later.');
const writeLimiter = limiter(60 * 60 * 1000, 60, 'Too many requests. Please try again later.');
const adminLimiter = limiter(60 * 60 * 1000, 60, 'Too many requests. Please try again later.');

// ── config ────────────────────────────────────────────────────────────────────
// Everything the UI needs to decide whether to render a payment control at all, and nothing
// else. `enabled: false` is the default and means the UI shows no way to pay.
router.get('/config', requireAuth, h(async (_req, res) => {
  const c = cfg.config();
  res.json({
    feeBps: money.FEE_BPS,
    card: {
      enabled: c.stripe.enabled,
      publishableKey: c.stripe.publishableKey, // publishable only — never the secret key
      proAvailable: c.stripe.enabled && Boolean(c.stripe.proPriceId),
      // Gross, fee and net for each tier, all computed here so the UI never does money maths.
      tiers: c.stripe.enabled
        ? cfg.CARD_DEPOSIT_TIERS.map((t) => ({ id: t.id, currency: t.currency, ...money.splitFee(t.grossMinor) }))
        : [],
    },
    sol: {
      enabled: c.solana.enabled,
      treasury: c.solana.treasury, // public by necessity: people send funds to it
      proPriceLamports: c.solana.enabled ? c.solana.proPriceLamports : null,
    },
  });
}));

// ── wallet address ────────────────────────────────────────────────────────────
// Registers the PUBLIC address of the caller's Privy embedded wallet. There is no field here,
// and no column behind it, for a private key or a seed phrase: Privy MPC-shards the key
// material and it never leaves the user's session. If a client ever posts one, it is rejected
// by the length check in registerWallet and is never written or logged.
router.post('/wallet', requireAuth, writeLimiter, h(async (req, res) => {
  const address = deposits.registerWallet(req.user.id, req.body?.address);
  res.json({ address, addresses: deposits.walletsFor(req.user.id) });
}));

router.get('/wallet', requireAuth, h(async (req, res) => {
  res.json({ addresses: deposits.walletsFor(req.user.id), treasury: cfg.solanaConfig().treasury });
}));

// ── balance ───────────────────────────────────────────────────────────────────
// Minor units all the way out. The UI formats for display and never adds them up.
router.get('/balance', requireAuth, h(async (req, res) => {
  res.json({
    balances: ledger.balances(req.user.id),
    history: ledger.history(req.user.id, 25),
    units: { usd: 'cents', sol: 'lamports' },
  });
}));

// ── card deposit ──────────────────────────────────────────────────────────────
router.post('/deposit/card', requireAuth, payLimiter, h(async (req, res) => {
  const c = cfg.stripeConfig();
  if (!c.enabled) throw new HttpError('Card payments are not available.', 503, 'disabled');

  // The ONLY thing the client chooses is which tier. The amount comes from our table.
  const tier = cfg.cardTier(typeof req.body?.tierId === 'string' ? req.body.tierId : '');
  if (!tier) throw new HttpError('Pick a deposit amount.', 400, 'bad_tier');
  const split = money.splitFee(tier.grossMinor);

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const session = await stripe().checkout.sessions.create({
    mode: 'payment',
    client_reference_id: req.user.id,
    customer_email: req.user.email,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: tier.currency,
        unit_amount: split.grossMinor, // integer minor units, straight from our table
        product_data: {
          name: 'Travauxus deposit',
          description: `${money.formatMinor(split.netMinor, tier.currency)} credited after the ${money.FEE_BPS / 100}% fee`,
        },
      },
    }],
    // Read back in the webhook. Treated as untrusted on the way back in anyway: the webhook
    // re-derives the fee from the amount Stripe reports, not from anything written here.
    success_url: `${frontendUrl}/settings?deposited=1`,
    cancel_url: `${frontendUrl}/settings`,
    metadata: { userId: req.user.id, purpose: 'deposit', tierId: tier.id },
  }, {
    // A double-clicked button returns the same Checkout session instead of opening two.
    idempotencyKey: `dep:${req.user.id}:${tier.id}:${Math.floor(Date.now() / 60000)}`,
  });

  res.json({ url: session.url, ...split, currency: tier.currency });
}));

// ── SOL deposit ───────────────────────────────────────────────────────────────
// The client submits a signature it believes paid us. Everything that matters is read back
// off the chain by services/solanaDeposits; see that file for the six checks.
router.post('/deposit/solana', requireAuth, claimLimiter, h(async (req, res) => {
  const sig = typeof req.body?.signature === 'string' ? req.body.signature : '';
  const out = await deposits.claimDeposit(req.user.id, sig);
  res.json({
    credited: out.credited,
    duplicate: out.duplicate,       // a resubmitted signature is a success that credits nothing
    signature: out.signature,
    ...(out.entry ? { grossMinor: out.entry.grossMinor, feeMinor: out.entry.feeMinor, netMinor: out.entry.netMinor } : {}),
    currency: 'sol',
  });
}));

// ── Pro ───────────────────────────────────────────────────────────────────────
router.get('/pro', requireAuth, h(async (req, res) => {
  const status = entitlements.proStatus(req.user.id, req.user.app_metadata);
  res.json({
    ...status,
    canCancelStripe: Boolean(entitlements.stripeSubscriptionIdFor(req.user.id)) && cfg.stripeConfig().enabled,
    isAdmin: entitlements.isAdmin(req.user.id),
  });
}));

router.post('/pro/checkout', requireAuth, payLimiter, h(async (req, res) => {
  const c = cfg.stripeConfig();
  if (!c.enabled || !c.proPriceId) throw new HttpError('Card payments are not available.', 503, 'disabled');
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const session = await stripe().checkout.sessions.create({
    mode: 'subscription',
    // The price is a Stripe Price object id from our environment. No amount crosses the wire.
    line_items: [{ price: c.proPriceId, quantity: 1 }],
    client_reference_id: req.user.id,
    customer_email: req.user.email,
    success_url: `${frontendUrl}/settings?pro=1`,
    cancel_url: `${frontendUrl}/pricing`,
    metadata: { userId: req.user.id, purpose: 'pro' },
  }, { idempotencyKey: `pro:${req.user.id}:${Math.floor(Date.now() / 60000)}` });
  res.json({ url: session.url });
}));

// Pro paid in SOL: a one-off transfer, verified exactly like a deposit, that buys a month.
router.post('/pro/solana', requireAuth, claimLimiter, h(async (req, res) => {
  const c = cfg.solanaConfig();
  if (!c.enabled) throw new HttpError('SOL payments are not available.', 503, 'disabled');
  if (!c.proPriceLamports) throw new HttpError('SOL pricing is not configured.', 503, 'disabled');

  const v = await deposits.verifyTransfer(req.user.id, req.body?.signature);
  // Underpaying does not buy a month. Checked against the server's own price, in integers.
  if (v.lamports < c.proPriceLamports) {
    throw new HttpError(`That transfer was ${money.formatMinor(v.lamports, 'sol')} SOL; Pro costs ${money.formatMinor(c.proPriceLamports, 'sol')} SOL.`, 400, 'underpaid');
  }

  const now = Date.now();
  const startsAt = new Date(now).toISOString();
  const endsAt = require('../services/referrals').addMonthsIso(now, 1);
  // The signature is the idempotency key for BOTH the grant and the ledger entry, so a
  // resubmitted signature neither extends Pro nor books the money twice.
  const grant = entitlements.grantPro({
    userId: req.user.id, source: 'solana', startsAt, endsAt,
    externalId: v.signature, reason: 'Pro paid in SOL',
  });
  const booked = ledger.credit({
    userId: req.user.id, currency: 'sol', rail: 'solana', kind: 'pro',
    grossMinor: v.lamports, externalId: v.signature, ref: { payer: v.payer, slot: v.slot, purpose: 'pro' },
  });
  res.json({ granted: grant.granted, duplicate: grant.duplicate || booked.duplicate, until: endsAt, signature: v.signature });
}));

// Cancelling. Does the right thing with Stripe rather than only flipping a local row: the
// subscription is set to stop at the end of the period the user has already paid for, so they
// keep what they bought and are not billed again. The local grant is revoked when Stripe
// confirms the deletion via webhook, not optimistically here — revoking first would take
// access away from someone who has paid through to next month.
router.post('/pro/cancel', requireAuth, writeLimiter, h(async (req, res) => {
  const subId = entitlements.stripeSubscriptionIdFor(req.user.id);
  if (!subId) {
    // Nothing to cancel at Stripe. A SOL-paid month is already paid and simply runs out; an
    // admin grant is revoked by an admin. Say so plainly instead of pretending to cancel.
    const status = entitlements.proStatus(req.user.id, req.user.app_metadata);
    return res.json({ cancelled: false, reason: 'no_subscription', ...status });
  }
  const c = cfg.stripeConfig();
  if (!c.enabled) throw new HttpError('Subscriptions cannot be changed right now.', 503, 'disabled');

  const sub = await stripe().subscriptions.update(subId, { cancel_at_period_end: true });
  entitlements.audit(req.user.id, 'pro.cancel', req.user.id, { subscriptionId: subId });
  res.json({
    cancelled: true,
    endsAt: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
    message: 'Pro stays active until the end of the period you have paid for.',
  });
}));

// ── admin ─────────────────────────────────────────────────────────────────────
// No shared password. Authority is an `admin` row keyed to a Supabase account, so every
// action below is attributable to one authenticated person and is written to admin_audit
// before it takes effect. See services/entitlements.js for the full reasoning.
function requireAdmin(req, res, next) {
  if (!req.user?.id || !entitlements.isAdmin(req.user.id)) {
    // Answered here rather than handed to next(): the refusal must be the same JSON shape
    // wherever this router is mounted, instead of depending on an error handler above it.
    // Identical to any other refusal — an admin endpoint must not confirm its own existence.
    return res.status(403).json({ error: true, code: 'forbidden', message: 'Forbidden.' });
  }
  next();
}

const PRO_GRANT_MAX_DAYS = 366; // an unbounded grant is a mistake waiting to happen

router.post('/admin/pro', requireAuth, adminLimiter, requireAdmin, h(async (req, res) => {
  const { userId, days, revoke, reason } = req.body || {};
  if (!isUuid(userId)) throw new HttpError('userId must be a user id.', 400, 'bad_user');
  const why = typeof reason === 'string' && reason.trim() ? reason.trim().slice(0, 200) : null;
  if (!why) throw new HttpError('A reason is required.', 400, 'reason_required'); // an unexplained comp is indistinguishable from abuse

  if (revoke === true) {
    entitlements.audit(req.user.id, 'pro.admin_revoke', userId, { reason: why });
    const n = entitlements.revokePro(userId, { source: 'admin' });
    return res.json({ revoked: n });
  }

  const d = Number(days);
  if (!Number.isSafeInteger(d) || d < 1 || d > PRO_GRANT_MAX_DAYS) {
    throw new HttpError(`days must be between 1 and ${PRO_GRANT_MAX_DAYS}.`, 400, 'bad_days');
  }
  const now = Date.now();
  // Audited BEFORE the grant: if the audit write fails, nothing is granted.
  entitlements.audit(req.user.id, 'pro.admin_grant', userId, { days: d, reason: why });
  const grant = entitlements.grantPro({
    userId, source: 'admin',
    startsAt: new Date(now).toISOString(),
    endsAt: new Date(now + d * 86400000).toISOString(),
    grantedBy: req.user.id, reason: why,
  });
  res.json({ granted: grant.granted, id: grant.id, days: d });
}));

router.post('/admin/role', requireAuth, adminLimiter, requireAdmin, h(async (req, res) => {
  const { userId, admin } = req.body || {};
  if (!isUuid(userId)) throw new HttpError('userId must be a user id.', 400, 'bad_user');
  if (typeof admin !== 'boolean') throw new HttpError('admin must be true or false.', 400, 'bad_flag');
  if (userId === req.user.id && admin === false) throw new HttpError('You cannot remove your own admin role.', 400, 'self_demote');
  entitlements.setAdmin(req.user.id, userId, admin);
  res.json({ userId, admin });
}));

router.get('/admin/audit', requireAuth, adminLimiter, requireAdmin, h(async (_req, res) => {
  const { getDb } = require('../db/schema');
  res.json({
    entries: getDb().prepare('SELECT id, actor_id, action, target_id, detail, created_at FROM admin_audit ORDER BY id DESC LIMIT 100').all(),
  });
}));

// ── webhook ───────────────────────────────────────────────────────────────────
// The body reaching this handler is hostile until `constructEvent` says otherwise. Nothing is
// parsed, read or logged from it before the signature check — not the event type, not an id.
router.post('/webhook', h(async (req, res) => {
  const c = cfg.stripeConfig();
  // Nothing configured: acknowledge and do nothing. Returning 400 to an unconfigured server
  // would just fill someone's Stripe dashboard with failures.
  if (!c.enabled) return res.json({ received: true, ignored: 'not_configured' });

  // Signature verification requires the EXACT bytes Stripe signed. express.json() at the app
  // level would have already turned them into an object, and re-serialising an object does
  // not reproduce the original bytes — this is the single most common way a Stripe
  // integration ends up unverified. Fail closed and say what is wrong rather than reaching
  // for JSON.stringify.
  if (!Buffer.isBuffer(req.body)) {
    console.error('[billing] webhook received a parsed body — mount express.raw({type:"application/json"}) on /api/billing/webhook BEFORE express.json()');
    return res.status(500).json({ error: true, message: 'Webhook misconfigured.' });
  }

  let event;
  try {
    event = stripe().webhooks.constructEvent(
      req.body,
      req.headers['stripe-signature'],
      process.env.BILLING_STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    // err.message here is Stripe's own text about the signature, never our secret.
    console.error('[billing] webhook signature rejected:', err.message);
    return res.status(400).json({ error: true, message: 'Signature verification failed.' });
  }

  // Replay guard for the delivery itself. Claimed before any side effect so a retry of a
  // delivery that half-completed does not re-run the non-money parts.
  if (!ledger.claimWebhookEvent('stripe', event.id, event.type)) {
    return res.json({ received: true, duplicate: true });
  }

  try {
    await handleStripeEvent(event);
  } catch (err) {
    // Let Stripe retry: money must never be silently dropped. Release the claim first or the
    // retry would be swallowed as a duplicate.
    ledger.releaseWebhookEvent('stripe', event.id);
    console.error('[billing] webhook handler failed for', event.type, err.message);
    return res.status(500).json({ error: true, message: 'Could not process that event.' });
  }

  res.json({ received: true });
}));

async function handleStripeEvent(event) {
  if (event.type === 'checkout.session.completed') {
    const s = event.data.object;
    if (s.payment_status !== 'paid' && s.mode !== 'subscription') return;
    const userId = s.client_reference_id || s.metadata?.userId;
    if (!isUuid(userId)) { console.error('[billing] session without a usable userId:', s.id); return; }

    if (s.mode === 'payment') {
      // The amount comes from Stripe's record of what was actually captured, in the minor
      // units Stripe already uses. Never from metadata, and never from the client.
      const gross = Number(s.amount_total);
      const currency = String(s.currency || '').toLowerCase();
      if (!money.isMinorAmount(gross) || gross <= 0 || currency !== 'usd') {
        console.error('[billing] unusable amount on session', s.id); return;
      }
      // Keyed on the PAYMENT, not the event. Stripe can report one payment through more than
      // one event type (checkout.session.completed and payment_intent.succeeded carry
      // different event ids), so keying the ledger on event.id would let a single payment be
      // credited twice. The payment_intent id is one-per-payment; the event id is handled
      // separately by claimWebhookEvent above.
      const paymentId = typeof s.payment_intent === 'string' ? s.payment_intent : (s.payment_intent?.id || `session:${s.id}`);
      const out = ledger.credit({
        userId, currency: 'usd', rail: 'stripe', kind: 'deposit',
        grossMinor: gross, externalId: paymentId,
        ref: { sessionId: s.id, eventId: event.id, tierId: s.metadata?.tierId || null },
      });
      if (out.duplicate) console.log('[billing] deposit already credited for payment', paymentId);
      return;
    }

    if (s.mode === 'subscription' && s.subscription) {
      const subId = typeof s.subscription === 'string' ? s.subscription : s.subscription.id;
      // ends_at NULL = open-ended: the subscription itself is the authority on expiry, and
      // customer.subscription.deleted is what closes it.
      entitlements.grantPro({
        userId, source: 'stripe', startsAt: new Date().toISOString(), endsAt: null,
        externalId: subId, reason: 'Stripe subscription',
      });
    }
    return;
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object;
    const userId = entitlements.userIdForStripeSubscription(sub.id);
    if (!userId) { console.error('[billing] subscription.deleted for an unknown subscription', sub.id); return; }
    // Revokes only the stripe-sourced grant. A referral month or an admin comp is a separate
    // entitlement and must survive a cancelled card — this is exactly what a single shared
    // isPro boolean could not express.
    entitlements.revokePro(userId, { source: 'stripe' });
    return;
  }

  if (event.type === 'charge.refunded' || event.type === 'charge.dispute.created') {
    // Deliberately not automated. Clawing a credited balance back is a decision with real
    // consequences (the user may already have spent it) and the right handling depends on
    // policy we do not have. Logged loudly for a human; nothing silently changes.
    console.error('[billing] MANUAL REVIEW NEEDED —', event.type, 'charge', event.data.object?.id);
  }
}

module.exports = { router, handleStripeEvent, HttpError };
