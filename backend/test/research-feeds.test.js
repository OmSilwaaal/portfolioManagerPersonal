'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('os');
const { DatabaseSync } = require('./_sqlite');

const S = path.join(__dirname, '..', 'src', 'research', 'social');
const { initSocialSchema, pruneSocialText } = require(path.join(S, 'schema.js'));
const feeds = require(path.join(S, 'feeds.js'));
const { getProviders } = require(path.join(S, 'providers.js'));
const collector = require(path.join(S, 'collector.js'));

const MINT = 'So11111111111111111111111111111111111111112';
const quiet = { warn() {}, error() {}, log() {} };
const newDb = () => initSocialSchema(new DatabaseSync(':memory:'));
const noSeeds = path.join(os.tmpdir(), 'nonexistent-seeds.json');

const resp = (body, { status = 200, headers = {} } = {}) => ({
  ok: status >= 200 && status < 300, status,
  headers: { get: (k) => headers[String(k).toLowerCase()] ?? null },
  json: async () => body,
});
const tail = (url) => url.split('/').slice(-2).join('/');

test('4chan parsing: html stripped, <wbr> removed without a space so addresses survive', () => {
  const half = Math.floor(MINT.length / 2);
  const com = `gm<br>buy &gt;&gt;123 ${MINT.slice(0, half)}<wbr>${MINT.slice(half)} &amp; $FOO`;
  assert.strictEqual(feeds.htmlToText(com), `gm\nbuy >>123 ${MINT} & $FOO`);
  const cat = feeds.parseCatalog([{ page: 1, threads: [{ no: 5, time: 1000, last_modified: 1500, replies: 3, sub: 'Title', com: 'x<br>y' }, { bad: 1 }] }], 'biz');
  assert.strictEqual(cat.length, 1);
  assert.deepStrictEqual([cat[0].no, cat[0].lastModified, cat[0].replies, cat[0].op.ts], [5, 1500, 3, 1_000_000]);
  const posts = feeds.parseThread({ posts: [{ no: 5, time: 1000, com: 'op' }, { no: 6, time: 1010, com: 'r', id: 'AbC' }, { no: 'x' }] }, 'biz');
  assert.deepStrictEqual(posts.map((p) => [p.id, p.ts, p.posterId]), [[5, 1_000_000, null], [6, 1_010_000, 'AbC']]);
});

test('4chan provider is off unless SOCIAL_FOURCHAN=1 and SOCIAL_FOURCHAN_ACK=1', () => {
  const p = feeds.createFourchanProvider({}, { fetchImpl: async () => resp({}) });
  assert.strictEqual(p.enabled, false);
  assert.ok(p.reason);
  assert.strictEqual(getProviders({}).fourchan.enabled, false);
});

