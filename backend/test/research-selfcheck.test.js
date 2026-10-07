const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('./_sqlite');

const { initWalletSchema } = require('../src/research/wallets/schema');
const { initSocialSchema } = require('../src/research/social/schema');
const sc = require('../src/research/selfCheck');

const NOW = 1_800_000_000;

function mkdb() {
  const db = new DatabaseSync(':memory:');
  initWalletSchema(db); initSocialSchema(db);
  return db;
}

test('everything off: says so, with the reason, and never throws without a db', () => {
  const { lines, counts } = sc.buildSelfCheck({ env: {}, db: null, now: NOW });
  const text = lines.join('\n');
  assert.match(text, /radar OFF \(ENABLE_RADAR != true\)/);
  assert.match(text, /smart-money collector OFF \(SMART_MONEY_COLLECTOR != 1\)/);
  assert.match(text, /fast loop OFF/);
  assert.match(text, /social collector OFF \(SOCIAL_COLLECTOR != 1\)/);
  assert.match(text, /eval job OFF \(EVAL_JOB != 1\)/);
  assert.match(text, /winner-first job OFF/);
  assert.match(text, /wallets scored n\/a/);
  assert.equal(counts.walletsScored, null);
  assert.ok(lines.length <= 5, 'one compact block');
});

test('collector flag without any provider key is reported as off for that reason', () => {
  const text = sc.buildSelfCheck({ env: { SMART_MONEY_COLLECTOR: '1' }, db: null, now: NOW }).lines.join('\n');
  assert.match(text, /smart-money collector OFF \(no HELIUS_API_KEY or BIRDEYE_API_KEY\)/);
});

test('on: providers, fast loop budget use, discovery sources, live groups; counts from the research tables', () => {
  const db = mkdb();
  const snap = (w, asOf, score, hold) => db.prepare('INSERT INTO wallet_skill_snapshot (wallet_id, as_of_ts, n_trades, passed_holdout, skill_score, event_ts, ingested_ts) VALUES (?,?,?,?,?,?,?)').run(w, asOf, 20, hold, score, asOf, asOf);
  snap('a', NOW - 9000, 0.8, 1); snap('a', NOW - 100, 0.8, 1);   // skilled now
  snap('b', NOW - 100, 0.8, 0);                                  // not passed
  snap('c', NOW - 9000, 0.8, 1); snap('c', NOW - 100, 0.2, 1);   // passed once, no longer skilled
  db.prepare('INSERT INTO smart_money_event VALUES (?,?,?,?,?,?,?,?,?)').run('tok', 'a', NOW - 300, 'buy', 500, NOW - 9000, 0.8, NOW - 300, NOW - 200);
  db.prepare('INSERT INTO smart_money_event VALUES (?,?,?,?,?,?,?,?,?)').run('tok', 'a', NOW - 3 * 86400, 'buy', 500, NOW - 9000, 0.8, NOW - 3 * 86400, NOW - 3 * 86400);   // older than 24h
  db.prepare('INSERT INTO account_post (post_id, account_id, token_address, ts, platform, text_hash, ingested_ts) VALUES (?,?,?,?,?,?,?)').run('p1', 'x:a', 'tok', (NOW - 100) * 1000, 'x', 'h', (NOW - 90) * 1000);
  db.prepare('INSERT INTO telegram_message (message_id, channel_id, ts, token_address, text_hash, ingested_ts) VALUES (?,?,?,?,?,?)').run('m1', 'ch', (NOW - 100) * 1000, 'tok', 'h', (NOW - 90) * 1000);
  db.prepare('INSERT INTO account_post (post_id, account_id, token_address, ts, platform, text_hash, ingested_ts) VALUES (?,?,?,?,?,?,?)').run('p2', 'x:b', 'tok', (NOW - 5 * 86400) * 1000, 'x', 'h', (NOW - 5 * 86400) * 1000);
  const hour = new Date(NOW * 1000).toISOString().slice(0, 13);
  db.prepare('INSERT INTO api_budget (provider, day, used) VALUES (?,?,?)').run('fast-helius', hour, 7);

  const env = { ENABLE_RADAR: 'true', SMART_MONEY_COLLECTOR: '1', SOCIAL_COLLECTOR: '1', EVAL_JOB: '1', HELIUS_API_KEY: 'k', BIRDEYE_API_KEY: 'k', SMART_MONEY_BIRDEYE_LB: '1', SMART_MONEY_SEEDS: '1' };
  const { lines, counts } = sc.buildSelfCheck({ env, db, now: NOW, extraGroups: ['smartmoney', 'social'], liveModel: 'market_v2_sm_social' });
  const text = lines.join('\n');
  assert.match(text, /radar ON/);
  assert.match(text, /extra groups smartmoney,social \(live model market_v2_sm_social\)/);
  assert.match(text, /score persistence ON \(gap 5m\)/);
  assert.match(text, /smart-money collector ON via helius,birdeye/);
  assert.match(text, /fast loop ON 60000ms \(helius, 7\/120 req this hour\)/);
  assert.match(text, /discovery: birdeye_leaderboard,seeds/);
  assert.match(text, /social collector ON/);
  assert.match(text, /eval job ON/);
  assert.deepEqual(counts, { walletsScored: 3, passedHoldout: 2, skilledNow: 1, smartMoneyEvents24h: 1, socialPosts24h: 2, radarScores24h: null });
  assert.match(text, /wallets scored 3, passed holdout 2 \(skilled now 1\), smart_money_event 24h 1, social posts 24h 2/);
});

test('warnings: collector on but no wallets / nobody skilled', () => {
  const db = mkdb();
  const env = { SMART_MONEY_COLLECTOR: '1', HELIUS_API_KEY: 'k' };
  assert.match(sc.buildSelfCheck({ env, db, now: NOW }).lines.join('\n'), /note: no wallets scored yet/);
  db.prepare('INSERT INTO wallet_skill_snapshot (wallet_id, as_of_ts, n_trades, passed_holdout, skill_score, event_ts, ingested_ts) VALUES (?,?,?,?,?,?,?)').run('x', NOW - 5, 3, 0, 0, NOW - 5, NOW - 5);
  assert.match(sc.buildSelfCheck({ env, db, now: NOW }).lines.join('\n'), /no wallet is skilled right now/);
});

test('logSelfCheck writes ONE block and never throws; start() honours RESEARCH_SELFCHECK_MS=0', () => {
  const out = [];
  const log = { log: (m) => out.push(m), warn: (m) => out.push('WARN ' + m) };
  const counts = sc.logSelfCheck({ env: {}, db: mkdb(), now: NOW, log });
  assert.equal(out.length, 1);
  assert.match(out[0], /^\[research\] self-check @ 2027-01-15T08:00:00Z\n\[research\]  radar OFF/);
  assert.equal(counts.walletsScored, 0);
  assert.equal(sc.logSelfCheck({ env: {}, db: { prepare() { throw new Error('x'); } }, now: NOW, log }) !== undefined, true);   // db errors degrade to n/a
  assert.equal(sc.start({ env: { RESEARCH_SELFCHECK_MS: '0' }, log }), null);
  const t = sc.start({ env: {}, log, initialDelayMs: 3_600_000, getContext: () => { throw new Error('ctx'); } });
  assert.ok(t);
  sc.stop();
});
