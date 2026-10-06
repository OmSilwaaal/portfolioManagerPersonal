'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { DatabaseSync } = require('node:sqlite');

const S = path.join(__dirname, '..', 'src', 'research', 'social');
const { initSocialSchema, addSelfDeclaredWalletLink } = require(path.join(S, 'schema.js'));
const el = require(path.join(S, 'entityLinking.js'));
const fg = require(path.join(S, 'followGraph.js'));
const { createMockProvider, createXProvider, createTelegramProvider, createRateLimiter } = require(path.join(S, 'providers.js'));
const collector = require(path.join(S, 'collector.js'));

const MINT = 'So11111111111111111111111111111111111111112';
const MINT2 = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const quiet = { warn() {}, error() {}, log() {} };
const newDb = () => initSocialSchema(new DatabaseSync(':memory:'));
const noSeeds = path.join(os.tmpdir(), 'nonexistent-seeds.json');

test('entity linking: addresses and cashtags', () => {
  assert.ok(el.isSolanaAddress(MINT));
  assert.ok(el.isSolanaAddress(MINT2));
  assert.ok(!el.isSolanaAddress('0OIl' + MINT.slice(4))); // invalid charset
  assert.ok(!el.isSolanaAddress('abc'));
  assert.ok(!el.isSolanaAddress('1'.repeat(32) + 'x')); // wrong byte length
  assert.deepStrictEqual(el.extractAddresses(`buy ${MINT}! and ${MINT2}.`), [MINT, MINT2]);
  assert.deepStrictEqual(el.extractAddresses('no addr here 12345'), []);
  assert.deepStrictEqual(el.extractCashtags('$BONK to the moon, $wif too, costs $100, a$b'), ['BONK', 'WIF']);
});

test('cashtags resolve only when unambiguous', () => {
  const known = [{ address: 'A', symbol: 'BONK' }, { address: 'B', symbol: 'WIF' }, { address: 'C', symbol: 'WIF' }];
  assert.strictEqual(el.resolveCashtag('$bonk', known), 'A');
  assert.strictEqual(el.resolveCashtag('WIF', known), null);
  assert.strictEqual(el.resolveCashtag('NOPE', known), null);
  const e = el.extractEntities(`$BONK $WIF ${MINT}`, known);
  assert.deepStrictEqual(e.tokens.sort(), ['A', MINT].sort());
});

test('schema is append-only and wallet links must be self-declared', () => {
  const db = newDb();
  addSelfDeclaredWalletLink(db, { handle: '@Alice', walletId: 'W1', source: 'self_declared_bio', evidenceUrl: 'https://x.com/alice', ts: 1 });
  assert.throws(() => db.prepare('UPDATE account SET handle = ?').run('z'), /append-only/);
  assert.throws(() => db.prepare('DELETE FROM account_wallet_link').run(), /append-only/);
  assert.throws(() => addSelfDeclaredWalletLink(db, { handle: 'bob', walletId: 'W2', source: 'inferred', evidenceUrl: 'https://x.com/b' }), /self-declared/);
  assert.throws(() => addSelfDeclaredWalletLink(db, { handle: 'bob', walletId: 'W2', source: 'self_declared_bio' }), /evidenceUrl/);
  // raw SQL bypass is blocked by trigger too
  assert.throws(() => db.prepare("INSERT INTO account_wallet_link VALUES ('x:b','W','heuristic','https://e',1)").run(), /self-declared/);
  assert.throws(() => db.prepare("INSERT INTO account_wallet_link VALUES ('x:b','W','self_declared_bio','',1)").run(), /self-declared/);
});

function seedFollowSnapshots(db) {
  const now = 1000;
  for (const h of ['s1', 's2', 's3']) {
    db.prepare('INSERT INTO account VALUES (?,?,?,?)').run(`x:${h}`, 'x', h, 1);
  }
  const ins = db.prepare('INSERT INTO follow_edge_snapshot VALUES (?,?,?)');
  ins.run('x:s1', 'x:news', 100); ins.run('x:s2', 'x:news', 100); ins.run('x:s1', 'x:solo', 100);
  // later snapshot: s2 unfollowed news, s3 followed news
  ins.run('x:s2', 'x:other', 500); ins.run('x:s3', 'x:news', 500);
  return now;
}

