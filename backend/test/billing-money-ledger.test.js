// Money arithmetic and the ledger's idempotency.
//
// The two things most worth proving here:
//   - the fee split is exact integer arithmetic at the edges, and gross = fee + net always
//   - "credit exactly once" is enforced by the DATABASE, not by application logic. The
//     duplicate tests deliberately go straight at ledger.credit() rather than through a
//     route, so what is being proved is the unique index and nothing above it.
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
require('./_sqlite').installBetterSqlite3Adapter();

process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'billing-ledger-')), 'test.sqlite');

const money = require('../src/services/money');
const ledger = require('../src/services/ledger');
const { getDb } = require('../src/db/schema');

const U = 'user-1';

test('the fee is 5%, floored, and gross always equals fee plus net', () => {
  assert.deepStrictEqual(money.splitFee(10000), { grossMinor: 10000, feeMinor: 500, netMinor: 9500, feeBps: 500 });
  assert.deepStrictEqual(money.splitFee(2500), { grossMinor: 2500, feeMinor: 125, netMinor: 2375, feeBps: 500 });
  // A 1-lamport deposit: the fee floors to zero and the books still balance.
  assert.deepStrictEqual(money.splitFee(1), { grossMinor: 1, feeMinor: 0, netMinor: 1, feeBps: 500 });
  assert.deepStrictEqual(money.splitFee(19), { grossMinor: 19, feeMinor: 0, netMinor: 19, feeBps: 500 });
  assert.deepStrictEqual(money.splitFee(20), { grossMinor: 20, feeMinor: 1, netMinor: 19, feeBps: 500 });
  assert.deepStrictEqual(money.splitFee(0), { grossMinor: 0, feeMinor: 0, netMinor: 0, feeBps: 500 });
  // Exhaustive at the small end, where rounding mistakes hide.
  for (let g = 0; g < 5000; g++) {
    const s = money.splitFee(g);
    assert.strictEqual(s.feeMinor + s.netMinor, g, `gross ${g} must split exactly`);
    assert.ok(Number.isInteger(s.feeMinor) && Number.isInteger(s.netMinor));
    assert.ok(s.feeMinor >= 0 && s.netMinor >= 0);
  }
});

test('the fee is computed in BigInt, so a huge gross does not lose precision', () => {
  // 9e15 lamports * 500 overflows a double; the result must still be exact.
  const big = 9_000_000_000_000_000;
  const s = money.splitFee(big);
  assert.strictEqual(s.feeMinor, 450_000_000_000_000);
  assert.strictEqual(s.feeMinor + s.netMinor, big);
});

test('a zero fee rate and a 100% fee rate are both representable', () => {
  assert.deepStrictEqual(money.splitFee(1234, 0), { grossMinor: 1234, feeMinor: 0, netMinor: 1234, feeBps: 0 });
  assert.deepStrictEqual(money.splitFee(1234, 10000), { grossMinor: 1234, feeMinor: 1234, netMinor: 0, feeBps: 10000 });
  assert.throws(() => money.splitFee(100, 10001), TypeError);
  assert.throws(() => money.splitFee(100, -1), TypeError);
});

test('non-integer, negative and absurd amounts are refused rather than coerced', () => {
  for (const bad of [1.5, -1, NaN, Infinity, '100', null, undefined, true, Number.MAX_SAFE_INTEGER + 2]) {
    assert.throws(() => money.splitFee(bad), TypeError, `${bad} must be refused`);
  }
});

test('decimal strings parse without ever touching binary floating point', () => {
  assert.strictEqual(money.parseDecimalToMinor('12.34', 'usd'), 1234);
  assert.strictEqual(money.parseDecimalToMinor('0.07', 'usd'), 7);
  assert.strictEqual(money.parseDecimalToMinor('1', 'usd'), 100);
  assert.strictEqual(money.parseDecimalToMinor('0.1', 'sol'), 100000000);
  // The classic: 0.1 + 0.2 must not become 0.30000000000000004 anywhere.
  assert.strictEqual(money.parseDecimalToMinor('0.1', 'usd') + money.parseDecimalToMinor('0.2', 'usd'), 30);
  // More fractional digits than the currency has is not a real amount of money.
  assert.strictEqual(money.parseDecimalToMinor('1.005', 'usd'), null);
  assert.strictEqual(money.parseDecimalToMinor('1.0000000001', 'sol'), null);
  for (const bad of ['-1', '', 'abc', '1e3', '.', '1.2.3', ' 1 2 ', null, {}, []]) {
    assert.strictEqual(money.parseDecimalToMinor(bad, 'usd'), null, `${JSON.stringify(bad)} must not parse`);
  }
  assert.strictEqual(money.parseDecimalToMinor('1.00', 'eur'), null);
});

