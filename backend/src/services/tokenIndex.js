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
// Every function is best-effort: a DB problem degrades the feature, never the response.
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

module.exports = {
  recordTokens, recordLaunch, ingestLaunches, searchIndex, lookup, countRows, prune,
  MAX_ROWS, LOW_WATER, MAX_RESULTS,
  _resetLaunchHighWater: () => { launchHighWater = 0; },
};
