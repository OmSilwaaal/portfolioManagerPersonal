// DMs between friends, ticker shares, cosmetics and the winners feed (real SQLite, stubbed auth, stub profile lookups).
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
require('./_sqlite').installBetterSqlite3Adapter();

process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'socialwins-')), 'test.sqlite');

// The routes read public profile cards from Supabase; serve a fixed set instead.
const PROFILES = [
  { user_id: '11111111-1111-4111-8111-111111111111', username: 'larp', display_name: 'larp', avatar_url: 'https://img.example/larp.png' },
  { user_id: '22222222-2222-4222-8222-222222222222', username: 'bob', display_name: 'Bob', avatar_url: '' },
  { user_id: '33333333-3333-4333-8333-333333333333', username: 'eve', display_name: 'Eve', avatar_url: '' },
];
const adminPath = require.resolve('../src/services/supabaseAdmin');
function queryOver(rows) {
  const st = { rows, filters: [] };
  const api = {
    select() { return api; },
    in(col, vals) { st.filters.push((r) => vals.includes(r[col])); return api; },
    eq(col, val) { st.filters.push((r) => r[col] === val); return api; },
    then(res) { res({ data: st.rows.filter((r) => st.filters.every((f) => f(r))), error: null }); },
  };
  return api;
}
require.cache[adminPath] = {
  id: adminPath, filename: adminPath, loaded: true,
  exports: { supabase: { from: () => queryOver(PROFILES), auth: { admin: { getUserById: async () => ({ data: { user: null } }) } } } },
};

const express = require('express');
const { getDb } = require('../src/db/schema');
const wins = require('../src/services/wins');
const messages = require('../src/routes/messages');

const [LARP, BOB, EVE] = PROFILES.map((p) => p.user_id);
let USER = LARP;
const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.user = { id: USER }; next(); });
app.use('/api/messages', messages);
const server = app.listen(0);
const ready = new Promise((r) => server.once('listening', r));
let base;
test.before(async () => {
  await ready;
  base = `http://127.0.0.1:${server.address().port}/api/messages`;
  const db = getDb();
  db.prepare("INSERT INTO friendships (requester_id, addressee_id, status) VALUES (?, ?, 'accepted')").run(LARP, BOB);
  db.prepare("INSERT INTO friendships (requester_id, addressee_id, status) VALUES (?, ?, 'pending')").run(LARP, EVE);
});
test.after(() => server.close());