test('getFollowGraphAsOf uses only snapshots strictly before ts', () => {
  const db = newDb(); seedFollowSnapshots(db);
  const at = (ts) => Object.fromEntries(fg.getFollowGraphAsOf(db, ts).map((r) => [r.account_id, r.n_followers_in_seed_set]));
  assert.deepStrictEqual(at(100), {});
  assert.deepStrictEqual(at(101), { 'x:news': 2, 'x:solo': 1 });
  assert.deepStrictEqual(at(500), { 'x:news': 2, 'x:solo': 1 }); // snapshot at 500 not yet visible
  assert.deepStrictEqual(at(501), { 'x:news': 2, 'x:solo': 1, 'x:other': 1 }); // s1 + s3 follow news; s2 now follows other
  assert.deepStrictEqual(fg.getCandidateAccounts(db, 501, 2).map((r) => r.account_id), ['x:news']);
  assert.strictEqual(fg.storeCountSnapshot(db, 501, 2), 1);
  const w = db.prepare('SELECT * FROM account_weight_snapshot').get();
  assert.strictEqual(w.weight, null);
  assert.strictEqual(w.n_followers_in_seed_set, 2);
});

test('seed accounts from wallet links + manual handles; weekly snapshot cadence', async () => {
  const db = newDb();
  addSelfDeclaredWalletLink(db, { handle: 'alice', walletId: 'W1', source: 'self_declared_post', evidenceUrl: 'https://x.com/alice/status/1', ts: 10 });
  addSelfDeclaredWalletLink(db, { handle: 'carol', walletId: 'WX', source: 'self_declared_bio', evidenceUrl: 'https://x.com/carol', ts: 10 });
  const seeds = fg.getSeedAccounts(db, { skilledWalletIds: ['W1'], extraHandles: ['Bob'], asOf: 20 });
  assert.deepStrictEqual(seeds.map((s) => s.account_id).sort(), ['x:alice', 'x:bob']);
  assert.strictEqual(fg.getSeedAccounts(db, { skilledWalletIds: ['W1'], asOf: 5 }).length, 0);

  const p = createMockProvider({ following: { alice: ['news1', 'news2'], bob: ['news1'] } });
  const day = 86400000;
  let r = await fg.snapshotFollows(db, p, seeds, { now: 1 * day, logger: quiet });
  assert.strictEqual(r.snapshotted, 2);
  r = await fg.snapshotFollows(db, p, seeds, { now: 3 * day, logger: quiet });
  assert.strictEqual(r.skipped, 2);
  assert.strictEqual(p.calls.getFollowing, 2);
  r = await fg.snapshotFollows(db, p, seeds, { now: 9 * day, logger: quiet });
  assert.strictEqual(r.snapshotted, 2);
  assert.strictEqual(fg.getFollowGraphAsOf(db, 2 * day).find((x) => x.account_id === 'x:news1').n_followers_in_seed_set, 2);
});

test('seeds.json loader tolerates missing file', () => {
  assert.deepStrictEqual(fg.loadSeedsFile(noSeeds), { xHandles: [], telegramChannels: [] });
  const f = path.join(os.tmpdir(), `seeds-${process.pid}.json`);
  fs.writeFileSync(f, JSON.stringify({ x_handles: ['@Foo'], telegram_channels: ['chan'] }));
  assert.deepStrictEqual(fg.loadSeedsFile(f), { xHandles: ['foo'], telegramChannels: ['chan'] });
  fs.unlinkSync(f);
});

test('providers return enabled:false without keys', () => {
  assert.strictEqual(createXProvider({}).enabled, false);
  assert.strictEqual(createTelegramProvider({}).enabled, false);
  assert.strictEqual(createXProvider({ X_BEARER_TOKEN: 't' }, { fetchImpl: () => {} }).enabled, true);
});

