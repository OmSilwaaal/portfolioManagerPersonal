// Changing the name you signed up with, as a privacy control: who may take a handle, how fast, and what a cleared
// display name means. Real SQLite for the hold/audit log, an in-memory stand-in for the Supabase `profiles` table.
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
require('./_sqlite').installBetterSqlite3Adapter();

process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rename-')), 'test.sqlite');

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const rows = [
  { user_id: ME, username: 'oldname', display_name: 'Signup Name', bio: '', avatar_url: '' },
  { user_id: OTHER, username: 'squatter', display_name: 'Other', bio: '', avatar_url: '' },
];

// Just enough of the query builder for what the route calls on `profiles`.
function profilesQuery() {
  const st = { op: 'select', payload: null, filters: [], single: null };
  const match = (r) => st.filters.every((f) => f(r));
  const run = () => {
    if (st.op === 'upsert') {
      const found = rows.find((r) => r.user_id === st.payload.user_id);
      if (found) Object.assign(found, st.payload); else rows.push({ ...st.payload });
      return { data: rows.find((r) => r.user_id === st.payload.user_id), error: null };
    }
    const hit = rows.filter(match);
    if (st.single) return { data: hit[0] ?? null, error: null };
    return { data: hit, error: null };
  };
  const api = {
    select() { return api; },
    update(p) { st.op = 'update'; st.payload = p; return api; },
    upsert(p) { st.op = 'upsert'; st.payload = p; return api; },
    insert(p) { st.op = 'upsert'; st.payload = p; return api; },
    eq(col, val) { st.filters.push((r) => r[col] === val); return api; },
    neq(col, val) { st.filters.push((r) => r[col] !== val); return api; },
    maybeSingle() { st.single = true; return api; },
    single() { st.single = true; return api; },
    then(res) { res(run()); },
  };
  return api;
}

const adminPath = require.resolve('../src/services/supabaseAdmin');
let AUTH_USER = { id: ME, email: 'someone@gmail.com', user_metadata: {}, app_metadata: {}, created_at: '2024-01-01T00:00:00Z' };
require.cache[adminPath] = {
  id: adminPath, filename: adminPath, loaded: true,
  exports: {
    supabase: {
      from: () => profilesQuery(),
      auth: { admin: { getUserById: async (id) => ({ data: { user: id === ME ? AUTH_USER : { id, user_metadata: {}, app_metadata: {}, created_at: null } } }) } },
    },
  },
};

const express = require('express');
const { getDb } = require('../src/db/schema');
const profiles = require('../src/routes/profiles');

const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.user = { ...AUTH_USER }; next(); });
app.use('/api/profiles', profiles);
const server = app.listen(0);
const ready = new Promise((r) => server.once('listening', r));
let base;
test.before(async () => { await ready; base = `http://127.0.0.1:${server.address().port}/api/profiles`; });
test.after(() => server.close());

