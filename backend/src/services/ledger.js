// The ledger. Every credit the user receives passes through here and nowhere else.
//
// Two rules this module exists to enforce:
//
//  1. The SERVER decides the amounts. Nothing in this file accepts a fee, a net or a total
//     from a caller: it takes a gross in minor units that was read off a verified Stripe
//     event or a confirmed on-chain transaction, and computes the split itself. The client
//     proposes; the server decides and records.
//
//  2. Crediting twice is impossible, not merely unlikely. The uniqueness of
//     (rail, external_id) lives in a database index, so two concurrent webhook deliveries
//     racing on the same event resolve to one INSERT and one constraint violation whichever
//     order they interleave in. `credit()` reports the duplicate as a normal, successful,
//     non-crediting outcome because that is exactly what a webhook retry should see.
//
// Balances are DERIVED (SUM of net_minor), never stored. A cached balance is a second source
// of truth that can drift from the entries, and a drifted balance is unfindable after the
// fact. Summing is cheap at this row count; if it ever stops being cheap, the fix is a
// materialised view that is rebuilt from these rows, not a counter that is incremented.

const { getDb } = require('../db/schema');
const { splitFee, isMinorAmount, isCurrency, FEE_BPS } = require('./money');

const RAILS = new Set(['stripe', 'solana', 'manual']);
const KINDS = new Set(['deposit', 'pro', 'refund', 'adjustment']);

/** SQLite reports both a failed UNIQUE index and a failed PRIMARY KEY as a constraint error. */
const isUniqueViolation = (err) => /UNIQUE constraint failed|constraint failed.*unique/i.test(String(err && err.message));

/**
 * Record a credit exactly once.
 *
 * @param {object} e
 * @param {string} e.userId
 * @param {'usd'|'sol'} e.currency
 * @param {'stripe'|'solana'|'manual'} e.rail
 * @param {'deposit'|'pro'|'refund'|'adjustment'} e.kind
 * @param {number} e.grossMinor  integer minor units, taken from verified evidence
 * @param {string} e.externalId  Stripe event id, or Solana transaction signature
 * @param {object} [e.ref]       evidence to keep for audit; stored as JSON, never read back as a number
 * @param {number} [e.feeBps]    defaults to the server fee; 0 for refunds/adjustments
 * @returns {{credited: boolean, duplicate: boolean, entry: object|null}}
 */
function credit(e) {
  const { userId, currency, rail, kind, grossMinor, externalId, ref = null } = e || {};
  const feeBps = e && e.feeBps !== undefined ? e.feeBps : FEE_BPS;

  if (typeof userId !== 'string' || !userId) throw new TypeError('userId required');
  if (!isCurrency(currency)) throw new TypeError(`unknown currency: ${currency}`);
  if (!RAILS.has(rail)) throw new TypeError(`unknown rail: ${rail}`);
  if (!KINDS.has(kind)) throw new TypeError(`unknown kind: ${kind}`);
  if (!isMinorAmount(grossMinor)) throw new TypeError('grossMinor must be a non-negative safe integer');
  // An empty external id would make every such row collide, which looks like idempotency
  // working but is actually "only the first credit ever succeeds". Refuse it loudly.
  if (typeof externalId !== 'string' || !externalId.trim()) throw new TypeError('externalId required');

  const split = splitFee(grossMinor, feeBps);

  try {
    const row = getDb().prepare(`
      INSERT INTO billing_ledger (user_id, currency, rail, kind, gross_minor, fee_minor, net_minor, fee_bps, external_id, ref)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id, created_at
    `).get(userId, currency, rail, kind, split.grossMinor, split.feeMinor, split.netMinor, split.feeBps, externalId.trim(), ref ? JSON.stringify(ref) : null);
    return { credited: true, duplicate: false, entry: { id: row.id, createdAt: row.created_at, userId, currency, rail, kind, ...split } };
  } catch (err) {
    if (isUniqueViolation(err)) {
      // Already credited. This is the expected path for a Stripe retry or a resubmitted
      // signature, so it is not an error and must not produce a second credit.
      const prior = getDb().prepare(
        'SELECT id, user_id, currency, gross_minor, fee_minor, net_minor, created_at FROM billing_ledger WHERE rail = ? AND external_id = ?'
      ).get(rail, externalId.trim());
      return { credited: false, duplicate: true, entry: prior ? { id: prior.id, userId: prior.user_id, currency: prior.currency, grossMinor: prior.gross_minor, feeMinor: prior.fee_minor, netMinor: prior.net_minor, createdAt: prior.created_at } : null };
    }
    throw err;
  }
}

