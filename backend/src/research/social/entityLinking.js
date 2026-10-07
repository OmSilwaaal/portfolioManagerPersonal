'use strict';
/** Pure entity extraction: Solana addresses and $TICKER cashtags. No I/O. */
const crypto = require('crypto');

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const ADDR_RE = /(?<![1-9A-HJ-NP-Za-km-z])[1-9A-HJ-NP-Za-km-z]{32,44}(?![1-9A-HJ-NP-Za-km-z])/g;
const CASHTAG_RE = /(?<![A-Za-z0-9_$])\$([A-Za-z][A-Za-z0-9]{0,14})(?![A-Za-z0-9_])/g;

/** Decoded byte length of a base58 string, or -1 if invalid charset. */
function base58ByteLength(s) {
  let n = 0n;
  for (const ch of s) {
    const i = B58.indexOf(ch);
    if (i < 0) return -1;
    n = n * 58n + BigInt(i);
  }
  let len = n === 0n ? 0 : Math.ceil(n.toString(16).length / 2);
  for (const ch of s) { if (ch === '1') len++; else break; }
  return len;
}

/** Solana pubkey = base58 of exactly 32 bytes (32-44 chars). */
function isSolanaAddress(s) {
  return typeof s === 'string' && s.length >= 32 && s.length <= 44 && base58ByteLength(s) === 32;
}

function extractAddresses(text) {
  const out = new Set();
  for (const m of String(text || '').matchAll(ADDR_RE)) if (isSolanaAddress(m[0])) out.add(m[0]);
  return [...out];
}

function extractCashtags(text) {
  const out = new Set();
  for (const m of String(text || '').matchAll(CASHTAG_RE)) out.add(m[1].toUpperCase());
  return [...out];
}

/** knownTokens: [{address, symbol}]. Returns address only if exactly one distinct token has the symbol. */
function resolveCashtag(tag, knownTokens) {
  const t = String(tag || '').replace(/^\$/, '').toUpperCase();
  const hits = new Set();
  for (const k of knownTokens || []) {
    if (k && k.symbol && String(k.symbol).toUpperCase() === t) hits.add(k.address);
  }
  return hits.size === 1 ? [...hits][0] : null;
}

/**
 * @returns {{addresses:string[], cashtags:string[], tokens:string[]}}
 * tokens = deduped addresses from explicit addresses + unambiguously resolved cashtags.
 */
function extractEntities(text, knownTokens = []) {
  const addresses = extractAddresses(text);
  const cashtags = extractCashtags(text);
  const tokens = new Set(addresses);
  for (const c of cashtags) { const a = resolveCashtag(c, knownTokens); if (a) tokens.add(a); }
  return { addresses, cashtags, tokens: [...tokens] };
}

const textHash = (text) => crypto.createHash('sha256').update(String(text || '')).digest('hex');

module.exports = { isSolanaAddress, extractAddresses, extractCashtags, resolveCashtag, extractEntities, textHash };
