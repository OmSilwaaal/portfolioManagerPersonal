'use strict';
// 4chan is an OFF-BY-DEFAULT, EXPERIMENTAL anonymous-chatter control: untrusted content, no raw text stored,
// no media/links fetched, double opt-in.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { DatabaseSync } = require('./_sqlite');

const S = path.join(__dirname, '..', 'src', 'research', 'social');
const { initSocialSchema } = require(path.join(S, 'schema.js'));
const feeds = require(path.join(S, 'feeds.js'));
const collector = require(path.join(S, 'collector.js'));

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58(buf) {
  let n = BigInt('0x' + buf.toString('hex')); let s = '';
  while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  for (const b of buf) { if (b === 0) s = '1' + s; else break; }
  return s;
}
const addr = (i) => b58(Buffer.concat([Buffer.from([1 + (i % 200)]), crypto.createHash('sha256').update(String(i)).digest().subarray(0, 31)]));
const MINT = 'So11111111111111111111111111111111111111112';
const quiet = { warn() {}, error() {}, log() {} };
const noSeeds = path.join(os.tmpdir(), 'nonexistent-seeds.json');
const resp = (body, headers = {}) => ({ ok: true, status: 200, headers: { get: (k) => headers[String(k).toLowerCase()] ?? null }, json: async () => body });
const BOTH = { SOCIAL_FOURCHAN: '1', SOCIAL_FOURCHAN_ACK: '1' };

test('4chan feed is off without BOTH SOCIAL_FOURCHAN=1 and SOCIAL_FOURCHAN_ACK=1', async () => {
  const f = async () => resp({});
  for (const env of [{}, { SOCIAL_FOURCHAN: '1' }, { SOCIAL_FOURCHAN_ACK: '1' }, { SOCIAL_FOURCHAN: 'true', SOCIAL_FOURCHAN_ACK: 'true' }]) {
    const p = feeds.createFourchanProvider(env, { fetchImpl: f });
    assert.strictEqual(p.enabled, false, JSON.stringify(env));
    assert.ok(p.reason);
  }
  assert.match(feeds.createFourchanProvider({ SOCIAL_FOURCHAN: '1' }, { fetchImpl: f }).reason, /ACK/);
  assert.strictEqual(feeds.createFourchanProvider(BOTH, { fetchImpl: f }).enabled, true);

  // the collector does not poll the feed with only one flag, even if a provider object is injected
  const mk = () => feeds.createMockFeedProvider({ batches: [[{ id: 'f:1', ts: 1000, text: `x ${MINT}`, platform: '4chan', sourceId: 'biz', threadId: 'biz:1', authorId: null }]] });
  const bad = { enabled: false };
  for (const env of [{ SOCIAL_FOURCHAN: '1' }, { SOCIAL_FOURCHAN_ACK: '1' }]) {
    const db = initSocialSchema(new DatabaseSync(':memory:'));
    const prov = mk();
    await collector.runOnce(db, { providers: { x: bad, telegram: bad, fourchan: prov }, seedsPath: noSeeds, logger: quiet, env, now: () => 2000 });
    assert.strictEqual(prov.calls, 0);
    assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM social_post_raw').get().n, 0);
  }
});

test('4chan: raw text is never stored anywhere; only hash + extracted addresses/cashtags', async () => {
  const db = initSocialSchema(new DatabaseSync(':memory:'));
  const now = 1_700_000_000_000;
  const MARK = 'ZZQ_SENTINEL_PHRASE_9981';
  const feed = feeds.createMockFeedProvider({ batches: [[
    { id: '4chan:biz:1', ts: now - 1000, text: `${MARK} buy ${MINT} and $WIF now`, platform: '4chan', sourceId: 'biz', threadId: 'biz:1', authorId: null },
    { id: '4chan:biz:2', ts: now - 900, text: `${MARK} only a $CASH tag`, platform: '4chan', sourceId: 'biz', threadId: 'biz:1', authorId: null },
    { id: '4chan:biz:3', ts: now - 800, text: `${MARK} no entities at all`, platform: '4chan', sourceId: 'biz', threadId: 'biz:1', authorId: null },
  ]] });
  const r = await collector.runFeedOnce(db, feed, { logger: quiet, env: {}, knownTokens: [], now: () => now });
  assert.strictEqual(r.stored, 2);
  assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM social_post_text').get().n, 0);
  assert.ok(db.prepare('SELECT text FROM account_post').all().every((x) => x.text === null));
  const raw = db.prepare('SELECT * FROM social_post_raw ORDER BY post_id').all();
  assert.deepStrictEqual(JSON.parse(raw[0].addresses_json), [MINT]);
  assert.deepStrictEqual(JSON.parse(raw[0].cashtags_json), ['WIF']);
  assert.match(raw[0].text_hash, /^[0-9a-f]{64}$/);
  // sweep EVERY table and column: the post text must not appear anywhere
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((t) => t.name);
  for (const t of tables) {
    const dump = JSON.stringify(db.prepare(`SELECT * FROM ${t}`).all());
    assert.ok(!dump.includes(MARK), `raw 4chan text leaked into ${t}`);
    assert.ok(!dump.includes('no entities at all'), `raw 4chan text leaked into ${t}`);
  }
  // a non-4chan platform still gets its (retention-limited) text row: the rule is 4chan-specific
  collector.storeFeedPost(db, { id: 'reddit:t3_x', ts: now - 500, text: `${MARK} ${MINT}`, platform: 'reddit', sourceId: 'solana', threadId: 'reddit:x', authorId: 'reddit:u' }, [], now);
  assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM social_post_text').get().n, 1);
});

