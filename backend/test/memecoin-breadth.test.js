// Breadth of the market the terminal can see: more than one GeckoTerminal page in the lists, and a
// local discovery index behind search so it is not limited to DexScreener's ~30-pair answer.
//
// Nothing here touches the network (axios.get is stubbed) or the shared dev database (DB_PATH is a
// temp file, set before src/db/schema is required, as test/dbBackup.test.js does).
const os = require('os');
const fs = require('fs');
const path = require('path');

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'travauxus-breadth-'));
process.env.DB_PATH = path.join(ROOT, 'index.sqlite');

const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const { getDb } = require('../src/db/schema');
const data = require('../src/services/memecoinData');
const tokenIndex = require('../src/services/tokenIndex');
const budget = require('../src/services/geckoBudget');

test.after(() => fs.rmSync(ROOT, { recursive: true, force: true }));

// ── fixtures ────────────────────────────────────────────────────────────────
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
// A deterministic, valid-looking 44-char base58 mint per index, distinct for every index.
const mint = (i) => {
  let s = '';
  for (let n = i; s.length < 8; n = Math.floor(n / 58)) s += B58[n % 58];
  return (s + 'Z'.repeat(44)).slice(0, 44);
};

const PAGE_SIZE = 20; // what GeckoTerminal actually returns per page

function geckoPage(path, page) {
  const data_ = [];
  const included = [];
  for (let i = 0; i < PAGE_SIZE; i++) {
    const n = (page - 1) * PAGE_SIZE + i;
    const addr = mint(n + (path === 'new_pools' ? 500 : 0));
    const id = `solana_${addr}`;
    data_.push({
      id: `pool_${n}`,
      attributes: { name: `TK${n} / SOL`, address: `pool${n}`, base_token_price_usd: '1', reserve_in_usd: `${1000 + n}` },
      relationships: { base_token: { data: { id } }, dex: { data: { id: 'raydium' } } },
    });
    included.push({ id, attributes: { symbol: `TK${n}`, name: `Token ${n}` } });
  }
  return { data: data_, included };
}

const rateLimited = () => Object.assign(new Error('429'), { response: { status: 429 } });

const dexPair = (addr, over = {}) => ({
  chainId: 'solana',
  pairAddress: `p_${addr}`,
  dexId: 'raydium',
  baseToken: { address: addr, symbol: over.symbol || 'LIVE', name: over.name || 'Live Token' },
  quoteToken: { address: data.SOL_MINT, symbol: 'SOL' },
  priceUsd: over.priceUsd || '0.5',
  liquidity: { usd: over.liq ?? 1234 },
  marketCap: over.mcap ?? 99_000,
});

// Each test installs its own router of url -> response and starts from a clean cache/budget.
function stub(routes) {
  data._resetCache();
  budget._reset();
  const calls = [];
  axios.get = async (url, cfg) => {
    calls.push({ url, params: cfg?.params });
    for (const [match, reply] of routes) {
      if (url.includes(match)) {
        const r = typeof reply === 'function' ? reply(url, cfg?.params) : reply;
        if (r instanceof Error) throw r;
        return { data: r };
      }
    }
    throw Object.assign(new Error('unrouted ' + url), { response: { status: 500 } });
  };
  return calls;
}

const origGet = axios.get;
test.afterEach(() => { axios.get = origGet; });

const geckoCalls = (calls) => calls.filter((c) => c.url.includes('geckoterminal'));

const clearIndex = () => getDb().prepare('DELETE FROM token_index').run();

// ── 1. breadth in the lists ─────────────────────────────────────────────────
test('trending walks past page 1: one page is 20 pools, the list is ~100', async () => {
  const calls = stub([['trending_pools', (_u, p) => geckoPage('trending_pools', p.page || 1)]]);
  const list = await data.getTrending();
  assert.equal(list.length, PAGE_SIZE * data.GECKO_DEEP_PAGES, 'page 1 plus every deep page');
  assert.equal(geckoCalls(calls).length, data.GECKO_DEEP_PAGES);
  assert.deepEqual(geckoCalls(calls).map((c) => c.params.page), [1, 2, 3, 4, 5]);
  // every row is a distinct token
  assert.equal(new Set(list.map((t) => t.address)).size, list.length);
});

