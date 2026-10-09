// New pump.fun launches from Helius, pushed into the memecoin SSE stream.
//
// Opt-in exactly like the radar (ENABLE_HELIUS_LAUNCHES=true) and additionally dead without
// HELIUS_API_KEY, so a server with neither boots and behaves exactly as before. Follows the
// calling convention already used for Helius under research/wallets: the shared httpJson +
// createQueue, the documented api.helius.xyz/v0 enhanced-transactions endpoint, and the
// { name, enabled, reason } shape for an unconfigured provider.
//
// The key is read from the environment here and nowhere else. It travels only inside the
// request URL, is never logged (see redact) and never appears in anything emitted to a
// client — the stream says `launches: true|false` and nothing more.

const { httpJson, createQueue } = require('../research/wallets/providers');
const { cleanSymbol, cleanName, cleanUrl, isValidAddress } = require('./memecoinData');

const HELIUS_API = 'https://api.helius.xyz/v0';
const HELIUS_RPC = 'https://mainnet.helius-rpc.com';
// pump.fun's program. A `type=CREATE` transaction against it is a token launch.
const PUMP_FUN_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';

const POLL_MS = Number(process.env.HELIUS_LAUNCH_POLL_MS || 6000);
const PAGE = 50;          // launches run at a few per second; 50 covers a 6s gap with room to spare
const HYDRATE_MAX = 12;   // names per tick, in ONE getAssetBatch call
const COLD_START_AGE_S = 120; // on the first tick, ignore anything older than this rather than flooding the UI
const SEEN_MAX = 2000;

/** Never let a URL (which carries the key) reach a log line. */
const redact = (s) => String(s || '').replace(/api-key=[^&\s]+/gi, 'api-key=***');

function isEnabled(env = process.env) {
  return env.ENABLE_HELIUS_LAUNCHES === 'true' && Boolean(env.HELIUS_API_KEY);
}

/** mint of the launched token: the only token moved by a pump.fun CREATE is the new one. */
function launchMint(tx) {
  for (const t of tx?.tokenTransfers || []) if (isValidAddress(t?.mint)) return t.mint;
  for (const ad of tx?.accountData || []) {
    for (const ch of ad?.tokenBalanceChanges || []) if (isValidAddress(ch?.mint)) return ch.mint;
  }
  return null;
}

function createWatcher(env = process.env, opts = {}) {
  if (env.ENABLE_HELIUS_LAUNCHES !== 'true') {
    return { name: 'helius-launches', enabled: false, reason: 'ENABLE_HELIUS_LAUNCHES != true' };
  }
  const key = env.HELIUS_API_KEY;
  if (!key) return { name: 'helius-launches', enabled: false, reason: 'HELIUS_API_KEY not set' };

  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  const q = opts.queue || createQueue({ minIntervalMs: 150, maxRetries: 2 });
  const onLaunch = opts.onLaunch || (() => {});
  const hasListeners = opts.hasListeners || (() => true);
  const now = opts.now || (() => Date.now());
  const seen = new Set();
  let first = true;
  let timer = null;

  function remember(mint) {
    if (seen.size >= SEEN_MAX) {
      // Insertion order is chronological, so the oldest half is the right half to forget.
      let n = SEEN_MAX / 2;
      for (const m of seen) { seen.delete(m); if (--n <= 0) break; }
    }
    seen.add(mint);
  }

  /** name/symbol/image for up to HYDRATE_MAX mints in one DAS call. Missing metadata is not fatal. */
  async function hydrate(mints) {
    const out = new Map();
    if (!mints.length) return out;
    try {
      const res = await q.run(() => fetchImpl(`${HELIUS_RPC}/?api-key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 'launches', method: 'getAssetBatch', params: { ids: mints } }),
      }));
      if (!res.ok) return out;
      const body = await res.json();
      for (const a of body?.result || []) {
        if (!a?.id) continue;
        const m = a.content?.metadata || {};
        out.set(a.id, {
          symbol: cleanSymbol(m.symbol, a.id),
          name: cleanName(m.name || m.json_name, a.id, m.symbol),
          image: cleanUrl(a.content?.links?.image),
        });
      }
    } catch (_) { /* metadata is a nice-to-have; the mint alone is enough to open the token */ }
    return out;
  }

  async function pollOnce() {
    // Nobody is listening: do not spend Helius credits producing events with no reader.
    if (!hasListeners()) return [];
    const url = `${HELIUS_API}/addresses/${PUMP_FUN_PROGRAM}/transactions`
      + `?api-key=${key}&type=CREATE&limit=${PAGE}`;
    const txs = await q.run(() => httpJson(url, { fetchImpl }));
    if (!Array.isArray(txs)) return [];

    const cutoff = first ? Math.floor(now() / 1000) - COLD_START_AGE_S : 0;
    const fresh = [];
    for (const tx of txs) {
      if (tx?.source !== 'PUMP_FUN') continue;
      if (typeof tx.timestamp !== 'number' || tx.timestamp < cutoff) continue;
      const mint = launchMint(tx);
      if (!mint || seen.has(mint)) continue;
      remember(mint);
      fresh.push({ address: mint, creator: tx.feePayer || null, ts: tx.timestamp * 1000, signature: tx.signature || null });
    }
    first = false;
    if (!fresh.length) return [];

    fresh.sort((a, b) => a.ts - b.ts); // oldest first, so a UI prepending each one ends up newest-first
    const meta = await hydrate(fresh.slice(-HYDRATE_MAX).map((l) => l.address));
    const out = fresh.map((l) => ({
      ...l,
      source: 'pumpfun',
      symbol: meta.get(l.address)?.symbol ?? cleanSymbol(null, l.address),
      name: meta.get(l.address)?.name ?? cleanName(null, l.address, null),
      image: meta.get(l.address)?.image ?? null,
    }));
    for (const l of out) onLaunch(l);
    return out;
  }

  function start() {
    if (timer) return;
    const tick = () => pollOnce().catch((err) => console.error('[helius-launches]', redact(err.message)));
    tick();
    timer = setInterval(tick, Math.max(2000, POLL_MS));
    if (timer.unref) timer.unref();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { name: 'helius-launches', enabled: true, pollOnce, start, stop, PUMP_FUN_PROGRAM };
}

/** Wiring for index.js: starts the watcher when configured, logs which way it went. */
function startHeliusLaunches(opts = {}, env = process.env, log = console) {
  const w = createWatcher(env, opts);
  if (!w.enabled) {
    log.log(`[helius-launches] disabled (${w.reason})`);
    return w;
  }
  w.start();
  log.log(`[helius-launches] watching pump.fun launches every ${Math.max(2000, POLL_MS) / 1000}s`);
  return w;
}

module.exports = { createWatcher, startHeliusLaunches, isEnabled, launchMint, redact, PUMP_FUN_PROGRAM };
