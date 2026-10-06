const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite'); // local Node 24; prod uses better-sqlite3 with the same API subset

const X = require('../src/radar/extraFeatures');
const { initWalletSchema } = require('../src/research/wallets/schema');
const { initSocialSchema } = require('../src/research/social/schema');

// features.js pulls in radar/db.js -> better-sqlite3 (a native module that may not be built locally); those tests skip then.
let F = null;
try { F = require('../src/radar/features'); } catch { F = null; }
const needsRadar = { skip: F ? false : 'better-sqlite3 not loadable here' };

const T = 1_700_000_000;
const ev = (o) => ({ wallet: 'w1', ts: T - 60, side: 'buy', amount_usd: 1000, skill_as_of_ts: T - 86400, skill_score: 0.8, passed_holdout: 1, ...o });
const post = (o) => ({ kind: 'post', platform: 'x', account: 'a1', ts: T - 60, ...o });

test('smart money: window, skill-as-of-event, ingest time, distinct buyers, net', () => {
  const events = [
    ev({ wallet: 'w1', amount_usd: 1000 }),
    ev({ wallet: 'w1', ts: T - 30, amount_usd: 500 }),                    // same wallet: counted once as a buyer, still adds USD
    ev({ wallet: 'w2', amount_usd: 2000 }),
    ev({ wallet: 'w3', side: 'sell', amount_usd: 700 }),                  // sell lowers net, isn't a buyer
    ev({ wallet: 'w4', skill_score: 0.3 }),                               // not skilled
    ev({ wallet: 'w5', passed_holdout: 0 }),                              // failed holdout
    ev({ wallet: 'w6', skill_as_of_ts: T - 10 }),                         // snapshot AFTER the event = look-ahead, rejected
    ev({ wallet: 'w7', ts: T - 31 * 60 }),                                // older than 30m
    ev({ wallet: 'w8', ts: T + 1 }),                                      // future
    ev({ wallet: 'w9', ingested_ts: T + 5 }),                             // happened before t but we only stored it later
  ];
  const f = X.smartMoneyFeatures({ from: T - 86400, events }, T);
  assert.equal(f.sm_buyers_30m, 2);
  assert.equal(f.sm_net_usd_30m, 1000 + 500 + 2000 - 700);
});

test('smart money: no coverage yet or no provider data -> nulls, not zeros', () => {
  assert.deepEqual(X.smartMoneyFeatures(null, T), { sm_buyers_30m: null, sm_net_usd_30m: null });
  assert.deepEqual(X.smartMoneyFeatures({ from: T + 1, events: [] }, T), { sm_buyers_30m: null, sm_net_usd_30m: null });
  assert.deepEqual(X.smartMoneyFeatures({ from: T - 1, events: [] }, T), { sm_buyers_30m: 0, sm_net_usd_30m: 0 });   // covered, genuinely none
});

test('social: unique accounts, telegram, diversity, acceleration vs trailing median', () => {
  const posts = [
    post({ account: 'a1' }), post({ account: 'a1', ts: T - 120 }), post({ account: 'a2', ts: T - 200 }),
    post({ kind: 'telegram', platform: 'telegram', account: 'ch1' }), post({ kind: 'telegram', platform: 'telegram', account: 'ch1', ts: T - 90 }),
    post({ account: 'a9', ts: T - 16 * 60 }),                       // prior window only
    post({ account: 'a3', ts: T + 10 }),                            // future
    post({ account: 'a4', ingested_ts: T + 10 }),                   // stored later
  ];
  const f = X.socialFeatures({ from: T - 86400, posts }, T);
  assert.equal(f.mention_unique_accounts_15m, 2);
  assert.equal(f.telegram_mentions_15m, 2);
  assert.equal(f.source_diversity, 2);                              // x + telegram
  assert.equal(f.mention_accel, 5 / 1);                             // 5 mentions now, trailing median 0 -> floored at 1
});

