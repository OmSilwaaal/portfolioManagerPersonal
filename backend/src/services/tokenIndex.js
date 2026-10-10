// A local discovery index of every token this server has ever seen.
//
// Why it exists: DexScreener's /latest/dex/search returns at most 30 pairs, which after filtering
// to Solana and de-duping by token is often under a dozen results ("pump" measured 2). That is not
// a market the way pump.fun shows one. So every token that passes through the lists, a search or a
// token lookup is remembered here, and search answers from this table first.
//
// It is a DISCOVERY index and nothing else: it stores identity (address, symbol, name) plus the
// last market cap / liquidity it saw, and those two are used only to rank. Price for a selected
// token always comes back off the live path — see memecoinData.search(), which hydrates the
// addresses this table hands it rather than echoing what is stored here.
//
// Every function here is best-effort — a DB problem degrades the feature, never the response —
// with one documented exception: recordCurves() throws, because its caller is a background
// writer that has to back off when the volume is full rather than retry into an outage.
const { getDb } = require('../db/schema');
const { cleanSymbol, cleanName, isValidAddress } = require('./memecoinData');

const MAX_ROWS = 40_000;    // a Railway volume is small; this is a few MB
const LOW_WATER = 36_000;   // prune in batches so eviction runs rarely
const MAX_RESULTS = 60;

// cleanSymbol/cleanName fall back to a shortened mint when upstream gave us nothing. Such a
// placeholder must never overwrite a real name we already learned.
const isPlaceholder = (s) => typeof s !== 'string' || s === '' || s.includes('...');

const UPSERT = `
  INSERT INTO token_index
    (address, symbol, name, symbol_lc, name_lc, mcap, liquidity_usd, source, first_seen_ts, last_seen_ts)
  VALUES
    (@address, @symbol, @name, @symbol_lc, @name_lc, @mcap, @liquidity_usd, @source, @ts, @ts)
  ON CONFLICT(address) DO UPDATE SET
    symbol        = CASE WHEN @placeholder = 0 THEN excluded.symbol    ELSE token_index.symbol    END,
    name          = CASE WHEN @placeholder = 0 THEN excluded.name      ELSE token_index.name      END,
    symbol_lc     = CASE WHEN @placeholder = 0 THEN excluded.symbol_lc ELSE token_index.symbol_lc END,
    name_lc       = CASE WHEN @placeholder = 0 THEN excluded.name_lc   ELSE token_index.name_lc   END,
    mcap          = COALESCE(excluded.mcap, token_index.mcap),
    liquidity_usd = COALESCE(excluded.liquidity_usd, token_index.liquidity_usd),
    source        = excluded.source,
    last_seen_ts  = excluded.last_seen_ts`;

const finite = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function row(t, source, ts) {
  const address = t?.address;
  if (!isValidAddress(address)) return null;
  const symbol = cleanSymbol(t.symbol, address);
  const name = cleanName(t.name, address, symbol);
  return {
    address,
    symbol,
    name,
    symbol_lc: symbol.toLowerCase(),
    name_lc: name.toLowerCase(),
    mcap: finite(t.mcap) ?? finite(t.fdv),
    liquidity_usd: finite(t.liquidity_usd),
    source: typeof source === 'string' ? source.slice(0, 16) : null,
    ts,
    placeholder: isPlaceholder(t.symbol) && isPlaceholder(t.name) ? 1 : 0,
  };
}

/** Remember a batch of tokens. Returns how many rows were written. Never throws. */
function recordTokens(list, source = 'list', nowMs = Date.now()) {
  if (!Array.isArray(list) || !list.length) return 0;
  const ts = Math.floor(nowMs / 1000);
  try {
    const db = getDb();
    const rows = [];
    for (const t of list) {
      const r = row(t, source, ts);
      if (r) rows.push(r);
    }
    if (!rows.length) return 0;
    const upsert = db.prepare(UPSERT);
    db.transaction(() => { for (const r of rows) upsert.run(r); })();
    prune(db);
    return rows.length;
  } catch (err) {
    console.error('[tokenIndex] record failed:', err.message);
    return 0;
  }
}