test('a 429 on a deep page degrades to the pages we have instead of a 503', async () => {
  const calls = stub([['trending_pools', (_u, p) => ((p.page || 1) >= 3 ? rateLimited() : geckoPage('trending_pools', p.page))]]);
  const list = await data.getTrending();
  assert.equal(list.length, PAGE_SIZE * 2, 'pages 1 and 2 survive the 429 on page 3');
  assert.ok(geckoCalls(calls).length >= 3);
});

test('page 1 failing still falls back to DexScreener boosted tokens', async () => {
  const addr = mint(900);
  stub([
    ['trending_pools', rateLimited()],
    ['token-boosts', [{ chainId: 'solana', tokenAddress: addr }]],
    ['/tokens/v1/solana/', [dexPair(addr)]],
  ]);
  const list = await data.getTrending();
  assert.equal(list.length, 1);
  assert.equal(list[0].address, addr);
});

test('a refresh re-fetches page 1 only: the deep pages stay warm on their long TTL', async () => {
  const calls = stub([['new_pools', (_u, p) => geckoPage('new_pools', p.page || 1)]]);
  await data.getNew();
  assert.equal(geckoCalls(calls).length, data.GECKO_DEEP_PAGES, 'cold: every page');

  data._resetCache((k) => k === 'new');   // the 30s list entry lapses; the warm deep pages do not
  const list = await data.getNew();
  assert.equal(list.length, PAGE_SIZE * data.GECKO_DEEP_PAGES, 'still the full list');
  assert.equal(geckoCalls(calls).length, data.GECKO_DEEP_PAGES + 1, 'one GeckoTerminal request, for page 1');
  assert.equal(geckoCalls(calls).at(-1).params.page, 1);
});

test('deep-page rows are repriced from DexScreener; page 1 keeps its GeckoTerminal numbers', async () => {
  const calls = stub([
    ['trending_pools', (_u, p) => geckoPage('trending_pools', p.page || 1)],
    // DexScreener prices everything it is asked about at $9 with $42k of liquidity
    ['/tokens/v1/solana/', (url) => url.split('/solana/')[1].split(',')
      .map((a) => dexPair(a, { priceUsd: '9', liq: 42_000, mcap: 777 }))],
  ]);
  const list = await data.getTrending();
  assert.equal(list.length, PAGE_SIZE * data.GECKO_DEEP_PAGES);
  // page 1 is fresh from GeckoTerminal already and is deliberately left alone
  assert.equal(list[0].price, 1);
  assert.equal(list[0].liquidity_usd, 1000);
  // everything past it carries the live DexScreener numbers, not a ten-minute-old pool price
  for (const t of list.slice(PAGE_SIZE)) {
    assert.equal(t.price, 9);
    assert.equal(t.liquidity_usd, 42_000);
  }
  const batches = calls.filter((c) => c.url.includes('/tokens/v1/solana/'));
  assert.equal(batches.length, 3, '80 deep rows in batches of 30');
});

test('repricing keeps the pool creation time when DexScreener has none (the age column)', async () => {
  stub([
    ['new_pools', (_u, p) => {
      const page = geckoPage('new_pools', p.page || 1);
      for (const pool of page.data) pool.attributes.pool_created_at = '2026-01-01T00:00:00Z';
      return page;
    }],
    // a live pair with no pairCreatedAt, as DexScreener sometimes returns
    ['/tokens/v1/solana/', (url) => url.split('/solana/')[1].split(',').map((a) => dexPair(a))],
  ]);
  const list = await data.getNew();
  const deep = list[PAGE_SIZE];
  assert.equal(deep.price, 0.5, 'repriced');
  assert.equal(deep.pair.created_at, Date.parse('2026-01-01T00:00:00Z'), 'age survives the reprice');
});

test('repricing failing leaves the GeckoTerminal numbers in place rather than dropping rows', async () => {
  stub([
    ['trending_pools', (_u, p) => geckoPage('trending_pools', p.page || 1)],
    ['/tokens/v1/solana/', Object.assign(new Error('down'), { response: { status: 502 } })],
  ]);
  const list = await data.getTrending();
  assert.equal(list.length, PAGE_SIZE * data.GECKO_DEEP_PAGES);
  assert.equal(list.at(-1).price, 1, 'the pool price it was discovered with');
});

