// Visiting a friend's trading profile, and callouts on positions. Real SQLite for friendships/callouts, an in-memory
// stand-in for the Supabase ledger, and a stubbed token price so nothing here touches the network.
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
require('./_sqlite').installBetterSqlite3Adapter();

process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'friendsprofile-')), 'test.sqlite');

const { createFakeSupabase } = require('./memecoin-fakeSupabase');

const PROFILES = [
  { user_id: '11111111-1111-4111-8111-111111111111', username: 'larp', display_name: 'Larp', avatar_url: '' },
  { user_id: '22222222-2222-4222-8222-222222222222', username: 'bob', display_name: 'Bob', avatar_url: '' },
  { user_id: '33333333-3333-4333-8333-333333333333', username: 'eve', display_name: 'Eve', avatar_url: '' },
  { user_id: '44444444-4444-4444-8444-444444444444', username: 'carl', display_name: 'Carl', avatar_url: '' },
  { user_id: '55555555-5555-4555-8555-555555555555', username: 'dave', display_name: 'Dave', avatar_url: '' },
];
const [LARP, BOB, EVE, CARL, DAVE] = PROFILES.map((p) => p.user_id);
const GHOST = '99999999-9999-4999-8999-999999999999'; // a uuid with no account behind it

function queryOver(rows) {
  const st = { filters: [] };
  const api = {
    select() { return api; },
    in(col, vals) { st.filters.push((r) => vals.includes(r[col])); return api; },
    eq(col, val) { st.filters.push((r) => r[col] === val); return api; },
    then(res) { res({ data: rows.filter((r) => st.filters.every((f) => f(r))), error: null }); },
  };
  return api;
}

const ledger = createFakeSupabase();
const adminPath = require.resolve('../src/services/supabaseAdmin');
require.cache[adminPath] = {
  id: adminPath, filename: adminPath, loaded: true,
  exports: {
    supabase: {
      from: (t) => (t === 'profiles' ? queryOver(PROFILES) : ledger.from(t)),
      auth: { admin: { getUserById: async () => ({ data: { user: null } }) } },
    },
  },
};

// Keep the real text/address hardening, stub only the upstream price lookup.
const dataPath = require.resolve('../src/services/memecoinData');
const realData = require(dataPath);
const PRICES = { ['So11111111111111111111111111111111111111112']: { symbol: 'WSOL', price: 2 } };
require.cache[dataPath].exports = {
  ...realData,
  getToken: async (address) => {
    const p = PRICES[address];
    if (!p) throw new Error('Token not found');
    return { address, symbol: p.symbol, name: p.symbol, price: p.price, image: null };
  },
};

const express = require('express');
const { getDb } = require('../src/db/schema');
const friends = require('../src/routes/friends');

const MINT = 'So11111111111111111111111111111111111111112';
const OLD_MINT = 'BonkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkA'; // held once, no longer resolves upstream
const NEVER = 'Never1111111111111111111111111111111111111A';

let USER = LARP;
const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.user = { id: USER }; next(); });
app.use('/api/friends', friends);
const server = app.listen(0);
const ready = new Promise((r) => server.once('listening', r));
let base;

test.before(async () => {
  await ready;
  base = `http://127.0.0.1:${server.address().port}/api/friends`;
  const db = getDb();
  db.prepare("INSERT INTO friendships (requester_id, addressee_id, status) VALUES (?, ?, 'accepted')").run(LARP, BOB);
  db.prepare("INSERT INTO friendships (requester_id, addressee_id, status) VALUES (?, ?, 'pending')").run(LARP, EVE);
  db.prepare("INSERT INTO friendships (requester_id, addressee_id, status) VALUES (?, ?, 'accepted')").run(DAVE, BOB);

  const win = db.prepare('INSERT INTO trade_wins (user_id, kind, symbol, address, entry, exit, qty, pnl_usd, pnl_pct) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (const [sym, pnl] of [['AAA', 10], ['BBB', 900], ['CCC', 400], ['DDD', 20], ['EEE', 30], ['FFF', 40]]) {
    win.run(BOB, 'meme', sym, MINT, 1, 2, 10, pnl, 50);
  }
  win.run(LARP, 'stock', 'NVDA', null, 100, 150, 2, 100, 50);

  // Bob holds the mint; Dave holds it too (for the rate-limit run). Larp holds it and has also closed OLD_MINT.
  ledger.seedPosition(BOB, MINT, 1000, 0.5);
  ledger.seedPosition(LARP, MINT, 500, 1);
  ledger.seedPosition(DAVE, MINT, 10, 1);
  ledger.seedTx({ user_id: LARP, type: 'buy', ticker: OLD_MINT, shares: 100, price: 0.25, total: 25 });
  ledger.seedTx({ user_id: LARP, type: 'sell', ticker: OLD_MINT, shares: 100, price: 0.4, total: 40 });
});
test.after(() => server.close());