/**
 * Remember one brand-new launch (services/heliusLaunches shape). These are the coins neither
 * GeckoTerminal nor DexScreener can see yet — no pool, no pair, no price — so only identity
 * is recorded and search returns them with null price until a DEX picks them up.
 */
function recordLaunch(launch) {
  return recordTokens([{ address: launch?.address, symbol: launch?.symbol, name: launch?.name }], 'pumpfun') === 1;
}

// Brand-new pump.fun coins have no pool, so neither GeckoTerminal nor DexScreener can see them at
// all; services/heliusLaunches is the only thing that does, and its feed is in-memory and does not
// survive a restart. Folding it in here is what makes those coins findable. recentLaunches()
// returns [] when the feature is off, so this needs no flag check.
const LAUNCH_READ = 200;
let launchHighWater = 0;

/** Absorb launches seen since the last call. Cheap enough to call on every search. */
function ingestLaunches() {
  try {
    const { recentLaunches } = require('./heliusLaunches');
    const fresh = recentLaunches(LAUNCH_READ).filter((l) => Number(l?.ts) > launchHighWater);
    if (!fresh.length) return 0;
    launchHighWater = Math.max(launchHighWater, ...fresh.map((l) => Number(l.ts) || 0));
    return recordTokens(fresh, 'pumpfun');
  } catch (err) {
    console.error('[tokenIndex] launches:', err.message);
    return 0;
  }
}

/** Oldest-seen rows go first, in batches, so the table cannot grow without bound. */
function prune(db) {
  const n = db.prepare('SELECT COUNT(*) AS n FROM token_index').get().n;
  if (n <= MAX_ROWS) return 0;
  const excess = n - LOW_WATER;
  db.prepare('DELETE FROM token_index WHERE address IN (SELECT address FROM token_index ORDER BY last_seen_ts ASC LIMIT ?)')
    .run(excess);
  return excess;
}

const likeEscape = (s) => s.replace(/[\\%_]/g, '\\$&');

// Ranked the way pump.fun's box feels: the exact ticker you typed, then tickers starting with it,
// then names, then anything containing it; ties broken by the deepest liquidity we last saw.
const SEARCH = `
  SELECT address, symbol, name, mcap, liquidity_usd, last_seen_ts,
         CASE
           WHEN symbol_lc = @q                 THEN 0
           WHEN symbol_lc LIKE @pre ESCAPE '\\' THEN 1
           WHEN name_lc   = @q                 THEN 2
           WHEN name_lc   LIKE @pre ESCAPE '\\' THEN 3
           WHEN symbol_lc LIKE @sub ESCAPE '\\' THEN 4
           ELSE 5
         END AS tier
  FROM token_index
  WHERE symbol_lc LIKE @sub ESCAPE '\\' OR name_lc LIKE @sub ESCAPE '\\'
  ORDER BY tier, COALESCE(liquidity_usd, 0) DESC, COALESCE(mcap, 0) DESC, last_seen_ts DESC
  LIMIT @lim`;

/**
 * Case-insensitive prefix/substring match on symbol and name.
 * Returns [{ address, symbol, name, mcap, liquidity_usd, last_seen_ts, tier }] — identity data.
 * The mcap/liquidity on these rows are last-known and must not be presented as live.
 */
function searchIndex(query, limit = MAX_RESULTS) {
  const q = String(query || '').trim().toLowerCase().slice(0, 80);
  if (!q) return [];
  const lim = Math.min(Math.max(Math.trunc(limit) || 0, 1), MAX_RESULTS);
  try {
    const esc = likeEscape(q);
    return getDb().prepare(SEARCH).all({ q, pre: `${esc}%`, sub: `%${esc}%`, lim });
  } catch (err) {
    console.error('[tokenIndex] search failed:', err.message);
    return [];
  }
}

/** One row by address, or null. */
function lookup(address) {
  try {
    return getDb().prepare('SELECT * FROM token_index WHERE address = ?').get(address) || null;
  } catch (_) {
    return null;
  }
}

