// Serving the live pump.fun list out of our own index. The point of this path is that there is
// no aggregator in it: no rate limit, no 20-rows-per-page ceiling, and nothing that can make a
// user wait on an upstream. The rules worth holding onto:
//   - a curve carries a REAL price and mcap (unlike a remembered index row), and nothing else
//   - what a curve cannot know stays null, never zero — a fake liquidity would mislead the
//     low-liquidity warning, and a fake volume would mislead everything
//   - the indexer being off means an empty list, not a different list
const os = require('os');
const fs = require('fs');
const path = require('path');

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'tvx-livelist-'));
process.env.DB_PATH = path.join(ROOT, 'live.sqlite');

const test = require('node:test');
const assert = require('node:assert');
const { getDb } = require('../src/db/schema');
const data = require('../src/services/memecoinData');

test.after(() => fs.rmSync(ROOT, { recursive: true, force: true }));

const MINT = (i) => `${'Cur'}${String(i).padStart(2, '0')}${'v'.repeat(38)}`.slice(0, 44);
const nowS = () => Math.floor(Date.now() / 1000);

function putCurve({ address, priceUsd = 0.000042, mcap = 41000, progress = 0.33, ageS = 0, complete = 0, symbol, name }) {
  const db = getDb();
  db.prepare(`INSERT OR REPLACE INTO token_curve
      (address, curve, price_usd, price_sol, mcap, progress, v_sol, complete, slot, first_seen_ts, updated_ts)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(address, `curve-${address}`, priceUsd, priceUsd / 110, mcap, progress, 31.2, complete, 1, nowS() - ageS, nowS() - ageS);
  if (symbol) {
    db.prepare(`INSERT OR REPLACE INTO token_index
        (address, symbol, name, symbol_lc, name_lc, first_seen_ts, last_seen_ts)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(address, symbol, name || symbol, symbol.toLowerCase(), (name || symbol).toLowerCase(), nowS(), nowS());
  }
}

test('a curve becomes a list token carrying a real price and market cap', () => {
  putCurve({ address: MINT(1), priceUsd: 0.0000421, mcap: 42100, symbol: 'CURVY', name: 'Curvy Coin' });
  const [t] = data.getLivePump();
  assert.strictEqual(t.address, MINT(1));
  assert.strictEqual(t.symbol, 'CURVY');
  assert.strictEqual(t.name, 'Curvy Coin');
  assert.strictEqual(t.price, 0.0000421, 'the chain price is served, not a remembered one');
  assert.strictEqual(t.mcap, 42100);
  assert.strictEqual(t.source, 'curve');
  assert.ok(t.curve_progress > 0, 'bonding-curve progress is carried');
});

test('what a curve cannot know is null, never zero', () => {
  const [t] = data.getLivePump();
  // A zero here would be read as fact by the UI: no liquidity, no trades, no holders.
  for (const f of ['liquidity_usd', 'volume_24h', 'volume_5m', 'change_24h', 'change_5m', 'holders', 'buy_count', 'pair']) {
    assert.strictEqual(t[f], null, `${f} must be null, not a number the chain never told us`);
  }
});

test('a coin whose name we have not learned still lists, under a readable fallback', () => {
  putCurve({ address: MINT(2), mcap: 9000 }); // no token_index row
  const t = data.getLivePump().find((x) => x.address === MINT(2));
  assert.ok(t, 'an unnamed coin is still tradable and must still appear');
  assert.ok(t.symbol && t.symbol.length > 0, 'a placeholder symbol, never empty');
  assert.strictEqual(t.price, 0.000042);
});

test('completed curves are excluded — their reserves are frozen, not a price', () => {
  putCurve({ address: MINT(3), complete: 1, mcap: 999999, symbol: 'GRAD' });
  assert.ok(!data.getLivePump().some((t) => t.address === MINT(3)), 'a migrated coin must not be priced off its dead curve');
});

test('stale curves age out of the list', () => {
  putCurve({ address: MINT(4), ageS: 10_000, symbol: 'OLD' });
  assert.ok(!data.getLivePump().some((t) => t.address === MINT(4)), 'not traded in ages: not "live"');
  assert.ok(data.getLivePump({ maxAgeS: 20_000 }).some((t) => t.address === MINT(4)), 'but reachable with a wider window');
});

test('newest trade first, and the limit is honoured and bounded', () => {
  for (let i = 10; i < 20; i++) putCurve({ address: MINT(i), ageS: 20 - i, symbol: `T${i}` });
  const all = data.getLivePump({ limit: 5 });
  assert.strictEqual(all.length, 5);
  const ages = all.map((t) => t.last_seen);
  assert.deepStrictEqual(ages, [...ages].sort((a, b) => b - a), 'most recently traded first');
  assert.ok(data.getLivePump({ limit: 100000 }).length <= 500, 'an absurd limit is clamped, not obeyed');
});

test('with no curves at all the answer is an empty list, not an error or another list', () => {
  getDb().prepare('DELETE FROM token_curve').run();
  const out = data.getLivePump();
  assert.ok(Array.isArray(out));
  assert.strictEqual(out.length, 0, 'the indexer being off means empty, never a silent fallback to trending');
});
