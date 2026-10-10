// Server-sent events for the trading terminal: one held-open connection per tab replaces
// eight pollers.
//
// Why this exists: /api is behind a 60 req/min per-IP limiter and one open terminal already
// spends ~26 of them. Shortening the poll intervals trips the limiter, and the client then
// pauses EVERY poller for 15-120s — the naive "make it faster" change makes the product
// slower. Pushing costs one request per tab instead.
//
// Nothing here adds upstream load per subscriber. Every read goes through memecoinData's TTL
// cache, which de-dupes in-flight requests, so N tabs watching one token still cost one
// DexScreener call per TTL. The tick intervals below are deliberately shorter than those TTLs:
// the cache absorbs the difference and we simply notice a change as soon as it lands.

const data = require('./memecoinData');
const { evaluateVolatility } = require('./memecoinAlerts');

// Per-IP connection cap. An SSE endpoint exempt from the request limiter and with no
// connection cap is a one-line resource-exhaustion vector: a browser allows 6 connections
// per origin, so a legitimate user never needs more than a handful.
const MAX_PER_IP = 4;
const MAX_CLIENTS = 200;
const MAX_ADDRESSES_PER_CLIENT = 4;
// Hard ceiling on the upstream work the hub can be made to do. Past this, extra tokens are
// simply not pushed; the client's existing polling still covers them.
const MAX_WATCHED = 20;

// Railway's proxy and most intermediaries idle a silent connection out at around 60s.
const HEARTBEAT_MS = 20_000;

const TICK = {
  detail: 5_000,   // token: TTL 10s
  candle: 10_000,  // ohlcv: TTL 10s (1m) / 20s
  trades: 8_000,   // trades: TTL 8s
  signal: 20_000,  // the route's own signal cache has a 45s TTL
  lists: 15_000,   // trending/new: TTL 30s
};

// A token must not be able to announce itself every tick.
const VOLATILITY_COOLDOWN_MS = 90_000;
const SAMPLE_MAX = 500;

const TFS = new Set(['1m', '5m', '15m', '1h']);
const TRADES_PUSHED = 40;

const clientIp = (req) => req.ip || req.socket?.remoteAddress || 'unknown';

/**
 * The addresses a client asked for, capped. Returns the dropped count as well as the list,
 * because dropping silently is how a client ends up watching the wrong coin: it used to send
 * oldest-first, so the cap threw away the token actually on screen and nothing said so. The
 * client side of that is fixed; `hello` now reports the cap so it cannot happen quietly again.
 */
function parseAddresses(q) {
  const raw = Array.isArray(q) ? q : [q];
  const out = [];
  let dropped = 0;
  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    for (const a of entry.split(',')) {
      const addr = a.trim();
      if (!data.isValidAddress(addr) || out.includes(addr)) continue;
      if (out.length >= MAX_ADDRESSES_PER_CLIENT) { dropped += 1; continue; }
      out.push(addr);
    }
  }
  return { addresses: out, dropped };
}

/**
 * The hub. One per process in production; tests build their own with fake deps.
 * deps.data       — memecoinData (or a stand-in)
 * deps.signalFor  — async (address) => shaped signal, or null
 * deps.deliver    — (candidates, now) => void, the per-user alert feed
 * deps.now        — clock, for tests
 */
