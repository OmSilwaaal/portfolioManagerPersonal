// What is switched on, and the server's own price list.
//
// Gated the way ENABLE_HELIUS_LAUNCHES gates the launch watcher: each rail is dead unless its
// flag is true AND the keys it needs are present. With nothing configured the module loads,
// the routes mount, every paying endpoint answers 503, and the UI is told `enabled: false`
// so it never renders a pay button. Nothing can go live by accident — turning a rail on takes
// a deliberate flag plus a deliberate key.
//
// The price list lives here, server-side, and is the ONLY source of an amount to charge. A
// client that posts {amount: 1} gets charged the list price, because no endpoint reads an
// amount out of a request body.

const { parseDecimalToMinor } = require('./money');

const SOL_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/; // base58, no 0/O/I/l

const truthy = (v) => v === 'true';

/** Card rail: needs the flag, a secret key, a publishable key and a webhook secret. */
function stripeConfig(env = process.env) {
  const enabled = truthy(env.ENABLE_BILLING_STRIPE);
  const missing = [];
  if (!env.STRIPE_SECRET_KEY) missing.push('STRIPE_SECRET_KEY');
  if (!env.BILLING_STRIPE_PUBLISHABLE_KEY) missing.push('BILLING_STRIPE_PUBLISHABLE_KEY');
  if (!env.BILLING_STRIPE_WEBHOOK_SECRET) missing.push('BILLING_STRIPE_WEBHOOK_SECRET');
  if (!enabled) missing.unshift('ENABLE_BILLING_STRIPE != true');
  return {
    enabled: enabled && missing.length === 0,
    missing,
    // Only ever the publishable key leaves the process. The secret key is read here and
    // handed to the Stripe SDK; it is never returned, logged or put in an error message.
    publishableKey: enabled && missing.length === 0 ? env.BILLING_STRIPE_PUBLISHABLE_KEY : null,
    proPriceId: env.BILLING_STRIPE_PRO_PRICE_ID || null,
  };
}

/** SOL rail: needs the flag and a treasury address that is at least shaped like one. */
function solanaConfig(env = process.env) {
  const enabled = truthy(env.ENABLE_BILLING_SOLANA);
  const treasury = String(env.BILLING_TREASURY_ADDRESS || '').trim();
  const missing = [];
  if (!treasury) missing.push('BILLING_TREASURY_ADDRESS');
  else if (!SOL_ADDRESS_RE.test(treasury)) missing.push('BILLING_TREASURY_ADDRESS (not a base58 Solana address)');
  if (!enabled) missing.unshift('ENABLE_BILLING_SOLANA != true');
  const on = enabled && missing.length === 0;
  return {
    enabled: on,
    missing,
    // The treasury address is public by nature — it has to be, people send to it.
    treasury: on ? treasury : null,
    rpcUrl: env.BILLING_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    // Deliberately a fixed, operator-set lamport price rather than a USD price converted at
    // request time. Charging real money through a price oracle means a stale or manipulated
    // quote sets the price; a number in the environment cannot be manipulated by a caller.
    proPriceLamports: Number.isSafeInteger(Number(env.BILLING_PRO_PRICE_LAMPORTS)) && Number(env.BILLING_PRO_PRICE_LAMPORTS) > 0
      ? Number(env.BILLING_PRO_PRICE_LAMPORTS) : null,
    // How long a user has to claim a transfer before we stop looking at it.
    maxClaimAgeMs: 7 * 24 * 60 * 60 * 1000,
  };
}

/** Server-side deposit menu for the card rail. Gross is what we charge; the 5% comes out of it. */
const CARD_DEPOSIT_TIERS = Object.freeze([
  { id: 'usd_1000', currency: 'usd', grossMinor: 1000 },
  { id: 'usd_2500', currency: 'usd', grossMinor: 2500 },
  { id: 'usd_5000', currency: 'usd', grossMinor: 5000 },
  { id: 'usd_10000', currency: 'usd', grossMinor: 10000 },
  { id: 'usd_25000', currency: 'usd', grossMinor: 25000 },
  { id: 'usd_50000', currency: 'usd', grossMinor: 50000 },
]);

/** A tier by id, or null. The id is the only deposit input a client gets to choose. */
const cardTier = (id) => CARD_DEPOSIT_TIERS.find((t) => t.id === id) || null;

/** How long a referral grants free Pro. One calendar month from the day of referral. */
const REFERRAL_PRO_MONTHS = 1;

function config(env = process.env) {
  const stripe = stripeConfig(env);
  const solana = solanaConfig(env);
  return { stripe, solana, anyEnabled: stripe.enabled || solana.enabled };
}

module.exports = {
  SOL_ADDRESS_RE, stripeConfig, solanaConfig, config,
  CARD_DEPOSIT_TIERS, cardTier, REFERRAL_PRO_MONTHS, parseDecimalToMinor,
};
