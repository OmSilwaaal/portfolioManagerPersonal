// Verifying that a SOL payment really happened.
//
// A client saying "I paid, here is a signature" is a claim, not evidence. Everything the
// credit depends on is read back off the chain:
//
//   1. the signature is well-formed base58 (cheap reject before any RPC call)
//   2. the transaction exists at `finalized` commitment — not `processed`, not `confirmed`.
//      A confirmed-but-not-finalized transaction can still be dropped by a fork, and
//      crediting one is crediting money that may cease to exist.
//   3. meta.err is null — a failed transaction can still appear on chain
//   4. the TREASURY's own lamport balance went up, read as (postBalance - preBalance) on the
//      treasury's account index. Deriving the amount from the balance delta rather than from
//      an instruction's parsed `lamports` field means it is correct regardless of how the
//      transfer was constructed (transfer, transferWithSeed, several transfers in one tx, a
//      CPI from a program) and it cannot be inflated by a decoy instruction.
//   5. the fee payer is one of the CLAIMING user's own registered wallet addresses. Without
//      this, any user could watch the chain and claim a stranger's transfer as their own
//      deposit — the signature is public information. This is the single most important check
//      in the file and the reason wallet addresses are registered at all.
//   6. the treasury is not itself the fee payer, so the delta we credit is never polluted by
//      the network fee.
//
// Who pays the Solana network fee: the sender, always. They sign the transfer, so the
// ~5000-lamport fee is debited from their account by the runtime before our treasury is
// touched. We credit the treasury's balance delta, which is already net of it. Our 5% is then
// taken from that landed amount. The user therefore pays: network fee + 5%.

const { getDb } = require('../db/schema');
const ledger = require('./ledger');
const { solanaConfig } = require('./billingConfig');

const SIG_RE = /^[1-9A-HJ-NP-Za-km-z]{64,100}$/; // base58-encoded 64-byte signature

class DepositError extends Error {
  constructor(message, status = 400, code = 'invalid') { super(message); this.status = status; this.code = code; }
}

let connectionFactory = null;
/** Test seam: hand in a fake { getTransaction } so the suite never touches the network. */
function __setConnectionFactory(fn) { connectionFactory = fn; }

function getConnection(cfg) {
  if (connectionFactory) return connectionFactory(cfg);
  // Required lazily: with the rail off, @solana/web3.js is never constructed.
  const { Connection } = require('@solana/web3.js');
  return new Connection(cfg.rpcUrl, 'finalized');
}

/** Public addresses this user has registered. Used to prove a transfer is theirs. */
function walletsFor(userId) {
  return getDb().prepare("SELECT address FROM user_wallets WHERE user_id = ? AND chain = 'solana'").all(userId).map((r) => r.address);
}

const MAX_WALLETS_PER_USER = 5;
const CHALLENGE_TTL_MS = 5 * 60_000;
// SPKI DER prefix for a raw ed25519 public key, so node's crypto can verify without a
// dependency. The 32 key bytes are appended to it.
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

function assertAddress(address) {
  const addr = String(address || '').trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr)) throw new DepositError('Not a Solana address.', 400, 'bad_address');
  // A 64-byte base58 string is a secret key, not an address. Refuse it without logging it.
  if (addr.length > 44) throw new DepositError('Not a Solana address.', 400, 'bad_address');
  return addr;
}

/** Exactly what the wallet must sign. Bound to the account AND the address, so a signature
 *  collected for one cannot register the other. */
function challengeMessage({ nonce, userId, address, expiresAt }) {
  return [
    'Travauxus wallet verification',
    `account: ${userId}`,
    `address: ${address}`,
    `nonce: ${nonce}`,
    `expires: ${new Date(expiresAt).toISOString()}`,
  ].join('\n');
}

/**
 * Hand out a nonce to sign. Registering a wallet used to require nothing but the address,
 * which meant anyone could claim an address they did not control — and because the treasury
 * is public, an attacker could watch it, register each incoming payer and be credited for
 * other people's deposits. Proving control is the fix.
 */