test('formatting is display-only and round-trips through the parser', () => {
  assert.strictEqual(money.formatMinor(1234, 'usd'), '12.34');
  assert.strictEqual(money.formatMinor(7, 'usd'), '0.07');
  assert.strictEqual(money.formatMinor(100000000, 'sol'), '0.100000000');
  for (const [m, c] of [[1, 'usd'], [999999, 'usd'], [1, 'sol'], [123456789, 'sol']]) {
    assert.strictEqual(money.parseDecimalToMinor(money.formatMinor(m, c), c), m);
  }
});

// ── idempotency ───────────────────────────────────────────────────────────────

test('a credit is recorded with its gross, fee and net together', () => {
  const r = ledger.credit({ userId: U, currency: 'usd', rail: 'stripe', kind: 'deposit', grossMinor: 10000, externalId: 'pi_first' });
  assert.strictEqual(r.credited, true);
  assert.strictEqual(r.duplicate, false);
  assert.strictEqual(r.entry.feeMinor, 500);
  assert.strictEqual(r.entry.netMinor, 9500);
});

test('replaying the same Stripe payment credits exactly once', () => {
  const before = ledger.balances(U).usd.netMinor;
  const first = ledger.credit({ userId: U, currency: 'usd', rail: 'stripe', kind: 'deposit', grossMinor: 5000, externalId: 'pi_replay' });
  assert.strictEqual(first.credited, true);

  // Ten retries, as a flapping webhook would produce.
  for (let i = 0; i < 10; i++) {
    const again = ledger.credit({ userId: U, currency: 'usd', rail: 'stripe', kind: 'deposit', grossMinor: 5000, externalId: 'pi_replay' });
    assert.strictEqual(again.credited, false, 'a retry must not credit');
    assert.strictEqual(again.duplicate, true);
    assert.strictEqual(again.entry.id, first.entry.id, 'the retry should report the original entry');
  }
  assert.strictEqual(ledger.balances(U).usd.netMinor, before + 4750, 'balance moved exactly once');
  const rows = getDb().prepare("SELECT COUNT(*) AS n FROM billing_ledger WHERE external_id = 'pi_replay'").get().n;
  assert.strictEqual(rows, 1);
});

test('replaying the same Solana signature credits exactly once', () => {
  const sig = '5xPay' + 'z'.repeat(60);
  const before = ledger.balances(U).sol.netMinor;
  assert.strictEqual(ledger.credit({ userId: U, currency: 'sol', rail: 'solana', kind: 'deposit', grossMinor: 1_000_000_000, externalId: sig }).credited, true);
  for (let i = 0; i < 5; i++) {
    assert.strictEqual(ledger.credit({ userId: U, currency: 'sol', rail: 'solana', kind: 'deposit', grossMinor: 1_000_000_000, externalId: sig }).credited, false);
  }
  assert.strictEqual(ledger.balances(U).sol.netMinor, before + 950_000_000);
});

test('a replay cannot be smuggled through by changing the amount or the user', () => {
  const sig = 'sigAmountSwap' + 'q'.repeat(50);
  ledger.credit({ userId: U, currency: 'sol', rail: 'solana', kind: 'deposit', grossMinor: 1000, externalId: sig });
  const other = ledger.credit({ userId: 'attacker', currency: 'sol', rail: 'solana', kind: 'deposit', grossMinor: 99999999, externalId: sig });
  assert.strictEqual(other.credited, false, 'the key is the signature, not the claimant');
  assert.strictEqual(ledger.balances('attacker').sol.netMinor, 0);
});

test('the same id on a different rail is a different credit', () => {
  const id = 'shared-id-1';
  assert.strictEqual(ledger.credit({ userId: U, currency: 'usd', rail: 'stripe', kind: 'deposit', grossMinor: 100, externalId: id }).credited, true);
  assert.strictEqual(ledger.credit({ userId: U, currency: 'sol', rail: 'solana', kind: 'deposit', grossMinor: 100, externalId: id }).credited, true);
});