function createHub(deps = {}) {
  const d = deps.data || data;
  const now = deps.now || (() => Date.now());
  const clients = new Set();
  const byIp = new Map();
  const timers = new Map();
  const lastSent = new Map();  // dedupe key -> serialised payload
  const samples = new Map();   // address -> { price, ts, volume_5m } (previous observation)
  const volLast = new Map();   // address -> ts of the last volatility broadcast
  // What is on somebody's screen right now, which is not the same as what the hub polls:
  // `focused` is every address some client opened, `listed` is every row in the lists last
  // broadcast. The market-wide curve index produces updates for thousands of tokens nobody is
  // looking at, and these two sets are how it knows which handful to turn into frames.
  const focused = new Set();
  let listed = new Set();
  let running = false;

  // ── framing ───────────────────────────────────────────────────────────────
  function write(client, chunk) {
    if (client.closed) return;
    try {
      client.res.write(chunk);
      // A consumer that stops reading must not be allowed to buffer unboundedly in our heap.
      if (client.res.writableLength > 1_000_000) drop(client);
    } catch (_) {
      drop(client);
    }
  }

  function send(client, event, payload) {
    write(client, `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
  }

  /** Broadcast to every client `match` accepts. */
  function broadcast(event, payload, match) {
    const frame = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const c of clients) if (!match || match(c)) write(c, frame);
  }

  /** True when this payload differs from the last one broadcast under `key`. */
  function changed(key, payload) {
    const s = JSON.stringify(payload);
    if (lastSent.get(key) === s) return false;
    if (lastSent.size > 400) lastSent.clear(); // cheap bound; a cleared entry only costs one resend
    lastSent.set(key, s);
    return true;
  }

  // ── subscriptions ─────────────────────────────────────────────────────────
  /** Addresses at least one client wants, most-subscribed first, capped. */
  function watched() {
    const counts = new Map();
    for (const c of clients) for (const a of c.addresses) counts.set(a, (counts.get(a) || 0) + 1);
    return [...counts.entries()].sort((x, y) => y[1] - x[1]).slice(0, MAX_WATCHED).map(([a]) => a);
  }

  const wants = (addr) => (c) => c.addresses.has(addr);

  // The on-chain price feed subscribes to exactly what the hub is watching, so it has to be
  // told whenever that changes — which is only ever on a connect or a disconnect.
  const onWatched = deps.onWatched || ((list) => {
    try { require('./solanaPriceFeed').setWatched(list); } catch (_) { /* accelerator only */ }
  });
  let watchedKey = '';

  function syncWatched() {
    // Rebuilt before the early return below: the on-chain feed only cares about the capped
    // top-20, but every address a client opened is still being rendered.
    focused.clear();
    for (const c of clients) for (const a of c.addresses) focused.add(a);

    const list = watched();
    const key = list.join(',');
    if (key === watchedKey) return;
    watchedKey = key;
    onWatched(list);
  }

  /**
   * Is this token on somebody's screen? Asked by the market-wide curve index before it builds a
   * frame, so a push covering the whole of pump.fun costs only what is actually displayed.
   * Deliberately a set lookup: it is called once per token per flush, and recomputing the
   * watched set there would be O(clients) per token.
   */
  function isDisplayed(address) {
    return focused.has(address) || listed.has(address);
  }

  // ── ticks ─────────────────────────────────────────────────────────────────
  async function tickDetail() {
    for (const address of watched()) {
      const token = await d.getToken(address).catch(() => null);
      if (!token) continue;
      observe(token);
      if (changed(`token:${address}`, token)) broadcast('token', token, wants(address));
    }
  }

  async function tickCandles() {
    const byTf = new Map();
    // A client that is not showing a chart is not worth a series. This is the most expensive
    // tick the hub has — one getOhlcv per address per timeframe — and GeckoTerminal's keyless
    // ~6-8 calls/min is the scarcest resource in the product, so a list-only tab should not
    // spend any of it. Opt out with `candles=0`, the same shape as `lists=0`.
    for (const c of clients) {
      if (!c.candles) continue;
      for (const a of c.addresses) {
        if (!byTf.has(c.tf)) byTf.set(c.tf, new Set());
        byTf.get(c.tf).add(a);
      }
    }
    const allowed = new Set(watched());
    for (const [tf, addrs] of byTf) {
      for (const address of addrs) {
        if (!allowed.has(address)) continue;
        const candles = await d.getOhlcv(address, tf).catch(() => null);
        if (!Array.isArray(candles) || !candles.length) continue;
        // Only the newest bucket moves; sending the whole series every 10s would defeat the point.
        const candle = candles[candles.length - 1];
        if (!changed(`ohlcv:${address}:${tf}:${candle.time}`, candle)) continue;
        broadcast('candle', { address, tf, candle }, (c) => c.candles && c.tf === tf && c.addresses.has(address));
      }
    }
  }

  async function tickTrades() {
    for (const address of watched()) {
      const trades = await d.getTrades(address).catch(() => null);
      if (!Array.isArray(trades) || !trades.length) continue;
      const head = trades.slice(0, TRADES_PUSHED);
      if (!changed(`trades:${address}`, head[0])) continue;
      broadcast('trades', { address, trades: head }, wants(address));
    }
  }

  async function tickSignal() {
    const signalFor = deps.signalFor || (async (address) => {
      try { return await require('../routes/memecoins').signalFor(address); } catch (_) { return null; }
    });
    for (const address of watched()) {
      const sig = await signalFor(address).catch(() => null);
      if (!sig) continue;
      if (changed(`signal:${address}`, sig)) broadcast('signal', sig, wants(address));
    }
  }

  async function tickLists() {
    const next = [];
    for (const [list, load] of [['trending', () => d.getTrending()], ['new', () => d.getNew()]]) {
      const tokens = await load().catch(() => null);
      if (!Array.isArray(tokens) || !tokens.length) continue;
      for (const t of tokens) observe(t);
      next.push(...tokens.map((t) => t.address));
      if (changed(`list:${list}`, tokens.map((t) => [t.address, t.price, t.liquidity_usd, t.volume_5m]))) {
        broadcast('list', { list, tokens }, (c) => c.lists);
      }
    }
    // Replaced wholesale rather than added to, so a token that drops out of both lists stops
    // being pushed instead of staying live forever.
    if (next.length) listed = new Set(next);
  }

  // ── volatility ────────────────────────────────────────────────────────────
  // Every token observation the hub makes — list rows and watched-token detail alike —
  // is compared against the previous one we took ourselves. That is the only way to see
  // a 40-second doubling: the upstream 5m change still reports it as modest.
  function observe(token) {
    if (!token?.address || typeof token.price !== 'number' || !Number.isFinite(token.price)) return;
    const t = now();
    const prev = samples.get(token.address);
    if (samples.size > SAMPLE_MAX && !prev) {
      // Drop the oldest half rather than one entry, so this does not run on every insert.
      const stale = [...samples.entries()].sort((a, b) => a[1].ts - b[1].ts).slice(0, SAMPLE_MAX / 2);
      for (const [k] of stale) samples.delete(k);
    }
    samples.set(token.address, { price: token.price, ts: t, volume_5m: token.volume_5m ?? null });
    if (!prev) return;

    const last = volLast.get(token.address);
    if (last !== undefined && t - last < VOLATILITY_COOLDOWN_MS) return;
    const alert = evaluateVolatility({ prev, token, now: t });
    if (!alert) return;
    volLast.set(token.address, t);
    if (volLast.size > SAMPLE_MAX) for (const [k, v] of volLast) if (t - v > VOLATILITY_COOLDOWN_MS) volLast.delete(k);

    broadcast('volatility', alert);
    // The in-app bell feed is per user and lives in SQLite; the same candidate goes
    // through the poller's delivery so cooldowns and prefs are applied in one place.
    const deliver = deps.deliver || ((a, ts) => {
      try { require('./memecoinAlertPoller').deliverAlerts(a, ts); } catch (_) { /* feed is best-effort */ }
    });
    try { deliver([alert], t); } catch (err) { console.error('[meme-stream] alert delivery:', err.message); }
  }

  /**
   * A price read straight off the Solana bonding curve, arriving between detail ticks. It is a
   * separate event rather than a `token`: the `token` payload is a whole aggregator record and
   * the client replaces its cache entry with it, so a price-only token would blank out market
   * cap, liquidity, volume and the change figures. This carries just the price, and the client
   * folds it into the record already there.
   *
   * Deliberately NOT fed through observe(): the volatility watcher compares consecutive
   * observations, and samples arriving several times a second would turn its windows into noise.
   */
  function pushPrice(p) {
    if (!p?.address || typeof p.price !== 'number' || !Number.isFinite(p.price) || p.price <= 0) return;
    const num = (v, dflt) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : dflt);
    const frame = {
      address: p.address,
      price: p.price,
      // Market cap moves with price, so a list row that updated one and not the other would
      // contradict itself. Only sent when the producer computed it.
      ...(Number.isFinite(p.mcap) && p.mcap > 0 ? { mcap: p.mcap } : {}),
      ...(Number.isFinite(p.progress) ? { progress: p.progress } : {}),
      // Extremes and traded size since the previous frame, which is what the client needs to
      // build the forming candle: the price alone would lose a spike between two frames.
      high: num(p.high, p.price),
      low: num(p.low, p.price),
      volumeUsd: num(p.volumeUsd, 0),
      source: p.source || 'onchain',
      ts: p.ts ?? now(),
    };
    // A curve write that moves nothing (a trade too small to shift the price) is not news.
    if (!changed(`price:${p.address}`, [frame.price, frame.high, frame.low, frame.volumeUsd, frame.mcap])) return;
    // Anyone who opened this token, plus anyone showing a list it appears in: a live price on
    // the focused chart and a dead one in the row above it is the same data twice.
    broadcast('price', frame, (c) => c.addresses.has(p.address) || (c.lists && listed.has(p.address)));
  }

  /** New launches arrive from outside (Helius) rather than from a tick. */
  function pushLaunch(launch) {
    if (!launch?.address) return;
    broadcast('launch', launch, (c) => c.lists);
  }

  // ── lifecycle ─────────────────────────────────────────────────────────────
  function start() {
    if (running) return;
    running = true;
    const loop = (name, ms, fn) => {
      // The tick interval is shorter than the upstream TTLs on purpose, so a tick that has to
      // go to the network can outlive its own interval. Skip rather than overlap: setInterval
      // would otherwise stack ticks until the process is doing nothing but retrying.
      let inFlight = false;
      const t = setInterval(() => {
        if (inFlight) return;
        inFlight = true;
        fn()
          .catch((err) => console.error(`[meme-stream] ${name}:`, err.message))
          .finally(() => { inFlight = false; });
      }, ms);
      if (t.unref) t.unref();
      timers.set(name, t);
    };
    loop('detail', TICK.detail, tickDetail);
    loop('candle', TICK.candle, tickCandles);
    loop('trades', TICK.trades, tickTrades);
    loop('signal', TICK.signal, tickSignal);
    loop('lists', TICK.lists, tickLists);
    const hb = setInterval(heartbeat, HEARTBEAT_MS);
    if (hb.unref) hb.unref();
    timers.set('heartbeat', hb);
  }

  // A comment frame: valid SSE, ignored by EventSource, and enough traffic to keep
  // Railway's proxy from idling the connection out.
  function heartbeat() {
    for (const c of clients) write(c, ': ping\n\n');
  }

  function stop() {
    for (const t of timers.values()) clearInterval(t);
    timers.clear();
    running = false;
    // Nobody is watching anything, so the on-chain feed should hold no socket either.
    onWatched([]);
    watchedKey = '';
    // Nothing is watched any more, so held payloads and price history are dead weight.
    lastSent.clear();
    samples.clear();
    volLast.clear();
    focused.clear();
    listed = new Set();
  }

  function drop(client) {
    if (client.closed) return;
    client.closed = true;
    clients.delete(client);
    const n = (byIp.get(client.ip) || 1) - 1;
    if (n > 0) byIp.set(client.ip, n); else byIp.delete(client.ip);
    try { client.res.end(); } catch (_) { /* already gone */ }
    if (clients.size === 0) stop(); else syncWatched();
  }

  /** Express handler. */
  function handler(req, res) {
    const ip = clientIp(req);
    if (clients.size >= MAX_CLIENTS) {
      return res.status(503).json({ error: true, message: 'Stream capacity reached, falling back to polling.' });
    }
    if ((byIp.get(ip) || 0) >= MAX_PER_IP) {
      return res.status(429).json({ error: true, message: 'Too many open streams from this address.' });
    }

    const tf = TFS.has(req.query.tf) ? req.query.tf : '5m';
    const asked = parseAddresses(req.query.address);
    const client = {
      res,
      ip,
      tf,
      addresses: new Set(asked.addresses),
      lists: req.query.lists !== '0',
      candles: req.query.candles !== '0',
      closed: false,
    };

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // nginx-style proxies buffer otherwise and the stream never arrives
    });
    if (typeof res.flushHeaders === 'function') res.flushHeaders();
    if (typeof req.socket?.setNoDelay === 'function') req.socket.setNoDelay(true);

    clients.add(client);
    byIp.set(ip, (byIp.get(ip) || 0) + 1);

    // The browser reconnects on its own if we die; our client replaces that with capped
    // backoff, but this is the floor if it ever falls back to the default behaviour.
    write(client, 'retry: 5000\n\n');
    send(client, 'hello', {
      addresses: [...client.addresses],
      tf: client.tf,
      candles: client.candles,
      // The cap, and whether it bit. `addresses` above is authoritative either way, but saying
      // so explicitly means a client cannot lose a token to the cap without being told.
      maxAddresses: MAX_ADDRESSES_PER_CLIENT,
      truncated: asked.dropped > 0,
      dropped: asked.dropped,
      heartbeatMs: HEARTBEAT_MS,
      // Whether launches can arrive at all, so the UI need not wait for one to find out.
      // Deliberately a boolean: nothing about the upstream credential crosses this line.
      launches: Boolean(deps.launchesEnabled ? deps.launchesEnabled() : launchesEnabled()),
    });

    start();
    syncWatched();

    const cleanup = () => drop(client);
    req.on('close', cleanup);
    req.on('aborted', cleanup);
    res.on('close', cleanup);
    res.on('error', cleanup);

    // Seed from cache so a fresh connection is useful immediately rather than one tick late.
    Promise.all([tickDetail(), tickLists()]).catch(() => { /* ticks log their own failures */ });
  }

  function stats() {
    return {
      clients: clients.size, ips: byIp.size, watched: watched(), running, samples: samples.size,
      displayed: focused.size + listed.size,
      charting: [...clients].filter((c) => c.candles).length,
    };
  }

  return {
    handler, pushLaunch, pushPrice, isDisplayed, stats, broadcast, stop,
    // Test seams: the two ticks whose cost and reach these changes are about, run on demand
    // rather than on a timer.
    __clients: clients, __tickLists: tickLists, __tickCandles: tickCandles,
  };
}

function launchesEnabled() {
  try { return require('./heliusLaunches').isEnabled(); } catch (_) { return false; }
}

const hub = createHub();

module.exports = {
  createHub,
  handler: hub.handler,
  pushLaunch: hub.pushLaunch,
  pushPrice: hub.pushPrice,
  isDisplayed: hub.isDisplayed,
  stats: hub.stats,
  MAX_PER_IP,
  MAX_WATCHED,
  MAX_ADDRESSES_PER_CLIENT,
  HEARTBEAT_MS,
  TICK,
};
