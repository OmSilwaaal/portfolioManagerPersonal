// Sub-second prices for the tokens the live stream is watching, read straight off Solana.
//
// Why this exists: a price change takes 10-30s to reach the terminal today, and almost none of
// that is ours to fix by turning knobs. DexScreener/GeckoTerminal need 2-20s to index the swap,
// and the TTLs in memecoinData that sit on top cannot simply be lowered — GeckoTerminal's free
// tier is ~30 req/min and the hub watches up to 20 tokens. Reading the pump.fun bonding curve
// over a WebSocket skips the aggregator entirely: the account is written in the same transaction
// as the swap, so we see the new price in the slot it happens.
//
// Price comes from the curve's virtual reserves, which is what pump.fun itself quotes against:
//   priceSol = (virtualSolReserves / 1e9) / (virtualTokenReserves / 10**mintDecimals)
// Measured against DexScreener on live tokens this agrees to well under a percent while
// DexScreener is current, and runs ahead of it by whatever DexScreener happens to be behind.
//
// Scope: pre-migration pump.fun tokens only. Once `complete` is set the curve is frozen and
// trading has moved to a Raydium pool, so there is nothing left to read here; those tokens stay
// on the aggregator path. Raydium/AMM pools are deliberately NOT handled.
//
// This is an accelerator, never a dependency. With no key, with ENABLE_HELIUS_PRICE=false, or
// with the socket down, every tick in memecoinStream still runs at today's cadence and the
// product behaves exactly as it did.
//
// The key is read from the environment here and nowhere else. It travels only inside the
// request/socket URL, is never logged (see heliusLaunches' redact) and never appears in
// anything emitted to a client — the frames carry an address, a price and a source string.

const WebSocket = require('ws');
const { PublicKey } = require('@solana/web3.js');
const { redact, PUMP_FUN_PROGRAM } = require('./heliusLaunches');
const data = require('./memecoinData');

const HELIUS_WS = 'wss://mainnet.helius-rpc.com';
const HELIUS_RPC = 'https://mainnet.helius-rpc.com';

// The curve account is a PDA of the mint, so there is no registry to look up: seed + mint +
// program id gives the address offline.
const CURVE_SEED = Buffer.from('bonding-curve');

// 8-byte Anchor discriminator, then five u64 LE, then a bool.
const OFF = {
  virtualTokenReserves: 8,
  virtualSolReserves: 16,
  realTokenReserves: 24,
  realSolReserves: 32,
  tokenTotalSupply: 40,
  complete: 48,
};
const CURVE_MIN_LEN = OFF.complete + 1;

const SOL_DECIMALS = 9;
// pump.fun mints 6 decimals and has for every token we have seen, but a mint that did not would
// be priced wrong by orders of magnitude, so this is only the fallback when the lookup fails.
const FALLBACK_DECIMALS = 6;

// Mirrors MAX_WATCHED in memecoinStream: the hub will never ask for more, and a bug there must
// not turn into unbounded subscriptions here.
const MAX_TOKENS = 20;

// A token mid-raid writes its curve several times a second, and this is the only pacing in the
// whole path — everything else is event-driven. It exists to stop one hot token flooding the
// socket, not to set the update rate: measured notification rates on a busy pre-migration token
// are well under 1/s, so the floor only engages inside a micro-burst, where it costs at most
// this much. Ten frames a second per token is ~1.4 KB/s of SSE and leaves the budget to the
// chain, which is the part we cannot do anything about.
const MIN_EMIT_INTERVAL_MS = 100;

// Same shape as the client's reconnect in web/src/api/liveFeed.js.
const BACKOFF_MIN = 1_000;
const BACKOFF_MAX = 60_000;
// Helius closes an idle socket without notice, and a half-open TCP connection looks fine from
// here forever. Ping on a timer, and treat silence past STALE_MS as dead.
const PING_MS = 30_000;
const STALE_MS = 90_000;
// memecoinData caches SOL/USD for 15s; refreshing on the same cadence means the notification
// handler never has to await anything, so emits stay in slot order.
const SOL_REFRESH_MS = 15_000;

