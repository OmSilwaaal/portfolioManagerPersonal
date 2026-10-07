'use strict';
// END-TO-END: can the radar SEE the top earners?
//   wallet trades -> wallet_skill_snapshot -> smart_money_event (main DB, keyed by MINT ADDRESS)
//   -> radar/extraFeatures main-db provider -> features.js extra groups -> market_v2_sm* models
//   -> services/radarSignals (live score) -> GET /api/radar/signals | /token/:address
// plus: social posts (ms) -> social group, production wiring from env flags, point-in-time rules, and the winner-first /
// winner-back-buy readers of radar.sqlite. Uses the REAL better-sqlite3 when it loads (Node 20, as on Railway); on a
// machine without the native module it falls back to a node:sqlite adapter (see test/_sqlite.js). Everything is in-memory.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const http = require('http');

const sqlite = require('./_sqlite');
const driver = sqlite.installBetterSqlite3Adapter();
process.env.DB_PATH = ':memory:';
process.env.RADAR_DB_PATH = ':memory:';
process.env.ENABLE_RADAR = 'true';
delete process.env.RADAR_EXTRA_FEATURES;

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58(buf) {                                   // seeded 32-byte -> base58 (a valid Solana address)
  let n = BigInt('0x' + buf.toString('hex')), s = '';
  while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  for (const b of buf) { if (b === 0) s = '1' + s; else break; }
  return s;
}
const addr = (seed) => b58(crypto.createHash('sha256').update('e2e:' + seed).digest());

const { getDb } = require('../src/db/schema');
const { getRadarDb } = require('../src/radar/db');
const { initWalletSchema } = require('../src/research/wallets/schema');
const { initSocialSchema } = require('../src/research/social/schema');
const { initEvalSchema } = require('../src/research/eval/schema');
const { runCycle } = require('../src/research/wallets/collector');
const { createMockProvider } = require('../src/research/wallets/providers');
const X = require('../src/radar/extraFeatures');
const F = require('../src/radar/features');
const RS = require('../src/services/radarSignals');
const radarIndex = require('../src/radar');

const main = getDb();
initWalletSchema(main); initSocialSchema(main); initEvalSchema(main);
const radar = getRadarDb();

const NOW = Math.floor(Date.now() / 1000);
const LAST = NOW - 30;                                 // last radar snapshot (live scoring evaluates at this time)
const TOK_A = addr('token-A-skilled-buyer');           // a skilled wallet buys this one
const TOK_B = addr('token-B-no-buyer');                // identical market data, nobody skilled buys it
const TOK_C = addr('token-C-late-skill');              // skilled wallet's snapshot only exists AFTER its buy (look-ahead)
const SMART = addr('wallet-smart');
const DUD = addr('wallet-dud');
const LATE = addr('wallet-late');
const quiet = { log: { log() {}, warn() {} } };