test('a deep page won once is not lost when its refresh is refused', async () => {
  let page1Only = false;
  stub([['trending_pools', (_u, p) => ((p.page || 1) > 1 && page1Only ? rateLimited() : geckoPage('trending_pools', p.page || 1))]]);
  assert.equal((await data.getTrending()).length, PAGE_SIZE * data.GECKO_DEEP_PAGES);

  page1Only = true;                                  // GeckoTerminal starts refusing deep pages
  data._resetCache((k) => k === 'trending');
  data._expireCache((k) => k.startsWith('gkpage:')); // the 10-minute pages age out, values retained
  const list = await data.getTrending();
  assert.equal(list.length, PAGE_SIZE * data.GECKO_DEEP_PAGES, 'the pages we already won are kept');
});

test('with the budget spent, deep pages serve what they have and page 1 still goes out', async () => {
  const calls = stub([['trending_pools', (_u, p) => geckoPage('trending_pools', p.page || 1)]]);
  await data.getTrending();
  const won = geckoCalls(calls).length;

  data._resetCache((k) => k === 'trending');
  data._expireCache((k) => k.startsWith('gkpage:'));
  budget.record(budget.OPPORTUNISTIC_CEILING);       // the signal route and radar have eaten the budget
  const list = await data.getTrending();
  assert.equal(list.length, PAGE_SIZE * data.GECKO_DEEP_PAGES, 'full list, from cache');
  assert.equal(geckoCalls(calls).length, won + 1, 'only page 1 was fetched');
});

// ── 2. the request budget ───────────────────────────────────────────────────
test('the opportunistic lane refuses once recorded traffic reaches its ceiling', () => {
  budget._reset();
  const t0 = 1_000_000;
  assert.equal(budget.tryTake(1, { now: t0 }), true);
  // fill the window with calls that had to happen (what the signal route and token detail spend)
  budget.record(budget.OPPORTUNISTIC_CEILING, t0);
  assert.equal(budget.tryTake(1, { now: t0 + 10_000 }), false, 'yields to user-facing traffic');
  // a minute later the window has rolled off
  assert.equal(budget.spentLastMinute(t0 + 61_000), 0);
  assert.equal(budget.tryTake(1, { now: t0 + 61_000 }), true);
});

test('the opportunistic lane never bursts: grants are spaced', () => {
  budget._reset();
  const t0 = 2_000_000;
  assert.equal(budget.tryTake(1, { now: t0 }), true);
  assert.equal(budget.tryTake(1, { now: t0 + 1 }), false);
  assert.equal(budget.waitFor(undefined, t0 + 1), budget.MIN_GAP_MS - 1);
  assert.equal(budget.tryTake(1, { now: t0 + budget.MIN_GAP_MS }), true);
});

test('the ceiling leaves headroom under the free tier for traffic we cannot see', () => {
  assert.ok(budget.OPPORTUNISTIC_CEILING <= budget.LIMIT_PER_MIN - budget.RESERVED_OTHER);
  assert.ok(budget.RESERVED_OTHER >= 6, 'radar discovery alone is 3 pages per 30s');
});

test('warming the deep pages stays inside the budget across a full minute of polling', async () => {
  const calls = stub([['trending_pools', (_u, p) => geckoPage('trending_pools', p.page || 1)]]);
  // Two cold lists plus 30s-apart refreshes: the worst the lists can cost in one minute.
  await data.getTrending();
  data._resetCache();
  await data.getTrending();
  assert.ok(budget.spentLastMinute() <= budget.LIMIT_PER_MIN - budget.RESERVED_OTHER,
    `spent ${budget.spentLastMinute()} of ${budget.LIMIT_PER_MIN - budget.RESERVED_OTHER}`);
  assert.ok(geckoCalls(calls).length <= budget.LIMIT_PER_MIN - budget.RESERVED_OTHER);
});

test('every GeckoTerminal request through memecoinData is counted', async () => {
  stub([['trending_pools', (_u, p) => geckoPage('trending_pools', p.page || 1)]]);
  await data.getTrending();
  assert.equal(budget.spentLastMinute(), data.GECKO_DEEP_PAGES);
});