const call = (p, method = 'GET', body) =>
  fetch(base + p, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    .then(async (r) => ({ status: r.status, body: await r.json() }));

test('friends can message, strangers and pending requests cannot', async () => {
  USER = LARP;
  assert.strictEqual((await call(`/to/${BOB}`, 'POST', { body: 'gm' })).status, 200);
  assert.strictEqual((await call(`/to/${EVE}`, 'POST', { body: 'hi' })).status, 403, 'pending request is not a friendship');
  assert.strictEqual((await call(`/with/${EVE}`)).status, 403);
  assert.strictEqual((await call('/to/not-a-uuid', 'POST', { body: 'x' })).status, 400);
  assert.strictEqual((await call(`/to/${LARP}`, 'POST', { body: 'self' })).status, 400);
});

test('empty messages are rejected; bodies are trimmed and control characters stripped', async () => {
  USER = LARP;
  assert.strictEqual((await call(`/to/${BOB}`, 'POST', { body: '   ' })).status, 400);
  const r = await call(`/to/${BOB}`, 'POST', { body: '  hello‮ world\u0007  ' });
  assert.strictEqual(r.body.message.body, 'hello world');
});

test('ticker shares: valid stock + mint accepted, junk dropped', async () => {
  USER = LARP;
  const stock = await call(`/to/${BOB}`, 'POST', { ticker: { ticker: 'nvda', kind: 'stock' } });
  assert.deepStrictEqual(stock.body.message.attachment, { kind: 'stock', ticker: 'NVDA', symbol: null });
  const mint = 'So11111111111111111111111111111111111111112';
  const meme = await call(`/to/${BOB}`, 'POST', { ticker: { ticker: mint, kind: 'meme', symbol: 'SOL' } });
  assert.strictEqual(meme.body.message.attachment.ticker, mint);
  const bad = await call(`/to/${BOB}`, 'POST', { ticker: { ticker: '<script>', kind: 'stock' } });
  assert.strictEqual(bad.status, 400, 'a message with only an invalid ticker has nothing to send');
});

test('unread counts, thread paging by id, and read receipts', async () => {
  USER = BOB;
  const convos = await call('/conversations');
  const larp = convos.body.conversations.find((c) => c.user.userId === LARP);
  assert.ok(larp.unread >= 3);
  assert.strictEqual(larp.user.username, 'larp');
  assert.strictEqual(convos.body.conversations.length, 1, 'only accepted friends are listed');

  const thread = await call(`/with/${LARP}`);
  const lastId = thread.body.messages.at(-1).id;
  assert.deepStrictEqual((await call(`/with/${LARP}?after=${lastId}`)).body.messages, []);

  assert.ok((await call(`/read/${LARP}`, 'POST')).body.marked >= 3);
  assert.strictEqual((await call('/unread')).body.unread, 0);
});

test('only the two people in a conversation can read it', async () => {
  USER = EVE;
  assert.strictEqual((await call(`/with/${LARP}`)).status, 403);
});

test('profitable sells are logged; losses and dust are not', () => {
  const db = getDb();
  assert.ok(wins.recordWin({ userId: BOB, kind: 'meme', symbol: 'pepe', address: 'x', entry: 1, exit: 2, qty: 10, pnlUsd: 10, pnlPct: 100, solPrice: 100 }, db));
  assert.strictEqual(wins.recordWin({ userId: BOB, symbol: 'PEPE', pnlUsd: -5 }, db), null);
  assert.strictEqual(wins.recordWin({ userId: BOB, symbol: 'PEPE', pnlUsd: 0.2 }, db), null);
  assert.strictEqual(wins.recordWin({ symbol: 'PEPE', pnlUsd: 50 }, db), null, 'needs a user');
  assert.deepStrictEqual(wins.winStats(BOB, db), { wins: 1, totalUsd: 10, bestUsd: 10 });
});

test('a win that cannot be logged never throws (the trade it describes must still succeed)', () => {
  const broken = { prepare() { throw new Error('disk full'); } };
  assert.strictEqual(wins.recordWin({ userId: BOB, symbol: 'PEPE', pnlUsd: 100 }, broken), null);
});

test('winners feed: only real wins, ranked by profit, USD + SOL on every row', async () => {
  const db = getDb();
  db.prepare("INSERT INTO user_cosmetics (user_id, banner, effect) VALUES (?, 'storm', 'fire')").run(BOB);
  wins.recordWin({ userId: LARP, kind: 'meme', symbol: 'sol', pnlUsd: 5000, pnlPct: 60, solPrice: 200 }, db);
  const sb = require('../src/services/supabaseAdmin').supabase;
  const out = await wins.listWins({ range: 'all', solPrice: 200, supabase: sb, db });
  const usd = out.wins.map((w) => w.pnlUsd);
  assert.deepStrictEqual(usd, [...usd].sort((a, b) => b - a), 'sorted biggest first');
  assert.deepStrictEqual(out.wins.map((w) => w.rank), out.wins.map((_, i) => i + 1));
  assert.strictEqual(out.wins.length, 2, 'no seeded entries');
  assert.ok(out.wins.every((w) => w.demo === undefined && wins.ANIMS.includes(w.anim)));

  const larp = out.wins.find((w) => w.username === 'larp');
  assert.strictEqual(larp.pnlUsd, 5000);
  assert.strictEqual(larp.pnlSol, 25, '$5,000 at $200/SOL');
  assert.strictEqual(larp.avatarUrl, 'https://img.example/larp.png');

  const real = out.wins.find((w) => w.username === 'bob');
  assert.strictEqual(real.banner, 'storm');
  assert.strictEqual(real.pnlSol, 10 / 100, 'a win keeps the SOL price it happened at');
});

test('killcams are randomised per win and never repeat back to back', () => {
  const db = getDb();
  const seen = [];
  for (let i = 0; i < 40; i++) {
    const id = wins.recordWin({ userId: BOB, symbol: 'PEPE', pnlUsd: 5 + i }, db);
    seen.push(db.prepare('SELECT anim FROM trade_wins WHERE id = ?').get(id).anim);
  }
  assert.ok(seen.every((a, i) => i === 0 || a !== seen[i - 1]), 'no immediate repeats');
  assert.ok(new Set(seen).size >= 4, 'draws from the whole set');
});

test('ranges filter by age', async () => {
  const db = getDb();
  const sb = require('../src/services/supabaseAdmin').supabase;
  const day = await wins.listWins({ range: 'day', solPrice: 150, supabase: sb, db });
  assert.ok(day.wins.every((w) => Date.now() - Date.parse(w.at) <= 86_400_000 + 5000));
});

test('attachments/body helpers behave', () => {
  const { parseAttachment, cleanBody } = messages._test;
  assert.strictEqual(parseAttachment(null), null);
  assert.strictEqual(parseAttachment({ ticker: 'AAPL', kind: 'meme' }), null, 'a meme share needs a mint address');
  assert.strictEqual(cleanBody('a'.repeat(5000)).length, 1000);
});
