// Elo ladder, leaderboard, clans (one per player, Pro to create), Pro-only cosmetics, and the friends -> DM flow.
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
require('./_sqlite').installBetterSqlite3Adapter();

process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'eloclans-')), 'test.sqlite');
process.env.WINNERS_DEMO = 'off';

const PRO = '11111111-1111-4111-8111-111111111111';
const FREE = '22222222-2222-4222-8222-222222222222';
const THIRD = '33333333-3333-4333-8333-333333333333';
const PROFILES = [
  { user_id: PRO, username: 'prodan', display_name: 'Pro Dan', avatar_url: '' },
  { user_id: FREE, username: 'freddy', display_name: 'Freddy', avatar_url: '' },
  { user_id: THIRD, username: 'thirdy', display_name: 'Thirdy', avatar_url: '' },
];
const adminPath = require.resolve('../src/services/supabaseAdmin');
function queryOver(rows) {
  const st = { filters: [] };
  const api = {
    select() { return api; },
    in(col, vals) { st.filters.push((r) => vals.includes(r[col])); return api; },
    eq(col, val) { st.filters.push((r) => r[col] === val); return api; },
    neq(col, val) { st.filters.push((r) => r[col] !== val); return api; },
    not() { return api; }, order() { return api; }, limit() { return api; },
    ilike(col, pat) { const p = pat.replace(/\\_/g, '_').replace(/%$/, ''); st.filters.push((r) => (r[col] ?? '').startsWith(p)); return api; },
    then(res) { res({ data: rows.filter((r) => st.filters.every((f) => f(r))), error: null }); },
  };
  return api;
}
require.cache[adminPath] = {
  id: adminPath, filename: adminPath, loaded: true,
  exports: {
    supabase: {
      from: () => queryOver(PROFILES),
      auth: { admin: { getUserById: async (id) => ({ data: { user: { id, app_metadata: id === PRO ? { isPro: true } : {} } } }) } },
    },
  },
};

const express = require('express');
const { getDb } = require('../src/db/schema');
const elo = require('../src/services/elo');