test('4chan: <=1 req/s spacing, catalog >=60s, If-Modified-Since, only changed threads refetched', async () => {
  let clock = 1_700_000_000_000;
  const sec = () => Math.floor(clock / 1000);
  const calls = [];
  const sleeps = [];
  let catalogVersion = 0;
  const lm200 = sec() - 100;
  const fetchImpl = async (url, { headers }) => {
    calls.push({ url, ims: headers['If-Modified-Since'] || null, ua: headers['User-Agent'] });
    if (url.endsWith('/catalog.json')) {
      if (catalogVersion === 1) return resp(null, { status: 304 });
      const lm1 = catalogVersion === 2 ? sec() : sec() - 100;
      return resp([{ page: 1, threads: [
        { no: 100, time: sec() - 500, last_modified: lm1, replies: 1, com: 'op100' },
        { no: 200, time: sec() - 500, last_modified: lm200, replies: 1, com: 'op200' },
      ] }], { headers: { 'last-modified': 'Tue, 01 Jan 2030 00:00:00 GMT' } });
    }
    const no = Number(url.match(/thread\/(\d+)\.json/)[1]);
    const reply = catalogVersion === 2 ? 103 : no + 1;
    return resp({ posts: [{ no, time: sec() - 500, com: 'op' }, { no: reply, time: sec(), com: `reply ${MINT}` }] },
      { headers: { 'last-modified': `thread-${no}-lm` } });
  };
  const p = feeds.createFourchanProvider({ SOCIAL_FOURCHAN: '1', SOCIAL_FOURCHAN_ACK: '1' }, { fetchImpl, now: () => clock, sleep: async (ms) => { sleeps.push(ms); } });
  assert.ok(p.enabled);

  const first = await p.getNewPosts();
  assert.deepStrictEqual(calls.map((c) => tail(c.url)), ['biz/catalog.json', 'thread/100.json', 'thread/200.json']);
  assert.strictEqual(calls[0].ims, null);
  assert.ok(calls[0].ua.length > 10);
  assert.deepStrictEqual(first.map((x) => x.id).sort(), ['4chan:biz:100', '4chan:biz:101', '4chan:biz:200', '4chan:biz:201']);
  assert.ok(first.every((x) => x.platform === '4chan' && x.authorId === null && x.threadId.startsWith('biz:')));
  assert.ok(first.find((x) => x.id.endsWith(':101')).text.includes(MINT));
  assert.ok(sleeps.length >= 2 && sleeps.every((ms) => ms >= 1000), 'requests spaced >= ~1s apart');

  // inside the 60s catalog interval: no request at all
  clock += 30_000;
  assert.deepStrictEqual(await p.getNewPosts(), []);
  assert.strictEqual(calls.length, 3);

  // after 60s: conditional catalog request -> 304 -> nothing, no thread fetches
  clock += 31_000; catalogVersion = 1;
  assert.deepStrictEqual(await p.getNewPosts(), []);
  assert.strictEqual(calls.length, 4);
  assert.strictEqual(calls[3].ims, 'Tue, 01 Jan 2030 00:00:00 GMT');

  // catalog changed for thread 100 only: exactly one thread refetch, with If-Modified-Since from its last fetch
  clock += 61_000; catalogVersion = 2;
  const third = await p.getNewPosts();
  const newCalls = calls.slice(4);
  assert.deepStrictEqual(newCalls.map((c) => tail(c.url)), ['biz/catalog.json', 'thread/100.json']);
  assert.strictEqual(newCalls[1].ims, 'thread-100-lm');
  assert.deepStrictEqual(third.map((x) => x.id), ['4chan:biz:103']);       // OP and reply 101 are not re-delivered
});

test('4chan: a thread is never refetched within 10s even when the catalog polls fast', async () => {
  let clock = 1_700_000_000_000;
  const sec = () => Math.floor(clock / 1000);
  let n = 0; const threadCalls = [];
  const fetchImpl = async (url) => {
    if (url.endsWith('/catalog.json')) return resp([{ page: 1, threads: [{ no: 9, time: sec() - 100, last_modified: sec() + n, replies: 1, com: 'op' }] }]);
    threadCalls.push(clock);
    return resp({ posts: [{ no: 9, time: sec(), com: 'op' }, { no: 10 + n, time: sec(), com: 'r' }] });
  };
  const p = feeds.createFourchanProvider({ SOCIAL_FOURCHAN: '1', SOCIAL_FOURCHAN_ACK: '1' }, { fetchImpl, now: () => clock, sleep: async () => {}, catalogMinIntervalMs: 0 });
  await p.getNewPosts();
  clock += 3000; n = 1;
  await p.getNewPosts();
  assert.strictEqual(threadCalls.length, 1, 'second thread fetch deferred (<10s)');
  clock += 8000; n = 2;
  await p.getNewPosts();
  assert.strictEqual(threadCalls.length, 2);
});

test('4chan: 404 thread is marked dead and never fetched again; provider errors never throw out of the collector', async () => {
  let clock = 1_700_000_000_000;
  const sec = () => Math.floor(clock / 1000);
  let threadHits = 0;
  const fetchImpl = async (url) => {
    if (url.endsWith('/catalog.json')) return resp([{ page: 1, threads: [{ no: 9, time: sec() - 100, last_modified: sec(), replies: 1, com: 'op' }] }]);
    threadHits++; return resp({}, { status: 404 });
  };
  const p = feeds.createFourchanProvider({ SOCIAL_FOURCHAN: '1', SOCIAL_FOURCHAN_ACK: '1' }, { fetchImpl, now: () => clock, sleep: async () => {}, catalogMinIntervalMs: 0 });
  await p.getNewPosts(); clock += 20_000; await p.getNewPosts();
  assert.strictEqual(threadHits, 1);
  const boom = { enabled: true, name: '4chan', async getNewPosts() { throw new Error('net down'); } };
  const r = await collector.runFeedOnce(newDb(), boom, { logger: quiet, env: {} });
  assert.strictEqual(r.stored, 0);
  assert.strictEqual(r.errors, 1);
});