/** Enabled by presence of a key. Deliberately opt-OUT: an opt-in flag nobody sets is dead code. */
function isEnabled(env = process.env) {
  return Boolean(env.HELIUS_API_KEY) && env.ENABLE_HELIUS_PRICE !== 'false';
}

/** The bonding-curve PDA for a mint, or null if the mint is not a valid pubkey. */
function curveAddress(mint) {
  try {
    const [pda] = PublicKey.findProgramAddressSync(
      [CURVE_SEED, new PublicKey(mint).toBuffer()],
      new PublicKey(PUMP_FUN_PROGRAM),
    );
    return pda.toBase58();
  } catch (_) {
    return null;
  }
}

/** Decode a curve account. Returns null for anything too short to be one. */
function decodeCurve(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < CURVE_MIN_LEN) return null;
  return {
    virtualTokenReserves: buf.readBigUInt64LE(OFF.virtualTokenReserves),
    virtualSolReserves: buf.readBigUInt64LE(OFF.virtualSolReserves),
    realTokenReserves: buf.readBigUInt64LE(OFF.realTokenReserves),
    realSolReserves: buf.readBigUInt64LE(OFF.realSolReserves),
    tokenTotalSupply: buf.readBigUInt64LE(OFF.tokenTotalSupply),
    // Set once the curve has filled and liquidity has moved to Raydium. The account stops
    // changing at that moment, so its reserves are a snapshot of the past, not a price.
    complete: buf.readUInt8(OFF.complete) === 1,
  };
}

/** Spot price in SOL, or null when the curve cannot price (empty, or migrated). */
function priceSolFromCurve(curve, decimals = FALLBACK_DECIMALS) {
  if (!curve || curve.complete) return null;
  const dp = Number.isInteger(decimals) && decimals >= 0 && decimals <= 18 ? decimals : FALLBACK_DECIMALS;
  const tokens = Number(curve.virtualTokenReserves) / 10 ** dp;
  const sol = Number(curve.virtualSolReserves) / 10 ** SOL_DECIMALS;
  if (!(tokens > 0) || !(sol > 0)) return null;
  const price = sol / tokens;
  return Number.isFinite(price) ? price : null;
}

/**
 * Per-key rate limiter: emit the first value at once, then at most one per minIntervalMs,
 * always the newest. A value superseded inside the window is dropped on purpose — it is a
 * price that was already wrong by the time the next notification arrived.
 */
function createCoalescer(opts = {}) {
  const minIntervalMs = opts.minIntervalMs ?? MIN_EMIT_INTERVAL_MS;
  const now = opts.now || (() => Date.now());
  const setTimer = opts.setTimer || setTimeout;
  const clearTimer = opts.clearTimer || clearTimeout;
  const emit = opts.emit || (() => {});
  const keys = new Map(); // key -> { last, timer, pending }

  function fire(key, value) {
    const s = keys.get(key);
    if (!s) return;
    s.last = now();
    s.pending = null;
    emit(value);
  }

  function push(key, value) {
    let s = keys.get(key);
    if (!s) { s = { last: 0, timer: null, pending: null }; keys.set(key, s); }
    const wait = s.last + minIntervalMs - now();
    if (wait <= 0 && !s.timer) { fire(key, value); return; }
    s.pending = value;
    if (s.timer) return;
    const t = setTimer(() => {
      s.timer = null;
      if (s.pending !== null) fire(key, s.pending);
    }, Math.max(0, wait));
    if (t && t.unref) t.unref();
    s.timer = t;
  }

  function forget(key) {
    const s = keys.get(key);
    if (s?.timer) clearTimer(s.timer);
    keys.delete(key);
  }

  function stop() { for (const k of [...keys.keys()]) forget(k); }

  return { push, forget, stop, size: () => keys.size };
}

