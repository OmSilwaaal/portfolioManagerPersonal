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

const WINDOW_MS = 60_000;
const LIMIT_PER_MIN = 30;          // GeckoTerminal free tier
const RESERVED_OTHER = 8;          // radar discovery (3 pages/30s) plus slack for calls we cannot see
const OPPORTUNISTIC_CEILING = 14;  // low-priority work stops here so user-facing calls keep room
const MIN_GAP_MS = 400;

const calls = []; // ms timestamps, oldest first
let lastGrant = 0;

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
  if (waitFor(opts.minGapMs ?? MIN_GAP_MS, now) > 0) return false;
  if (calls.length + n > ceiling) return false;
  lastGrant = now;
  return true;
}

function _reset() {
  calls.length = 0;
  lastGrant = 0;
}

module.exports = {
  record, tryTake, waitFor, spentLastMinute, _reset,
  WINDOW_MS, LIMIT_PER_MIN, RESERVED_OTHER, OPPORTUNISTIC_CEILING, MIN_GAP_MS,
};