function countRows() {
  try { return getDb().prepare('SELECT COUNT(*) AS n FROM token_index').get().n; } catch (_) { return 0; }
}

// ── the market-wide pump.fun curve state (table token_curve) ────────────────
//
// Written by services/pumpCurveIndex from one programSubscribe covering every pump.fun bonding
// curve on the network. Kept here, beside the discovery index, so there is one store module for
// "what the server knows about a token offline" rather than two.
//
// Why a second table and not columns on token_index: see the schema. Short version — identity is
// learned slowly and must not be evicted, curve state churns many times a minute and most of its
// rows have no name yet. The reads below join the two.

// ── the disk ceiling, stated, measured and enforced ─────────────────────────
// A market-wide index writes a row per mint, so its size is part of the design. These are
// measured figures, not estimates — see the two numbers, because they differ and the bigger one
// is the one that matters:
//
//   densely packed   313-328 bytes/row   (a fresh table filled once, no eviction yet)
//   steady state     690 bytes/row       (the same table after sustained churn through the cap)
//
// The gap is the freelist. Pruning frees pages, SQLite keeps them in the file, and later inserts
// reuse them — so a churning table settles at roughly 2x its densely-packed size and stays
// there. Measured directly: a 50_000-row cap reaches 7584 pages (29.6 MB) after the first
// eviction and then sits at EXACTLY 7584 pages across repeated full-cap churns, with ~2900 pages
// cycling on the freelist. It settles; it does not climb.
//
//   200_000 rows x 690 bytes  ~=  140 MB high-water, and it cannot exceed that.
//
// ~2.8% of the 5 GB volume, against radar's ~0.69 GB at its 14-day retention, and 200k rows is
// days of market-wide pump.fun activity. Sized for usefulness rather than squeezed — but still
// a hard cap, because an unbounded index is an unbounded index whatever the volume.
//
// Note for whoever reads `npm run db:space`: about a third of this table's pages will show as
// "reclaimable by VACUUM". That is the freelist doing its job, not a leak. VACUUMing it buys
// nothing, because the next few thousand mints would take the space straight back.
//
// The cap is enforced on the way IN rather than reclaimed afterwards, which is the only thing
// that works: SQLite never shrinks a file on DELETE, so a table allowed to grow past what the
// volume can afford stays at that high-water mark until someone VACUUMs it.
//
// Writes are batched on a 10s cadence (see pumpCurveIndex), not per update, so the WAL churns at
// 0.1 Hz rather than 50 Hz; schema.js caps the WAL itself with journal_size_limit.
//
// PUMP_CURVE_MAX_ROWS tunes it, clamped — a cap that can be set to anything is not a cap. The
// hard limit is 1M rows, ~690 MB, which is still inside the volume but is not a default.
const CURVE_ROWS_DEFAULT = 200_000;
const CURVE_ROWS_LIMIT = 1_000_000;
const MAX_CURVE_ROWS = (() => {
  const n = Math.trunc(Number(process.env.PUMP_CURVE_MAX_ROWS));
  return Number.isFinite(n) && n >= 500 ? Math.min(n, CURVE_ROWS_LIMIT) : CURVE_ROWS_DEFAULT;
})();
// Prune in one batch down to 90%, so eviction runs about once per 20k new mints rather than on
// every write once the table is full.
const LOW_WATER_CURVES = Math.floor(MAX_CURVE_ROWS * 0.9);
const MAX_CURVE_RESULTS = 100;
/** Steady-state bytes per row, table + indexes + the freelist churn leaves behind. Measured. */
const CURVE_BYTES_PER_ROW = 690;