// ---- radar world: three tokens with IDENTICAL market series -------------------------------------------------------
function seedRadarToken(tok, symbol) {
  radar.prepare(`INSERT INTO token (token_address, symbol, name, creator, first_pool, current_pool, dex, launchpad, pool_created_ts, first_seen_ts, last_snapshot_ts, last_vol_h1, last_liq)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(tok, symbol, symbol + ' / SOL', addr('creator-' + symbol), 'pool' + symbol, 'pool' + symbol, 'pumpswap', 'pumpfun', NOW - 3600, NOW - 3590, LAST, 20000, 30000);
  const ins = radar.prepare(`INSERT INTO market_snapshot (token_address, ts, pool_address, price_usd, liquidity_usd, liq_estimated, fdv, vol_m5, vol_h1, buys_m5, sells_m5, buys_h1, sells_h1)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (let i = 0; i <= 50; i++) {                       // one snapshot a minute, mild uptrend, healthy buy pressure
    const ts = LAST - (50 - i) * 60;
    ins.run(tok, ts, 'pool' + symbol, 0.001 * (1 + i * 0.004), 30000, 0, 40000, 3000 + (i % 5) * 100, 20000, 40, 12, 300, 120);
  }
  radar.prepare(`INSERT INTO token_security (token_address, ts, creator, rc_score, danger_count, top1_pct_ex, top10_pct_ex, creator_pct, insider_pct, mint_auth, freeze_auth, holders, lp_locked_pct, rugged, creator_prev_count, creator_prev_dead_share, risks_json)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(tok, NOW - 1800, addr('creator-' + symbol), 5, 0, 4, 20, 1, 0, 0, 0, 400, 100, 0, 0, null, '[]');
}
seedRadarToken(TOK_A, 'AAA'); seedRadarToken(TOK_B, 'BBB'); seedRadarToken(TOK_C, 'CCC');

// ---- main DB: its own `token` table (integer ids!) is a DIFFERENT table from radar.token ---------------------------
// Decoys: the main-db token ids are small integers and one row even carries token A's address under id 1. Nothing may
// ever be joined on id; events and posts are matched by contract address only.
main.prepare("INSERT INTO token (chain, contract_address, first_seen_ts, symbol) VALUES ('solana', ?, ?, 'AAA')").run(TOK_A, NOW - 99999);
main.prepare("INSERT INTO token (chain, contract_address, first_seen_ts, symbol) VALUES ('solana', ?, ?, 'ZZZ')").run(addr('main-only-token'), NOW - 99999);

// ---- wallet history: SMART has a steady edge over many tokens in the past; DUD loses; LATE is skilled too ------------
function trips(mults, { base, tokenPrefix }) {
  const out = [];
  mults.forEach((m, i) => {
    const t0 = base + i * 4000;
    const tok = addr(tokenPrefix + i);
    out.push({ token_id: tok, ts: t0, side: 'buy', amount_token: 100, price_usd: 1, amount_usd: 100, tx: `b${tokenPrefix}${i}` });
    out.push({ token_id: tok, ts: t0 + 100, side: 'sell', amount_token: 100, price_usd: m, amount_usd: 100 * m, tx: `s${tokenPrefix}${i}` });
  });
  return out;
}
const SKILLED = [1.3, 1.2, 0.9, 1.25, 1.3, 1.2, 0.95, 1.3, 1.25, 1.2, 1.3, 1.2];
const BASE = NOW - 20 * 86400;
const T_CYCLE1 = NOW - 600;
const T_CYCLE2 = NOW - 100;
const BUY_A = NOW - 300;                                // after cycle-1 snapshot, before cycle 2
const BUY_C = NOW - 450;                                // LATE's skill snapshot is created at cycle 2 (> BUY_C)
const trade = (token, ts, usd, tx) => ({ token_id: token, ts, side: 'buy', amount_token: usd / 0.001, price_usd: 0.001, amount_usd: usd, tx });

test('driver in use is reported (real better-sqlite3 on Node 20 / Railway)', () => {
  console.log(`# e2e driver: ${driver}, node ${process.version}`);
  if (/^v(20|22)\./.test(process.version)) assert.equal(driver, 'better-sqlite3', 'Node 20/22 (Railway) must exercise the production driver');
});

test('(a) wallet collector writes smart_money_event keyed by MINT ADDRESS for tokens that are NOT in the trending list', async () => {
  const provider = createMockProvider({
    candidates: {},
    trades: {
      [SMART]: [...trips(SKILLED, { base: BASE, tokenPrefix: 'S' }), trade(TOK_A, BUY_A, 500, 'liveA')],
      [DUD]: [...trips([0.7, 0.8, 0.9, 0.8, 0.7, 0.9, 0.8, 0.7, 0.9, 0.8], { base: BASE, tokenPrefix: 'D' }), trade(TOK_B, BUY_A, 5000, 'liveB')],
      // LATE trades history before cycle 1 too, but only starts to qualify when its 12th profitable trip lands after cycle 1
      [LATE]: [...trips(SKILLED, { base: BASE, tokenPrefix: 'L' }).map((t) => ({ ...t, ts: t.ts + 0 })), trade(TOK_C, BUY_C, 800, 'liveC')],
    },
  });
  // seed the wallets (a leaderboard / seeds source would do this in production)
  for (const w of [SMART, DUD]) main.prepare('INSERT OR IGNORE INTO wallet (wallet_id, chain, first_seen_ts, event_ts, ingested_ts) VALUES (?,?,?,?,?)').run(w, 'solana', T_CYCLE1, T_CYCLE1, T_CYCLE1);
  // trending is deliberately EMPTY of our tokens: events must come from any recent buy by a skilled wallet
  const common = { providers: [provider], getTrending: async () => [{ address: addr('some-other-trending') }], ...quiet };
  const s1 = await runCycle(main, { ...common, now: T_CYCLE1 });
  assert.equal(s1.errors, 0);
  assert.equal(s1.events, 0, 'the buy has not happened yet at cycle 1');
  main.prepare('INSERT OR IGNORE INTO wallet (wallet_id, chain, first_seen_ts, event_ts, ingested_ts) VALUES (?,?,?,?,?)').run(LATE, 'solana', T_CYCLE2, T_CYCLE2, T_CYCLE2);
  const s2 = await runCycle(main, { ...common, now: T_CYCLE2 });
  assert.equal(s2.errors, 0);

  const ev = main.prepare('SELECT * FROM smart_money_event ORDER BY token_id').all();
  assert.deepEqual(ev.map((e) => [e.token_id, e.wallet_id]), [[TOK_A, SMART]], 'only SMART (skilled BEFORE the buy) on token A; DUD failed, LATE had no earlier snapshot');
  const e = ev[0];
  assert.equal(e.ts, BUY_A);                            // seconds
  assert.equal(e.skill_as_of_ts, T_CYCLE1);
  assert.ok(e.skill_as_of_ts < e.ts, 'point in time: skill snapshot predates the event');
  assert.ok(e.ingested_ts >= e.ts);
  // the mint-address id is the very string radar.token uses (same case, same base58), so the join needs no id mapping
  assert.ok(radar.prepare('SELECT 1 FROM token WHERE token_address = ?').get(e.token_id));
  // append-only triggers hold on this driver
  assert.throws(() => main.prepare('UPDATE smart_money_event SET amount_usd = 1').run(), /append-only/);
  assert.throws(() => main.prepare('DELETE FROM wallet_skill_snapshot').run(), /append-only/);
});

test('(b)+(c) main-db provider: event features at the radar time, units, point-in-time, no id join', () => {
  const p = X.createMainDbProvider({ db: main });
  const at = (tok, t, groups = ['smartmoney']) => X.extraFeaturesAt(p, tok, t, groups);
  assert.deepEqual(at(TOK_A, LAST), { sm_buyers_30m: 1, sm_net_usd_30m: 500 });
  assert.deepEqual(at(TOK_B, LAST), { sm_buyers_30m: 0, sm_net_usd_30m: 0 }, 'covered, nobody skilled bought B');
  // DUD bought B for $5000 but is not skilled: it never counts
  // point-in-time: before the first recorded event the collector's coverage is unknown (null); before we ingested the
  // event (cycle 2) it is a known zero
  assert.equal(at(TOK_A, BUY_A - 1).sm_buyers_30m, null);
  assert.equal(at(TOK_A, T_CYCLE2 - 1).sm_buyers_30m, 0, 'event was ingested at cycle 2; unknowable before that');
  assert.equal(at(TOK_A, T_CYCLE2).sm_buyers_30m, 1);
  assert.equal(at(TOK_A, BUY_A + 31 * 60).sm_buyers_30m, 0, '30 minute window expires');
  // the main-db integer token ids must never be used for matching: an id-looking string matches nothing
  assert.equal(at('1', LAST).sm_buyers_30m, 0);
  // a stored event whose wallet has NO skill snapshot before the event is rejected even if the row claims skill
  main.prepare('INSERT INTO smart_money_event VALUES (?,?,?,?,?,?,?,?,?)').run(TOK_C, LATE, BUY_C, 'buy', 800, BUY_C - 5, 0.9, BUY_C, T_CYCLE2);
  assert.equal(at(TOK_C, LAST).sm_buyers_30m, 0, 'look-ahead event (snapshot after the buy) is not counted');
});

test('(b) social units: account_post / telegram_message are epoch MS; features come out in the radar\'s seconds', () => {
  const p = X.createMainDbProvider({ db: main });
  const ins = main.prepare('INSERT INTO account_post (post_id, account_id, token_address, ts, platform, text_hash, ingested_ts) VALUES (?,?,?,?,?,?,?)');
  ins.run('x:1', 'x:alice', TOK_A, (LAST - 120) * 1000, 'x', 'h', (LAST - 100) * 1000);
  ins.run('x:2', 'x:bob', TOK_A, (LAST - 200) * 1000, 'x', 'h', (LAST - 150) * 1000);
  ins.run('4chan:3', '4chan:biz:42:anon', TOK_A, (LAST - 300) * 1000, '4chan', 'h', (LAST - 250) * 1000);
  ins.run('x:9', 'x:late', TOK_A, (LAST - 60) * 1000, 'x', 'h', (LAST + 500) * 1000);          // stored AFTER LAST: invisible then
  main.prepare('INSERT INTO telegram_message (message_id, channel_id, ts, token_address, text_hash, ingested_ts) VALUES (?,?,?,?,?,?)').run('c:1', 'chan', (LAST - 90) * 1000, TOK_A, 'h', (LAST - 80) * 1000);
  const f = X.extraFeaturesAt(p, TOK_A, LAST, ['social']);
  assert.equal(f.mention_unique_accounts_15m, 3);        // alice, bob, 4chan thread (late post excluded: ingested after t)
  assert.equal(f.telegram_mentions_15m, 1);
  assert.equal(f.source_diversity, 3);                   // x, 4chan, telegram
  assert.equal(X.extraFeaturesAt(p, TOK_B, LAST, ['social']).mention_unique_accounts_15m, 0);
  assert.equal(X.extraFeaturesAt(p, TOK_A, LAST - 3600 * 24, ['social']).mention_unique_accounts_15m, null, 'before collector coverage: unknown, not zero');
});

test('(d) production wiring: collector flags enable the matching groups; RADAR_EXTRA_FEATURES=off disables', () => {
  const log = { log() {} };
  try {
    assert.deepEqual(radarIndex.configureExtraFeatures({}, log), []);
    assert.equal(F.getExtraSource(), null);
    assert.ok(!Object.keys(F.MODELS).includes('market_v2_sm'));
    assert.deepEqual(radarIndex.configureExtraFeatures({ SMART_MONEY_COLLECTOR: '1' }, log), ['smartmoney']);
    assert.equal(F.liveModelFor(F.getExtraSource().groups), 'market_v2_sm');
    assert.ok(Object.keys(F.MODELS).includes('market_v1_sm') && Object.keys(F.MODELS).includes('market_v2_sm'));
    assert.deepEqual(radarIndex.configureExtraFeatures({ SOCIAL_COLLECTOR: '1' }, log), ['social']);
    assert.deepEqual(radarIndex.configureExtraFeatures({ SMART_MONEY_COLLECTOR: '1', SOCIAL_COLLECTOR: '1' }, log), ['smartmoney', 'social']);
    assert.equal(F.liveModelFor(F.getExtraSource().groups), 'market_v2_sm_social');
    assert.deepEqual(radarIndex.configureExtraFeatures({ SMART_MONEY_COLLECTOR: '1', SOCIAL_COLLECTOR: '1', RADAR_EXTRA_FEATURES: 'off' }, log), []);
    assert.equal(F.getExtraSource(), null);
    assert.ok(!Object.keys(F.MODELS).includes('market_v2_sm'), 'off really removes the models again');
    assert.deepEqual(radarIndex.configureExtraFeatures({ RADAR_EXTRA_FEATURES: 'social' }, log), ['social']);
  } finally {
    F.setExtraFeatureSource(null);
  }
});

test('(e) live scoring: a skilled buyer lifts the score; no collector data degrades to nulls and the plain market_v2 score', () => {
  const now = NOW;
  const tokens = [TOK_A, TOK_B, TOK_C].map((a) => radar.prepare('SELECT * FROM token WHERE token_address = ?').get(a));
  const score = (sigs, a) => sigs.find((s) => s.address === a);

  // 1. extras OFF: identical market data -> identical score, no extra keys, model market_v2
  F.setExtraFeatureSource(null);
  const off = RS.computeForTokens(radar, F, tokens, now);
  assert.equal(score(off, TOK_A).model, 'market_v2');
  assert.equal(score(off, TOK_A).score, score(off, TOK_B).score);
  assert.ok(!('sm_buyers_30m' in score(off, TOK_A).features));
  const base = score(off, TOK_A).score;
  assert.ok(base > 0 && base < 55, `fixture should sit below the bonus ceiling (got ${base})`);

  // 2. smart-money ON with the real main-db provider
  radarIndex.configureExtraFeatures({ SMART_MONEY_COLLECTOR: '1' }, { log() {} });
  try {
    const on = RS.computeForTokens(radar, F, tokens, now);
    const a = score(on, TOK_A), b = score(on, TOK_B), c = score(on, TOK_C);
    assert.equal(a.model, 'market_v2_sm');
    assert.equal(a.features.sm_buyers_30m, 1);
    assert.equal(a.features.sm_net_usd_30m, 500);
    assert.equal(b.features.sm_buyers_30m, 0);
    assert.equal(b.score, base, 'no skilled buyer: score unchanged vs plain market_v2');
    assert.equal(c.score, base, 'look-ahead skill (snapshot after the buy) must not lift token C');
    assert.ok(a.score > base + 10, `skilled wallet bought A: ${a.score} should exceed ${base}`);
    assert.ok(a.score <= 100);
    assert.equal(a.components.smart_money.weight, 'bonus');
    assert.ok(a.components.smart_money.score > 0);
    assert.equal(b.components.smart_money.score, 0);
    assert.ok(a.notes.some((n) => /smartmoney/.test(n)));
    // the API mapping keeps working
    const mem = RS.toMemecoinSignal(a, null);
    assert.equal(mem.source, 'radar');
  } finally {
    F.setExtraFeatureSource(null);
  }

  // 3. group ON but the collectors have written nothing at all: nulls (not zeros), no error, score == market_v2
  const emptyMain = new sqlite.DatabaseSync(':memory:');
  initWalletSchema(emptyMain); initSocialSchema(emptyMain);
  F.setExtraFeatureSource({ provider: X.createMainDbProvider({ db: emptyMain }), groups: ['smartmoney', 'social'] });
  try {
    const empty = RS.computeForTokens(radar, F, tokens, now);
    const a = score(empty, TOK_A);
    assert.equal(a.model, 'market_v2_sm_social');
    assert.equal(a.features.sm_buyers_30m, null);
    assert.equal(a.features.mention_unique_accounts_15m, null);
    assert.equal(a.components.smart_money.score, null);
    assert.equal(a.score, base);
    // ...and a provider whose database has no research tables at all
    F.setExtraFeatureSource({ provider: X.createMainDbProvider({ db: new sqlite.DatabaseSync(':memory:') }), groups: ['smartmoney', 'social'] });
    assert.equal(score(RS.computeForTokens(radar, F, tokens, now), TOK_A).score, base);
    // ...and a provider that throws
    F.setExtraFeatureSource({ provider: { smartMoney() { throw new Error('boom'); }, social() { throw new Error('boom'); } }, groups: ['smartmoney', 'social'] });
    assert.equal(score(RS.computeForTokens(radar, F, tokens, now), TOK_A).score, base);
  } finally {
    F.setExtraFeatureSource(null);
  }
});

test('report replays the same models: with the groups on, market_v2_sm* and market_v1_sm* are in the grid', () => {
  radarIndex.configureExtraFeatures({ SMART_MONEY_COLLECTOR: '1', SOCIAL_COLLECTOR: '1' }, { log() {} });
  try {
    const names = Object.keys(F.MODELS);
    for (const n of ['market_v1_sm', 'market_v1_social', 'market_v1_sm_social', 'market_v2_sm', 'market_v2_social', 'market_v2_sm_social', 'smartmoney_only', 'social_only']) assert.ok(names.includes(n), n);
    const u = F.loadUniverse({ sinceTs: 0 });                       // real driver: loads radar + attaches extras from the main DB
    const a = u.get(TOK_A);
    assert.ok(a, 'token A is in the research universe');
    const last = a.rows[a.rows.length - 1];
    assert.equal(last.ts, LAST);
    assert.equal(last.sm_buyers_30m, 1);
    assert.equal(u.get(TOK_B).rows[u.get(TOK_B).rows.length - 1].sm_buyers_30m, 0);
    assert.ok(F.MODELS.market_v2_sm(last) > F.MODELS.market_v2(last));
    const first = a.rows[0];                                        // an hour earlier: before any smart-money event was recorded
    assert.equal(first.sm_buyers_30m, null, 'before collector coverage: unknown, never a fake zero');
    // the report runs end to end with the extra groups and does not throw
    const rep = require('../src/radar/report').runReport({ models: ['market_v2', 'market_v2_sm'], includeTpsl: false, horizons: [15] });
    assert.ok(Array.isArray(rep.results));
  } finally {
    F.setExtraFeatureSource(null);
  }
});

function request(server, path) {
  return new Promise((resolve, reject) => {
    http.get({ port: server.address().port, path }, (res) => {
      let b = ''; res.on('data', (d) => { b += d; }); res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(b) }));
    }).on('error', reject);
  });
}