test('an empty external id is refused, because it would collide with every other blank', () => {
  for (const bad of ['', '   ', null, undefined, 5]) {
    assert.throws(() => ledger.credit({ userId: U, currency: 'usd', rail: 'stripe', kind: 'deposit', grossMinor: 1, externalId: bad }), TypeError);
  }
});

test('a malformed credit is rejected before it reaches the database', () => {
  const base = { userId: U, currency: 'usd', rail: 'stripe', kind: 'deposit', grossMinor: 100, externalId: 'x1' };
  assert.throws(() => ledger.credit({ ...base, currency: 'gbp' }), TypeError);
  assert.throws(() => ledger.credit({ ...base, rail: 'paypal' }), TypeError);
  assert.throws(() => ledger.credit({ ...base, kind: 'freebie' }), TypeError);
  assert.throws(() => ledger.credit({ ...base, userId: '' }), TypeError);
  assert.throws(() => ledger.credit({ ...base, grossMinor: -5 }), TypeError);
  assert.throws(() => ledger.credit({ ...base, grossMinor: 10.5 }), TypeError);
});

test('the database itself refuses a row where gross does not equal fee plus net', () => {
  // Proves the CHECK constraint is real, not just a comment: a future bug that writes an
  // unbalanced row cannot persist it.
  assert.throws(() => getDb().prepare(
    'INSERT INTO billing_ledger (user_id, currency, rail, kind, gross_minor, fee_minor, net_minor, fee_bps, external_id) VALUES (?,?,?,?,?,?,?,?,?)'
  ).run(U, 'usd', 'stripe', 'deposit', 1000, 10, 10, 500, 'unbalanced'), /CHECK constraint failed|constraint/i);
});

test('the database refuses a negative gross and an unknown currency', () => {
  const ins = (cur, gross, fee, net) => getDb().prepare(
    'INSERT INTO billing_ledger (user_id, currency, rail, kind, gross_minor, fee_minor, net_minor, fee_bps, external_id) VALUES (?,?,?,?,?,?,?,?,?)'
  ).run(U, cur, 'stripe', 'deposit', gross, fee, net, 500, `bad-${cur}-${gross}`);
  assert.throws(() => ins('usd', -100, 0, -100), /constraint/i);
  assert.throws(() => ins('gbp', 100, 0, 100), /constraint/i);
});

test('balances are derived by summing entries, so they cannot drift', () => {
  const V = 'user-sum';
  let expected = 0;
  for (let i = 1; i <= 20; i++) {
    const r = ledger.credit({ userId: V, currency: 'usd', rail: 'stripe', kind: 'deposit', grossMinor: i * 37, externalId: `sum-${i}` });
    expected += r.entry.netMinor;
  }
  assert.strictEqual(ledger.balances(V).usd.netMinor, expected);
  const direct = getDb().prepare("SELECT SUM(net_minor) AS n FROM billing_ledger WHERE user_id = ? AND currency = 'usd'").get(V).n;
  assert.strictEqual(Number(direct), expected);
});

test('history never leaks the external id', () => {
  const rows = ledger.history(U, 50);
  assert.ok(rows.length > 0);
  for (const r of rows) {
    assert.ok(!('externalId' in r) && !('external_id' in r), 'a payment id must not reach a balance response');
    assert.ok(Number.isInteger(r.grossMinor) && Number.isInteger(r.feeMinor) && Number.isInteger(r.netMinor));
  }
});

test('a webhook delivery can be claimed exactly once', () => {
  assert.strictEqual(ledger.claimWebhookEvent('stripe', 'evt_1', 'checkout.session.completed'), true);
  assert.strictEqual(ledger.claimWebhookEvent('stripe', 'evt_1', 'checkout.session.completed'), false);
  assert.strictEqual(ledger.claimWebhookEvent('stripe', 'evt_2', 'other'), true);
  // Releasing lets a retry through again, which is what a transient failure needs.
  ledger.releaseWebhookEvent('stripe', 'evt_1');
  assert.strictEqual(ledger.claimWebhookEvent('stripe', 'evt_1', 'checkout.session.completed'), true);
  assert.strictEqual(ledger.claimWebhookEvent('stripe', '', 'x'), false);
});