// ── 3. the discovery index ──────────────────────────────────────────────────
test('ranking: exact symbol, then symbol prefix, then name, then substring; ties by liquidity', () => {
  clearIndex();
  const rows = [
    { address: mint(1), symbol: 'DOG', name: 'Dog Coin', liquidity_usd: 10 },
    { address: mint(2), symbol: 'DOGE', name: 'Dogecoin', liquidity_usd: 500 },
    { address: mint(3), symbol: 'DOGS', name: 'Dog Army', liquidity_usd: 5000 },
    { address: mint(4), symbol: 'WIF', name: 'dog wif hat', liquidity_usd: 900 },
    { address: mint(5), symbol: 'MOONDOG', name: 'Moon Dog', liquidity_usd: 50 },
  ];
  assert.equal(tokenIndex.recordTokens(rows, 'test'), 5);
  const hits = tokenIndex.searchIndex('dog');
  assert.deepEqual(hits.map((h) => h.symbol), ['DOG', 'DOGS', 'DOGE', 'WIF', 'MOONDOG']);
  assert.deepEqual(hits.map((h) => h.tier), [0, 1, 1, 3, 4]);
});

test('matching is case-insensitive and substring on both symbol and name', () => {
  clearIndex();
  tokenIndex.recordTokens([{ address: mint(10), symbol: 'PePe', name: 'The Frog' }], 'test');
  for (const q of ['pepe', 'PEPE', 'epe', 'frog', 'The Frog']) {
    assert.equal(tokenIndex.searchIndex(q).length, 1, q);
  }
  assert.equal(tokenIndex.searchIndex('zzz').length, 0);
});

test('LIKE wildcards in a query match literally rather than everything', () => {
  clearIndex();
  tokenIndex.recordTokens([
    { address: mint(11), symbol: 'AB', name: 'plain' },
    { address: mint(12), symbol: 'A%B', name: 'literal' },
  ], 'test');
  const hits = tokenIndex.searchIndex('a%b');
  assert.deepEqual(hits.map((h) => h.symbol), ['A%B']);
});

test('a placeholder symbol never overwrites a real one, but a real one upgrades a placeholder', () => {
  clearIndex();
  const a = mint(20);
  tokenIndex.recordTokens([{ address: a }], 'pumpfun');            // nothing known: short-mint placeholder
  assert.ok(tokenIndex.lookup(a).symbol.includes('...'));
  tokenIndex.recordTokens([{ address: a, symbol: 'REAL', name: 'Real Coin' }], 'list');
  assert.equal(tokenIndex.lookup(a).symbol, 'REAL');
  tokenIndex.recordTokens([{ address: a }], 'pumpfun');            // a later sighting with no metadata
  assert.equal(tokenIndex.lookup(a).symbol, 'REAL');
});

test('last-known mcap and liquidity survive a sighting that has neither', () => {
  clearIndex();
  const a = mint(21);
  tokenIndex.recordTokens([{ address: a, symbol: 'X', mcap: 7, liquidity_usd: 8 }], 'list');
  tokenIndex.recordTokens([{ address: a, symbol: 'X' }], 'pumpfun');
  const r = tokenIndex.lookup(a);
  assert.equal(r.mcap, 7);
  assert.equal(r.liquidity_usd, 8);
});

test('rows without a valid Solana address are not indexed', () => {
  clearIndex();
  assert.equal(tokenIndex.recordTokens([{ address: 'nope' }, { address: null }, {}], 'test'), 0);
  assert.equal(tokenIndex.countRows(), 0);
});

test('the table is capped and the least recently seen rows are evicted first', () => {
  clearIndex();
  const db = getDb();
  // Fill straight to just over the cap: writing 40k rows through recordTokens is the slow way.
  const ins = db.prepare(`INSERT INTO token_index (address, symbol, name, symbol_lc, name_lc, first_seen_ts, last_seen_ts)
                          VALUES (?, 'S', 'N', 's', 'n', ?, ?)`);
  db.transaction(() => {
    for (let i = 0; i < tokenIndex.MAX_ROWS; i++) ins.run(`addr_${i}`, i, i); // last_seen_ts = i, so 0 is oldest
  })();
  assert.equal(tokenIndex.countRows(), tokenIndex.MAX_ROWS);

  const keep = mint(30);
  tokenIndex.recordTokens([{ address: keep, symbol: 'KEEP' }], 'test');
  assert.equal(tokenIndex.countRows(), tokenIndex.LOW_WATER, 'pruned down to the low-water mark');
  assert.ok(tokenIndex.lookup(keep), 'the row just seen is kept');
  assert.equal(tokenIndex.lookup('addr_0'), null, 'the oldest sighting is gone');
  assert.ok(tokenIndex.lookup(`addr_${tokenIndex.MAX_ROWS - 1}`), 'the newest sighting is kept');
  clearIndex();
});