test('4chan: platform/untrusted flag is what matters, not the provider (defence in depth) and candidates are capped', () => {
  const db = initSocialSchema(new DatabaseSync(':memory:'));
  const flood = Array.from({ length: 40 }, (_, i) => addr(i)).join(' ') + ' ' + Array.from({ length: 40 }, (_, i) => `$T${i}`).join(' ');
  assert.ok(collector.storeFeedPost(db, { id: 'x:1', ts: 1, text: flood, platform: 'other', untrusted: true, sourceId: 'b', threadId: 't', authorId: null }, [], 5));
  const row = db.prepare('SELECT addresses_json, cashtags_json FROM social_post_raw').get();
  assert.ok(JSON.parse(row.addresses_json).length <= 8);
  assert.ok(JSON.parse(row.cashtags_json).length <= 8);
  assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM social_post_text').get().n, 0);
  // text beyond the cap is not even examined
  const far = 'a'.repeat(2100) + ` ${MINT}`;
  assert.strictEqual(collector.storeFeedPost(db, { id: 'x:2', ts: 1, text: far, platform: '4chan', sourceId: 'b', threadId: 't', authorId: null }, [], 5), false);
});

test('4chan: HTML is stripped, hostile input never throws, length is capped', () => {
  assert.strictEqual(feeds.htmlToText('a<script>alert(1)</script>b <img src="http://evil/x.png"><a href="http://evil/">link</a>'), 'aalert(1)b link');
  assert.doesNotThrow(() => feeds.htmlToText('&#99999999999; &#xFFFFFFFF; &#55357; &#0; ok'));
  assert.strictEqual(feeds.htmlToText('x'.repeat(100000)).length, feeds.MAX_POST_TEXT_CHARS);
  assert.ok(!feeds.htmlToText('a\u0000b\u0007c').match(/[\u0000-\u0008]/));
  const cat = feeds.parseCatalog([{ page: 1, threads: [{ no: 1, time: 1, com: '<'.repeat(50000), sub: 'y'.repeat(50000), tim: 1234, ext: '.png', filename: 'evil' }] }]);
  assert.ok(cat[0].op.text.length <= feeds.MAX_POST_TEXT_CHARS);
  assert.ok(!('tim' in cat[0].op) && !('ext' in cat[0].op) && !('filename' in cat[0].op));
});

test('4chan: no image, attachment or in-post link is ever fetched; only catalog/thread JSON on the API host', async () => {
  const urls = [];
  const sec = 1_700_000_000;
  const nasty = '<a href="https://evil.example/pwn">https://evil.example/pwn</a><img src="https://i.4cdn.org/biz/1.png"> https://i.4cdn.org/biz/2.jpg ' + MINT;
  const fetchImpl = async (url) => {
    urls.push(url);
    if (url.endsWith('/catalog.json')) {
      return resp([{ page: 1, threads: [{ no: 100, time: sec - 100, last_modified: sec - 10, replies: 2, com: nasty, tim: 1700000000123, ext: '.png', filename: 'x', md5: 'abc', semantic_url: 'https://evil.example/' }] }]);
    }
    return resp({ posts: [{ no: 100, time: sec - 100, com: nasty, tim: 1, ext: '.webm' }, { no: 101, time: sec - 50, com: nasty, tim: 2, ext: '.gif' }] });
  };
  const p = feeds.createFourchanProvider(BOTH, { fetchImpl, now: () => sec * 1000, sleep: async () => {}, catalogMinIntervalMs: 0 });
  const posts = await p.getNewPosts();
  assert.ok(posts.length >= 2);
  assert.ok(posts.every((x) => x.untrusted === true && x.platform === '4chan'));
  assert.ok(urls.length >= 2);
  for (const u of urls) {
    assert.ok(/^https:\/\/a\.4cdn\.org\/biz\/(catalog\.json|thread\/\d+\.json)$/.test(u), `unexpected fetch: ${u}`);
  }
  assert.ok(posts.every((x) => !/<|href|img/i.test(x.text)));
});

test('4chan: a non-integer/hostile thread number cannot make the provider fetch an arbitrary URL', async () => {
  const urls = [];
  const sec = 1_700_000_000;
  const fetchImpl = async (url) => {
    urls.push(url);
    if (url.endsWith('/catalog.json')) return resp([{ page: 1, threads: [{ no: 1e21, time: sec, last_modified: sec, replies: 3, com: 'x' }] }]);
    return resp({ posts: [] });
  };
  const p = feeds.createFourchanProvider(BOTH, { fetchImpl, now: () => sec * 1000, sleep: async () => {}, catalogMinIntervalMs: 0 });
  await p.getNewPosts();
  assert.deepStrictEqual(urls, ['https://a.4cdn.org/biz/catalog.json']);
});