test('social: accel needs an hour of collector coverage; surge vs steady chatter', () => {
  const steady = [];
  for (let k = 1; k <= 4; k++) for (let q = 0; q < 4; q++) steady.push(post({ account: `s${k}${q}`, ts: T - k * 900 - 100 - q }));   // 4 per prior window
  for (let q = 0; q < 8; q++) steady.push(post({ account: `n${q}`, ts: T - 100 - q }));
  assert.equal(X.socialFeatures({ from: T - 86400, posts: steady }, T).mention_accel, 2);   // 8 / median 4
  assert.equal(X.socialFeatures({ from: T - 600, posts: steady }, T).mention_accel, null);  // collector only 10 min old
  assert.equal(X.socialFeatures({ from: T - 600, posts: steady }, T).telegram_mentions_15m, 0);
});

test('never throws: broken provider, null provider, unknown groups', () => {
  const bad = { smartMoney() { throw new Error('boom'); }, social() { throw new Error('boom'); } };
  const out = X.extraFeaturesAt(bad, 'tok', T, ['smartmoney', 'social', 'nope']);
  assert.deepEqual(Object.keys(out).sort(), [...X.GROUPS.smartmoney, ...X.GROUPS.social].sort());
  assert.ok(Object.values(out).every((v) => v === null));
  const rows = [{ ts: T }];
  X.attachExtraFeatures(rows, 'tok', bad, ['smartmoney']);
  assert.equal(rows[0].sm_buyers_30m, null);
  assert.deepEqual(X.extraFeaturesAt(X.createMemoryProvider({ smFrom: null, socialFrom: null }), 't', T, ['smartmoney', 'social']),
    X.nullFeatures(['smartmoney', 'social']));
});

test('point-in-time: adding future records never changes a feature at t', () => {
  const base = { sm: { tok: [ev({})] }, social: { tok: [post({})] } };
  const fut = { sm: { tok: [ev({}), ev({ wallet: 'w2', ts: T + 100 })] }, social: { tok: [post({}), post({ account: 'a2', ts: T + 100 }), post({ kind: 'telegram', ts: T + 50 })] } };
  const a = X.extraFeaturesAt(X.createMemoryProvider(base), 'tok', T, X.GROUP_NAMES);
  const b = X.extraFeaturesAt(X.createMemoryProvider(fut), 'tok', T, X.GROUP_NAMES);
  assert.deepEqual(a, b);
});

function mainDb() {
  const db = new DatabaseSync(':memory:');
  initWalletSchema(db);
  initSocialSchema(db);
  return db;
}