test('a pump.fun launch with no pair anywhere is still indexed and findable', () => {
  clearIndex();
  const a = mint(40);
  assert.equal(tokenIndex.recordLaunch({ address: a, symbol: 'FRESH', name: 'Fresh Launch', ts: Date.now() }), true);
  const hits = tokenIndex.searchIndex('fresh');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].address, a);
  assert.equal(hits[0].mcap, null, 'a launch has no market cap yet and none is invented');
});

test('with the Helius feature off, launch ingestion is a no-op rather than an error', () => {
  clearIndex();
  tokenIndex._resetLaunchHighWater();
  assert.equal(tokenIndex.ingestLaunches(), 0);
  assert.equal(tokenIndex.countRows(), 0);
});

test('launches from the Helius feed become searchable, and are read only once', async () => {
  clearIndex();
  tokenIndex._resetLaunchHighWater();
  const helius = require('../src/services/heliusLaunches');
  const orig = helius.recentLaunches;
  const a = mint(41);
  const reads = [];
  helius.recentLaunches = (n) => {
    reads.push(n);
    return [{ address: a, symbol: 'LAUNCHED', name: 'Just Launched', ts: 1_700_000_000_000, source: 'pumpfun' }];
  };
  try {
    stub([['/latest/dex/search', { pairs: [] }], ['/tokens/v1/solana/', []]]);
    const hits = await data.search('launched');
    assert.equal(hits.length, 1);
    assert.equal(hits[0].address, a);
    assert.equal(hits[0].source, 'index');
    assert.equal(hits[0].price, null, 'no pool yet, so no price is invented');

    // the same launch is not re-written on the next look
    assert.equal(tokenIndex.ingestLaunches(), 0);
    assert.ok(reads.length >= 2);
  } finally {
    helius.recentLaunches = orig;
    tokenIndex._resetLaunchHighWater();
  }
});

// ── 4. search over both sources ─────────────────────────────────────────────
test('the lists feed the index, so a coin DexScreener cannot find is still searchable', async () => {
  clearIndex();
  stub([['trending_pools', (_u, p) => geckoPage('trending_pools', p.page || 1)]]);
  await data.getTrending();
  assert.equal(tokenIndex.countRows(), PAGE_SIZE * data.GECKO_DEEP_PAGES);

  const deepOnly = mint(80);                      // TK80: page 5, nowhere near DexScreener's answer
  assert.ok(tokenIndex.lookup(deepOnly), 'indexed from a deep page');

  stub([
    ['/latest/dex/search', { pairs: [] }],         // upstream finds nothing, as it did for "pump"
    ['/tokens/v1/solana/', []],                    // and cannot price any of them either
  ]);
  const hits = await data.search('TK8');
  assert.ok(hits.length >= 10, `index answered with ${hits.length} where DexScreener had 0`);
  assert.ok(hits.some((t) => t.address === deepOnly));
  const row = hits.find((t) => t.address === deepOnly);
  assert.equal(row.source, 'index');
  assert.equal(row.price, null, 'no live pair: no price, not a remembered one');
  assert.equal(row.mcap, null);
});

test('index hits that do have a pair are priced from the live path, not from the index', async () => {
  clearIndex();
  const a = mint(90);
  tokenIndex.recordTokens([{ address: a, symbol: 'HYD', name: 'Hydrate Me', mcap: 1, liquidity_usd: 2 }], 'test');
  stub([
    ['/latest/dex/search', { pairs: [] }],
    ['/tokens/v1/solana/', [dexPair(a, { symbol: 'HYD', mcap: 500_000, liq: 77_000, priceUsd: '3' })]],
  ]);
  const hits = await data.search('hyd');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].price, 3, 'live price');
  assert.equal(hits[0].mcap, 500_000);
  assert.equal(hits[0].liquidity_usd, 77_000);
  assert.notEqual(hits[0].source, 'index');
});