const call = (p, method = 'GET', body) =>
  fetch(base + p, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    .then(async (r) => ({ status: r.status, body: await r.json() }));

/* ── who may read a profile ───────────────────────────────────────────────── */

test('a non-friend cannot read positions or trades, however they ask', async () => {
  USER = CARL; // friends with nobody
  const direct = await call(`/${BOB}/profile`);
  assert.strictEqual(direct.status, 403);
  assert.strictEqual(direct.body.code, 'not_friends');
  assert.strictEqual(direct.body.positions, undefined, 'the refusal must not carry the data it refused');
  assert.strictEqual(direct.body.topTrades, undefined);

  // Guessing ids gets the same answer whether or not the account exists, so this is not an enumeration oracle.
  const ghost = await call(`/${GHOST}/profile`);
  assert.strictEqual(ghost.status, 403);
  assert.deepStrictEqual(ghost.body, direct.body);

  // ...and a pending request is not a friendship.
  USER = EVE;
  assert.strictEqual((await call(`/${LARP}/profile`)).status, 403);

  // The friendship is directional in storage but not in meaning: Bob's side opens both ways.
  USER = BOB;
  assert.strictEqual((await call(`/${LARP}/profile`)).status, 200);
});

test('an accepted friend sees top trades, biggest first and capped, plus live-priced open positions', async () => {
  USER = LARP;
  const { status, body } = await call(`/${BOB}/profile`);
  assert.strictEqual(status, 200);
  assert.strictEqual(body.isSelf, false);
  assert.strictEqual(body.topTrades.length, 5, 'top trades are capped');
  assert.deepStrictEqual(body.topTrades.map((t) => t.symbol), ['BBB', 'CCC', 'FFF', 'EEE', 'DDD']);
  assert.strictEqual(body.topTrades[0].pnlUsd, 900);

  assert.strictEqual(body.positions.length, 1);
  assert.strictEqual(body.positions[0].address, MINT);
  assert.strictEqual(body.positions[0].symbol, 'WSOL');
  assert.strictEqual(body.positions[0].currentPrice, 2, 'priced through the same path the owner sees');
  assert.strictEqual(body.positions[0].pnl, 1000 * 2 - 1000 * 0.5);
  assert.strictEqual(body.priced, true);

  // Nothing private rides along.
  const flat = JSON.stringify(body);
  for (const leak of ['cash', 'email', 'phone', 'balance']) {
    assert.ok(!flat.toLowerCase().includes(leak), `response should not mention ${leak}`);
  }
});

test('your own profile needs no friendship, and a junk id is refused before any lookup', async () => {
  USER = LARP;
  const mine = await call(`/${LARP}/profile`);
  assert.strictEqual(mine.status, 200);
  assert.strictEqual(mine.body.isSelf, true);
  assert.strictEqual(mine.body.topTrades[0].symbol, 'NVDA');
  assert.strictEqual((await call('/not-a-uuid/profile')).status, 400);
});

/* ── callouts ─────────────────────────────────────────────────────────────── */

test('a callout must name a position you hold or have held', async () => {
  USER = LARP;
  const unowned = await call('/callouts', 'POST', { address: NEVER, body: 'trust me' });
  assert.strictEqual(unowned.status, 403);
  assert.strictEqual(unowned.body.code, 'not_your_position');

  const open = await call('/callouts', 'POST', { address: MINT, body: 'still holding', symbol: 'WSOL' });
  assert.strictEqual(open.status, 200);
  assert.strictEqual(open.body.callout.stance, 'open');
  assert.strictEqual(open.body.callout.entry, 1, 'entry comes from the ledger, not the request');

  // A closed position still counts: the buy is on the ledger even though nothing is held now.
  const closed = await call('/callouts', 'POST', { address: OLD_MINT, body: 'caught the whole move' });
  assert.strictEqual(closed.status, 200);
  assert.strictEqual(closed.body.callout.stance, 'closed');
  assert.strictEqual(closed.body.callout.entry, 0.25);
  assert.strictEqual(closed.body.callout.symbol, realData.shortMint(OLD_MINT), 'a coin with no symbol falls back to a short mint');

  // Someone else's position is not yours, even though it exists.
  USER = CARL;
  assert.strictEqual((await call('/callouts', 'POST', { address: MINT, body: 'mine actually' })).status, 403);
});

test('callout text is bounded and stripped of anything that could inject markup', async () => {
  USER = LARP;
  assert.strictEqual((await call('/callouts', 'POST', { address: 'not-a-mint', body: 'hi' })).status, 400);
  assert.strictEqual((await call('/callouts', 'POST', { address: MINT, body: '   ' })).status, 400);
  assert.strictEqual((await call('/callouts', 'POST', { address: MINT, body: 42 })).status, 400, 'a number is not a callout');

  const nasty = await call('/callouts', 'POST', { address: MINT, body: '  <img src=x>‮​bad\u0007 line\ntwo  ' });
  assert.strictEqual(nasty.status, 200);
  const text = nasty.body.callout.body;
  assert.strictEqual(text, '<img src=x>bad line two', 'control, bidi and zero-width characters are gone; newlines fold to spaces');
  assert.ok(!/[‮​\u0007]/.test(text));

  const long = await call('/callouts', 'POST', { address: MINT, body: 'x'.repeat(5000) });
  assert.strictEqual(long.status, 200);
  assert.strictEqual([...long.body.callout.body].length, 240, 'capped by code point');
});

test('the feed is your circle only, with each author identity attached', async () => {
  USER = BOB;
  await call('/callouts', 'POST', { address: MINT, body: 'bob is in' });
  USER = CARL;
  const carl = await call('/callouts', 'POST', { address: OLD_MINT, body: 'should stay hidden' });
  assert.strictEqual(carl.status, 403, 'Carl has no position to call out');

  USER = LARP;
  const { status, body } = await call('/callouts');
  assert.strictEqual(status, 200);
  assert.ok(body.callouts.length >= 5);
  assert.ok(body.callouts.every((c) => [LARP, BOB].includes(c.user.userId)), 'only me and my friends');
  assert.ok(!body.callouts.some((c) => c.body === 'should stay hidden'));
  assert.strictEqual(body.callouts[0].body, 'bob is in', 'newest first');
  assert.strictEqual(body.callouts[0].user.username, 'bob');

  // Eve is only a pending request, so nothing of mine reaches her feed.
  USER = EVE;
  assert.strictEqual((await call('/callouts')).body.callouts.length, 0);
});

test('you can delete your own callout and nobody else can', async () => {
  USER = BOB;
  const mine = (await call('/callouts')).body.callouts.find((c) => c.user.userId === BOB);
  USER = LARP;
  assert.strictEqual((await call(`/callouts/${mine.id}`, 'DELETE')).status, 404, "another user's callout is simply not found");
  assert.strictEqual((await call('/callouts/0', 'DELETE')).status, 400);
  USER = BOB;
  assert.strictEqual((await call(`/callouts/${mine.id}`, 'DELETE')).status, 200);
  assert.ok(!(await call('/callouts')).body.callouts.some((c) => c.id === mine.id));
});

test('posting is rate limited per user, and a refused post costs nothing', async () => {
  USER = DAVE;
  for (let i = 0; i < 5; i++) {
    assert.strictEqual((await call('/callouts', 'POST', { address: MINT, body: `run ${i}` })).status, 200, `post ${i}`);
  }
  const over = await call('/callouts', 'POST', { address: MINT, body: 'one too many' });
  assert.strictEqual(over.status, 429);
  // Bob shares none of Dave's budget.
  USER = BOB;
  assert.strictEqual((await call('/callouts', 'POST', { address: MINT, body: 'unaffected' })).status, 200);
});

test('a callout keeps only the newest per author, so the table cannot grow forever', async () => {
  const db = getDb();
  const insert = db.prepare("INSERT INTO trade_callouts (user_id, address, symbol, stance, body) VALUES (?, ?, 'WSOL', 'open', ?)");
  for (let i = 0; i < 60; i++) insert.run(CARL, MINT, `filler ${i}`);
  ledger.seedPosition(CARL, MINT, 1, 1);
  USER = CARL;
  assert.strictEqual((await call('/callouts', 'POST', { address: MINT, body: 'the keeper' })).status, 200);
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM trade_callouts WHERE user_id = ?').get(CARL).n, 50);
  assert.strictEqual(db.prepare('SELECT body FROM trade_callouts WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(CARL).body, 'the keeper');
});

/* ── delivery ─────────────────────────────────────────────────────────────── */

test('a waiting feed read is released by the next callout, and nothing is left holding a socket', async () => {
  USER = LARP;
  const newest = (await call('/callouts')).body.callouts[0].id;

  // The read is held open; the middleware has already captured Larp as the caller, so switching USER only affects
  // the POST that follows.
  const started = Date.now();
  const waiting = call(`/callouts?after=${newest}&wait=1`);
  await new Promise((r) => setTimeout(r, 50));
  assert.strictEqual(friends._test.calloutWaiters.size, 1, 'the read should be parked, not answered');

  USER = BOB;
  assert.strictEqual((await call('/callouts', 'POST', { address: MINT, body: 'pushed' })).status, 200);

  const res = await waiting;
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.callouts[0].body, 'pushed');
  assert.ok(Date.now() - started < friends._test.CALLOUT_WAIT_MS, 'it must return on the post, not on the timeout');
  assert.strictEqual(friends._test.calloutWaiters.size, 0, 'the waiter is cleaned up');
});

test('a feed read that already has something newer never waits', async () => {
  USER = LARP;
  const started = Date.now();
  const res = await call('/callouts?after=1&wait=1');
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.callouts.length > 0);
  assert.ok(Date.now() - started < 2000, 'answered immediately');
  assert.strictEqual(friends._test.calloutWaiters.size, 0);
});
