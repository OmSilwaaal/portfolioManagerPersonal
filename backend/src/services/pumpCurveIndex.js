// A market-wide pump.fun price index, off ONE WebSocket subscription.
//
// Why this exists: the terminal learns what exists and what it costs by polling GeckoTerminal,
// whose keyless tier measures 6-8 calls/min from one IP. That ceiling — not our code — is what
// makes lists slow and shallow, and it cannot be raised by tuning TTLs. The paid escape
// (Geyser/LaserStream) is $499+/mo.
//
// It is not necessary. Every pump.fun bonding curve is an account owned by one program, so a
// single `programSubscribe` filtered to the BondingCurve discriminator delivers every
// pre-migration price change on the network, in the slot it happens. Measured on mainnet against
// the existing Helius key: ~40-55 curve writes/second, ~130 distinct tokens per 30s, 31 KB/s —
// about 0.08 TB/month, or 1-2% of the smallest 5 TB streaming add-on. One subscription replaces
// the polling ceiling entirely.
//
// Scope is pre-migration pump.fun only, same as solanaPriceFeed: `complete` means the curve is
// frozen and trading has moved to Raydium, so its reserves are a snapshot of the past rather
// than a price. Those tokens stay on the aggregator path.
//
// ── curve → mint ───────────────────────────────────────────────────────────────────────────
// A notification names the CURVE account, and the mint is what everything else is keyed by. The
// mint is NOT recoverable from the account: the 166-byte BondingCurve holds reserves, the
// `complete` flag and the creator pubkey, and nothing else (verified on mainnet — the pubkey at
// offset 49 does not re-derive the curve PDA). The address is a PDA of the mint, and a PDA is a
// hash, so it cannot be inverted either.
//
// So resolution is one of three things, in cost order:
//   1. Free and exact — the reverse index. curve = PDA("bonding-curve", mint), so any mint we
//      already know gives its curve offline. The index is seeded at boot from token_curve (every
//      pair this server ever resolved) and topped up from heliusLaunches, which is where the
//      newest mints — the bulk of unknown curves — arrive named and for nothing.
//   2. One batched RPC — getTokenAccountsByOwner on the curve PDA. The curve owns exactly one
//      token account, the "associated bonding curve", and it carries both the mint and its real
//      decimals, so one sub-request answers both questions a price needs. Verified on mainnet,
//      every returned mint re-deriving its own curve PDA. pump.fun mints under Token-2022 now,
//      so that is asked first and the legacy SPL program is the one-shot fallback.
//   3. Never. See the storm guards below: nothing is resolved on first sight, resolution is
//      capped per process rather than per curve, and a curve that cannot be resolved is parked.
//
// ── what this is allowed to cost ───────────────────────────────────────────────────────────
// A market-wide index writes a row per mint on a volume that has already filled once in
// production and taken the service down, so the budget is part of the design:
//
//   disk   — token_curve is capped at 200_000 rows (PUMP_CURVE_MAX_ROWS tunes it) and pruned
//            oldest-updated-first on every write batch. Measured at 690 bytes a row in steady
//            state, that is ~140 MB at the cap and cannot exceed it: a capped table settles at
//            a fixed page count and reuses its freelist rather than climbing. SQLite never
//            shrinks a file on DELETE, so the cap is enforced on the way IN. See tokenIndex,
//            which carries the measurement and the two figures it depends on.
//   writes — one batched transaction every 10s, not one per update: 0.1 Hz of WAL churn instead
//            of 50 Hz. A failed write means the volume is full, so writing pauses for a minute
//            rather than retrying into an outage. Frames keep flowing; they never needed disk.
//   heap   — at most MAX_DIRTY coalesced observations (~1 MB) and MAX_KNOWN curve->mint pairs.
//   network— one socket, ~31-36 KB/s, and at most 1.33 resolve requests/second carrying 10
//            sub-requests, which is the measured ceiling before Helius returns 429.
//
// ── nothing here is a dependency ───────────────────────────────────────────────────────────
// Opt-in via ENABLE_PUMP_CURVE_INDEX=true AND a key, exactly as the launch watcher is gated.
// With neither, createIndex returns an inert object, the server boots unchanged and every
// existing path runs at today's cadence.
//
// The key is read from the environment here and nowhere else. It travels only inside the
// socket/request URL, is never logged (see heliusLaunches' redact) and never appears in anything
// emitted to a client.