test('DexScreener results and index results are merged, de-duped and ranked together', async () => {
  clearIndex();
  const liveAddr = mint(91);
  const idxAddr = mint(92);
  tokenIndex.recordTokens([
    { address: liveAddr, symbol: 'CATZ', name: 'Catz' },            // also returned live: must appear once
    { address: idxAddr, symbol: 'CAT', name: 'Cat' },                // index only: exact symbol, ranks first
  ], 'test');
  stub([
    ['/latest/dex/search', { pairs: [dexPair(liveAddr, { symbol: 'CATZ', name: 'Catz', liq: 10_000 })] }],
    ['/tokens/v1/solana/', []],
  ]);
  const hits = await data.search('cat');
  assert.equal(hits.length, 2);
  assert.equal(new Set(hits.map((t) => t.address)).size, 2);
  assert.equal(hits[0].symbol, 'CAT', 'the exact ticker outranks the deeper but inexact one');
  assert.equal(hits[1].address, liveAddr);
});

test('a contract address still resolves directly', async () => {
  const a = mint(93);
  stub([['/tokens/v1/solana/', [dexPair(a, { symbol: 'DIRECT' })]]]);
  const hits = await data.search(a);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].address, a);
  assert.equal(hits[0].symbol, 'DIRECT');
});

test('DexScreener down: index hits answer, and only a truly empty index is an error', async () => {
  clearIndex();
  tokenIndex.recordTokens([{ address: mint(94), symbol: 'OFFLINE', name: 'Offline Coin' }], 'test');
  stub([
    ['/latest/dex/search', Object.assign(new Error('boom'), { response: { status: 502 } })],
    ['/tokens/v1/solana/', Object.assign(new Error('boom'), { response: { status: 502 } })],
  ]);
  const hits = await data.search('offline');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].symbol, 'OFFLINE');

  stub([
    ['/latest/dex/search', Object.assign(new Error('boom'), { response: { status: 502 } })],
    ['/tokens/v1/solana/', Object.assign(new Error('boom'), { response: { status: 502 } })],
  ]);
  await assert.rejects(() => data.search('nothing-we-know-of'), /Upstream search failed/);
});

test('an empty upstream answer with an empty index is still an empty list, not an error', async () => {
  clearIndex();
  stub([['/latest/dex/search', { pairs: [] }], ['/tokens/v1/solana/', []]]);
  assert.deepEqual(await data.search('definitely-not-a-coin'), []);
});

test('index-only rows never carry a stale number in a live field', async () => {
  clearIndex();
  const a = mint(95);
  tokenIndex.recordTokens([{ address: a, symbol: 'STALE', name: 'Stale', mcap: 123, liquidity_usd: 456 }], 'test');
  stub([['/latest/dex/search', { pairs: [] }], ['/tokens/v1/solana/', []]]);
  const [row] = await data.search('stale');
  for (const k of ['price', 'mcap', 'fdv', 'liquidity_usd', 'volume_24h', 'change_5m']) {
    assert.equal(row[k], null, `${k} must be null, not remembered`);
  }
  assert.equal(row.last_mcap, 123, 'the remembered figures travel under their own names');
  assert.equal(row.last_liquidity_usd, 456);
  assert.ok(row.last_seen > 0);
});

// ── 5. search cost ──────────────────────────────────────────────────────────
test('search spends at most two DexScreener requests and nothing on GeckoTerminal', async () => {
  clearIndex();
  tokenIndex.recordTokens(
    Array.from({ length: 80 }, (_, i) => ({ address: mint(200 + i), symbol: `SP${i}`, name: `Spend ${i}` })),
    'test',
  );
  const calls = stub([['/latest/dex/search', { pairs: [] }], ['/tokens/v1/solana/', []]]);
  const hits = await data.search('sp');
  assert.equal(calls.length, 2, 'one search, one batched hydrate');
  assert.equal(budget.spentLastMinute(), 0, 'search never touches GeckoTerminal');
  assert.ok(hits.length <= data.SEARCH_RESULTS);
  assert.ok(hits.length >= 50);
  clearIndex();
});