function issueWalletChallenge(userId, address) {
  const addr = assertAddress(address);
  const db = getDb();
  db.prepare('DELETE FROM wallet_challenges WHERE expires_at < ?').run(Date.now());
  const nonce = require('crypto').randomBytes(24).toString('hex');
  const expiresAt = Date.now() + CHALLENGE_TTL_MS;
  db.prepare('INSERT INTO wallet_challenges (nonce, user_id, address, expires_at) VALUES (?, ?, ?, ?)')
    .run(nonce, userId, addr, expiresAt);
  return { nonce, address: addr, expiresAt, message: challengeMessage({ nonce, userId, address: addr, expiresAt }) };
}

/** True when `signature` (base64) is a valid ed25519 signature of `message` by `address`. */
function verifySignature(address, message, signatureB64) {
  let sig;
  try { sig = Buffer.from(String(signatureB64 || ''), 'base64') } catch { return false }
  if (sig.length !== 64) return false;
  let keyBytes;
  try { keyBytes = Buffer.from(new (require('@solana/web3.js').PublicKey)(address).toBytes()) } catch { return false }
  if (keyBytes.length !== 32) return false;
  try {
    const key = require('crypto').createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, keyBytes]), format: 'der', type: 'spki',
    });
    return require('crypto').verify(null, Buffer.from(message, 'utf8'), key, sig);
  } catch { return false }
}

/**
 * Register a public Solana address, but only on proof that the caller controls it.
 * There is no code path here that accepts key material — only a signature over a nonce
 * this server issued.
 */
function registerWallet(userId, address, { nonce, signature } = {}) {
  const addr = assertAddress(address);
  const db = getDb();

  const row = db.prepare('SELECT * FROM wallet_challenges WHERE nonce = ?').get(String(nonce || ''));
  // Every failure answers the same way: a probe must not learn whether a nonce exists,
  // belongs to someone else, or simply expired.
  const bad = () => { throw new DepositError('Could not verify control of that wallet.', 400, 'unverified_wallet') };
  if (!row || row.used_at || row.user_id !== userId || row.address !== addr || row.expires_at < Date.now()) bad();

  const msg = challengeMessage({ nonce: row.nonce, userId, address: addr, expiresAt: row.expires_at });
  if (!verifySignature(addr, msg, signature)) bad();

  // One use only, whatever happens next.
  db.prepare("UPDATE wallet_challenges SET used_at = datetime('now') WHERE nonce = ?").run(row.nonce);

  const held = db.prepare("SELECT COUNT(*) AS n FROM user_wallets WHERE user_id = ? AND chain = 'solana'").get(userId).n;
  if (held >= MAX_WALLETS_PER_USER) {
    throw new DepositError(`At most ${MAX_WALLETS_PER_USER} wallets per account.`, 400, 'too_many_wallets');
  }

  try {
    db.prepare("INSERT INTO user_wallets (user_id, chain, address) VALUES (?, 'solana', ?)").run(userId, addr);
  } catch (err) {
    if (!ledger.isUniqueViolation(err)) throw err;
    // The unique index spans (chain, address), so a clash is either this user re-registering
    // (fine) or someone else already owning it (not fine, and not something to explain).
    const owner = db.prepare("SELECT user_id FROM user_wallets WHERE chain = 'solana' AND address = ?").get(addr);
    if (owner && owner.user_id !== userId) {
      throw new DepositError('That wallet is already registered to another account.', 409, 'wallet_taken');
    }
  }
  return addr;
}

/** Account keys as plain base58 strings, across every shape web3.js returns them in. */
function accountKeys(tx) {
  const msg = tx?.transaction?.message;
  if (!msg) return [];
  const raw = typeof msg.getAccountKeys === 'function'
    ? msg.getAccountKeys({ accountKeysFromLookups: tx.meta?.loadedAddresses }).keySegments().flat()
    : (msg.accountKeys || msg.staticAccountKeys || []);
  return raw.map((k) => (typeof k === 'string' ? k : (k?.pubkey ? String(k.pubkey) : String(k))));
}

