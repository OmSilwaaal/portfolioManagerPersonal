// The Helius WebSocket, as a reusable connection rather than a copy per subscriber.
//
// This was the socket lifecycle inside solanaPriceFeed, lifted out unchanged when a second
// consumer appeared (pumpCurveIndex). Both want exactly the same four things and all four are
// easy to get subtly wrong twice:
//
//   - capped, jittered backoff, so a Helius blip does not have every container returning in
//     lockstep and does not turn into a reconnect loop;
//   - re-subscribe on every open, because a reconnect starts with no server-side state and a
//     feed that does not re-ask goes permanently silent while looking perfectly healthy;
//   - a liveness check, because Helius closes an idle socket without notice and a half-open
//     TCP connection looks fine from this end forever;
//   - a teardown that leaves no socket and no timer behind, so a process can stop.
//
// It deliberately knows nothing about accounts, prices or JSON-RPC semantics: it delivers raw
// frames to onMessage and calls onOpen when the caller should re-ask for whatever it wants.
// The caller owns its own subscription bookkeeping.
//
// The key is only ever interpolated into the socket URL and the URL is never logged — every
// log line here goes through heliusLaunches' redact() first.

const WebSocket = require('ws');
const { redact } = require('./heliusLaunches');

const HELIUS_WS = 'wss://mainnet.helius-rpc.com';

// Same shape as the client's reconnect in web/src/api/liveFeed.js.
const BACKOFF_MIN = 1_000;
const BACKOFF_MAX = 60_000;
const PING_MS = 30_000;
const STALE_MS = 90_000;

/**
 * opts.key          — Helius API key, used only to build the URL
 * opts.tag          — log prefix, e.g. 'solana-price'
 * opts.onMessage    — (raw) => void, every frame, already counted as traffic
 * opts.onOpen       — () => void, re-ask for every subscription here
 * opts.onDrop       — () => void, forget every server-side id; the socket is gone
 * opts.shouldConnect— () => boolean, false means "nothing to watch, hold no socket"
 * opts.createSocket / now / setTimer / clearTimer / log — injected by tests
 */
function createHeliusSocket(opts = {}) {
  const key = opts.key;
  const tag = opts.tag || 'helius-ws';
  const now = opts.now || (() => Date.now());
  const setTimer = opts.setTimer || setTimeout;
  const clearTimer = opts.clearTimer || clearTimeout;
  const log = opts.log || console;
  const createSocket = opts.createSocket || ((url) => new WebSocket(url));
  const url = opts.url || `${HELIUS_WS}/?api-key=${key}`;
  const pingMs = opts.pingMs ?? PING_MS;
  const staleMs = opts.staleMs ?? STALE_MS;
  const backoffMin = opts.backoffMin ?? BACKOFF_MIN;
  const backoffMax = opts.backoffMax ?? BACKOFF_MAX;

  const onMessage = opts.onMessage || (() => {});
  const onOpen = opts.onOpen || (() => {});
  const onDrop = opts.onDrop || (() => {});
  const shouldConnect = opts.shouldConnect || (() => true);

  let ws = null;
  let attempts = 0;
  let retryTimer = null;
  let pingTimer = null;
  let lastMsgAt = 0;
  let stopped = false;

  function send(msg) {
    if (!ws || ws.readyState !== 1) return false;
    try { ws.send(JSON.stringify(msg)); return true; } catch (_) { return false; }
  }

  /** Mark traffic. Anything that proves the peer is alive — a frame, a pong — belongs here. */
  function touch() { lastMsgAt = now(); }

  function startTimers() {
    stopTimers();
    pingTimer = setTimer(function tick() {
      if (!ws) return;
      if (now() - lastMsgAt > staleMs) {
        // Silent for longer than any healthy socket goes: assume half-open and start over.
        log.error(`[${tag}] socket silent, reconnecting`);
        const dead = ws;
        drop();
        try { (dead.terminate || dead.close).call(dead); } catch (_) { /* already gone */ }
        scheduleReconnect();
        return;
      }
      try { ws.ping?.(); } catch (_) { /* a failed ping shows up as a close */ }
      pingTimer = setTimer(tick, pingMs);
      if (pingTimer?.unref) pingTimer.unref();
    }, pingMs);
    if (pingTimer?.unref) pingTimer.unref();
  }

  function stopTimers() {
    clearTimer(pingTimer);
    pingTimer = null;
  }

  /** Forget the socket and let the caller forget its subscription ids. Stays reconnectable. */
  function drop() {
    const dead = ws;
    ws = null;
    stopTimers();
    try { onDrop(); } catch (err) { log.error(`[${tag}] drop:`, redact(err.message)); }
    if (dead) { try { dead.close(); } catch (_) { /* already gone */ } }
  }

  function scheduleReconnect() {
    if (stopped || retryTimer || !shouldConnect()) return;
    attempts = Math.min(attempts + 1, 16);
    const capped = Math.min(backoffMax, backoffMin * 2 ** (attempts - 1));
    // Jitter so a Helius blip does not have every container coming back in lockstep.
    const wait = capped * (0.5 + Math.random() * 0.5);
    retryTimer = setTimer(() => { retryTimer = null; connect(); }, wait);
    if (retryTimer?.unref) retryTimer.unref();
  }

  function connect() {
    if (stopped || ws || !shouldConnect()) return;
    clearTimer(retryTimer);
    retryTimer = null;
    let socket;
    try {
      socket = createSocket(url);
    } catch (err) {
      log.error(`[${tag}] socket:`, redact(err.message));
      scheduleReconnect();
      return;
    }
    ws = socket;
    lastMsgAt = now();

    socket.on('open', () => {
      // A socket that opened after we moved on is not ours; close it rather than adopt it.
      if (ws !== socket) { try { socket.close(); } catch (_) { /* already gone */ } return; }
      attempts = 0;
      lastMsgAt = now();
      try { onOpen(); } catch (err) { log.error(`[${tag}] open:`, redact(err.message)); }
      startTimers();
    });
    socket.on('message', (raw) => {
      if (ws !== socket) return;
      lastMsgAt = now();
      onMessage(raw);
    });
    socket.on('pong', () => { if (ws === socket) lastMsgAt = now(); });
    socket.on('error', (err) => {
      if (ws !== socket) return;
      log.error(`[${tag}] socket:`, redact(err?.message || 'error'));
    });
    socket.on('close', () => {
      if (ws !== socket) return;
      drop();
      scheduleReconnect();
    });
  }

  /** Give up the socket but stay usable: the next connect() reopens it. */
  function teardown() {
    clearTimer(retryTimer);
    retryTimer = null;
    drop();
  }

  function stop() {
    stopped = true;
    teardown();
  }

  return {
    connect,
    send,
    touch,
    drop,
    teardown,
    stop,
    connected: () => Boolean(ws) && ws.readyState === 1,
    attempts: () => attempts,
    stopped: () => stopped,
  };
}

module.exports = { createHeliusSocket, HELIUS_WS, BACKOFF_MIN, BACKOFF_MAX, PING_MS, STALE_MS };