const CURVE_UPSERT = `
  INSERT INTO token_curve
    (address, curve, decimals, price_sol, price_usd, mcap, v_sol, v_token, progress, complete,
     slot, hits, first_seen_ts, updated_ts)
  VALUES
    (@address, @curve, @decimals, @price_sol, @price_usd, @mcap, @v_sol, @v_token, @progress,
     @complete, @slot, @hits, @ts, @ts)
  ON CONFLICT(address) DO UPDATE SET
    curve      = excluded.curve,
    decimals   = COALESCE(excluded.decimals, token_curve.decimals),
    price_sol  = COALESCE(excluded.price_sol, token_curve.price_sol),
    -- A fresh SOL price carries its own USD figure, even when that figure is NULL because the
    -- SOL/USD rate was briefly unavailable. Keeping the previous USD price next to a new SOL
    -- price would read as current and be wrong by however much SOL has moved. A write with no
    -- SOL price at all (recording a migration) leaves both alone.
    price_usd  = CASE WHEN excluded.price_sol IS NOT NULL
                      THEN excluded.price_usd ELSE COALESCE(excluded.price_usd, token_curve.price_usd) END,
    mcap       = CASE WHEN excluded.price_sol IS NOT NULL
                      THEN excluded.mcap ELSE COALESCE(excluded.mcap, token_curve.mcap) END,
    v_sol      = COALESCE(excluded.v_sol, token_curve.v_sol),
    v_token    = COALESCE(excluded.v_token, token_curve.v_token),
    progress   = COALESCE(excluded.progress, token_curve.progress),
    -- One-way: a curve that has migrated never un-migrates, and a later notification arriving
    -- out of order must not make a frozen curve look tradeable again.
    complete   = MAX(token_curve.complete, excluded.complete),
    slot       = MAX(COALESCE(token_curve.slot, 0), COALESCE(excluded.slot, 0)),
    hits       = token_curve.hits + excluded.hits,
    updated_ts = excluded.updated_ts`;

function curveRow(c, ts) {
  if (!isValidAddress(c?.address) || !isValidAddress(c?.curve)) return null;
  const dp = Number.isInteger(c.decimals) && c.decimals >= 0 && c.decimals <= 18 ? c.decimals : null;
  return {
    address: c.address,
    curve: c.curve,
    decimals: dp,
    price_sol: finite(c.priceSol),
    price_usd: finite(c.priceUsd),
    mcap: finite(c.mcap),
    v_sol: finite(c.vSol),
    v_token: finite(c.vToken),
    progress: finite(c.progress),
    complete: c.complete ? 1 : 0,
    slot: Number.isFinite(c.slot) ? Math.trunc(c.slot) : null,
    hits: Number.isFinite(c.hits) && c.hits > 0 ? Math.trunc(c.hits) : 1,
    ts: Math.floor((Number.isFinite(c.ts) ? c.ts : ts) / 1000),
  };
}

/**
 * Write a batch of curve observations. One transaction for the whole batch, because the caller
 * persists hundreds at a time and a transaction per row would make SQLite the bottleneck in a
 * path whose whole point is keeping up with the chain. Returns how many rows were written.
 *
 * The one function in this module that THROWS rather than degrading quietly, and deliberately:
 * its only caller is a background writer, not a request, and a failing write here means the
 * volume is full. Swallowing that would retry forever on top of an outage. `err.diskFull` says
 * which kind of failure it was.
 */
function recordCurves(list, nowMs = Date.now()) {
  if (!Array.isArray(list) || !list.length) return 0;
  try {
    const db = getDb();
    const rows = [];
    for (const c of list) {
      const r = curveRow(c, nowMs);
      if (r) rows.push(r);
    }
    if (!rows.length) return 0;
    const upsert = db.prepare(CURVE_UPSERT);
    db.transaction(() => { for (const r of rows) upsert.run(r); })();
    pruneCurves(db);
    return rows.length;
  } catch (err) {
    // A full volume arrives here as "database or disk is full". Re-thrown rather than swallowed
    // because the caller has to stop writing: retrying a failing write every batch is how a full
    // disk turns into a busy loop on top of an outage.
    console.error('[tokenIndex] curves failed:', err.message);
    const e = new Error(err.message);
    e.diskFull = /disk is full|database or disk|SQLITE_FULL|readonly database/i.test(err.message);
    throw e;
  }
}

