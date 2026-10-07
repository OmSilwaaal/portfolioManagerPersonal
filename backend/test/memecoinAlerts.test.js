const test = require('node:test');
const assert = require('node:assert');
const { evaluateToken, normalisePrefs, offCooldown, DEFAULT_PREFS } = require('../src/services/memecoinAlerts');

const ON = { ...DEFAULT_PREFS, enabled: 1 };
const TOKEN = { address: 'So111', symbol: 'WIF', liquidity_usd: 100_000, change_5m: 2, change_1h: 5 };
const SIG = { score: 40, confidence: 0.8, level: 'ACTIVE', riskFlags: [] };
const kinds = (r) => r.map((a) => a.kind).sort();

test('disabled means silent, whatever the token is doing', () => {
  const r = evaluateToken({ token: { ...TOKEN, change_5m: 400 }, signal: { ...SIG, score: 99 }, prefs: DEFAULT_PREFS });
  assert.deepStrictEqual(r, []);
});

test('a major move fires in both directions', () => {
  const up = evaluateToken({ token: { ...TOKEN, change_5m: 40 }, signal: SIG, prefs: ON });
  const down = evaluateToken({ token: { ...TOKEN, change_5m: -40 }, signal: SIG, prefs: ON });
  assert.deepStrictEqual(kinds(up), ['move']);
  assert.deepStrictEqual(kinds(down), ['move']);
  assert.strictEqual(up[0].direction, 'up');
  assert.strictEqual(down[0].direction, 'down');
  assert.match(up[0].message, /jumped \+40\.0%/);
  assert.match(down[0].message, /dropped -40\.0%/);
});

test('a move just under the threshold stays quiet', () => {
  const r = evaluateToken({ token: { ...TOKEN, change_5m: 24.9 }, signal: SIG, prefs: ON });
  assert.deepStrictEqual(r, []);
});

test('the 5m window wins over 1h so one move is not reported twice', () => {
  const r = evaluateToken({ token: { ...TOKEN, change_5m: 40, change_1h: 150 }, signal: SIG, prefs: ON });
  assert.strictEqual(r.filter((a) => a.kind === 'move').length, 1);
  assert.strictEqual(r[0].window, '5m');
});

test('a good signal fires and carries score + confidence', () => {
  const r = evaluateToken({ token: TOKEN, signal: { ...SIG, score: 82, confidence: 0.7, level: 'HOT' }, prefs: ON });
  assert.deepStrictEqual(kinds(r), ['signal']);
  assert.strictEqual(r[0].score, 82);
  assert.match(r[0].message, /signal 82\/100 \(HOT\), confidence 70%/);
});

test('a high score on thin data does not fire', () => {
  const r = evaluateToken({ token: TOKEN, signal: { ...SIG, score: 95, confidence: 0.2 }, prefs: ON });
  assert.deepStrictEqual(r, []);
});

test('a rug indicator suppresses the signal alert but not the move alert', () => {
  const token = { ...TOKEN, change_5m: 60 };
  const signal = { ...SIG, score: 90, confidence: 0.9, riskFlags: [{ code: 'MINT_AUTHORITY' }] };
  const r = evaluateToken({ token, signal, prefs: ON });
  assert.deepStrictEqual(kinds(r), ['move'], 'a dump on a rug is still worth knowing about');
});

test('soft risk flags do not suppress a good signal', () => {
  const signal = { ...SIG, score: 90, confidence: 0.9, riskFlags: [{ code: 'LOW_LIQUIDITY' }, { code: 'VERY_NEW' }] };
  const r = evaluateToken({ token: TOKEN, signal, prefs: ON });
  assert.deepStrictEqual(kinds(r), ['signal']);
  assert.deepStrictEqual(r[0].flags.sort(), ['LOW_LIQUIDITY', 'VERY_NEW']);
});

test('illiquid tokens are gated out entirely', () => {
  const token = { ...TOKEN, liquidity_usd: 500, change_5m: 400 };
  assert.deepStrictEqual(evaluateToken({ token, signal: { ...SIG, score: 99, confidence: 1 }, prefs: ON }), []);
  // and a missing liquidity figure is treated as failing the gate, not passing it
  const noLiq = { ...TOKEN, liquidity_usd: null, change_5m: 400 };
  assert.deepStrictEqual(evaluateToken({ token: noLiq, signal: SIG, prefs: ON }), []);
});

test('a move and a good signal at once produce both alerts', () => {
  const r = evaluateToken({
    token: { ...TOKEN, change_5m: 55 },
    signal: { ...SIG, score: 88, confidence: 0.8, level: 'HOT' },
    prefs: ON,
  });
  assert.deepStrictEqual(kinds(r), ['move', 'signal']);
});

test('a non-finite score or confidence never fires', () => {
  for (const sig of [{ score: NaN, confidence: 0.9 }, { score: 90, confidence: NaN }, { score: null, confidence: null }, {}]) {
    assert.deepStrictEqual(evaluateToken({ token: TOKEN, signal: { ...SIG, ...sig }, prefs: ON }), []);
  }
});

test('garbage prefs fall back to defaults instead of opening the gates', () => {
  const p = normalisePrefs({ enabled: 1, move_pct_5m: -5, min_score: 0, min_confidence: 'abc', min_liquidity: null, cooldown_min: 0 });
  assert.strictEqual(p.move_pct_5m, DEFAULT_PREFS.move_pct_5m);
  assert.strictEqual(p.min_score, DEFAULT_PREFS.min_score);
  assert.strictEqual(p.min_confidence, DEFAULT_PREFS.min_confidence);
  assert.strictEqual(p.min_liquidity, DEFAULT_PREFS.min_liquidity);
  assert.strictEqual(p.cooldown_min, DEFAULT_PREFS.cooldown_min);
  // a 0 threshold would otherwise mean "alert on literally everything"
  assert.deepStrictEqual(evaluateToken({ token: TOKEN, signal: SIG, prefs: { enabled: 1, move_pct_5m: 0 } }), []);
});

test('min_confidence of 0 is honoured (it is a legitimate setting)', () => {
  const p = normalisePrefs({ enabled: 1, min_confidence: 0 });
  assert.strictEqual(p.min_confidence, 0);
});

test('cooldown gates repeats but lets the first one through', () => {
  const now = 1_700_000_000_000;
  assert.strictEqual(offCooldown(null, now, 60), true);
  assert.strictEqual(offCooldown(now - 59 * 60_000, now, 60), false);
  assert.strictEqual(offCooldown(now - 60 * 60_000, now, 60), true);
  assert.strictEqual(offCooldown(NaN, now, 60), true);
});