test('reddit is disabled without keys or without the non-commercial ack', () => {
  assert.strictEqual(feeds.createRedditProvider({}).enabled, false);
  const noAck = feeds.createRedditProvider({ REDDIT_CLIENT_ID: 'a', REDDIT_CLIENT_SECRET: 'b' }, { fetchImpl: async () => resp({}) });
  assert.strictEqual(noAck.enabled, false);
  assert.match(noAck.reason, /NON_COMMERCIAL_ACK/);
  const bad = feeds.createRedditProvider({ REDDIT_CLIENT_ID: 'a', REDDIT_CLIENT_SECRET: 'b', REDDIT_NON_COMMERCIAL_ACK: '0' }, { fetchImpl: async () => resp({}) });
  assert.strictEqual(bad.enabled, false);
  assert.strictEqual(getProviders({ REDDIT_CLIENT_ID: 'a', REDDIT_CLIENT_SECRET: 'b' }).reddit.enabled, false);
});

test('reddit with ack: oauth, descriptive user agent, posts+comments mapped, cursor prevents repeats', async () => {
  const clock = 1_700_000_000_000;
  const seen = [];
  const fetchImpl = async (url, opts) => {
    seen.push({ url, headers: opts.headers, method: opts.method });
    if (url.includes('access_token')) return resp({ access_token: 'tok', expires_in: 3600 });
    const kind = url.includes('/comments?') ? 't1' : 't3';
    const base = clock / 1000;
    return resp({ data: { children: [kind === 't3'
      ? { kind: 't3', data: { name: 't3_abc', created_utc: base - 60, title: 'Look', selftext: `ca ${MINT}`, author: 'Someone', subreddit: 'solana' } }
      : { kind: 't1', data: { name: 't1_def', created_utc: base - 30, body: '$BONK', author: '[deleted]', link_id: 't3_abc', subreddit: 'solana' } }] } });
  };
  const env = { REDDIT_CLIENT_ID: 'id', REDDIT_CLIENT_SECRET: 'sec', REDDIT_NON_COMMERCIAL_ACK: '1', REDDIT_SUBREDDITS: 'r/solana', REDDIT_USERNAME: 'tester' };
  const p = feeds.createRedditProvider(env, { fetchImpl, now: () => clock, sleep: async () => {} });
  assert.ok(p.enabled);
  const posts = await p.getNewPosts();
  assert.deepStrictEqual(posts.map((x) => x.id).sort(), ['reddit:t1_def', 'reddit:t3_abc']);
  const post = posts.find((x) => x.id === 'reddit:t3_abc');
  assert.strictEqual(post.authorId, 'reddit:someone');
  assert.strictEqual(post.ts, clock - 60_000);
  assert.strictEqual(posts.find((x) => x.id === 'reddit:t1_def').authorId, null);
  assert.ok(seen.every((c) => /by \/u\/tester/.test(c.headers['User-Agent'])));
  assert.ok(seen[0].url.includes('access_token') && seen[0].method === 'POST');
  assert.ok(seen.slice(1).every((c) => c.headers.Authorization === 'bearer tok' && c.url.startsWith('https://oauth.reddit.com/r/solana/')));
  assert.deepStrictEqual(await p.getNewPosts(), []);
});

