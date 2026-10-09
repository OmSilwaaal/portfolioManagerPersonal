// On-chain verification of a SOL payment. No network: the RPC is a stub.
//
// The claim "I paid you" is worthless on its own, so each test here removes exactly one piece
// of the evidence and checks the deposit is refused. The most important one is
// `not_your_transaction`: a signature is public, so without binding the payer to the claimant
// the first person to see a transfer could claim it.
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
require('./_sqlite').installBetterSqlite3Adapter();

process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'billing-sol-')), 'test.sqlite');

const deposits = require('../src/services/solanaDeposits');
const ledger = require('../src/services/ledger');

const TREASURY = 'TrEaSuRy1111111111111111111111111111111111';
const MINE = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const THEIRS = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const U = 'user-sol';
const ENV = { ENABLE_BILLING_SOLANA: 'true', BILLING_TREASURY_ADDRESS: TREASURY };
// Base58 excludes 0, O, I and l, so a label has to be scrubbed before it can stand in for a
// real signature — otherwise the test is exercising the format check instead of the logic.
const sig = (s) => (s.replace(/[0OIl]/g, 'x') + '2'.repeat(88)).slice(0, 88);

/** A finalized transfer of `lamports` from `payer` to the treasury. */
function tx({ payer = MINE, lamports = 1_000_000_000, keys = null, err = null, blockTime = Math.floor(Date.now() / 1000) } = {}) {
  const accountKeys = keys || [payer, TREASURY];
  const treasuryIdx = accountKeys.indexOf(TREASURY);
  const pre = accountKeys.map(() => 0);
  const post = accountKeys.map(() => 0);
  if (treasuryIdx >= 0) { pre[treasuryIdx] = 5_000_000; post[treasuryIdx] = 5_000_000 + lamports; }
  return { slot: 42, blockTime, meta: { err, preBalances: pre, postBalances: post }, transaction: { message: { accountKeys } } };
}

/** Install a fake RPC that returns `result` (or throws) for getTransaction. */
function rpc(result, { throws = false } = {}) {
  let calls = 0;
  deposits.__setConnectionFactory(() => ({
    getTransaction: async () => { calls++; if (throws) throw new Error('rpc down'); return result; },
  }));
  return () => calls;
}

test.beforeEach(() => { deposits.__setConnectionFactory(null); });
test.after(() => { deposits.__setConnectionFactory(null); });

test('a public address can be registered; key material cannot', () => {
  assert.strictEqual(deposits.registerWallet(U, MINE), MINE);
  assert.deepStrictEqual(deposits.walletsFor(U), [MINE]);
  deposits.registerWallet(U, MINE); // registering twice is a no-op, not an error
  assert.deepStrictEqual(deposits.walletsFor(U), [MINE]);

  // A 64-byte base58 blob is a secret key. It must be refused, and nothing like it stored.
  const secretish = '4'.repeat(88);
  assert.throws(() => deposits.registerWallet(U, secretish), /Not a Solana address/);
  for (const bad of ['', 'not an address', '0OIl'.repeat(10), null, undefined, 'x'.repeat(200)]) {
    assert.throws(() => deposits.registerWallet(U, bad), /Not a Solana address/);
  }
  assert.deepStrictEqual(deposits.walletsFor(U), [MINE], 'nothing extra was written');
});

test('with the rail switched off nothing is verified and no RPC is called', async () => {
  const calls = rpc(tx());
  await assert.rejects(() => deposits.verifyTransfer(U, sig('a'), { env: {} }), (e) => e.code === 'disabled' && e.status === 503);
  assert.strictEqual(calls(), 0);
});

test('a malformed signature is refused before any RPC call', async () => {
  const calls = rpc(tx());
  for (const bad of ['', 'short', 'has spaces in it', '0OIl'.repeat(30), null, 12345]) {
    await assert.rejects(() => deposits.verifyTransfer(U, bad, { env: ENV }), (e) => e.code === 'bad_signature');
  }
  assert.strictEqual(calls(), 0, 'garbage must not cost us an RPC round trip');
});