const crypto = require('crypto');
const { PublicKey } = require('@solana/web3.js');
const { redact, PUMP_FUN_PROGRAM } = require('./heliusLaunches');
const { createHeliusSocket } = require('./heliusSocket');
const { decodeCurve, priceSolFromCurve, curveAddress, FALLBACK_DECIMALS } = require('./solanaPriceFeed');
const tokenIndex = require('./tokenIndex');
const data = require('./memecoinData');

const HELIUS_RPC = 'https://mainnet.helius-rpc.com';

// Anchor prefixes every account with sha256("account:<Name>")[0..8]. Filtering on that rather
// than on dataSize is both exact and version-proof: it admits the 151-byte curves of older
// tokens and the 166-byte ones minted today, and it excludes the other pump.fun account types
// (137, 256 and 600 bytes were all observed on the same program) instead of hoping their sizes
// never collide. A wrong dataSize fails SILENTLY — it returns zero events, which reads as "no
// activity" rather than as an error — so there is real value in not guessing a length at all.
const CURVE_DISCRIMINATOR = crypto.createHash('sha256').update('account:BondingCurve').digest().subarray(0, 8);

const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

const SOL_DECIMALS = 9;

// pump.fun seeds every standard curve with 793.1M real tokens and they fall to zero at
// migration, which is the only reason a "how close to migrating" figure is computable from one
// account read. A curve built to different parameters would give a nonsense ratio, so anything
// outside [0,1] is reported as unknown rather than clamped into looking plausible.
const INITIAL_REAL_TOKENS = 793_100_000_000_000;

// ── back-pressure ceilings ──────────────────────────────────────────────────
// Measured load is ~40-55 updates/s. Every ceiling below is set well above that, because the
// cost of being wrong is unbounded memory in a mania, and set at all, because "it was fine in
// testing" is not a bound.

// Absolute intake limit. Past this many notifications in a wall-clock second the rest of that
// second is dropped — ~25x measured, so it only engages if the market changes character or the
// filter ever matches more than we think. Dropping is correct: a price superseded inside the
// same second was never going to be emitted anyway.
const MAX_UPDATES_PER_SEC = 1_500;

// Coalescing: the newest state per mint, held in memory and drained on two different clocks.
// A mint written 300 times between flushes costs one frame and one row, and that is the only
// reason 50+ writes/second is cheap.
//
// The two clocks are deliberately far apart, and the reason is disk rather than CPU. A frame is
// free and wants to be live, so emitting runs at chart speed. A row costs a WAL write on a
// volume that has already filled once in production, so persisting runs at archive speed: 10s
// granularity is indistinguishable in a list of what is trading, and it is 1/10th the write
// churn of the obvious design.
const EMIT_MS = 1_000;
const PERSIST_MS = 10_000;
// Rows per persist, newest activity first. One transaction of this size is single-digit
// milliseconds; the cap exists so a backlog drains at a bounded rate rather than blocking the
// event loop in one enormous transaction.
const MAX_PERSIST_ROWS = 1_500;
// Dirty mints held in memory. ~130 distinct curves per 30s makes this many minutes of backlog;
// past it new mints are dropped rather than queued, and the counter says so. At roughly 200
// bytes of object per entry this is ~1 MB of heap at the cap.
const MAX_DIRTY = 4_000;
// A failed write means the volume is full. Stop writing for this long rather than retrying every
// persist: the rows are an accelerator, and hammering a full disk is how an outage gets worse.
// Everything else — the socket, the frames, the reverse index — keeps working meanwhile.
const DISK_BACKOFF_MS = 60_000;