/** An inert feed: every caller can treat the service as present and skip the branching. */
function inert(reason) {
  return {
    name: 'solana-price',
    enabled: false,
    reason,
    setWatched() {},
    stop() {},
    stats: () => ({ enabled: false, reason, connected: false, watched: [] }),
  };
}

/**
 * opts.onPrice      — ({ address, price, priceSol, source, ts }) => void
 * opts.createSocket — (url) => WebSocket-alike, for tests
 * opts.fetchImpl / opts.now / opts.setTimer / opts.clearTimer — also for tests
 */
function createFeed(env = process.env, opts = {}) {
  if (env.ENABLE_HELIUS_PRICE === 'false') return inert('ENABLE_HELIUS_PRICE=false');
  const key = env.HELIUS_API_KEY;
  if (!key) return inert('HELIUS_API_KEY not set');

  const d = opts.data || data;
  const now = opts.now || (() => Date.now());
  const setTimer = opts.setTimer || setTimeout;
  const clearTimer = opts.clearTimer || clearTimeout;
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  const createSocket = opts.createSocket || ((url) => new WebSocket(url));
  const log = opts.log || console;
  const onPrice = opts.onPrice || ((p) => {
    // Lazy so neither module has to be loaded before the other, and so a hub that syncs its
    // watched set before index.js wires anything still reaches the stream.
    try { require('./memecoinStream').pushPrice(p); } catch (_) { /* accelerator only */ }
  });

  const subs = new Map();     // mint -> { curve, subId, reqId, decimals, migrated }
  const bySubId = new Map();  // subscription id -> mint
  const pendingReq = new Map(); // json-rpc id -> mint
  let ws = null;
  let nextId = 1;
  let attempts = 0;
  let retryTimer = null;
  let pingTimer = null;
  let solTimer = null;
  let lastMsgAt = 0;
  let solUsd = null;
  let stopped = false;

  const coalescer = createCoalescer({
    minIntervalMs: opts.minIntervalMs ?? MIN_EMIT_INTERVAL_MS,
    now,
    setTimer,
    clearTimer,
    // The window's extremes and traded size are read here rather than carried in the queued
    // value: coalescing drops superseded prices, and a high or a swap inside the window is not
    // superseded by the price that follows it.
    emit: (q) => {
      const s = subs.get(q.address);
      const usd = solUsd || 0;
      const hi = s?.hiSol ?? q.priceSol;
      const lo = s?.loSol ?? q.priceSol;
      const volSol = s?.volSol || 0;
      if (s) { s.hiSol = null; s.loSol = null; s.volSol = 0; }
      try {
        onPrice({
          address: q.address,
          price: q.priceSol * usd,
          priceSol: q.priceSol,
          high: hi * usd,
          low: lo * usd,
          volumeSol: volSol,
          volumeUsd: volSol * usd,
          source: 'pumpfun-curve',
          ts: now(),
          slot: q.slot,
        });
      } catch (err) { log.error('[solana-price] emit:', redact(err.message)); }
    },
  });

  // ── rpc ───────────────────────────────────────────────────────────────────
  async function rpc(method, params) {
    const res = await fetchImpl(`${HELIUS_RPC}/?api-key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: method, method, params }),
    });
    if (!res.ok) throw new Error(`${method} http ${res.status}`);
    const body = await res.json();
    if (body?.error) throw new Error(`${method}: ${body.error.message}`);
    return body?.result;
  }

  async function refreshSolUsd() {
    try {
      const p = await d.getSolPrice();
      if (typeof p === 'number' && Number.isFinite(p) && p > 0) solUsd = p;
    } catch (_) { /* keep the last known price; a missing one only costs us this emit */ }
  }

  /**
   * One call for both accounts a new token needs: the curve (so the first price lands on
   * selection rather than on the next trade) and the mint (for its decimals). jsonParsed gives
   * the SPL mint parsed and falls back to base64 for the curve, which has no known parser.
   */
  async function prime(mint) {
    const s = subs.get(mint);
    if (!s) return;
    let accounts;
    try {
      const r = await rpc('getMultipleAccounts', [[s.curve, mint], { encoding: 'jsonParsed', commitment: 'processed' }]);
      accounts = r?.value;
    } catch (err) {
      log.error('[solana-price] prime:', redact(err.message));
      return;
    }
    if (!Array.isArray(accounts) || !subs.has(mint)) return;
    const [curveAcct, mintAcct] = accounts;

    const dp = mintAcct?.data?.parsed?.info?.decimals;
    s.decimals = Number.isInteger(dp) && dp >= 0 && dp <= 18 ? dp : null;

    // No curve account at all: not a pump.fun token (or long since closed). Hold the slot but
    // never expect a notification — the aggregator path is all it ever had.
    const raw = Array.isArray(curveAcct?.data) ? curveAcct.data[0] : null;
    if (!raw) return;
    // Selecting a token is the one moment a price is wanted before any trade happens, so make
    // sure we have a SOL/USD figure (from the 15s cache, usually) rather than dropping it.
    if (!solUsd) await refreshSolUsd();
    if (subs.has(mint)) apply(mint, raw, null);
  }

  // ── subscriptions ─────────────────────────────────────────────────────────
  function send(msg) {
    if (!ws || ws.readyState !== 1) return false;
    try { ws.send(JSON.stringify(msg)); return true; } catch (_) { return false; }
  }

  function subscribe(mint) {
    const s = subs.get(mint);
    if (!s || s.migrated || s.subId !== null || s.reqId !== null) return;
    const id = nextId++;
    // `processed` rather than `confirmed`: a swap's own slot is the point of all this, and a
    // price that is re-org'd away is corrected by the next notification a moment later.
    if (!send({ jsonrpc: '2.0', id, method: 'accountSubscribe', params: [s.curve, { encoding: 'base64', commitment: 'processed' }] })) return;
    s.reqId = id;
    pendingReq.set(id, mint);
  }

  function unsubscribe(mint, s) {
    if (s.reqId !== null) pendingReq.delete(s.reqId);
    if (s.subId !== null) {
      bySubId.delete(s.subId);
      send({ jsonrpc: '2.0', id: nextId++, method: 'accountUnsubscribe', params: [s.subId] });
    }
    s.reqId = null;
    s.subId = null;
  }

  /** The hub's watched set, verbatim. Called on every connect and disconnect. */
  function setWatched(list) {
    if (stopped) return;
    const next = [];
    for (const a of Array.isArray(list) ? list : []) {
      if (typeof a === 'string' && d.isValidAddress(a) && !next.includes(a)) next.push(a);
      if (next.length >= MAX_TOKENS) break;
    }
    const keep = new Set(next);

    for (const [mint, s] of [...subs]) {
      if (keep.has(mint)) continue;
      unsubscribe(mint, s);
      subs.delete(mint);
      coalescer.forget(mint);
    }
    for (const mint of next) {
      if (subs.has(mint)) continue;
      const curve = curveAddress(mint);
      if (!curve) continue;
      subs.set(mint, {
        curve, subId: null, reqId: null, decimals: null, migrated: false,
        lastVSol: null, volSol: 0, hiSol: null, loSol: null,
      });
      subscribe(mint);
      prime(mint).catch(() => { /* prime logs its own failure */ });
    }

    // Nothing to watch: hold no socket at all rather than an idle one.
    if (!subs.size) { teardown(); return; }
    connect();
  }

  // ── notifications ─────────────────────────────────────────────────────────
  /** Decode one curve write and queue the price. Synchronous, so emits stay in slot order. */
  function apply(mint, base64, slot) {
    const s = subs.get(mint);
    if (!s) return;
    let curve;
    try { curve = decodeCurve(Buffer.from(base64, 'base64')); } catch (_) { return; }
    if (!curve) return;
    if (curve.complete) {
      // Migrated to Raydium: the curve is frozen from here on, so stop listening and leave the
      // token to the aggregator. Out of scope by design.
      s.migrated = true;
      unsubscribe(mint, s);
      return;
    }
    const priceSol = priceSolFromCurve(curve, s.decimals ?? FALLBACK_DECIMALS);
    if (priceSol === null || !solUsd) return;

    // Swap size, for the forming candle's volume bar. Only a trade against this curve moves
    // virtualSolReserves, so the absolute change since the last notification is that trade's
    // SOL size. It is a lower bound by nature: several swaps in one slot arrive as a single
    // notification, and a buy and a sell in the same slot partly cancel out.
    if (s.lastVSol !== null) {
      const a = curve.virtualSolReserves;
      const b = s.lastVSol;
      s.volSol += Number(a > b ? a - b : b - a) / 10 ** SOL_DECIMALS;
    }
    s.lastVSol = curve.virtualSolReserves;
    s.hiSol = s.hiSol === null ? priceSol : Math.max(s.hiSol, priceSol);
    s.loSol = s.loSol === null ? priceSol : Math.min(s.loSol, priceSol);

    coalescer.push(mint, { address: mint, priceSol, slot: slot ?? null });
  }

  function onMessage(raw) {
    lastMsgAt = now();
    let msg;
    try { msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString()); } catch (_) { return; }

    if (msg.method === 'accountNotification') {
      const mint = bySubId.get(msg.params?.subscription);
      if (!mint) return;
      const value = msg.params?.result?.value;
      const b64 = Array.isArray(value?.data) ? value.data[0] : null;
      if (b64) apply(mint, b64, msg.params?.result?.context?.slot ?? null);
      return;
    }

    if (msg.id === undefined || !pendingReq.has(msg.id)) return;
    const mint = pendingReq.get(msg.id);
    pendingReq.delete(msg.id);
    const s = subs.get(mint);
    if (s) s.reqId = null;
    if (msg.error) {
      log.error('[solana-price] accountSubscribe rejected:', redact(msg.error.message));
      return;
    }
    if (!s || typeof msg.result !== 'number') return;
    s.subId = msg.result;
    bySubId.set(msg.result, mint);
  }

  // ── socket lifecycle ──────────────────────────────────────────────────────
  function connect() {
    if (stopped || ws || !subs.size) return;
    clearTimer(retryTimer);
    retryTimer = null;
    let socket;
    try {
      socket = createSocket(`${HELIUS_WS}/?api-key=${key}`);
    } catch (err) {
      log.error('[solana-price] socket:', redact(err.message));
      scheduleReconnect();
      return;
    }
    ws = socket;
    lastMsgAt = now();

    socket.on('open', () => {
      if (ws !== socket) { try { socket.close(); } catch (_) { /* already gone */ } return; }
      attempts = 0;
      lastMsgAt = now();
      // A reconnect starts with no server-side state: everything watched has to be re-asked for.
      for (const [mint, s] of subs) {
        s.subId = null;
        s.reqId = null;
        if (!s.migrated) subscribe(mint);
      }
      startTimers();
    });
    socket.on('message', (raw) => { if (ws === socket) onMessage(raw); });
    socket.on('pong', () => { if (ws === socket) lastMsgAt = now(); });
    socket.on('error', (err) => {
      if (ws !== socket) return;
      log.error('[solana-price] socket:', redact(err?.message || 'error'));
    });
    socket.on('close', () => {
      if (ws !== socket) return;
      dropSocket();
      scheduleReconnect();
    });
  }

  function startTimers() {
    stopTimers();
    pingTimer = setTimer(function tick() {
      if (!ws) return;
      if (now() - lastMsgAt > STALE_MS) {
        // Silent for longer than any healthy socket goes: assume half-open and start over.
        log.error('[solana-price] socket silent, reconnecting');
        const dead = ws;
        dropSocket();
        try { (dead.terminate || dead.close).call(dead); } catch (_) { /* already gone */ }
        scheduleReconnect();
        return;
      }
      try { ws.ping?.(); } catch (_) { /* a failed ping shows up as a close */ }
      pingTimer = setTimer(tick, PING_MS);
      if (pingTimer?.unref) pingTimer.unref();
    }, PING_MS);
    if (pingTimer?.unref) pingTimer.unref();

    refreshSolUsd();
    solTimer = setTimer(function tick() {
      refreshSolUsd();
      solTimer = setTimer(tick, SOL_REFRESH_MS);
      if (solTimer?.unref) solTimer.unref();
    }, SOL_REFRESH_MS);
    if (solTimer?.unref) solTimer.unref();
  }

  function stopTimers() {
    clearTimer(pingTimer);
    clearTimer(solTimer);
    pingTimer = null;
    solTimer = null;
  }

  /** Forget the socket and every subscription id it owned; the watched set itself survives. */
  function dropSocket() {
    const dead = ws;
    ws = null;
    stopTimers();
    bySubId.clear();
    pendingReq.clear();
    for (const s of subs.values()) { s.subId = null; s.reqId = null; }
    if (dead) { try { dead.close(); } catch (_) { /* already gone */ } }
  }

  function scheduleReconnect() {
    if (stopped || retryTimer || !subs.size) return;
    attempts = Math.min(attempts + 1, 16);
    const capped = Math.min(BACKOFF_MAX, BACKOFF_MIN * 2 ** (attempts - 1));
    // Jitter so a Helius blip does not have every container coming back in lockstep.
    const wait = capped * (0.5 + Math.random() * 0.5);
    retryTimer = setTimer(() => { retryTimer = null; connect(); }, wait);
    if (retryTimer?.unref) retryTimer.unref();
  }

  /** Give up the socket but stay usable: the next non-empty watched set reconnects. */
  function teardown() {
    clearTimer(retryTimer);
    retryTimer = null;
    dropSocket();
    coalescer.stop();
  }

  function stop() {
    stopped = true;
    teardown();
    subs.clear();
  }

  function stats() {
    return {
      enabled: true,
      connected: Boolean(ws) && ws.readyState === 1,
      attempts,
      watched: [...subs.keys()],
      subscribed: [...subs.values()].filter((s) => s.subId !== null).length,
      migrated: [...subs.values()].filter((s) => s.migrated).length,
      solUsd: solUsd !== null,
    };
  }

  return { name: 'solana-price', enabled: true, setWatched, stop, stats, __apply: apply, __onMessage: onMessage };
}

// ── process singleton ───────────────────────────────────────────────────────
let singleton = null;
const feed = () => (singleton ||= createFeed());

/** Called by the stream hub whenever the set of watched tokens changes. */
function setWatched(list) {
  try { feed().setWatched(list); } catch (err) { console.error('[solana-price]', redact(err.message)); }
}

/** Wiring for index.js: says which way it went, exactly as the launch watcher does. */
function startPriceFeed(opts = {}, env = process.env, log = console) {
  singleton = createFeed(env, opts);
  if (!singleton.enabled) {
    log.log(`[solana-price] disabled (${singleton.reason})`);
    return singleton;
  }
  // Nothing opens until the hub has something to watch, so no credits are spent on an idle server.
  log.log('[solana-price] bonding-curve prices on for watched pump.fun tokens');
  return singleton;
}

module.exports = {
  createFeed,
  createCoalescer,
  startPriceFeed,
  setWatched,
  isEnabled,
  curveAddress,
  decodeCurve,
  priceSolFromCurve,
  stats: () => feed().stats(),
  MAX_TOKENS,
  MIN_EMIT_INTERVAL_MS,
  FALLBACK_DECIMALS,
};
