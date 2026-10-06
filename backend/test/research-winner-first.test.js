'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const E = path.join(__dirname, '..', 'src', 'research', 'eval');
const wf = require(path.join(E, 'winnerFirst.js'));
const { mulberry32 } = require(path.join(E, 'evaluate.js'));
const { initSocialSchema } = require(path.join(__dirname, '..', 'src', 'research', 'social', 'schema.js'));

const T0 = 1_800_000_000;       // seconds
const CFG = { bootstrapIters: 600 };

/**
 * Synthetic world: nW winners (price x2.5 inside the horizon) and nC non-winners (flat/down), same liquidity/volume
 * distribution. Each token: created at T0 + i*400, reference snapshot at created + 900.
 */
function makeWorld({ nW = 60, nC = 540, seed = 5 } = {}) {
  const rng = mulberry32(seed);
  const tokens = [];
  const mkTok = (i, win) => {
    const created = T0 + i * 400;
    const liq = 10 ** (3 + Math.floor(rng() * 3));
    const vol = 10 ** (2 + Math.floor(rng() * 3));
    const snaps = [];
    for (let k = 0; k <= 40; k++) {
      const ts = created + 900 + k * 600;
      let price = 1;
      if (win && k >= 10) price = 2.5;
      else if (!win) price = 1 - Math.min(0.5, k * 0.01);
      snaps.push({ ts, price, liq, vol });
    }
    return { address: `T${String(i).padStart(4, '0')}`, symbol: `S${i}`, created, dead_ts: null, snaps, win };
  };
  const k = Math.round((nW + nC) / nW);
  let wc = 0;
  for (let i = 0; i < nW + nC; i++) {
    const win = i % k === 0 && wc < nW;
    if (win) wc++;
    tokens.push(mkTok(i, win));
  }
  return tokens;
}
const refTs = (t) => t.created + 900;

function mention(token, ts, platform, extra = {}) {
  return {
    ts, ingested_ts: extra.ingested_ts ?? ts, platform,
    srcs: [['platform', platform], ['community', `${platform}:${extra.community || 'main'}`]],
    addresses: [token.address], cashtags: [],
  };
}
const find = (r, key) => r.sources.find((s) => s.key === key);

test('world sanity: matched controls drawn, deterministic with seed', () => {
  const tokens = makeWorld();
  const a = wf.computeWinnerFirst({ tokens, raws: [], coverage: {} }, CFG);
  const b = wf.computeWinnerFirst({ tokens, raws: [], coverage: {} }, CFG);
  assert.ok(a.counts.winners >= 50);
  assert.ok(a.counts.controls >= a.counts.winners * 2);
  assert.strictEqual(JSON.stringify(a.counts), JSON.stringify(b.counts));
  assert.strictEqual(a.verdict, 'INSUFFICIENT_DATA');
  const c = wf.computeWinnerFirst({ tokens, raws: [], coverage: {} }, { ...CFG, seed: 99 });
  assert.notStrictEqual(a.counts.controls, undefined);
  assert.ok(c.counts.controls >= 1);
});

test('planted early-mention source -> POSSIBLE_EDGE', () => {
  const tokens = makeWorld();
  const rng = mulberry32(11);
  const raws = [];
  for (const t of tokens) {
    const p = t.win ? 0.7 : 0.08;
    if (rng() < p) raws.push(mention(t, refTs(t) - (120 + Math.floor(rng() * 600)), '4chan'));
  }
  const r = wf.computeWinnerFirst({ tokens, raws, coverage: { '4chan': T0 - 1 } }, CFG);
  const s = find(r, 'platform:4chan');
  assert.ok(s, 'platform source reported');
  assert.strictEqual(s.verdict, 'POSSIBLE_EDGE', JSON.stringify({ e: s.early, w: s.winnersPreceded, c: s.controlsPreceded }));
  assert.ok(s.winnersPreceded > s.controlsPreceded);
  assert.ok(s.leadWinners.medianSec >= 120 && s.leadWinners.p25Sec <= s.leadWinners.medianSec);
  assert.ok(s.early.ci95[0] > 0 && s.early.qBH < 0.05 && s.early.pBonferroni < 0.05);
  assert.strictEqual(r.verdict, 'POSSIBLE_EDGE');
  assert.ok(r.caveats.length >= 4);
});