/** Oldest-updated rows go first, in batches, so the table cannot grow without bound. */
function pruneCurves(db) {
  const n = db.prepare('SELECT COUNT(*) AS n FROM token_curve').get().n;
  if (n <= MAX_CURVE_ROWS) return 0;
  const excess = n - LOW_WATER_CURVES;
  db.prepare('DELETE FROM token_curve WHERE address IN (SELECT address FROM token_curve ORDER BY updated_ts ASC LIMIT ?)')
    .run(excess);
  return excess;
}

/**
 * Every curve → mint pair already known, newest activity first. This is what makes a restart
 * cheap: the reverse index is rebuilt from here rather than by asking the network which mint each
 * of thousands of curve accounts belongs to.
 */
function curveMints(limit = MAX_CURVE_ROWS) {
  const lim = Math.min(Math.max(Math.trunc(limit) || 0, 1), MAX_CURVE_ROWS);
  try {
    return getDb()
      .prepare('SELECT address, curve, decimals, complete FROM token_curve ORDER BY updated_ts DESC LIMIT ?')
      .all(lim);
  } catch (_) {
    return [];
  }
}

/** The stored curve state for one mint, or null. Never a live price — see `updated_ts`. */
function curveState(address) {
  try {
    return getDb().prepare('SELECT * FROM token_curve WHERE address = ?').get(address) || null;
  } catch (_) {
    return null;
  }
}

// Identity comes from token_index when we have learned it and is simply absent when we have not:
// a curve row proves a coin trades, not what it is called. The LEFT JOIN is why curve churn can
// never evict a name.
const LIVE_CURVES = `
  SELECT c.address, c.price_usd, c.price_sol, c.mcap, c.progress, c.v_sol, c.slot, c.updated_ts,
         i.symbol, i.name
  FROM token_curve c
  LEFT JOIN token_index i ON i.address = c.address
  WHERE c.complete = 0
    AND c.updated_ts >= @since
    AND c.price_usd IS NOT NULL
    AND COALESCE(c.mcap, 0) >= @minMcap
  ORDER BY c.updated_ts DESC, c.mcap DESC
  LIMIT @lim`;

/**
 * Pre-migration pump.fun tokens seen trading in the last `maxAgeS` seconds, most recently traded
 * first. Served entirely from SQLite: no aggregator call, no rate limit, no 30-row ceiling.
 * Completed curves are excluded — their reserves are a frozen snapshot, not a price.
 */
function liveCurves(opts = {}) {
  const lim = Math.min(Math.max(Math.trunc(opts.limit) || 0, 1), MAX_CURVE_RESULTS);
  const maxAgeS = Math.max(Math.trunc(opts.maxAgeS) || 0, 1);
  const since = Math.floor((opts.nowMs ?? Date.now()) / 1000) - maxAgeS;
  const minMcap = finite(opts.minMcap) ?? 0;
  try {
    return getDb().prepare(LIVE_CURVES).all({ since, minMcap, lim });
  } catch (err) {
    console.error('[tokenIndex] liveCurves failed:', err.message);
    return [];
  }
}

function countCurves() {
  try { return getDb().prepare('SELECT COUNT(*) AS n FROM token_curve').get().n; } catch (_) { return 0; }
}

/**
 * What this table is allowed to cost, and what it costs now. Reported by the index's stats so
 * the ceiling is visible in production rather than only in this comment.
 */
function curveFootprint() {
  const rows = countCurves();
  return {
    rows,
    maxRows: MAX_CURVE_ROWS,
    bytes: rows * CURVE_BYTES_PER_ROW,
    maxBytes: MAX_CURVE_ROWS * CURVE_BYTES_PER_ROW,
  };
}

module.exports = {
  recordTokens, recordLaunch, ingestLaunches, searchIndex, lookup, countRows, prune,
  recordCurves, curveMints, curveState, liveCurves, countCurves, pruneCurves, curveFootprint,
  MAX_ROWS, LOW_WATER, MAX_RESULTS,
  MAX_CURVE_ROWS, LOW_WATER_CURVES, MAX_CURVE_RESULTS, CURVE_BYTES_PER_ROW,
  _resetLaunchHighWater: () => { launchHighWater = 0; },
};