test('X official provider maps responses and paginates (fake fetch)', async () => {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    const body = url.includes('/users/by/username/') ? { data: { id: '9', username: 'alice' } }
      : url.includes('/following') ? (url.includes('pagination_token=n2')
        ? { data: [{ id: '3', username: 'c' }], meta: {} } : { data: [{ id: '2', username: 'b' }], meta: { next_token: 'n2' } })
        : { data: [{ id: '55', text: 'hi', created_at: '2026-01-01T00:00:00.000Z' }] };
    return { ok: true, status: 200, json: async () => body, headers: { get: () => null } };
  };
  const p = createXProvider({ X_BEARER_TOKEN: 't' }, { fetchImpl, sleep: async () => {} });
  assert.deepStrictEqual((await p.getFollowing('alice')).map((u) => u.handle), ['b', 'c']);
  const posts = await p.getUserPosts('alice');
  assert.strictEqual(posts[0].ts, Date.parse('2026-01-01T00:00:00.000Z'));
});

test('rate limiter retries 429 with backoff then gives up on 4xx', async () => {
  const sleeps = [];
  const rl = createRateLimiter({ minIntervalMs: 0, baseDelayMs: 10, sleep: async (ms) => { sleeps.push(ms); } });
  let n = 0;
  const v = await rl.schedule(async () => { if (++n < 3) { const e = new Error('x'); e.status = 429; throw e; } return 'ok'; });
  assert.strictEqual(v, 'ok');
  assert.deepStrictEqual(sleeps.filter((s) => s >= 10), [10, 20]);
  await assert.rejects(rl.schedule(async () => { const e = new Error('nf'); e.status = 404; throw e; }), /nf/);
});

test('collector: end-to-end with mock provider, actual post time, no network', async () => {
  const db = newDb();
  const T = Date.parse('2026-03-01T12:00:00Z');
  const postTs = T - 3600000;
  const mock = createMockProvider({
    following: { s1: ['news'], s2: ['news'], s3: ['news'] },
    posts: { news: [
      { id: '1', ts: postTs, text: `new gem ${MINT} $FOO` },
      { id: '2', ts: postTs + 1000, text: 'gm everyone' },
      { id: '3', ts: T + 3600000, text: 'future-dated junk' },
    ] },
    telegram: { calls1: [{ id: '7', ts: postTs, text: `ape $FOO ${MINT2}` }] },
  });
  const opts = { providers: { x: mock, telegram: mock }, now: () => T, seedsPath: noSeeds, K: 3, logger: quiet,
    env: {}, knownTokens: [{ address: MINT2, symbol: 'FOO' }], telegramChannels: ['calls1'],
    skilledWalletIds: ['W1'] };
  for (const h of ['s1', 's2', 's3']) addSelfDeclaredWalletLink(db, { handle: h, walletId: 'W1', source: 'self_declared_bio', evidenceUrl: `https://x.com/${h}`, ts: 1 });
  const s = await collector.runOnce(db, opts);
  assert.strictEqual(s.errors, 0);
  const rows = db.prepare("SELECT * FROM account_post ORDER BY post_id, token_address").all();
  assert.deepStrictEqual(rows.map((r) => [r.post_id, r.token_address]), [['x:1', MINT2], ['x:1', MINT], ['x:2', null]]);
  assert.ok(rows.every((r) => r.ts !== r.ingested_ts && (r.post_id !== 'x:1' || r.ts === postTs)));
  assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM telegram_message').get().c, 1);
  // idempotent re-run (mock filters on sinceTs; dupes also ignored by unique index)
  await collector.runOnce(db, opts);
  assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM account_post').get().c, 3);
  assert.ok(db.prepare('SELECT COUNT(*) c FROM account_weight_snapshot').get().c >= 1);
});

test('collector never throws and start() is guarded by SOCIAL_COLLECTOR', async () => {
  const bad = { enabled: true, name: 'bad', async getFollowing() { throw new Error('boom'); }, async getUserPosts() { throw new Error('boom'); }, async getChannelMessages() { throw new Error('boom'); } };
  const s = await collector.runOnce(newDb(), { providers: { x: bad, telegram: bad }, seedsPath: noSeeds, logger: quiet, env: {}, telegramChannels: ['c'] });
  assert.ok(s.errors >= 1);
  const s2 = await collector.runOnce({}, { logger: quiet, env: {} }); // broken db object
  assert.ok(s2.errors >= 1);
  assert.strictEqual(collector.start(newDb(), { env: {} }), false);
  assert.strictEqual(collector.start(newDb(), { env: { SOCIAL_COLLECTOR: '1' }, providers: {}, intervalMs: 1e9, logger: quiet }), true);
  collector.stop();
});
