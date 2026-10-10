// Registering a deposit wallet. The rule that matters: a SOL deposit is attributed by matching
// the transaction's payer to a registered address, so "which account owns this address" decides
// who gets the money. Before proof-of-control existed, an attacker could watch the public
// treasury, register each incoming payer as their own and be credited for other people's
// deposits — the victim's later claim returned already_credited and they got nothing.
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'tvx-walletproof-'));
process.env.DB_PATH = path.join(ROOT, 'wallets.sqlite');

const test = require('node:test');
const assert = require('node:assert');
const { PublicKey } = require('@solana/web3.js');
const deposits = require('../src/services/solanaDeposits');

test.after(() => fs.rmSync(ROOT, { recursive: true, force: true }));

const VICTIM = '11111111-1111-4111-8111-111111111111';
const ATTACKER = '22222222-2222-4222-8222-222222222222';

/** A real ed25519 keypair, as a Solana wallet would hold. */
function wallet() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const raw = publicKey.export({ type: 'spki', format: 'der' }).subarray(12);
  return {
    address: new PublicKey(raw).toBase58(),
    sign: (msg) => crypto.sign(null, Buffer.from(msg, 'utf8'), privateKey).toString('base64'),
  };
}

test('a wallet you can sign for registers, and the signature really is checked', () => {
  const w = wallet();
  const ch = deposits.issueWalletChallenge(VICTIM, w.address);
  assert.match(ch.message, /Travauxus wallet verification/);
  assert.ok(ch.message.includes(VICTIM) && ch.message.includes(w.address), 'bound to account and address');

  const got = deposits.registerWallet(VICTIM, w.address, { nonce: ch.nonce, signature: w.sign(ch.message) });
  assert.strictEqual(got, w.address);
  assert.deepStrictEqual(deposits.walletsFor(VICTIM), [w.address]);
});

test('THE ATTACK: an address you cannot sign for is refused', () => {
  const victimWallet = wallet();
  // The attacker knows the address — it is the public payer of a transfer to the public treasury.
  const ch = deposits.issueWalletChallenge(ATTACKER, victimWallet.address);
  assert.throws(
    () => deposits.registerWallet(ATTACKER, victimWallet.address, { nonce: ch.nonce, signature: 'AA'.repeat(43) }),
    (e) => e.code === 'unverified_wallet',
    'a forged signature must not register someone else\'s wallet',
  );
  assert.deepStrictEqual(deposits.walletsFor(ATTACKER), [], 'nothing was written');
});

test('a signature for one address cannot register a different one', () => {
  const mine = wallet();
  const theirs = wallet();
  const ch = deposits.issueWalletChallenge(ATTACKER, theirs.address);
  // Attacker signs the challenge with the key they DO hold, hoping the address is not rebound.
  assert.throws(
    () => deposits.registerWallet(ATTACKER, theirs.address, { nonce: ch.nonce, signature: mine.sign(ch.message) }),
    (e) => e.code === 'unverified_wallet',
  );
});

test('a challenge is single-use, account-bound and expiring', () => {
  const w = wallet();
  const ch = deposits.issueWalletChallenge(VICTIM, w.address);
  const sig = w.sign(ch.message);

  // Another account cannot spend this user's challenge, even holding the key.
  assert.throws(() => deposits.registerWallet(ATTACKER, w.address, { nonce: ch.nonce, signature: sig }),
    (e) => e.code === 'unverified_wallet');

  deposits.registerWallet(VICTIM, w.address, { nonce: ch.nonce, signature: sig });
  // Replaying the same nonce is refused.
  assert.throws(() => deposits.registerWallet(VICTIM, w.address, { nonce: ch.nonce, signature: sig }),
    (e) => e.code === 'unverified_wallet');

  assert.throws(() => deposits.registerWallet(VICTIM, w.address, { nonce: 'never-issued', signature: sig }),
    (e) => e.code === 'unverified_wallet');
});

test('one address belongs to one account, even with a valid signature', () => {
  const shared = wallet();
  const a = deposits.issueWalletChallenge(VICTIM, shared.address);
  deposits.registerWallet(VICTIM, shared.address, { nonce: a.nonce, signature: shared.sign(a.message) });

  // The attacker somehow obtains a valid signature (a leaked one, a shared device). The
  // address is still not theirs to claim: the unique index decides ownership, not the race.
  const b = deposits.issueWalletChallenge(ATTACKER, shared.address);
  assert.throws(
    () => deposits.registerWallet(ATTACKER, shared.address, { nonce: b.nonce, signature: shared.sign(b.message) }),
    (e) => e.code === 'wallet_taken',
  );
  assert.ok(!deposits.walletsFor(ATTACKER).includes(shared.address));
});

test('re-registering your own wallet is a no-op, and there is a cap', () => {
  const user = '33333333-3333-4333-8333-333333333333';
  const w = wallet();
  for (let i = 0; i < 2; i++) {
    const ch = deposits.issueWalletChallenge(user, w.address);
    deposits.registerWallet(user, w.address, { nonce: ch.nonce, signature: w.sign(ch.message) });
  }
  assert.deepStrictEqual(deposits.walletsFor(user), [w.address], 'still one row');

  for (let i = 0; i < deposits.MAX_WALLETS_PER_USER - 1; i++) {
    const extra = wallet();
    const ch = deposits.issueWalletChallenge(user, extra.address);
    deposits.registerWallet(user, extra.address, { nonce: ch.nonce, signature: extra.sign(ch.message) });
  }
  const one = wallet();
  const ch = deposits.issueWalletChallenge(user, one.address);
  assert.throws(() => deposits.registerWallet(user, one.address, { nonce: ch.nonce, signature: one.sign(ch.message) }),
    (e) => e.code === 'too_many_wallets');
});

test('key material is still refused outright', () => {
  const secret = Buffer.alloc(64, 7).toString('base64').replace(/[^1-9A-HJ-NP-Za-km-z]/g, 'x').slice(0, 60);
  assert.throws(() => deposits.issueWalletChallenge(VICTIM, secret), (e) => e.code === 'bad_address');
});