let USER = PRO;
const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.user = { id: USER, app_metadata: USER === PRO ? { isPro: true } : {} }; next(); });
app.use('/api/elo', require('../src/routes/elo'));
app.use('/api/clans', require('../src/routes/clans'));
app.use('/api/friends', require('../src/routes/friends'));
app.use('/api/messages', require('../src/routes/messages'));
app.use('/api/profiles', require('../src/routes/profiles'));
app.use((err, _req, res, _next) => res.status(500).json({ error: true, message: err.message }));
const server = app.listen(0);
const ready = new Promise((r) => server.once('listening', r));
let base;
test.before(async () => { await ready; base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const call = (as, p, method = 'GET', body) => {
  USER = as;
  return fetch(base + p, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    .then(async (r) => ({ status: r.status, body: await r.json() }));
};
const trade = (userId, pnlUsd) => elo.recordTrade({ userId, kind: 'stock', symbol: 'AAPL', pnlUsd, pnlPct: 5 });

test('elo starts at 500, climbs with profit, and ranks down on losses', () => {
  assert.strictEqual(elo.computeElo({}), 500);
  assert.strictEqual(elo.tierFor(500).id, 'rookie');
  assert.strictEqual(elo.tierFor(499).id, 'rekt');
  const up = elo.computeElo({ wins: 4, losses: 0, totalPnl: 200 });
  assert.ok(up > 500, 'wins raise it');
  const down = elo.computeElo({ wins: 0, losses: 4, totalPnl: -200 });
  assert.ok(down < 500, 'losses lower it');
  assert.strictEqual(elo.tierFor(down).id, 'rekt');
  assert.strictEqual(elo.computeElo({ wins: 0, losses: 50, totalPnl: -1e9 }), 0, 'never below zero');
});

test('win rate matters: same profit, better win rate, higher elo', () => {
  const lucky = elo.computeElo({ wins: 2, losses: 8, totalPnl: 1000 });
  const steady = elo.computeElo({ wins: 8, losses: 2, totalPnl: 1000 });
  assert.ok(steady > lucky);
});

test('tiers follow 500 / 1,000 / 10,000 / 100,000 and keep going', () => {
  assert.deepStrictEqual(elo.TIERS.filter((t) => t.min >= 500).map((t) => t.min), [500, 1000, 10000, 100000, 1000000, 10000000, 100000000]);
  assert.strictEqual(elo.tierFor(99999).id, 'shark');
  assert.strictEqual(elo.tierFor(100000).id, 'whale');
  assert.strictEqual(elo.tierFor(5e9).id, 'legend');
  const p = elo.progress(5500);
  assert.strictEqual(p.tier, 'trader');
  assert.strictEqual(p.next.id, 'shark');
  assert.strictEqual(p.next.needed, 4500);
});

test('recordTrade logs wins and losses, reports rank changes, and keeps the peak', () => {
  const db = getDb();
  const a = trade(FREE, 40);
  assert.ok(a.after > a.before);
  const peak = elo.statsFor(FREE, db).peak;
  for (let i = 0; i < 5; i++) trade(FREE, -60);
  const s = elo.statsFor(FREE, db);
  assert.ok(s.elo < 500, 'ranked down');
  assert.strictEqual(s.tier, 'rekt');
  assert.ok(s.peak >= peak, 'peak never drops');
  assert.strictEqual(trade(FREE, 0), null, 'flat trades are ignored');
  assert.strictEqual(elo.recordTrade({ pnlUsd: 5 }), null, 'needs a user');
});

test('leaderboard sorts by elo, pnl and win rate, with identity attached', async () => {
  for (let i = 0; i < 6; i++) trade(PRO, 150);
  trade(THIRD, 10);
  const byElo = await call(PRO, '/api/elo/leaderboard?sort=elo');
  assert.strictEqual(byElo.status, 200);
  assert.strictEqual(byElo.body.rows[0].username, 'prodan');
  assert.ok(byElo.body.rows[0].isPro);
  assert.ok(byElo.body.rows[0].mine);
  assert.ok(byElo.body.rows.every((r, i, a) => i === 0 || a[i - 1].elo >= r.elo));
  const byWr = await call(PRO, '/api/elo/leaderboard?sort=winrate');
  assert.ok(byWr.body.rows.every((r) => r.trades >= elo.MIN_TRADES_FOR_WINRATE_BOARD), 'win-rate board needs a minimum sample');
  const bad = await call(PRO, '/api/elo/leaderboard?sort=nope&range=nope');
  assert.strictEqual(bad.body.sort, 'elo');
  assert.strictEqual(bad.body.range, 'all');
  const me = await call(FREE, '/api/elo/me');
  assert.strictEqual(me.body.tier, 'rekt');
  assert.strictEqual(me.body.cards.rekt, true);
  assert.strictEqual(me.body.cards.shark, false);
});

test('free players cannot create clans; Pro can; one clan per player', async () => {
  const denied = await call(FREE, '/api/clans', 'POST', { name: 'Free Folks', tag: 'FREE' });
  assert.strictEqual(denied.status, 403);
  assert.strictEqual(denied.body.code, 'pro_required');

  const made = await call(PRO, '/api/clans', 'POST', { name: 'Alpha Wolves', tag: 'wolf', description: 'hunt together' });
  assert.strictEqual(made.status, 201);
  assert.strictEqual(made.body.tag, 'WOLF');
  const again = await call(PRO, '/api/clans', 'POST', { name: 'Second Pack', tag: 'PACK' });
  assert.strictEqual(again.status, 409, 'already in a clan');

  const id = made.body.id;
  const join = await call(FREE, `/api/clans/${id}/join`, 'POST');
  assert.strictEqual(join.status, 200);
  assert.strictEqual(join.body.tag, 'WOLF');
  assert.strictEqual((await call(FREE, `/api/clans/${id}/join`, 'POST')).status, 409, 'cannot join twice');
});

test('a clan owner cannot found a second clan, whatever the name', async () => {
  assert.strictEqual((await call(PRO, '/api/clans', 'POST', { name: 'Taken', tag: 'TAKE' })).status, 409);
});

test('members wear the clan tag and clan pnl sums member pnl since joining', async () => {
  const db = getDb();
  const id = db.prepare('SELECT id FROM clans').get().id;
  trade(FREE, 300); // after FREE joined
  trade(PRO, 200);
  const detail = await call(FREE, `/api/clans/${id}`);
  assert.strictEqual(detail.status, 200);
  assert.strictEqual(detail.body.members.length, 2);
  assert.ok(detail.body.members.every((m) => m.clanTag === 'WOLF'));
  assert.ok(detail.body.clan.pnl >= 500, 'both members trades count');
  const list = await call(FREE, '/api/clans?sort=pnl');
  assert.strictEqual(list.body.clans[0].tag, 'WOLF');
  assert.strictEqual(list.body.myClanId, id);
  const lb = await call(FREE, '/api/elo/leaderboard');
  assert.ok(lb.body.rows.find((r) => r.username === 'freddy').clanTag === 'WOLF');
});

test('the clan board is members only', async () => {
  const id = getDb().prepare('SELECT id FROM clans').get().id;
  assert.strictEqual((await call(THIRD, `/api/clans/${id}/posts`)).status, 403);
  assert.strictEqual((await call(FREE, `/api/clans/${id}/posts`, 'POST', { body: 'gm wolves' })).status, 201);
  const posts = await call(PRO, `/api/clans/${id}/posts`);
  assert.strictEqual(posts.body.posts[0].body, 'gm wolves');
  assert.strictEqual(posts.body.posts[0].user.clanTag, 'WOLF');
});

test('leaving: owner hands over; the last member closes the clan', async () => {
  const db = getDb();
  const id = db.prepare('SELECT id FROM clans').get().id;
  assert.strictEqual((await call(PRO, '/api/clans/leave', 'POST')).status, 200);
  assert.strictEqual(db.prepare('SELECT owner_id FROM clans WHERE id = ?').get(id).owner_id, FREE);
  assert.strictEqual((await call(FREE, '/api/clans/leave', 'POST')).status, 200);
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM clans').get().n, 0);
  assert.strictEqual((await call(FREE, '/api/clans/leave', 'POST')).status, 400);
});

test('cosmetics: free = solid name colour only; Pro = cards and effects; never shown for lapsed Pro', async () => {
  const solid = await call(FREE, '/api/profiles/me/cosmetics', 'PUT', { nameColor: '#38bdf8' });
  assert.strictEqual(solid.status, 200);
  assert.strictEqual(solid.body.nameColor, '#38bdf8');
  assert.strictEqual((await call(FREE, '/api/profiles/me/cosmetics', 'PUT', { effect: 'fire' })).status, 403);
  assert.strictEqual((await call(FREE, '/api/profiles/me/cosmetics', 'PUT', { banner: 'sunrise' })).status, 403);
  assert.strictEqual((await call(FREE, '/api/profiles/me/cosmetics', 'PUT', { nameColor: 'red; background:url(x)' })).status, 400);
  assert.strictEqual((await call(FREE, '/api/profiles/me/cosmetics', 'PUT', { effect: 'none', nameColor: null })).status, 200, 'clearing is allowed');

  const ok = await call(PRO, '/api/profiles/me/cosmetics', 'PUT', { effect: 'fire', banner: 'gilded' });
  assert.strictEqual(ok.status, 200);
  const locked = await call(PRO, '/api/profiles/me/cosmetics', 'PUT', { banner: 'legend' });
  assert.strictEqual(locked.status, 403, 'tier cards must be earned');
  trade(PRO, 1);
  const lb = await call(FREE, '/api/elo/leaderboard');
  const pro = lb.body.rows.find((r) => r.username === 'prodan');
  assert.strictEqual(pro.effect, 'fire');
  assert.strictEqual(pro.banner, 'gilded');
  // a free account that somehow has an effect saved shows none
  getDb().prepare("INSERT INTO user_cosmetics (user_id, banner, effect, name_color) VALUES (?, 'gilded', 'fire', '#ff0000') ON CONFLICT(user_id) DO UPDATE SET banner='gilded', effect='fire', name_color='#ff0000'").run(FREE);
  const lb2 = await call(PRO, '/api/elo/leaderboard');
  const free = lb2.body.rows.find((r) => r.username === 'freddy');
  assert.strictEqual(free.effect, 'none');
  assert.strictEqual(free.banner, null);
  assert.strictEqual(free.nameColor, '#ff0000');
});

test('friends: search -> request -> accept -> message, with a request badge on the way', async () => {
  const found = await call(FREE, '/api/friends/search?q=prod');
  assert.strictEqual(found.body.users[0].username, 'prodan');
  assert.strictEqual(found.body.users[0].relationship, 'none');
  assert.ok(found.body.users[0].elo >= 0, 'search results carry elo');

  assert.strictEqual((await call(FREE, `/api/messages/to/${PRO}`, 'POST', { body: 'hi' })).status, 403, 'not friends yet');
  assert.strictEqual((await call(FREE, '/api/friends/request', 'POST', { userId: PRO })).body.relationship, 'outgoing');
  assert.strictEqual((await call(PRO, '/api/messages/unread')).body.requests, 1);
  const lists = await call(PRO, '/api/friends');
  assert.strictEqual(lists.body.incoming[0].username, 'freddy');
  assert.strictEqual((await call(PRO, `/api/friends/${FREE}/accept`, 'POST')).body.relationship, 'friends');

  const sent = await call(FREE, `/api/messages/to/${PRO}`, 'POST', { body: 'gg on that trade' });
  assert.strictEqual(sent.status, 200);
  const convos = await call(PRO, '/api/messages/conversations');
  assert.strictEqual(convos.body.conversations[0].user.username, 'freddy');
  assert.strictEqual(convos.body.conversations[0].unread, 1);
  assert.ok('elo' in convos.body.conversations[0].user && 'clanTag' in convos.body.conversations[0].user);
  const thread = await call(PRO, `/api/messages/with/${FREE}`);
  assert.strictEqual(thread.body.messages[0].body, 'gg on that trade');
  assert.strictEqual((await call(PRO, `/api/messages/to/${FREE}`, 'POST', { body: 'thanks' })).status, 200);
  assert.strictEqual((await call(PRO, '/api/messages/unread')).body.requests, 0);
});
