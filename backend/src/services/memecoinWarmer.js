// Keeps the handful of keys everybody actually reads from going cold.
//
// Why this is not "poll more often": memecoinData's cache already serves an expired value
// immediately and refreshes behind the response, so nobody waits on an upstream. What is left is
// that the value a user gets right after an expiry is a little behind. Refreshing a key in the
// last PRE_EXPIRY_MS of its own TTL replaces the refresh the next request would have triggered
// anyway — the same upstream call, moved off the user's path into a moment when nothing is in
// flight. It cannot add calls: a key is only touched inside that window, so at most once per TTL,
// which is exactly the rate a continuously-read key already costs today.
//
// Everything here goes through geckoBudget's opportunistic lane (tryTake). That lane yields to any
// call somebody is waiting on, spaces its grants out, and stands down entirely after a 429. A
// refusal means "do nothing" and never "wait", because there is always a cached value to serve.
// DexScreener-backed work (the token row) is gated by the same lane even though DexScreener is not
// the scarce upstream: one lane is one place to reason about, and erring toward fewer calls is the
// whole point of this file.
//
// Nothing here is stored on disk. The warmer's own state is four counters and a timestamp; the
// values it refreshes live in memecoinData's in-memory cache, which is capped at MAX_ENTRIES. The
// one thing it touches on disk it touches only indirectly: refreshing a list runs that list through
// services/tokenIndex like any other read, and that table is already hard-capped (MAX_ROWS, pruned
// to LOW_WATER — a few MB). It cannot add rows the user path would not have added anyway, because
// it only ever refreshes a key a request was about to refresh.
//
// An idle server is silent. With no SSE client holding the stream open and no request in the last
// IDLE_AFTER_MS, the timer is cleared outright rather than ticking over an empty work list; the
// next request restarts it through noteDemand().

const budget = require('./geckoBudget');

const TICK_MS = 1_000;
// How far ahead of an expiry a key may be refreshed. Small on purpose: this is the window in which
// a refresh is work the next request would have done, not extra work.
const PRE_EXPIRY_MS = 2_000;
// Nobody watching and nothing asked for two minutes: a user who comes back after that pays one
// cold load, which is cheaper than having kept every key warm for an empty room.
const IDLE_AFTER_MS = 2 * 60_000;
// The timeframes the terminal opens with. The others are refreshed on demand; warming four
// timeframes per watched token would be the kind of speculative fetching this lane exists to avoid.
const WARM_TFS = ['5m', '1m'];

/**
 * deps.data   — memecoinData (or a stand-in)
 * deps.hub    — () => { clients, watched }, normally memecoinStream.stats()
 * deps.budget — geckoBudget (or a stand-in)
 * deps.now    — clock, for tests
 */
function createWarmer(deps = {}) {
  const d = deps.data || require('./memecoinData');
  const b = deps.budget || budget;
  const now = deps.now || (() => Date.now());
  const hub = deps.hub || (() => {
    try { return require('./memecoinStream').stats(); } catch (_) { return { clients: 0, watched: [] }; }
  });

  let timer = null;
  let enabled = false;
  let lastDemand = 0;
  const counts = { refreshed: 0, refused: 0, idleStops: 0, ticks: 0 };

  /** Expired, or about to be. A key with nothing cached counts: that is the cold load we want to own. */
  function due(key) {
    const left = d.freshFor(key);
    return left === null || left <= PRE_EXPIRY_MS;
  }

  /**
   * Every key worth refreshing, most valuable first — and the order is the allocation, because
   * grants are scarcer than keys. Measured on the keyless tier the opportunistic lane grants about
   * three calls a minute while these keys would like roughly thirty, so whatever comes first is
   * what actually gets warmed. The lists come first because they are the landing page and the most
   * expensive thing to load cold (5.5s measured), and because the SSE hub already refreshes the
   * watched tokens' rows and bars on its own 5s/10s ticks — starving those here costs nothing.
   *
   * No round-robin is needed on top: a key that was just refreshed stops being due, so equals take
   * turns by themselves.
   */
  function targets(addresses) {
    const jobs = [
      { key: 'trending', run: () => d.getTrending() },
      { key: 'new', run: () => d.getNew() },
    ];
    for (const address of addresses) {
      jobs.push({ key: `token:${address}`, run: () => d.getToken(address) });
      for (const tf of WARM_TFS) {
        // Without a remembered pool, refreshing the bars means resolving the token first. That is
        // the user path's business — doing it here would be two calls for a chart nobody opened.
        const key = d.ohlcvKey(address, tf);
        if (key) jobs.push({ key, run: () => d.getOhlcv(address, tf) });
      }
    }
    return jobs;
  }

  async function tick() {
    counts.ticks += 1;
    const t = now();
    const { clients = 0, watched = [] } = hub() || {};
    if (!clients && t - lastDemand > IDLE_AFTER_MS) { counts.idleStops += 1; stop(); return 0; }

    for (const job of targets(watched)) {
      if (!due(job.key)) continue;
      // The budget is the authority on whether any opportunistic call may happen at all. Refused
      // means the user lane is busy, the spacing has not elapsed, or we are cooling off from a 429.
      if (!b.tryTake(1)) { counts.refused += 1; return 0; }
      counts.refreshed += 1;
      // One per tick. With a cached value present this resolves off it at once and the refresh
      // runs behind; with nothing cached it is the cold load, and only the warmer is waiting.
      await job.run().catch(() => { /* memecoinData logs it and keeps the last good value */ });
      return 1;
    }
    return 0;
  }

  /** A request for memecoin data arrived. Keeps the warmer awake, and wakes it if it had stopped. */
  function noteDemand() {
    lastDemand = now();
    if (enabled && !timer) schedule();
  }

  function schedule() {
    let inFlight = false;
    const h = setInterval(() => {
      if (inFlight) return;   // a cold load can outlive the interval; skip rather than stack
      inFlight = true;
      tick().catch((err) => console.error('[meme-warmer]', err.message)).finally(() => { inFlight = false; });
    }, TICK_MS);
    if (h.unref) h.unref();
    timer = h;
  }

  function start() {
    if (enabled && timer) return false;
    enabled = true;
    lastDemand = now();      // a start is a reason to believe someone is about to arrive
    if (!timer) schedule();
    return true;
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  const stats = () => ({ ...counts, running: Boolean(timer), enabled, lastDemand });

  return { start, stop, noteDemand, stats, _tick: tick, _targets: targets, _due: due };
}

const warmer = createWarmer();

module.exports = {
  createWarmer,
  startMemecoinWarmer: warmer.start,
  stopMemecoinWarmer: warmer.stop,
  noteDemand: warmer.noteDemand,
  stats: warmer.stats,
  TICK_MS, PRE_EXPIRY_MS, IDLE_AFTER_MS, WARM_TFS,
};
