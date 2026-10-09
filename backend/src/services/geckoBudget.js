// One process-wide view of how much GeckoTerminal quota the last minute has spent.
//
// The free tier is ~30 calls/min and three places spend it: the discovery lists and OHLCV in
// services/memecoinData, the signal route's per-token OHLCV (routes/memecoins keeps its own
// sub-budget on top of this one), and radar/collector, which fetches new_pools on its own axios
// client and is therefore invisible here — hence RESERVED_OTHER.
//
// Two lanes, because the two kinds of call want opposite things:
//   record()  a call that is happening regardless; somebody is waiting on it. Accounting only.
//   tryTake() permission for opportunistic work. It yields to recorded traffic and refuses rather
//             than queueing, because every caller of it already has a cached page to serve instead.
// A handful of rapid calls is enough to get a 429 even well under 30/min, so the opportunistic
// lane is also spaced out (MIN_GAP_MS / waitFor).
//
// Counting what is left is not enough on its own, because the limit is upstream's and shared: a
// prefetch that is "within budget" still consumes the capacity the chart the user is staring at
// needs. So the opportunistic lane also stands down outright — while a user-facing call is in
// flight (beginUserCall) and for a while after upstream refuses anything (note429). Measured from
// one IP the keyless tier starts refusing well under its documented 30/min, so standing down is
// the only thing that reliably leaves room.

const WINDOW_MS = 60_000;
const LIMIT_PER_MIN = 30;          // GeckoTerminal free tier
const RESERVED_OTHER = 8;          // radar discovery (3 pages/30s) plus slack for calls we cannot see
// Measured, not documented: from one IP the keyless tier starts refusing at roughly 6-8 calls in a
// minute, nowhere near its published 30. Clicking eight freshly listed coins straight after a cold
// list load produced 2 charts out of 8 with the deep-page prefetch running and 6 out of 8 with it
// switched off, on the same code minutes apart. So the opportunistic lane's share has to be a small
// fraction of what we can see, not most of it.
// With a CoinGecko key the published 30/min is real and enforced per key rather than per IP, so the
// opportunistic lane can have back the share it had before the keyless reality forced it down. Read
// from the environment rather than imported, because memecoinData already depends on this module.
const KEYED = Boolean(process.env.COINGECKO_API_KEY);
const OPPORTUNISTIC_CEILING = KEYED ? 14 : 6; // low-priority work stops here so user-facing calls keep room
const MIN_GAP_MS = 400;
// After a 429 the whole opportunistic lane waits this out. Long enough that the next chart click
// is not competing with a prefetch for the first capacity that frees up; short enough that the
// deep pages still refresh on a quiet terminal.
const COOLOFF_MS = 20_000;
const COOLOFF_MAX_MS = 60_000;

const calls = []; // ms timestamps, oldest first
let lastGrant = 0;
let inFlightUser = 0;
let coolOffUntil = 0;

function trim(now) {
  while (calls.length && calls[0] <= now - WINDOW_MS) calls.shift();
}

/** Account for n calls that are happening regardless. */
function record(n = 1, now = Date.now()) {
  trim(now);
  for (let i = 0; i < n; i++) calls.push(now);
}

/** Calls known to this process in the last minute. */
function spentLastMinute(now = Date.now()) {
  trim(now);
  return calls.length;
}

/**
 * A call somebody is waiting on is starting. The returned function marks it finished; until then
 * the opportunistic lane refuses, so a prefetch cannot take the slot the chart is about to use.
 */
function beginUserCall() {
  inFlightUser += 1;
  let done = false;
  return () => { if (!done) { done = true; inFlightUser = Math.max(0, inFlightUser - 1); } };
}

/**
 * Upstream refused a call. `retryAfterMs` is what it said, if anything — the keyless tier answers
 * `retry-after: 0`, which is fine for the one caller that is waiting but says nothing about the
 * limit being clear, hence the floor.
 */
function note429(retryAfterMs = 0, now = Date.now()) {
  const ra = Number(retryAfterMs);
  const wait = Math.min(Math.max(Number.isFinite(ra) ? ra : 0, COOLOFF_MS), COOLOFF_MAX_MS);
  coolOffUntil = Math.max(coolOffUntil, now + wait);
}


/** True while the lane is standing down after a 429. */
function coolingOff(now = Date.now()) { return now < coolOffUntil; }

/** ms of cool-off left (0 = none). Worth telling a client, so it does not retry into a full limit. */
function coolOffRemaining(now = Date.now()) { return Math.max(0, coolOffUntil - now); }

/** Calls somebody is waiting on right now. */
function userCallsInFlight() { return inFlightUser; }

/** ms until the opportunistic lane's spacing allows another call (0 = now). */
function waitFor(minGapMs = MIN_GAP_MS, now = Date.now()) {
  return Math.max(0, lastGrant + minGapMs - now);
}

/**
 * Permission for n opportunistic calls. Refuses instead of waiting; a refusal means
 * "serve what you already have".
 *
 * A grant is not counted here — the call it authorises records itself a moment later. Nothing is
 * lost to that gap because the spacing above lets only one grant be outstanding at a time.
 */
function tryTake(n = 1, opts = {}) {
  const now = opts.now ?? Date.now();
  const ceiling = Math.min(opts.ceiling ?? OPPORTUNISTIC_CEILING, LIMIT_PER_MIN - RESERVED_OTHER);
  trim(now);
  if (inFlightUser > 0 || coolingOff(now)) return false;
  if (waitFor(opts.minGapMs ?? MIN_GAP_MS, now) > 0) return false;
  if (calls.length + n > ceiling) return false;
  lastGrant = now;
  return true;
}

function _reset() {
  calls.length = 0;
  lastGrant = 0;
  inFlightUser = 0;
  coolOffUntil = 0;
}

module.exports = {
  record, tryTake, waitFor, spentLastMinute, beginUserCall, note429, coolingOff, coolOffRemaining,
  userCallsInFlight, _reset,
  WINDOW_MS, LIMIT_PER_MIN, RESERVED_OTHER, OPPORTUNISTIC_CEILING, MIN_GAP_MS, COOLOFF_MS, COOLOFF_MAX_MS,
};