// ── curve → mint resolution, and what stops a request storm ─────────────────
// A curve is not resolved the first time it is seen: a single write in a window is a dead or
// one-trade token, while anything tradeable writes repeatedly. This alone removed ~40% of
// candidates in a measured 30s window (55 of 129 curves were seen exactly once).
const MIN_HITS_TO_RESOLVE = 2;
// At most ONE HTTP request per interval for the whole process — not per curve. This is the hard
// ceiling: 1.33 req/s, whatever the market does.
const RESOLVE_INTERVAL_MS = 750;
// Curves per request, one JSON-RPC sub-request each. Measured against Helius on this plan: a
// batch of 10 every 750ms runs indefinitely at 200, a batch of 20 returns 429 on the SECOND
// call, and 40 is refused outright — the limiter counts sub-requests, not HTTP requests. So 10
// is the measured safe batch, giving ~13 resolutions/second sustained.
const RESOLVE_BATCH = 10;
// A 429 or a 5xx means we are asking too fast, so the whole resolver backs off rather than
// re-offering at the same rate. Without this the queue simply hammers a limiter that is already
// saying no, which is the same request storm by a different route.
const RESOLVE_BACKOFF_MAX_MS = 30_000;
// Candidates waiting. Past this the coldest is dropped: it will be re-offered the next time it
// trades, so nothing is lost permanently and the queue cannot grow without bound.
const RESOLVE_QUEUE_MAX = 2_000;
// A curve that cannot be resolved is retried twice, then parked. Parked curves are remembered so
// the same unresolvable account cannot be re-queued every time it trades.
const MAX_RESOLVE_ATTEMPTS = 3;
const PARK_MS = 30 * 60_000;
const MAX_PARKED = 20_000;

// Reverse index size. Each entry is two base58 strings; 50k is a few MB and more pump.fun
// tokens than trade in a day.
const MAX_KNOWN = 50_000;

// memecoinData caches SOL/USD for 15s, so refreshing on the same cadence costs nothing and
// means the notification handler never awaits.
const SOL_REFRESH_MS = 15_000;
// Launches arrive named and already keyed by mint, so folding them in is free resolution.
const LAUNCH_ABSORB_MS = 5_000;

/** Gated exactly like the launch watcher: the flag AND a key, so a stray key cannot switch it on. */
function isEnabled(env = process.env) {
  return env.ENABLE_PUMP_CURVE_INDEX === 'true' && Boolean(env.HELIUS_API_KEY);
}

/**
 * How full the curve is, 0..1, or null when the account does not look like a standard curve.
 * Worth having off the same read: "about to migrate" is the one thing a pre-migration trader
 * cares about that a price does not say.
 */
function curveProgress(curve) {
  if (!curve) return null;
  const left = Number(curve.realTokenReserves) / INITIAL_REAL_TOKENS;
  if (!Number.isFinite(left)) return null;
  const p = 1 - left;
  return p >= 0 && p <= 1 ? p : null;
}

/** Market cap in USD from the curve's own supply figure, or null. */
function curveMcap(curve, priceUsd, decimals) {
  if (!curve || !Number.isFinite(priceUsd) || priceUsd <= 0) return null;
  const dp = Number.isInteger(decimals) && decimals >= 0 && decimals <= 18 ? decimals : FALLBACK_DECIMALS;
  const supply = Number(curve.tokenTotalSupply) / 10 ** dp;
  if (!(supply > 0)) return null;
  const mcap = supply * priceUsd;
  return Number.isFinite(mcap) ? mcap : null;
}

/** An inert index, so no caller has to branch on whether the feature is configured. */
function inert(reason) {
  return {
    name: 'pump-curve-index',
    enabled: false,
    reason,
    start() {},
    stop() {},
    noteMint() { return false; },
    stats: () => ({ enabled: false, reason, connected: false, known: 0, dirty: 0 }),
  };
}

/**
 * opts.onPrice   — ({ address, price, priceSol, ... }) => void, defaults to the SSE hub
 * opts.isDisplayed — (address) => boolean; only what a client can actually see is emitted
 * opts.store     — tokenIndex stand-in, for tests
 * opts.createSocket / fetchImpl / now / setTimer / clearTimer / log — for tests
 */