/** Derived balances per currency, in minor units. A user with no entries has zero of everything. */
function balances(userId) {
  const rows = getDb().prepare(
    'SELECT currency, SUM(net_minor) AS net, SUM(fee_minor) AS fee, SUM(gross_minor) AS gross FROM billing_ledger WHERE user_id = ? GROUP BY currency'
  ).all(userId);
  const out = { usd: { netMinor: 0, feeMinor: 0, grossMinor: 0 }, sol: { netMinor: 0, feeMinor: 0, grossMinor: 0 } };
  for (const r of rows) {
    if (out[r.currency]) out[r.currency] = { netMinor: Number(r.net) || 0, feeMinor: Number(r.fee) || 0, grossMinor: Number(r.gross) || 0 };
  }
  return out;
}

/** Recent entries for the account page. Amounts stay in minor units all the way to the UI. */
function history(userId, limit = 25) {
  const n = Number.isSafeInteger(limit) && limit > 0 && limit <= 200 ? limit : 25;
  return getDb().prepare(
    'SELECT id, currency, rail, kind, gross_minor, fee_minor, net_minor, fee_bps, created_at FROM billing_ledger WHERE user_id = ? ORDER BY id DESC LIMIT ?'
  ).all(userId, n).map((r) => ({
    id: r.id, currency: r.currency, rail: r.rail, kind: r.kind,
    grossMinor: r.gross_minor, feeMinor: r.fee_minor, netMinor: r.net_minor, feeBps: r.fee_bps,
    createdAt: r.created_at,
    // Deliberately NOT exposing external_id: a Stripe event id is internal plumbing and a
    // transaction signature is already public, but neither belongs in a balance response.
  }));
}

/** True when this (rail, externalId) has already been credited. Advisory — `credit()` is the gate. */
function alreadyCredited(rail, externalId) {
  if (typeof externalId !== 'string' || !externalId) return false;
  return Boolean(getDb().prepare('SELECT 1 FROM billing_ledger WHERE rail = ? AND external_id = ?').get(rail, externalId));
}

/**
 * Claim a webhook delivery. Returns true the first time an event id is seen and false for
 * every retry. Called immediately after the signature verifies and before any side effect,
 * so a delivery that crashed halfway is not replayed into a second credit — the credit itself
 * is separately protected, but the non-money side effects (cancelling a subscription) are not.
 */
function claimWebhookEvent(rail, eventId, eventType) {
  if (typeof eventId !== 'string' || !eventId.trim()) return false;
  try {
    getDb().prepare('INSERT INTO billing_webhook_events (rail, event_id, event_type) VALUES (?, ?, ?)')
      .run(rail, eventId.trim(), String(eventType || 'unknown').slice(0, 100));
    return true;
  } catch (err) {
    if (isUniqueViolation(err)) return false;
    throw err;
  }
}

/** Undo a webhook claim so Stripe's retry can have another go after a transient failure. */
function releaseWebhookEvent(rail, eventId) {
  try { getDb().prepare('DELETE FROM billing_webhook_events WHERE rail = ? AND event_id = ?').run(rail, String(eventId || '')); } catch (_) { /* best effort */ }
}

module.exports = { credit, balances, history, alreadyCredited, claimWebhookEvent, releaseWebhookEvent, isUniqueViolation };