test('HTTP: /api/radar/signals and /token/:address include the extra group when enabled, nulls when not', async () => {
  const express = require('express');
  const app = express();
  app.use((req, _res, next) => { req.user = { id: 'tester' }; next(); });     // requireAuth passes when req.user is set
  app.use('/api/radar', require('../src/routes/radar'));
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  try {
    F.setExtraFeatureSource(null);
    let r = await request(server, `/api/radar/token/${TOK_A}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.signal.model, 'market_v2');
    const plain = r.body.signal.score;

    radarIndex.configureExtraFeatures({ SMART_MONEY_COLLECTOR: '1' }, { log() {} });
    r = await request(server, `/api/radar/token/${TOK_A}`);
    assert.equal(r.body.signal.model, 'market_v2_sm');
    assert.ok(r.body.signal.score > plain);
    assert.equal(r.body.signal.features.sm_buyers_30m, 1);
    const list = await request(server, '/api/radar/signals?limit=10&maxAgeHours=24');
    assert.equal(list.body.enabled, true);
    const byAddr = Object.fromEntries(list.body.signals.map((s) => [s.address, s]));
    assert.ok(byAddr[TOK_A].score > byAddr[TOK_B].score, 'terminal list ranks the skilled-buy token above its identical twin');
    assert.equal(list.body.signals[0].address, TOK_A);

    // admin-only research endpoints stay locked
    const status = await request(server, '/api/radar/status');
    assert.equal(status.status, 403);
  } finally {
    F.setExtraFeatureSource(null);
    server.close();
  }
});

// ---- (f) winner-first + winner back-buy read radar.sqlite winners with the same address format ---------------------
test('(f) winner-first job and winner back-buyer discovery read radar winners and write to the main DB', async () => {
  const wf = require('../src/research/eval/winnerFirst');
  const { createWinnerBackBuyersSource } = require('../src/research/wallets/discoverySources');
  const { runDiscovery } = require('../src/research/wallets/discovery');
  const ins = radar.prepare(`INSERT INTO market_snapshot (token_address, ts, pool_address, price_usd, liquidity_usd, liq_estimated, fdv, vol_m5, vol_h1, buys_m5, sells_m5, buys_h1, sells_h1) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const mk = (tok, symbol, winner, createdAgo) => {
    const created = NOW - createdAgo;
    radar.prepare(`INSERT INTO token (token_address, symbol, name, creator, first_pool, current_pool, dex, launchpad, pool_created_ts, first_seen_ts, last_snapshot_ts, last_vol_h1, last_liq) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(tok, symbol, symbol, addr('cr-' + symbol), 'p', 'p', 'pumpswap', 'pumpfun', created, created + 5, created + 9 * 3600, 5000, 20000);
    for (let ts = created; ts <= created + 9 * 3600; ts += 300) {
      const sinceRef = ts - (created + 900);
      const price = winner && sinceRef > 600 ? 1 * (1 + Math.min(3, sinceRef / 3600)) : 1;   // winners triple after the reference time
      ins.run(tok, ts, 'p', price, 20000, 0, 40000, 100, 5000, 5, 5, 60, 60);
    }
  };
  const WIN = addr('winner-token');
  mk(WIN, 'WIN', true, 11 * 3600);
  for (let i = 0; i < 4; i++) mk(addr('loser' + i), 'L' + i, false, 11 * 3600 + i * 60);

  // an early mention (address, posted BEFORE the reference time and stored before it) of the winner in the MAIN db (ms)
  const created = NOW - 11 * 3600;
  main.prepare('INSERT INTO account_post (post_id, account_id, token_address, ts, platform, text_hash, ingested_ts) VALUES (?,?,?,?,?,?,?)')
    .run('x:win1', 'x:early', WIN, (created + 300) * 1000, 'x', 'h', (created + 310) * 1000);
  main.prepare('INSERT INTO social_post_raw (post_id, platform, source_id, thread_id, author_id, ts, text_hash, addresses_json, cashtags_json, ingested_ts) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run('4chan:w1', '4chan', 'biz', '1', null, (created + 200) * 1000, 'h', JSON.stringify([WIN]), '[]', (created + 210) * 1000);

  const r = wf.runWinnerFirst(radar, main, { nowSec: NOW, config: { minWinners: 1, minControls: 1 } });
  assert.equal(r.ok, true, r.error);
  assert.ok(r.counts.tokensConsidered >= 5);
  assert.ok(r.counts.postsLoaded >= 2, 'main-db posts (ms) were read');
  assert.ok(wf.latestWinnerFirst(main), 'report persisted in the MAIN db');
  assert.throws(() => main.prepare('UPDATE winner_first_report SET verdict = 1').run(), /append-only/);

  // winner back-buyers: reads the radar winner (same base58 mint), the injected finder returns early buyers
  const early1 = addr('early-buyer-1'), early2 = addr('early-buyer-2');
  const seen = [];
  const src = createWinnerBackBuyersSource({ SMART_MONEY_WINNER_BACKBUY: '1', ENABLE_RADAR: 'true' }, {
    radarDb: () => radar,
    finders: [async ({ token, createdTs, refTs }) => { seen.push({ token, createdTs, refTs }); return { early: [{ wallet: early1, ts: createdTs + 60 }, { wallet: early2, ts: createdTs + 90 }], late: [addr('late-buyer')] }; }],
  });
  assert.equal(src.enabled, true);
  const out = await runDiscovery(main, { sources: [src], now: NOW, tokens: [], env: {}, log: quiet.log });
  assert.equal(out.errors, 0);
  assert.ok(seen.some((s) => s.token === WIN), 'finder was asked about the radar winner by its exact mint address');
  assert.ok(!seen.some((s) => s.token.startsWith('loser')));
  const cands = main.prepare("SELECT wallet_id, source, reported_period FROM wallet_candidate WHERE source = 'winner_backbuyers' ORDER BY wallet_id").all();
  assert.deepEqual(cands.map((c) => c.wallet_id).sort(), [early1, early2].sort());
  assert.ok(cands.every((c) => c.reported_period === `winner:${WIN}`));
  assert.ok(main.prepare('SELECT 1 FROM wallet WHERE wallet_id = ?').get(early1), 'candidates are registered so the collector will score them');
  assert.throws(() => main.prepare('DELETE FROM wallet_candidate').run(), /append-only/);
});