const call = (p, method = 'GET', body) =>
  fetch(base + p, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    .then(async (r) => ({ status: r.status, body: await r.json() }));

const nameOf = (id) => rows.find((r) => r.user_id === id).username;

test('a rename moves the handle and puts the old one into the hold', async () => {
  const res = await call('/me', 'PATCH', { username: 'newname' });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(nameOf(ME), 'newname');
  const held = getDb().prepare('SELECT user_id, username FROM username_history WHERE username = ?').get('oldname');
  assert.deepStrictEqual({ ...held }, { user_id: ME, username: 'oldname' });
});

test('the released handle is held against everyone but its previous owner', async () => {
  AUTH_USER = { ...AUTH_USER, id: OTHER };
  const theirs = await call('/me', 'PATCH', { username: 'oldname' });
  assert.strictEqual(theirs.status, 409);
  assert.match(theirs.body.message, /held for 30 days/);
  assert.strictEqual(nameOf(OTHER), 'squatter', 'nothing was written');

  AUTH_USER = { ...AUTH_USER, id: ME };
  assert.strictEqual((await call('/me', 'PATCH', { username: 'oldname' })).status, 200, 'you can take your own name back');
  assert.strictEqual(nameOf(ME), 'oldname');
});

test('reserved handles cannot be claimed, so a seeded trader cannot be impersonated', async () => {
  // The Elo ladder and the winners board attribute a seed row to whoever holds its handle.
  for (const name of ['larp', 'degen_dan', 'admin', 'support', 'travauxus']) {
    const res = await call('/me', 'PATCH', { username: name });
    assert.strictEqual(res.status, 400, `${name} should be refused`);
    assert.match(res.body.message, /reserved/);
  }
  assert.strictEqual(nameOf(ME), 'oldname');
});

test('format and uniqueness are enforced server-side', async () => {
  for (const bad of ['ab', 'a'.repeat(21), 'has space', 'Caps-Dash', '..']) {
    assert.strictEqual((await call('/me', 'PATCH', { username: bad })).status, 400, `${bad} should be refused`);
  }
  assert.strictEqual((await call('/me', 'PATCH', { username: 'SQUATTER' })).status, 400, 'collisions are case-insensitive');
  assert.strictEqual((await call('/me', 'PATCH', { username: 42 })).status, 400);
  assert.strictEqual(nameOf(ME), 'oldname');
});

test('renames are capped per day, and saving the form without changing the handle is free', async () => {
  const db = getDb();
  const used = () => db.prepare(
    "SELECT COUNT(*) AS n FROM username_history WHERE user_id = ? AND released_at > datetime('now', '-1 day')"
  ).get(ME).n;

  // Earlier tests already spent part of today's allowance, so spend whatever is left rather than assuming.
  for (let i = 0; used() < 3; i++) {
    assert.ok(i < 5, 'the cap should be reached well inside five attempts');
    assert.strictEqual((await call('/me', 'PATCH', { username: `handle_${i}` })).status, 200, `rename ${i} is inside the cap`);
  }
  const over = await call('/me', 'PATCH', { username: 'handle_over' });
  assert.strictEqual(over.status, 429);
  assert.match(over.body.message, /3 times a day/);
  const kept = nameOf(ME);
  assert.notStrictEqual(kept, 'handle_over');

  // Re-saving the same handle (what the settings form posts when only the bio changed) must not be refused.
  const same = await call('/me', 'PATCH', { username: kept, bio: 'still here' });
  assert.strictEqual(same.status, 200);
  assert.strictEqual(rows.find((r) => r.user_id === ME).bio, 'still here');
});

test('a display name can be set, is stripped of spoofing characters, and a cleared one stays cleared', async () => {
  const set = await call('/me', 'PATCH', { display_name: '  Ja‮ne​  Doe  ' });
  assert.strictEqual(set.status, 200);
  assert.strictEqual(rows.find((r) => r.user_id === ME).display_name, 'Jane Doe');

  // '@' is removed so a name can never read as an email or a handle.
  await call('/me', 'PATCH', { display_name: 'me@example.com' });
  assert.strictEqual(rows.find((r) => r.user_id === ME).display_name, 'meexample.com');

  // Clearing it is honoured: the sign-up name must not come back, on this read or any later one.
  assert.strictEqual((await call('/me', 'PATCH', { display_name: '' })).status, 200);
  assert.strictEqual(rows.find((r) => r.user_id === ME).display_name, '');
  assert.strictEqual((await call('/me')).body.display_name, '', 'GET /me must not re-backfill it');
  const visited = await call(`/${ME}`);
  assert.strictEqual(visited.status, 200);
  assert.strictEqual(visited.body.display_name, null, 'other people see no name at all, only the @handle');
  assert.ok(!JSON.stringify(visited.body).includes('someone@gmail.com'));
  assert.ok(!JSON.stringify(visited.body).includes('someone'), 'the email local part must not leak as a name');

  assert.strictEqual((await call('/me', 'PATCH', { display_name: 7 })).status, 400);
});
