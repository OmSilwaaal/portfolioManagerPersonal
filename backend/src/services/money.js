// Money arithmetic for the billing rails.
//
// Every amount in this file, in the ledger and in every API payload is an INTEGER number of
// minor units: USD in cents, SOL in lamports. Binary floating point never touches a balance —
// `0.1 + 0.2 !== 0.3` is how ledgers silently go wrong, and a cent lost at 2am is unfindable.
// Floats are allowed in exactly one place: parsing a human-typed decimal string at the edge
// (`parseDecimalToMinor`), which is done with string surgery rather than multiplication so
// "0.07" can never become 6.999999 cents.
//
// Fee policy, decided once here: the fee is floored. The house therefore never collects a
// fraction of a minor unit it cannot represent, and `gross = fee + net` is an exact integer
// identity that the ledger enforces with a CHECK constraint. A 1-lamport deposit yields a
// 0-lamport fee and still balances.

/** 5% on card deposits and on SOL deposits alike (the product decision), in basis points. */
const FEE_BPS = 500;
const BPS_DIVISOR = 10_000;

const CURRENCIES = Object.freeze({
  usd: { decimals: 2, minor: 'cents' },
  sol: { decimals: 9, minor: 'lamports' },
});

const isCurrency = (c) => Object.prototype.hasOwnProperty.call(CURRENCIES, c);

/** A safe integer >= 0 and within the range we are willing to move in one transaction. */
const MAX_MINOR = Number.MAX_SAFE_INTEGER; // 9e15: ~9M SOL in lamports, ~$90T in cents

function isMinorAmount(v) {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= MAX_MINOR;
}

/**
 * Fee and net for a gross amount, both integers, with `gross === fee + net` by construction.
 * feeBps is a parameter rather than a constant read so a test can pin the edges, but callers
 * in the request path always pass the server-side FEE_BPS.
 */
function splitFee(grossMinor, feeBps = FEE_BPS) {
  if (!isMinorAmount(grossMinor)) throw new TypeError('grossMinor must be a non-negative safe integer');
  if (!Number.isSafeInteger(feeBps) || feeBps < 0 || feeBps > BPS_DIVISOR) {
    throw new TypeError('feeBps must be an integer between 0 and 10000');
  }
  // Floor division on integers. grossMinor * feeBps can reach 9e15 * 1e4 = 9e19, past the safe
  // range, so the multiplication is done in BigInt and only the (small) result comes back.
  const fee = Number((BigInt(grossMinor) * BigInt(feeBps)) / BigInt(BPS_DIVISOR));
  return { grossMinor, feeMinor: fee, netMinor: grossMinor - fee, feeBps };
}

/**
 * Parse a user-supplied decimal string ("12.34", "0.5", 7) into minor units WITHOUT multiplying
 * by a power of ten, so no binary rounding error can enter. Rejects anything that is not a plain
 * non-negative decimal, and rejects more fractional digits than the currency has.
 * Returns an integer, or null when the input is not acceptable.
 */
function parseDecimalToMinor(input, currency) {
  if (!isCurrency(currency)) return null;
  const { decimals } = CURRENCIES[currency];
  // Numbers are accepted for convenience but go through their decimal form, never through
  // a float multiply. A number that cannot print exactly (1e21, NaN) is refused below.
  const s = typeof input === 'number'
    ? (Number.isFinite(input) ? String(input) : '')
    : (typeof input === 'string' ? input.trim() : '');
  if (!/^\d{1,18}(\.\d{1,18})?$/.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  if (frac.length > decimals) return null; // "1.005" in USD is not a real amount of money
  const padded = frac.padEnd(decimals, '0');
  const minor = Number(`${whole}${padded}`.replace(/^0+(?=\d)/, ''));
  return isMinorAmount(minor) ? minor : null;
}

/** Minor units back to a display string. Presentation only — never feed this back into arithmetic. */
function formatMinor(minor, currency) {
  if (!isCurrency(currency) || !Number.isSafeInteger(minor)) return null;
  const { decimals } = CURRENCIES[currency];
  const neg = minor < 0;
  const s = String(Math.abs(minor)).padStart(decimals + 1, '0');
  const whole = s.slice(0, s.length - decimals);
  const frac = decimals ? `.${s.slice(s.length - decimals)}` : '';
  return `${neg ? '-' : ''}${whole}${frac}`;
}

module.exports = {
  FEE_BPS, BPS_DIVISOR, CURRENCIES, MAX_MINOR,
  isCurrency, isMinorAmount, splitFee, parseDecimalToMinor, formatMinor,
};