test('reactive-only source (mentions arrive after the move starts) -> MOSTLY_REACTIVE', () => {
  const tokens = makeWorld();
  const rng = mulberry32(12);
  const raws = [];
  for (const t of tokens) {
    const p = t.win ? 0.7 : 0.05;
    if (rng() < p) raws.push(mention(t, refTs(t) + 600 + Math.floor(rng() * 7000), 'reddit'));
  }
  const r = wf.computeWinnerFirst({ tokens, raws, coverage: { reddit: T0 - 1 } }, CFG);
  const s = find(r, 'platform:reddit');
  assert.strictEqual(s.winnersPreceded, 0);
  assert.strictEqual(s.controlsPreceded, 0);
  assert.strictEqual(s.verdict, 'MOSTLY_REACTIVE');
  assert.strictEqual(r.verdict, 'MOSTLY_REACTIVE');
});

test('random source (same rate and timing for winners and controls) -> NO_EDGE', () => {
  for (const seed of [21, 22, 23]) {
    const tokens = makeWorld({ seed });
    const rng = mulberry32(seed + 100);
    const raws = [];
    for (const t of tokens) if (rng() < 0.3) raws.push(mention(t, t.created + 60 + Math.floor(rng() * 6 * 3600), 'x'));
    const r = wf.computeWinnerFirst({ tokens, raws, coverage: { x: T0 - 1 } }, CFG);
    const s = find(r, 'platform:x');
    assert.strictEqual(s.verdict, 'NO_EDGE', `seed ${seed}: ${JSON.stringify({ e: s.early, a: s.after, w: s.winnersPreceded, c: s.controlsPreceded })}`);
    assert.strictEqual(r.verdict, 'NO_EDGE');
  }
});

test('tiny sample -> INSUFFICIENT_DATA even when the planted pattern is perfect', () => {
  const tokens = makeWorld({ nW: 6, nC: 40 });
  const raws = [];
  for (const t of tokens) if (t.win) raws.push(mention(t, refTs(t) - 300, '4chan'));
  const r = wf.computeWinnerFirst({ tokens, raws, coverage: { '4chan': T0 - 1 } }, CFG);
  const s = find(r, 'platform:4chan');
  assert.strictEqual(s.verdict, 'INSUFFICIENT_DATA');
  assert.ok(s.insufficientReasons.length > 0);
  assert.strictEqual(s.early, undefined, 'no significance test run below the minimum sample');
  assert.strictEqual(r.verdict, 'INSUFFICIENT_DATA');
});