test('a clean transfer from the claimant is accepted and credited once', async () => {
  rpc(tx({ lamports: 2_000_000_000 }));
  const s = sig('clean');
  const out = await deposits.claimDeposit(U, s, { env: ENV });
  assert.strictEqual(out.credited, true);
  assert.strictEqual(out.lamports, 2_000_000_000);
  assert.strictEqual(out.entry.feeMinor, 100_000_000, '5% of 2 SOL');
  assert.strictEqual(out.entry.netMinor, 1_900_000_000);

  // Resubmitting the same signature credits nothing.
  const again = await deposits.claimDeposit(U, s, { env: ENV }).catch((e) => e);
  assert.strictEqual(again.code, 'already_credited', 'the second attempt is refused outright');
  assert.strictEqual(ledger.balances(U).sol.netMinor, 1_900_000_000);
});

test('a transaction that is not finalized is not credited', async () => {
  rpc(null); // getTransaction returns null until finalization
  await assert.rejects(() => deposits.verifyTransfer(U, sig('pending'), { env: ENV }), (e) => e.code === 'not_finalized' && e.status === 409);
});

test('a transaction that failed on chain is not credited', async () => {
  rpc(tx({ err: { InstructionError: [0, 'Custom'] } }));
  await assert.rejects(() => deposits.verifyTransfer(U, sig('failed'), { env: ENV }), (e) => e.code === 'tx_failed');
});

test('a transfer that never touched the treasury is not credited', async () => {
  rpc(tx({ keys: [MINE, THEIRS] }));
  await assert.rejects(() => deposits.verifyTransfer(U, sig('elsewhere'), { env: ENV }), (e) => e.code === 'wrong_destination');
});

test('a transfer sent from somebody else cannot be claimed', async () => {
  // The whole point: transaction signatures are public, so this is the theft vector.
  rpc(tx({ payer: THEIRS }));
  await assert.rejects(() => deposits.verifyTransfer(U, sig('stolen'), { env: ENV }), (e) => e.code === 'not_your_transaction' && e.status === 403);
});

test('a user with no registered wallet cannot claim anything', async () => {
  const calls = rpc(tx());
  await assert.rejects(() => deposits.verifyTransfer('nobody', sig('nowallet'), { env: ENV }), (e) => e.code === 'no_wallet');
  assert.strictEqual(calls(), 0);
});

test('a zero or negative treasury delta is not a payment', async () => {
  rpc(tx({ lamports: 0 }));
  await assert.rejects(() => deposits.verifyTransfer(U, sig('zero'), { env: ENV }), (e) => e.code === 'no_payment');
});

test('the treasury paying its own fee is refused rather than mis-credited', async () => {
  // Index 0 is the fee payer. If that were the treasury the delta would include the network
  // fee and we would credit a wrong number, so the deposit is refused instead.
  rpc(tx({ keys: [TREASURY, MINE] }));
  await assert.rejects(() => deposits.verifyTransfer(U, sig('selfpay'), { env: ENV }), (e) => e.code === 'wrong_destination');
});

test('a stale transaction is not claimable', async () => {
  rpc(tx({ blockTime: Math.floor(Date.now() / 1000) - 40 * 86400 }));
  await assert.rejects(() => deposits.verifyTransfer(U, sig('ancient'), { env: ENV }), (e) => e.code === 'too_old');
});

test('an RPC outage is reported as our problem, not as an invalid payment', async () => {
  rpc(null, { throws: true });
  await assert.rejects(() => deposits.verifyTransfer(U, sig('rpcdown'), { env: ENV }),
    (e) => e.code === 'rpc_unavailable' && e.status === 503);
});

test('the amount is read off the treasury balance delta, not off an instruction', async () => {
  // Three accounts, treasury in the middle, plus a decoy balance change elsewhere.
  const keys = [MINE, THEIRS, TREASURY];
  const t = tx({ keys, lamports: 777 });
  t.meta.preBalances[1] = 10_000; t.meta.postBalances[1] = 99_999_999; // decoy
  rpc(t);
  const v = await deposits.verifyTransfer(U, sig('delta'), { env: ENV });
  assert.strictEqual(v.lamports, 777, 'only the treasury delta counts');
});

test('a treasury address that is not base58 disables the rail rather than matching loosely', async () => {
  rpc(tx());
  await assert.rejects(
    () => deposits.verifyTransfer(U, sig('badtreasury'), { env: { ENABLE_BILLING_SOLANA: 'true', BILLING_TREASURY_ADDRESS: 'not a real address!!' } }),
    (e) => e.code === 'disabled');
});