test('entity-linked posts are stored append-only; unresolved cashtags kept as candidates; text is retention-limited', async () => {
  const db = newDb();
  const now = 1_700_000_000_000;
  const old = now - 40 * 86400000;
  const mk = (n, ts, text, authorId = null, thread = 'biz:1') => ({ id: `4chan:biz:${n}`, ts, text, platform: '4chan', sourceId: 'biz', threadId: thread, authorId });
  const posts = [
    mk(1, now - 5000, `ape ${MINT} now`),
    mk(2, now - 4000, '$FOO looks good'),
    mk(3, now - 3000, 'unrelated chatter about $ZZZ'),
    mk(4, now - 2000, 'nothing to see'),
    mk(5, old, `old ${MINT}`, '4chan:biz:t0:ID1', 'biz:0'),
  ];
  const known = [{ address: 'FOOADDR', symbol: 'FOO' }];
  const feed = feeds.createMockFeedProvider({ batches: [posts, posts] });
  const r1 = await collector.runFeedOnce(db, feed, { logger: quiet, env: {}, knownTokens: known, now: () => now });
  assert.strictEqual(r1.seen, 5);
  assert.strictEqual(r1.stored, 4);       // post 4 has no token candidate
  const ap = db.prepare('SELECT post_id, token_address, account_id, text, platform FROM account_post ORDER BY post_id').all();
  assert.deepStrictEqual(ap.map((r) => [r.post_id, r.token_address]), [['4chan:biz:1', MINT], ['4chan:biz:2', 'FOOADDR'], ['4chan:biz:5', MINT]]);
  assert.ok(ap.every((r) => r.text === null && r.platform === '4chan'));
  assert.strictEqual(ap[0].account_id, '4chan:biz:1:anon', 'thread-level anonymous id when the board gives no poster id');
  assert.strictEqual(ap[2].account_id, '4chan:biz:t0:ID1');
  const raw = db.prepare('SELECT post_id, author_id, addresses_json, cashtags_json FROM social_post_raw ORDER BY post_id').all();
  assert.strictEqual(raw.length, 4);
  assert.deepStrictEqual(JSON.parse(raw.find((r) => r.post_id.endsWith(':3')).cashtags_json), ['ZZZ']);
  assert.strictEqual(raw.find((r) => r.post_id.endsWith(':5')).author_id, '4chan:biz:t0:ID1');
  assert.strictEqual(raw.find((r) => r.post_id.endsWith(':1')).author_id, null);
  // re-ingesting the same posts adds nothing
  await collector.runFeedOnce(db, feed, { logger: quiet, env: {}, knownTokens: known, now: () => now });
  assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM social_post_raw').get().n, 4);
  assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM account_post').get().n, 3);
  // append-only
  assert.throws(() => db.prepare('UPDATE social_post_raw SET ts = 1').run(), /append-only/);
  assert.throws(() => db.prepare('DELETE FROM social_post_raw').run(), /append-only/);
  assert.throws(() => db.prepare('UPDATE account_post SET ts = 1').run(), /append-only/);
  // retention: the 40-day-old text is gone after the prune in runFeedOnce (default 30d); hashes/candidates stay forever
  // 4chan never gets a raw-text row at all; retention is exercised with a reddit post
  assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM social_post_text').get().n, 0);
  collector.storeFeedPost(db, { id: 'reddit:t3_a', ts: now - 1000, text: `hi ${MINT}`, platform: 'reddit', sourceId: 'solana', threadId: 'reddit:a', authorId: 'reddit:u' }, [], now);
  collector.storeFeedPost(db, { id: 'reddit:t3_old', ts: old, text: `old ${MINT}`, platform: 'reddit', sourceId: 'solana', threadId: 'reddit:b', authorId: 'reddit:u' }, [], now);
  assert.strictEqual(pruneSocialText(db, now, 30), 1);
  assert.strictEqual(db.prepare("SELECT COUNT(*) n FROM social_post_raw WHERE post_id = '4chan:biz:5'").get().n, 1);
  assert.strictEqual(pruneSocialText(db, now, 0.00001), 1);
  assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM social_post_raw').get().n, 6);
});

test('runOnce polls feed providers only with their flag; future timestamps rejected', async () => {
  const now = 1_700_000_000_000;
  const mk = () => feeds.createMockFeedProvider({ batches: [[
    { id: 'f:1', ts: now - 1000, text: `x ${MINT}`, platform: '4chan', sourceId: 'biz', threadId: 'biz:1', authorId: null },
    { id: 'f:2', ts: now + 10 * 3600 * 1000, text: `future ${MINT}`, platform: '4chan', sourceId: 'biz', threadId: 'biz:1', authorId: null },
  ]] });
  const bad = { enabled: false };
  const off = newDb();
  await collector.runOnce(off, { providers: { x: bad, telegram: bad, fourchan: mk() }, seedsPath: noSeeds, logger: quiet, env: {}, now: () => now });
  assert.strictEqual(off.prepare('SELECT COUNT(*) n FROM social_post_raw').get().n, 0);
  const on = newDb();
  const s = await collector.runOnce(on, { providers: { x: bad, telegram: bad, fourchan: mk() }, seedsPath: noSeeds, logger: quiet, env: { SOCIAL_FOURCHAN: '1', SOCIAL_FOURCHAN_ACK: '1' }, now: () => now });
  assert.strictEqual(s.fourchan, 1);
  assert.strictEqual(on.prepare('SELECT COUNT(*) n FROM social_post_raw').get().n, 1);
  assert.strictEqual(collector.start(on, { env: {} }), false);       // SOCIAL_COLLECTOR switch still gates start()
});