test('LEAK: mentions at/after the move start never count as early (and neither do not-yet-ingested posts)', () => {
  const tokens = makeWorld();
  const winners = tokens.filter((t) => t.win);
  const raws = [];
  for (const t of winners) {
    const ref = refTs(t);
    raws.push(mention(t, ref, 'leak'));                     // exactly at the reference time
    raws.push(mention(t, ref + 1, 'leak'));
    raws.push(mention(t, ref + 3600, 'leak'));
    raws.push(mention(t, ref - 300, 'late', { ingested_ts: ref + 5 }));   // posted earlier but stored after t_ref
  }
  const r = wf.computeWinnerFirst({ tokens, raws, coverage: { leak: T0 - 1, late: T0 - 1 } }, CFG);
  const s = find(r, 'platform:leak');
  assert.strictEqual(s.winnersPreceded, 0);
  assert.strictEqual(s.leadWinners.n, 0);
  assert.ok(s.afterWinners > 0 && s.reactiveWinners === s.afterWinners);
  assert.notStrictEqual(s.verdict, 'POSSIBLE_EDGE');
  const late = find(r, 'platform:late');
  assert.ok(!late || late.winnersPreceded === 0);
  assert.ok(r.counts.lateIngested > 0);
  // one tick earlier than the reference IS early (boundary is strict)
  const t = winners[0];
  const sample = [{ address: t.address, group: 'winner', created: t.created, ref: { ts: refTs(t) } }];
  const mk = (ts) => new Map([[t.address, [mention(t, ts, 'p')]]]);
  const lowCfg = { ...wf.DEFAULTS, minWinners: 0, minControls: 0, minMentionedTokens: 0, bootstrapIters: 10 };
  const at = wf.analyzeSources(sample, mk(refTs(t)), { p: 0 }, lowCfg).sources.find((x) => x.key === 'platform:p');
  const before = wf.analyzeSources(sample, mk(refTs(t) - 1), { p: 0 }, lowCfg).sources.find((x) => x.key === 'platform:p');
  assert.strictEqual(at.winnersPreceded, 0);
  assert.strictEqual(before.winnersPreceded, 1);
  assert.strictEqual(before.leadWinners.medianSec, 1);
});

test('mentions before a token existed are dropped; ambiguous cashtags do not resolve', () => {
  const toks = [{ address: 'A', symbol: 'DUP', created: 1000 }, { address: 'B', symbol: 'DUP', created: 1500 }, { address: 'C', symbol: 'UNI', created: 1000 }];
  const raws = [
    { ts: 900, ingested_ts: 900, platform: 'p', srcs: [], addresses: ['A'], cashtags: [] },        // before creation
    { ts: 2000, ingested_ts: 2000, platform: 'p', srcs: [], addresses: [], cashtags: ['DUP'] },    // ambiguous at t=2000
    { ts: 1200, ingested_ts: 1200, platform: 'p', srcs: [], addresses: [], cashtags: ['DUP'] },    // only A existed -> resolves
    { ts: 1200, ingested_ts: 1200, platform: 'p', srcs: [], addresses: [], cashtags: ['UNI'] },
    { ts: 1000 + 90000, ingested_ts: 1, platform: 'p', srcs: [], addresses: [], cashtags: ['UNI'] }, // too long after creation
  ];
  const m = wf.resolveMentions(raws, toks, wf.DEFAULTS);
  assert.deepStrictEqual((m.get('A') || []).map((x) => x.ts), [1200]);
  assert.strictEqual(m.get('B'), undefined);
  assert.deepStrictEqual((m.get('C') || []).map((x) => x.ts), [1200]);
});

test('multiple-testing helpers', () => {
  assert.deepStrictEqual(wf.bonferroni([0.01, 0.2]), [0.02, 0.4]);
  const q = wf.bhAdjust([0.01, 0.04, 0.03, 0.5]);
  assert.ok(Math.abs(q[0] - 0.04) < 1e-9 && Math.abs(q[1] - 0.0533333) < 1e-5 && Math.abs(q[2] - 0.0533333) < 1e-5 && q[3] === 0.5);
});

test('classifyToken: winner needs +X% after the reference only; uncovered non-winners are skipped', () => {
  const mk = (prices, dead) => ({ address: 'Z', created: T0, dead_ts: dead ?? null, snaps: prices.map((p, i) => ({ ts: T0 + 900 + i * 600, price: p, liq: 1000, vol: 100 })) });
  assert.strictEqual(wf.classifyToken(mk([1, 1.2, 2.1])).status, 'winner');
  assert.strictEqual(wf.classifyToken(mk([1, 1.2, 1.5])).status, 'skip');                       // not enough horizon coverage
  const full = Array.from({ length: 40 }, () => 1);
  assert.strictEqual(wf.classifyToken(mk(full)).status, 'control');
  assert.strictEqual(wf.classifyToken(mk([1, 0.5], T0 + 2000)).status, 'control');              // died: counted as non-winner
  assert.strictEqual(wf.classifyToken({ address: 'Q', created: T0, snaps: [{ ts: T0 + 60, price: 1, liq: 1, vol: 1 }] }).status, 'skip');
});