function createIndex(env = process.env, opts = {}) {
  if (env.ENABLE_PUMP_CURVE_INDEX !== 'true') return inert('ENABLE_PUMP_CURVE_INDEX != true');
  const key = env.HELIUS_API_KEY;
  if (!key) return inert('HELIUS_API_KEY not set');

  const store = opts.store || tokenIndex;
  const d = opts.data || data;
  const now = opts.now || (() => Date.now());
  const setTimer = opts.setTimer || setTimeout;
  const clearTimer = opts.clearTimer || clearTimeout;
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  const log = opts.log || console;
  const emitMs = opts.emitMs ?? EMIT_MS;
  const persistMs = opts.persistMs ?? PERSIST_MS;
  const resolveIntervalMs = opts.resolveIntervalMs ?? RESOLVE_INTERVAL_MS;
  const minHits = opts.minHitsToResolve ?? MIN_HITS_TO_RESOLVE;

  const onPrice = opts.onPrice || ((p) => {
    try { require('./memecoinStream').pushPrice(p); } catch (_) { /* accelerator only */ }
  });
  // Market-wide means most updates are for tokens nobody is looking at. They are all stored;
  // only what some connected client actually renders is turned into a frame.
  const isDisplayed = opts.isDisplayed || ((address) => {
    try { return require('./memecoinStream').isDisplayed(address); } catch (_) { return false; }
  });

  const known = new Map();      // curve -> { mint, decimals }
  const sightings = new Map();  // curve -> hits, for curves not yet worth a request
  const parked = new Map();     // curve -> { attempts, until }, the negative cache
  const queued = new Set();     // curves waiting on, or in, a request
  const inFlight = new Set();
  // Curves that came back empty under Token-2022 and get one try under the legacy SPL program.
  // pump.fun mints under Token-2022 today, so 2022 is asked first and legacy is the exception.
  const legacy = new Set();
  const dirty = new Map();      // mint -> newest observation, flushed on a timer

  let flushTimer = null;
  let resolveTimer = null;
  let solTimer = null;
  let launchTimer = null;
  let solUsd = null;
  let started = false;
  let stopped = false;
  let subId = null;
  let reqId = null;
  let nextId = 1;
  let launchHighWater = 0;

  const counts = {
    updates: 0, completed: 0, unknown: 0, resolved: 0, resolveFails: 0,
    droppedRate: 0, droppedDirty: 0, rows: 0, frames: 0, requests: 0, bytes: 0,
    writeFails: 0, resolveThrottled: 0,
  };
  let diskBlockedUntil = 0;
  let resolveBlockedUntil = 0;
  let resolveBackoff = 0;
  let secWindow = 0;
  let secCount = 0;

  // ── the reverse index ─────────────────────────────────────────────────────
  function remember(curve, mint, decimals) {
    if (known.size >= MAX_KNOWN) {
      // Insertion order is roughly chronological; the oldest eighth is the cheapest to forget
      // and re-resolving one costs a single batched sub-request.
      let n = Math.floor(MAX_KNOWN / 8);
      for (const k of known.keys()) { known.delete(k); if (--n <= 0) break; }
    }
    known.set(curve, { mint, decimals: Number.isInteger(decimals) ? decimals : null });
    sightings.delete(curve);
    parked.delete(curve);
  }

  /**
   * Register a mint we learned about elsewhere. Pure arithmetic — seed, mint and program id give
   * the curve offline — so this is free resolution for anything already named.
   */
  function noteMint(mint, decimals = null) {
    if (!d.isValidAddress(mint)) return false;
    const curve = curveAddress(mint);
    if (!curve) return false;
    const had = known.get(curve);
    remember(curve, mint, decimals ?? had?.decimals ?? null);
    return true;
  }

  /** Every pair this server has already resolved, so a restart asks the network for nothing. */
  function seedFromStore() {
    let n = 0;
    try {
      for (const r of store.curveMints(MAX_KNOWN)) {
        if (!d.isValidAddress(r?.address) || !d.isValidAddress(r?.curve)) continue;
        known.set(r.curve, { mint: r.address, decimals: Number.isInteger(r.decimals) ? r.decimals : null });
        // A curve already recorded as migrated is never priced again, so park it rather than
        // spend an update on it every time something touches the account.
        if (r.complete) parked.set(r.curve, { attempts: MAX_RESOLVE_ATTEMPTS, until: Infinity });
        n += 1;
      }
    } catch (err) {
      log.error('[pump-index] seed:', redact(err.message));
    }
    return n;
  }

  /** New launches come with their mint, so absorbing them pre-empts a resolve request each. */
  function absorbLaunches() {
    try {
      const { recentLaunches } = require('./heliusLaunches');
      let high = launchHighWater;
      for (const l of recentLaunches(200)) {
        const ts = Number(l?.ts) || 0;
        if (ts <= launchHighWater) continue;
        if (ts > high) high = ts;
        noteMint(l.address);
      }
      launchHighWater = high;
    } catch (_) { /* the launch watcher is optional; resolution just falls back to RPC */ }
  }

  // ── intake ────────────────────────────────────────────────────────────────
  /**
   * One curve write. Synchronous and O(1) by design: this is the hot path, and anything that
   * awaited here would let the socket's receive queue grow while we worked.
   */
  function onCurve(curvePubkey, b64, slot) {
    // Hard intake ceiling, per wall-clock second. See MAX_UPDATES_PER_SEC.
    const t = now();
    const sec = Math.floor(t / 1000);
    if (sec !== secWindow) { secWindow = sec; secCount = 0; }
    if (++secCount > MAX_UPDATES_PER_SEC) { counts.droppedRate += 1; return; }
    counts.updates += 1;

    let curve;
    try { curve = decodeCurve(Buffer.from(b64, 'base64')); } catch (_) { return; }
    if (!curve) return;

    const hit = known.get(curvePubkey);

    if (curve.complete) {
      // Migrated to Raydium. The account is frozen from here on, so its reserves are history,
      // not a price: never emit it, never resolve it, and record the flag once so a lookup knows
      // to use the aggregator path. Parking it keeps the rest of this function off it for good.
      counts.completed += 1;
      const already = parked.get(curvePubkey);
      parked.set(curvePubkey, { attempts: MAX_RESOLVE_ATTEMPTS, until: Infinity });
      sightings.delete(curvePubkey);
      // Record the migration once. The account is frozen, so a second write of the same fact
      // would be a store round-trip that changes nothing.
      if (hit && !(already && already.until === Infinity) && dirty.size < MAX_DIRTY) {
        dirty.set(hit.mint, {
          address: hit.mint, curve: curvePubkey, decimals: hit.decimals, complete: true,
          priceSol: null, priceUsd: null, mcap: null, vSol: null, vToken: null, progress: null,
          slot, ts: t, hits: 1,
        });
      }
      return;
    }

    if (!hit) { offerForResolve(curvePubkey); return; }

    const priceSol = priceSolFromCurve(curve, hit.decimals ?? FALLBACK_DECIMALS);
    if (priceSol === null) return;
    const priceUsd = solUsd ? priceSol * solUsd : null;

    const prev = dirty.get(hit.mint);
    if (!prev && dirty.size >= MAX_DIRTY) { counts.droppedDirty += 1; return; }

    dirty.set(hit.mint, {
      address: hit.mint,
      curve: curvePubkey,
      decimals: hit.decimals,
      complete: false,
      priceSol,
      priceUsd,
      mcap: curveMcap(curve, priceUsd, hit.decimals),
      vSol: Number(curve.virtualSolReserves) / 10 ** SOL_DECIMALS,
      vToken: Number(curve.virtualTokenReserves) / 10 ** (hit.decimals ?? FALLBACK_DECIMALS),
      progress: curveProgress(curve),
      slot,
      ts: t,
      // Coalescing must not lose the fact that a token traded 300 times; the count is what
      // ranks "busiest right now" without storing every write.
      hits: (prev?.hits || 0) + 1,
      // The extremes inside the window, so a spike between two flushes is not flattened away.
      hiSol: prev ? Math.max(prev.hiSol ?? priceSol, priceSol) : priceSol,
      loSol: prev ? Math.min(prev.loSol ?? priceSol, priceSol) : priceSol,
    });
  }

  /** A curve we cannot name yet. Everything that stops a request storm is in here. */
  function offerForResolve(curve) {
    counts.unknown += 1;
    if (queued.has(curve)) return;
    // The parked entry is NOT removed when its cooldown expires: it carries the attempt count,
    // and forgetting that is how "retry twice then park" silently becomes "retry forever". A
    // curve past its cooldown is retried once and parked again, so the steady state for
    // something unresolvable is one request per PARK_MS, not one per trade.
    const p = parked.get(curve);
    if (p && (p.until === Infinity || now() < p.until)) return;
    // Not on first sight: one write in a window is a dead token, and resolving it would spend a
    // request to learn the name of something that will never trade again.
    const hits = (sightings.get(curve) || 0) + 1;
    if (hits < minHits) {
      if (sightings.size < RESOLVE_QUEUE_MAX * 4) sightings.set(curve, hits);
      return;
    }
    sightings.delete(curve);
    if (queued.size >= RESOLVE_QUEUE_MAX) return; // re-offered next time it trades
    queued.add(curve);
  }

  // ── resolution ────────────────────────────────────────────────────────────
  async function rpc(body) {
    counts.requests += 1;
    const res = await fetchImpl(`${HELIUS_RPC}/?api-key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw Object.assign(new Error(`http ${res.status}`), { status: res.status });
    return res.json();
  }

  function park(curve) {
    const p = parked.get(curve) || { attempts: 0, until: 0 };
    p.attempts += 1;
    // Two retries, then out of the way for half an hour. An account that owns no token account
    // is not a bonding curve we can price, and asking again every time it trades is the storm.
    p.until = p.attempts >= MAX_RESOLVE_ATTEMPTS ? now() + PARK_MS : 0;
    if (parked.size >= MAX_PARKED) {
      let n = Math.floor(MAX_PARKED / 8);
      for (const k of parked.keys()) { parked.delete(k); if (--n <= 0) break; }
    }
    parked.set(curve, p);
    counts.resolveFails += 1;
  }

  /**
   * One batched request for up to RESOLVE_BATCH curves. getTokenAccountsByOwner on the curve PDA
   * returns the associated bonding-curve token account, which carries the mint AND its real
   * decimals — so one sub-request answers both questions the price needs.
   */
  async function resolveTick() {
    if (stopped || inFlight.size) return;
    if (now() < resolveBlockedUntil) return;
    const batch = [];
    for (const c of queued) {
      if (batch.length >= RESOLVE_BATCH) break;
      batch.push(c);
    }
    if (!batch.length) return;
    for (const c of batch) inFlight.add(c);

    // One sub-request per curve, because the limiter counts sub-requests. Token-2022 first; a
    // curve that came back empty there is retried once under the legacy program, since a miss on
    // the wrong program is indistinguishable from "no such account".
    const reqs = batch.map((c, i) => ({
      jsonrpc: '2.0',
      id: i,
      method: 'getTokenAccountsByOwner',
      params: [c, { programId: legacy.has(c) ? TOKEN_PROGRAM : TOKEN_2022_PROGRAM },
        { encoding: 'jsonParsed', commitment: 'processed' }],
    }));

    let body;
    try {
      body = await rpc(reqs);
      resolveBackoff = 0;
    } catch (err) {
      for (const c of batch) inFlight.delete(c);
      // A transport failure or a limiter saying no is not the curve's fault, so it is not held
      // against it: requeued without an attempt. But asking again at the same rate is pointless,
      // so the resolver itself backs off, capped.
      resolveBackoff = Math.min(RESOLVE_BACKOFF_MAX_MS, Math.max(resolveIntervalMs * 2, resolveBackoff * 2));
      resolveBlockedUntil = now() + resolveBackoff;
      counts.resolveThrottled += 1;
      log.error(`[pump-index] resolve (backing off ${resolveBackoff}ms):`, redact(err.message));
      return;
    }

    const got = new Set();
    const retryLegacy = new Set();
    for (const r of Array.isArray(body) ? body : [body]) {
      const curve = batch[Number(r?.id)];
      if (!curve || got.has(curve)) continue;
      const info = r?.result?.value?.[0]?.account?.data?.parsed?.info;
      const mint = info?.mint;
      if (!d.isValidAddress(mint)) {
        // Empty under Token-2022: worth one look under the legacy program before giving up.
        if (!legacy.has(curve) && legacy.size < RESOLVE_QUEUE_MAX) retryLegacy.add(curve);
        continue;
      }
      // The mint has to re-derive the curve we asked about. Without this check a wrong or
      // reordered reply would quietly index prices against the wrong token, which is worse than
      // having no price at all.
      if (curveAddress(mint) !== curve) continue;
      const dp = info?.tokenAmount?.decimals;
      remember(curve, mint, Number.isInteger(dp) ? dp : null);
      got.add(curve);
      counts.resolved += 1;
    }

    for (const c of batch) {
      inFlight.delete(c);
      if (got.has(c)) { legacy.delete(c); queued.delete(c); continue; }
      if (retryLegacy.has(c)) { legacy.add(c); continue; } // stays queued for one more round
      legacy.delete(c);
      queued.delete(c);
      park(c);
    }
  }

  // ── emit, and separately persist ──────────────────────────────────────────
  /**
   * Turn the newest observation per mint into a frame, for the handful of mints a client can
   * actually see. Does not touch the dirty set's membership: persisting owns that, on its own
   * slower clock. `emitted` is what stops the same unchanged price going out every second.
   */
  function emit() {
    if (!dirty.size) return 0;
    let n = 0;
    const usd = solUsd || 0;
    for (const v of dirty.values()) {
      if (v.emitted === v.ts) continue;
      if (v.complete || !Number.isFinite(v.priceUsd) || v.priceUsd <= 0) { v.emitted = v.ts; continue; }
      if (!isDisplayed(v.address)) continue; // not emitted-marked: it may come on screen later
      v.emitted = v.ts;
      n += 1;
      counts.frames += 1;
      try {
        onPrice({
          address: v.address,
          price: v.priceUsd,
          priceSol: v.priceSol,
          high: (v.hiSol ?? v.priceSol) * usd,
          low: (v.loSol ?? v.priceSol) * usd,
          mcap: v.mcap,
          progress: v.progress,
          source: 'pumpfun-curve',
          ts: v.ts,
          slot: v.slot,
        });
      } catch (err) {
        log.error('[pump-index] emit:', redact(err.message));
      }
      // The extremes belong to the window just reported, so the next one starts fresh rather
      // than carrying a spike forward forever.
      v.hiSol = v.priceSol;
      v.loSol = v.priceSol;
    }
    return n;
  }

  /**
   * Drain the coalesced observations to SQLite: one transaction for the batch, capped, so a
   * backlog drains at a bounded rate. Stops entirely for DISK_BACKOFF_MS if the volume is full —
   * the frames above keep flowing, because they never needed the disk.
   */
  function persist() {
    if (!dirty.size) return 0;
    const t = now();
    if (t < diskBlockedUntil) return 0;

    const batch = [];
    if (dirty.size <= MAX_PERSIST_ROWS) {
      for (const v of dirty.values()) batch.push(v);
    } else {
      // Behind: take the most recently traded first. A row that has not moved for a while is the
      // one that can wait, and it stays dirty rather than being dropped.
      batch.push(...[...dirty.values()].sort((a, b) => b.ts - a.ts).slice(0, MAX_PERSIST_ROWS));
    }

    try {
      counts.rows += store.recordCurves(batch, t);
    } catch (err) {
      counts.writeFails += 1;
      diskBlockedUntil = t + DISK_BACKOFF_MS;
      log.error(`[pump-index] store write failed, pausing writes ${DISK_BACKOFF_MS / 1000}s:`, redact(err.message));
      // The batch stays dirty. It is bounded by MAX_DIRTY, so a long outage costs a fixed amount
      // of heap and the newest prices win when writing resumes.
      return 0;
    }
    for (const v of batch) dirty.delete(v.address);
    return batch.length;
  }

  // ── socket ────────────────────────────────────────────────────────────────
  function subscribe() {
    if (subId !== null || reqId !== null) return;
    const id = nextId++;
    const ok = sock.send({
      jsonrpc: '2.0',
      id,
      method: 'programSubscribe',
      params: [PUMP_FUN_PROGRAM, {
        encoding: 'base64',
        // `processed`, like solanaPriceFeed: a swap's own slot is the whole point, and a price
        // that is re-org'd away is corrected by the next write a moment later.
        commitment: 'processed',
        filters: [{ memcmp: { offset: 0, bytes: CURVE_DISCRIMINATOR.toString('base64'), encoding: 'base64' } }],
      }],
    });
    if (ok) reqId = id;
  }

  function onMessage(raw) {
    counts.bytes += raw?.length || 0;
    let msg;
    try { msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString()); } catch (_) { return; }

    if (msg.method === 'programNotification') {
      if (msg.params?.subscription !== subId) return;
      const value = msg.params?.result?.value;
      const b64 = Array.isArray(value?.account?.data) ? value.account.data[0] : null;
      if (value?.pubkey && b64) onCurve(value.pubkey, b64, msg.params?.result?.context?.slot ?? null);
      return;
    }

    if (msg.id === undefined || msg.id !== reqId) return;
    reqId = null;
    if (msg.error) {
      // Worth shouting about: a rejected filter leaves the index silent, which looks exactly
      // like a quiet market.
      log.error('[pump-index] programSubscribe rejected:', redact(msg.error.message));
      return;
    }
    if (typeof msg.result === 'number') subId = msg.result;
  }

  const sock = createHeliusSocket({
    key,
    tag: 'pump-index',
    now,
    setTimer,
    clearTimer,
    log,
    createSocket: opts.createSocket,
    shouldConnect: () => started && !stopped,
    onMessage,
    onOpen: subscribe,
    onDrop: () => { subId = null; reqId = null; },
  });

  // ── timers ────────────────────────────────────────────────────────────────
  async function refreshSolUsd() {
    try {
      const p = await d.getSolPrice();
      if (typeof p === 'number' && Number.isFinite(p) && p > 0) solUsd = p;
    } catch (_) { /* keep the last known price; a missing one costs these rows their USD figure */ }
  }

  // A self-rearming interval, so a slow tick can never stack on itself the way setInterval
  // would. The handle lives in a box because each tick replaces it.
  function every(ms, fn) {
    const slot = { t: null };
    const tick = () => {
      try { fn(); } catch (err) { log.error('[pump-index] tick:', redact(err.message)); }
      slot.t = setTimer(tick, ms);
      if (slot.t?.unref) slot.t.unref();
    };
    slot.t = setTimer(tick, ms);
    if (slot.t?.unref) slot.t.unref();
    return slot;
  }

  const timers = [];

  function start() {
    if (started || stopped) return;
    started = true;
    const seeded = seedFromStore();
    absorbLaunches();
    refreshSolUsd();
    timers.push(every(emitMs, emit));
    timers.push(every(persistMs, persist));
    timers.push(every(resolveIntervalMs, () => { resolveTick().catch(() => { /* logged inside */ }); }));
    timers.push(every(SOL_REFRESH_MS, refreshSolUsd));
    timers.push(every(LAUNCH_ABSORB_MS, absorbLaunches));
    sock.connect();
    log.log(`[pump-index] market-wide pump.fun curves on (${seeded} curve->mint pairs from the index)`);
  }

  function stop() {
    stopped = true;
    started = false;
    sock.stop();
    for (const s of timers) clearTimer(s.t);
    timers.length = 0;
    dirty.clear();
    queued.clear();
    inFlight.clear();
    legacy.clear();
    sightings.clear();
  }

  function stats() {
    return {
      enabled: true,
      connected: sock.connected(),
      subscribed: subId !== null,
      attempts: sock.attempts(),
      known: known.size,
      dirty: dirty.size,
      queued: queued.size,
      parked: parked.size,
      sightings: sightings.size,
      solUsd: solUsd !== null,
      // The disk budget, visible in production rather than only in a comment.
      disk: store.curveFootprint(),
      writesPaused: now() < diskBlockedUntil,
      resolvePaused: now() < resolveBlockedUntil,
      legacy: legacy.size,
      ...counts,
    };
  }

  return {
    name: 'pump-curve-index',
    enabled: true,
    start,
    stop,
    stats,
    noteMint,
    // Test seams: the pure intake and drain steps, without a socket or a clock.
    __onCurve: onCurve,
    __onMessage: onMessage,
    __emit: emit,
    __persist: persist,
    __resolveTick: resolveTick,
    __absorbLaunches: absorbLaunches,
  };
}

// ── process singleton ───────────────────────────────────────────────────────
let live = null;

/** Wiring for index.js: says which way it went, exactly as the launch watcher does. */
function startPumpCurveIndex(opts = {}, env = process.env, log = console) {
  const idx = createIndex(env, opts);
  live = idx;
  if (!idx.enabled) {
    log.log(`[pump-index] disabled (${idx.reason})`);
    return idx;
  }
  idx.start();
  return idx;
}

/** Safe to call unconditionally: an unconfigured index reports itself off rather than throwing. */
function stats() {
  try { return live ? live.stats() : { enabled: false, reason: 'not started' }; } catch (_) {
    return { enabled: false, reason: 'unavailable' };
  }
}

/** Free resolution for a mint learned elsewhere. A no-op when the index is off. */
function noteMint(mint, decimals) {
  try { return Boolean(live?.enabled) && live.noteMint(mint, decimals); } catch (_) { return false; }
}

module.exports = {
  createIndex,
  startPumpCurveIndex,
  isEnabled,
  stats,
  noteMint,
  curveProgress,
  curveMcap,
  CURVE_DISCRIMINATOR,
  PUMP_FUN_PROGRAM,
  MAX_UPDATES_PER_SEC,
  MAX_DIRTY,
  MAX_PERSIST_ROWS,
  EMIT_MS,
  PERSIST_MS,
  DISK_BACKOFF_MS,
  MIN_HITS_TO_RESOLVE,
  RESOLVE_BATCH,
  RESOLVE_QUEUE_MAX,
  RESOLVE_BACKOFF_MAX_MS,
  INITIAL_REAL_TOKENS,
};