test('main-db provider: wallet + social tables, ms->s units, skill re-verified as of the event', () => {
  const db = mainDb();
  const snap = (w, asOf, score, hold) => db.prepare('INSERT INTO wallet_skill_snapshot (wallet_id, as_of_ts, n_trades, passed_holdout, skill_score, event_ts, ingested_ts) VALUES (?,?,?,?,?,?,?)').run(w, asOf, 20, hold, score, asOf, asOf);
  snap('good', T - 86400, 0.8, 1);
  snap('late', T - 10, 0.9, 1);                                     // skill snapshot only exists AFTER the event
  snap('weak', T - 86400, 0.8, 0);                                  // stored event claims skilled, snapshot says no holdout
  const ins = (w, ts) => db.prepare('INSERT INTO smart_money_event VALUES (?,?,?,?,?,?,?,?,?)').run('tok', w, ts, 'buy', 1000, T - 86400, 0.8, ts, ts);
  ins('good', T - 100); ins('late', T - 100); ins('weak', T - 100);
  db.prepare('INSERT INTO account_post (post_id, account_id, token_address, ts, platform, text_hash, ingested_ts) VALUES (?,?,?,?,?,?,?)').run('p1', 'x:a', 'tok', (T - 100) * 1000, 'x', 'h', (T - 90) * 1000);
  db.prepare('INSERT INTO telegram_message (message_id, channel_id, ts, token_address, text_hash, ingested_ts) VALUES (?,?,?,?,?,?)').run('m1', 'ch', (T - 100) * 1000, 'tok', 'h', (T - 90) * 1000);
  db.prepare('INSERT INTO account_post (post_id, account_id, token_address, ts, platform, text_hash, ingested_ts) VALUES (?,?,?,?,?,?,?)').run('p2', 'x:b', 'other', (T - 100) * 1000, 'x', 'h', (T - 90) * 1000);

  const p = X.createMainDbProvider({ db });
  const f = X.extraFeaturesAt(p, 'tok', T, X.GROUP_NAMES);
  assert.equal(f.sm_buyers_30m, 1);                                  // only 'good' is skilled as of its event
  assert.equal(f.sm_net_usd_30m, 1000);
  assert.equal(f.mention_unique_accounts_15m, 1);
  assert.equal(f.telegram_mentions_15m, 1);
  assert.equal(f.source_diversity, 2);
  assert.equal(X.extraFeaturesAt(p, 'tok', T - 101, ['social']).mention_unique_accounts_15m, null);          // collector hadn't started yet
  assert.equal(X.extraFeaturesAt(p, 'tok', T - 85, ['social']).mention_unique_accounts_15m, 1);
  assert.equal(X.extraFeaturesAt(p, 'tok', T - 85, ['social']).source_diversity, 2);
  const none = X.extraFeaturesAt(p, 'unseen', T, X.GROUP_NAMES);
  assert.equal(none.sm_buyers_30m, 0);                               // covered, token simply never seen
  assert.equal(none.telegram_mentions_15m, 0);
});

test('main-db provider: missing tables or empty tables -> nulls, no throw', () => {
  const bare = new DatabaseSync(':memory:');
  const nulls = X.extraFeaturesAt(X.createMainDbProvider({ db: bare }), 'tok', T, X.GROUP_NAMES);
  assert.ok(Object.values(nulls).every((v) => v === null));
  const empty = X.extraFeaturesAt(X.createMainDbProvider({ db: mainDb() }), 'tok', T, X.GROUP_NAMES);
  assert.ok(Object.values(empty).every((v) => v === null));          // no collector data at all: unknown, not zero
});

test('radar models: optional groups are OFF by default and enabling them leaves existing models untouched', needsRadar, () => {
  const before = Object.keys(F.MODELS);
  for (const n of Object.keys(F.EXTRA_MODELS)) assert.ok(!before.includes(n), `${n} must not appear in the default model list`);
  assert.equal(typeof F.MODELS.market_v1_sm, 'function');            // still addressable by name
  const f = { volume_accel: 6, buy_pressure: 0.7, price_chg_15m: 0.1, liq_delta_15m: 0.1, realized_vol_30m: 0.1 };
  const scoresBefore = before.map((n) => F.MODELS[n](f));
  assert.equal(F.MODELS.market_v1_sm(f), F.MODELS.market_v1(f));     // group features absent -> identical to market_v1
  assert.equal(F.MODELS.market_v1_social(f), F.MODELS.market_v1(f));
  F.setExtraFeatureSource({ provider: X.createMemoryProvider(), groups: ['smartmoney'] });
  try {
    const on = Object.keys(F.MODELS);
    assert.ok(on.includes('market_v1_sm') && on.includes('smartmoney_only'));
    assert.ok(!on.includes('market_v1_social') && !on.includes('market_v1_sm_social'));
    assert.deepEqual(before.map((n) => F.MODELS[n](f)), scoresBefore);
    const g = { sm_buyers_30m: 3, sm_net_usd_30m: 3000 };   // weak market side, so the +70 bonus isn't clipped at 100
    assert.ok(F.MODELS.market_v1_sm(g) > F.MODELS.market_v1(g) + 50);
  } finally {
    F.setExtraFeatureSource(null);
  }
  assert.deepEqual(Object.keys(F.MODELS), before);
});