test('runner end to end on sqlite: radar tables + stored social posts, append-only report', () => {
  const radar = new DatabaseSync(':memory:');
  radar.exec(`CREATE TABLE token (token_address TEXT PRIMARY KEY, symbol TEXT, pool_created_ts INTEGER NOT NULL, dead_ts INTEGER);
    CREATE TABLE market_snapshot (token_address TEXT NOT NULL, ts INTEGER NOT NULL, price_usd REAL, liquidity_usd REAL, vol_h1 REAL, PRIMARY KEY (token_address, ts));`);
  const main = initSocialSchema(new DatabaseSync(':memory:'));
  const now = T0 + 3 * 86400;
  const base = now - 2 * 86400;
  const tokens = makeWorld({ nW: 30, nC: 270 }).map((t) => ({ ...t, created: base + (t.created - T0), snaps: t.snaps.map((s) => ({ ...s, ts: base + (s.ts - T0) })) }));
  const insT = radar.prepare('INSERT INTO token VALUES (?,?,?,?)');
  const insS = radar.prepare('INSERT INTO market_snapshot VALUES (?,?,?,?,?)');
  for (const t of tokens) { insT.run(t.address, t.symbol, t.created, null); for (const s of t.snaps) insS.run(t.address, s.ts, s.price, s.liq, s.vol); }
  const insR = main.prepare('INSERT INTO social_post_raw(post_id, platform, source_id, thread_id, author_id, ts, text_hash, addresses_json, cashtags_json, ingested_ts) VALUES (?,?,?,?,?,?,?,?,?,?)');
  const rng = mulberry32(3);
  let n = 0;
  for (const t of tokens) {
    if (rng() < (t.win ? 0.8 : 0.05)) {
      const ts = (t.created + 900 - 200 - Math.floor(rng() * 400)) * 1000;
      insR.run(`4chan:biz:${n++}`, '4chan', 'biz', `biz:${n % 7}`, null, ts, 'h', JSON.stringify([t.address]), '[]', ts + 20000);
    }
  }
  const r = wf.runWinnerFirst(radar, main, { nowSec: now, config: { bootstrapIters: 400 } });
  assert.strictEqual(r.ok, true, r.error);
  assert.strictEqual(r.verdict, 'POSSIBLE_EDGE');
  assert.ok(r.sources.some((s) => s.key === 'community:4chan:biz'));
  assert.ok(r.sources.some((s) => s.level === 'thread'), 'per-thread sources for anonymous 4chan');
  assert.ok(!r.sources.some((s) => s.level === 'account'), 'no account-level rows without identity');
  const latest = wf.latestWinnerFirst(main);
  assert.strictEqual(latest.verdict, 'POSSIBLE_EDGE');
  assert.throws(() => main.prepare('UPDATE winner_first_report SET verdict = ?').run('x'), /append-only/);
  assert.throws(() => main.prepare('DELETE FROM winner_first_report').run(), /append-only/);
  wf.runWinnerFirst(radar, main, { nowSec: now + 1 });
  assert.strictEqual(main.prepare('SELECT COUNT(*) n FROM winner_first_report').get().n, 2);
  // missing radar tables never throw
  const bad = wf.runWinnerFirst(new DatabaseSync(':memory:'), main, { nowSec: now });
  assert.strictEqual(bad.ok, false);
});

test('scheduler is guarded by WINNER_FIRST_JOB', () => {
  const prev = process.env.WINNER_FIRST_JOB;
  delete process.env.WINNER_FIRST_JOB;
  assert.strictEqual(wf.start(() => null, {}), null);
  if (prev !== undefined) process.env.WINNER_FIRST_JOB = prev;
});
