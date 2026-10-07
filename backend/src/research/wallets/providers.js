'use strict';
// Pluggable wallet-data providers. Uniform interface:
//   { name, enabled, reason?, discoverCandidateWallets(tokenAddress) -> string[],
//     getWalletTrades(wallet, sinceTs) -> Trade[] }
// Trade = { wallet_id, token_id, ts (unix s), side:'buy'|'sell', amount_token, price_usd, amount_usd, tx }
// Disabled providers are { name, enabled:false, reason } with no methods.

const { budgetError } = require('./budget');

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const STABLES = new Set([
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
]);

// Small serial queue with min spacing and exponential backoff on 429/5xx.
function createQueue({ minIntervalMs = 250, maxRetries = 4, baseBackoffMs = 500, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let chain = Promise.resolve();
  let last = 0;
  function run(fn) {
    const p = chain.then(async () => {
      for (let attempt = 0; ; attempt++) {
        const wait = last + minIntervalMs - Date.now();
        if (wait > 0) await sleep(wait);
        last = Date.now();
        try {
          return await fn();
        } catch (e) {
          const retriable = e && (e.status === 429 || (e.status >= 500 && e.status < 600) || e.retriable);
          if (!retriable || attempt >= maxRetries) throw e;
          await sleep(e.retryAfterMs || baseBackoffMs * 2 ** attempt);
        }
      }
    });
    chain = p.catch(() => {});
    return p;
  }
  return { run };
}

async function httpJson(url, { headers, fetchImpl = globalThis.fetch } = {}) {
  const res = await fetchImpl(url, { headers });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    const ra = Number(res.headers && res.headers.get && res.headers.get('retry-after'));
    if (ra) err.retryAfterMs = ra * 1000;
    throw err;
  }
  return res.json();
}

// SOL/USD with 5-min cache (CoinGecko public). Override via opts.getSolUsd for tests.
function makeSolUsd(fetchImpl) {
  let cached = null;
  return async () => {
    if (cached && Date.now() - cached.at < 300_000) return cached.v;
    const j = await httpJson('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd', { fetchImpl });
    cached = { v: j.solana.usd, at: Date.now() };
    return cached.v;
  };
}

// ── Helius: parsed swap history ─────────────────────────────────────────────
function createHeliusProvider(env = process.env, opts = {}) {
  const key = env.HELIUS_API_KEY;
  if (!key) return { name: 'helius', enabled: false, reason: 'HELIUS_API_KEY not set' };
  const q = opts.queue || createQueue({ minIntervalMs: 120 });
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  const solUsd = opts.getSolUsd || makeSolUsd(fetchImpl);

  function legs(tx, wallet) {
    const sw = tx.events && tx.events.swap;
    if (!sw) return null;
    const side = (nat, toks) => {
      const out = [];
      if (nat && Number(nat.amount) > 0 && (!nat.account || nat.account === wallet)) out.push({ mint: SOL_MINT, amt: Number(nat.amount) / 1e9 });
      for (const t of toks || []) {
        if (t.userAccount && t.userAccount !== wallet) continue;
        const r = t.rawTokenAmount; if (!r) continue;
        out.push({ mint: t.mint, amt: Number(r.tokenAmount) / 10 ** Number(r.decimals) });
      }
      return out;
    };
    return { spent: side(sw.nativeInput, sw.tokenInputs), got: side(sw.nativeOutput, sw.tokenOutputs) };
  }

  return {
    name: 'helius',
    enabled: true,
    // Helius has no per-token top-trader API; discovery comes from Birdeye (or others).
    async discoverCandidateWallets() { return []; },
    async getWalletTrades(wallet, sinceTs = 0) {
      const sol = await solUsd();
      const usdOf = (l) => (l.mint === SOL_MINT ? l.amt * sol : STABLES.has(l.mint) ? l.amt : null);
      const out = [];
      let before = '';
      for (let page = 0; page < 10; page++) {
        const url = `https://api.helius.xyz/v0/addresses/${wallet}/transactions?api-key=${key}&type=SWAP&limit=100${before ? `&before=${before}` : ''}`;
        const txs = await q.run(() => httpJson(url, { fetchImpl }));
        if (!Array.isArray(txs) || !txs.length) break;
        for (const tx of txs) {
          if (tx.timestamp < sinceTs) continue;
          const l = legs(tx, wallet); if (!l) continue;
          const spentQ = l.spent.find((x) => usdOf(x) !== null), gotTok = l.got.find((x) => usdOf(x) === null);
          const gotQ = l.got.find((x) => usdOf(x) !== null), spentTok = l.spent.find((x) => usdOf(x) === null);
          let side, tok, quote;
          if (spentQ && gotTok) { side = 'buy'; tok = gotTok; quote = spentQ; }
          else if (gotQ && spentTok) { side = 'sell'; tok = spentTok; quote = gotQ; }
          else continue;
          const usd = usdOf(quote);
          if (!(tok.amt > 0) || !(usd > 0)) continue;
          out.push({ wallet_id: wallet, token_id: tok.mint, ts: tx.timestamp, side, amount_token: tok.amt, price_usd: usd / tok.amt, amount_usd: usd, tx: tx.signature });
        }
        if (txs[txs.length - 1].timestamp < sinceTs) break;
        before = txs[txs.length - 1].signature;
      }
      return out;
    },
  };
}