/**
 * Verify a signature paid our treasury, and say how much landed.
 * Throws DepositError for anything that is not a clean, finalized, attributable payment.
 * @returns {{ signature: string, lamports: number, payer: string, slot: number }}
 */
async function verifyTransfer(userId, signature, { env = process.env, now = Date.now() } = {}) {
  const cfg = solanaConfig(env);
  if (!cfg.enabled) throw new DepositError('SOL payments are not enabled.', 503, 'disabled');

  const sig = String(signature || '').trim();
  if (!SIG_RE.test(sig)) throw new DepositError('Not a transaction signature.', 400, 'bad_signature');

  // Cheap pre-check so a replayed claim costs no RPC call. `credit()` is still the real gate.
  if (ledger.alreadyCredited('solana', sig)) throw new DepositError('That transaction has already been credited.', 409, 'already_credited');

  const mine = walletsFor(userId);
  if (mine.length === 0) throw new DepositError('Connect your wallet before claiming a deposit.', 400, 'no_wallet');

  let tx;
  try {
    tx = await getConnection(cfg).getTransaction(sig, { commitment: 'finalized', maxSupportedTransactionVersion: 0 });
  } catch (err) {
    // An RPC outage is our problem, not the user's: 503 so the UI says "try again" rather
    // than "your payment is invalid".
    throw new DepositError('Could not reach Solana to check that transaction. Try again shortly.', 503, 'rpc_unavailable');
  }

  if (!tx) throw new DepositError('That transaction is not finalized yet. Wait a few seconds and try again.', 409, 'not_finalized');
  if (tx.meta?.err) throw new DepositError('That transaction failed on chain.', 400, 'tx_failed');

  if (tx.blockTime && (now - tx.blockTime * 1000) > cfg.maxClaimAgeMs) {
    throw new DepositError('That transaction is too old to claim.', 400, 'too_old');
  }

  const keys = accountKeys(tx);
  const treasuryIdx = keys.indexOf(cfg.treasury);
  if (treasuryIdx < 0) throw new DepositError('That transaction did not pay Travauxus.', 400, 'wrong_destination');
  // Index 0 is always the fee payer. If that were the treasury, the delta below would be
  // mixed up with the network fee, so refuse rather than credit a wrong number.
  if (treasuryIdx === 0) throw new DepositError('That transaction did not pay Travauxus.', 400, 'wrong_destination');

  const payer = keys[0];
  if (!mine.includes(payer)) {
    // The signature is public, so without this the first person to see it could claim it.
    throw new DepositError('That transaction was not sent from your wallet.', 403, 'not_your_transaction');
  }

  const pre = Number(tx.meta?.preBalances?.[treasuryIdx]);
  const post = Number(tx.meta?.postBalances?.[treasuryIdx]);
  if (!Number.isFinite(pre) || !Number.isFinite(post)) throw new DepositError('Could not read that transaction.', 400, 'unreadable');
  const lamports = post - pre;
  if (!Number.isSafeInteger(lamports) || lamports <= 0) throw new DepositError('That transaction did not pay Travauxus.', 400, 'no_payment');

  return { signature: sig, lamports, payer, slot: Number(tx.slot) || 0 };
}

/**
 * Verify, then credit the ledger exactly once. The signature is the idempotency key, so the
 * same transfer submitted a hundred times credits once and reports `duplicate` thereafter.
 */
async function claimDeposit(userId, signature, opts = {}) {
  const v = await verifyTransfer(userId, signature, opts);
  const res = ledger.credit({
    userId, currency: 'sol', rail: 'solana', kind: 'deposit',
    grossMinor: v.lamports, externalId: v.signature,
    ref: { payer: v.payer, slot: v.slot },
  });
  return { ...res, lamports: v.lamports, signature: v.signature };
}

module.exports = {
  issueWalletChallenge, verifySignature, MAX_WALLETS_PER_USER,
  SIG_RE, DepositError, verifyTransfer, claimDeposit, registerWallet, walletsFor,
  accountKeys, __setConnectionFactory,
};