// ── Birdeye: top traders per token + wallet trades ──────────────────────────
function createBirdeyeProvider(env = process.env, opts = {}) {
  const key = env.BIRDEYE_API_KEY;
  if (!key) return { name: 'birdeye', enabled: false, reason: 'BIRDEYE_API_KEY not set' };
  const q = opts.queue || createQueue({ minIntervalMs: 1100 }); // free tier ~1 rps
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  const headers = { 'X-API-KEY': key, 'x-chain': 'solana', accept: 'application/json' };
  // Every Birdeye HTTP attempt (including retries) is charged against the persisted daily budget when one is given.
  const budget = opts.budget || null;
  const get = (url) => q.run(() => {
    if (budget && !budget.tryConsume(1)) throw budgetError('birdeye');
    return httpJson(url, { headers, fetchImpl });
  });

  return {
    name: 'birdeye',
    enabled: true,
    async discoverCandidateWallets(tokenAddress) {
      const j = await get(`https://public-api.birdeye.so/defi/v2/tokens/top_traders?address=${tokenAddress}&time_frame=24h&sort_type=desc&sort_by=volume&limit=10`);
      const items = (j && j.data && j.data.items) || [];
      return items.map((i) => i.owner).filter(Boolean);
    },
    async getWalletTrades(wallet, sinceTs = 0) {
      const j = await get(`https://public-api.birdeye.so/trader/txs/seek_by_time?address=${wallet}&offset=0&limit=100&tx_type=swap&after_time=${sinceTs}`);
      const items = (j && j.data && j.data.items) || [];
      const out = [];
      for (const it of items) {
        const ts = it.block_unix_time;
        const base = it.base, quote = it.quote;
        if (!ts || !base || !quote) continue;
        const quoteIsStable = (x) => x.address === SOL_MINT || STABLES.has(x.address);
        const [tok, qt] = quoteIsStable(quote) && !quoteIsStable(base) ? [base, quote] : quoteIsStable(base) && !quoteIsStable(quote) ? [quote, base] : [null, null];
        if (!tok) continue;
        const tokAmt = Math.abs(Number(tok.ui_amount)), qAmt = Math.abs(Number(qt.ui_amount));
        const qPrice = Number(qt.price);
        if (!(tokAmt > 0) || !(qAmt > 0) || !(qPrice > 0)) continue;
        // token_change_amount < 0 means the wallet gave the token up (sell)
        const side = (tok.type_swap === 'from' || Number(tok.change_amount) < 0) ? 'sell' : 'buy';
        const usd = qAmt * qPrice;
        out.push({ wallet_id: wallet, token_id: tok.address, ts, side, amount_token: tokAmt, price_usd: usd / tokAmt, amount_usd: usd, tx: it.tx_hash });
      }
      return out;
    },
  };
}

// Tatum gRPC (existing grpcStreamer) is a live stream only: no history/discovery queries.
function createTatumProvider(env = process.env) {
  if (!env.TATUM_API_KEY) return { name: 'tatum', enabled: false, reason: 'TATUM_API_KEY not set' };
  return { name: 'tatum', enabled: false, reason: 'Tatum gRPC is stream-only; no historical wallet queries implemented' };
}

// Deterministic in-memory provider for tests.
function createMockProvider({ candidates = {}, trades = {}, name = 'mock' } = {}) {
  return {
    name,
    enabled: true,
    async discoverCandidateWallets(token) { return candidates[token] || []; },
    async getWalletTrades(wallet, sinceTs = 0) {
      return (trades[wallet] || []).filter((t) => t.ts >= sinceTs).map((t) => ({ wallet_id: wallet, ...t }));
    },
  };
}

function getProviders(env = process.env, opts = {}) {
  return [createHeliusProvider(env, opts), createBirdeyeProvider(env, opts), createTatumProvider(env)];
}

module.exports = { httpJson, SOL_MINT, STABLES, getProviders, createHeliusProvider, createBirdeyeProvider, createTatumProvider, createMockProvider, createQueue };
