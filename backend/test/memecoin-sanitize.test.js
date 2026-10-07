const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const data = require('../src/services/memecoinData');
const router = require('../src/routes/memecoins');

const C = (...codes) => String.fromCharCode(...codes);
const MINT = 'E'.repeat(44);
const BIDI_CHARS = [0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069, 0x200e, 0x200f, 0x061c];
const ZERO_WIDTH = [0x200b, 0x200c, 0x200d, 0x2060, 0xfeff, 0x00ad];

test('strips bidi overrides, zero-width and control characters', () => {
  assert.equal(data.sanitizeText(`${C(0x202e)}EVIL${C(0x202c)}`, 32), 'EVIL');
  for (const c of [...BIDI_CHARS, ...ZERO_WIDTH]) assert.equal(data.sanitizeText(`A${C(c)}B`, 32), 'AB', `U+${c.toString(16)}`);
  assert.equal(data.sanitizeText('A\u0000B\u0007C\u001bD\u007fE\u0085F', 32), 'ABCDE F'); // U+0085 (NEL) is a line break -> space
  assert.equal(data.sanitizeText('line1\nline2\r\n\ttab', 32), 'line1 line2 tab');
  assert.equal(data.sanitizeText(`a${C(0x2028)}b${C(0x2029)}c`, 32), 'a b c'); // line/paragraph separators act as spaces
});

test('removes invisible filler glyphs and variation selectors used as padding', () => {
  const fillers = C(0x3164, 0x115f, 0x1160, 0xffa0, 0x2800, 0x17b4, 0x17b5, 0xfe0f);
  assert.equal(data.sanitizeText(`SOL${fillers}`, 32, 'fb'), 'SOL');
  assert.equal(data.sanitizeText(fillers, 32, 'fb'), 'fb');
  assert.equal(data.sanitizeText(`USDC${C(0x2800)}${C(0x3000)}   `, 32), 'USDC');
});

test('NFKC-normalises compatibility homoglyphs and collapses whitespace', () => {
  assert.equal(data.sanitizeText('ＢＯＮＫ', 32), 'BONK'); // fullwidth
  assert.equal(data.sanitizeText('①ﬁ', 32), '1fi');
  assert.equal(data.sanitizeText('  too   many    spaces ', 32), 'too many spaces');
});

test('limits stacked combining marks (zalgo)', () => {
  const z = `a${C(0x301, 0x302, 0x303, 0x304, 0x305)}b`;
  assert.equal(Array.from(data.sanitizeText(z, 32)).length, 4); // a + 2 marks + b
});

test('caps length by code point (32 symbol / 48 name) without cutting surrogate pairs', () => {
  assert.equal(Array.from(data.cleanSymbol('x'.repeat(500), MINT)).length, 32);
  assert.equal(Array.from(data.cleanName('y'.repeat(500), MINT, 'S')).length, 48);
  const emoji = '\u{1F680}'.repeat(100);
  const out = data.cleanSymbol(emoji, MINT);
  assert.equal(Array.from(out).length, 32);
  assert.ok(!/[\ud800-\udbff](?![\udc00-\udfff])/.test(out), 'no lone surrogate');
});

test('falls back to a shortened mint when nothing visible is left', () => {
  assert.equal(data.cleanSymbol(C(0x202e, 0x200b), MINT), 'EEEE...EEEE');
  assert.equal(data.cleanSymbol(undefined, MINT), 'EEEE...EEEE');
  assert.equal(data.cleanSymbol({ evil: 1 }, MINT), 'EEEE...EEEE');
  assert.equal(data.cleanName('', MINT, 'SYM'), 'SYM');
  assert.equal(data.cleanName(null, MINT), 'EEEE...EEEE');
});

test('HTML-looking text is left as inert plain text (rendered by React as text, never as markup)', () => {
  assert.equal(data.sanitizeText('<img src=x onerror=alert(1)>', 48), '<img src=x onerror=alert(1)>');
});

const evilPair = (over = {}) => ({
  chainId: 'solana',
  baseToken: { address: MINT, symbol: `${C(0x202e)}ELBAT${C(0x200b)}${C(0x3164)}`.padEnd(200, 'Z'), name: `Fake ${C(0x2800)}USDC${C(0x202e)}\n\t${'N'.repeat(300)}` },
  quoteToken: { symbol: `${C(0x202e)}SOL` },
  priceUsd: '0.1', pairAddress: 'pool', liquidity: { usd: 1e5 },
  url: 'javascript:alert(1)',
  info: {
    imageUrl: 'data:image/svg+xml,<svg onload=alert(1)>',
    websites: [{ url: 'javascript:alert(1)', label: 'x' }, { url: 'https://ok.example/a', label: `${C(0x202e)}Site` }],
    socials: [{ type: 'twitter', url: 'https://x.com/z' }, { type: 'bad', url: 'ftp://nope' }],
  },
  ...over,
});

test('fromDexPair sanitises symbol/name/quote symbol and drops non-http(s) URLs', () => {
  const t = data.fromDexPair(evilPair());
  assert.equal(Array.from(t.symbol).length, 32);
  assert.ok(t.symbol.startsWith('ELBAT'));
  assert.equal(Array.from(t.name).length, 48);
  assert.ok(t.name.startsWith('Fake USDC '));
  assert.equal(t.pair.quote_symbol, 'SOL');
  assert.equal(t.pair.url, null);
  assert.equal(t.image, null);
  assert.deepEqual(t.websites.map((w) => [w.url, w.label]), [['https://ok.example/a', 'Site']]);
  assert.deepEqual(t.socials.map((s) => s.url), ['https://x.com/z']);
  assert.ok(!/[‪-‮​ㅤ⠀\n\t]/.test(JSON.stringify(t).replace(/\\n|\\t/g, '!')), 'no bidi/zero-width/filler left');
});

test('fromGeckoPool sanitises included token attributes and the pool-name fallback', () => {
  const pool = {
    attributes: { name: `${C(0x202e)}POOLSYM / SOL`, address: 'pool', base_token_price_usd: '1' },
    relationships: { base_token: { data: { id: `solana_${MINT}` } } },
  };
  const t1 = data.fromGeckoPool(pool, [{ id: `solana_${MINT}`, attributes: { symbol: `A${C(0x200b)}B${'c'.repeat(80)}`, name: C(0x202e), image_url: 'http://img.example/x.png' } }]);
  assert.ok(t1.symbol.startsWith('ABcc'));
  assert.equal(Array.from(t1.symbol).length, 32);
  assert.equal(t1.name, t1.symbol, 'empty name falls back to the clean symbol');
  assert.equal(t1.image, 'http://img.example/x.png');
  const t2 = data.fromGeckoPool(pool, []);
  assert.equal(t2.symbol, 'POOLSYM');
  const t3 = data.fromGeckoPool({ ...pool, attributes: { name: '' } }, []);
  assert.equal(t3.symbol, 'EEEE...EEEE');
});

test('every token-returning route returns sanitised text (trending, new, search, detail, signal list)', async () => {
  const axios = require('axios');
  const origGet = axios.get;
  const store = require('../src/services/signalStore'); // keep the test off the SQLite signal store
  const origPersist = store.persistSignal; const origPrev = store.previousLiquidity;
  store.persistSignal = () => true; store.previousLiquidity = () => null;
  const pair = evilPair();
  axios.get = async (url) => {
    if (url.includes('trending_pools') || url.includes('new_pools')) throw Object.assign(new Error('x'), { response: { status: 500 } });
    if (url.includes('token-boosts')) return { data: [{ chainId: 'solana', tokenAddress: MINT }] };
    if (url.includes('token-profiles')) return { data: [{ chainId: 'solana', tokenAddress: MINT }] };
    if (url.includes('/latest/dex/search')) return { data: { pairs: [pair] } };
    if (url.includes('/tokens/v1/solana/')) return { data: [pair] };
    throw Object.assign(new Error('x'), { response: { status: 500 } });
  };
  const app = express();
  app.use((req, _res, next) => { req.user = { id: 'u' }; next(); });
  app.use('/api/memecoins', router);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}/api/memecoins`;
  const get = async (p) => (await fetch(base + p)).json();
  const bad = /[‪-‮⁦-⁩​-‏ㅤ⠀\u0000-\u001f]/;
  const ok = (t) => { assert.ok(!bad.test(t.symbol + t.name), 'clean'); assert.ok(Array.from(t.symbol).length <= 32 && Array.from(t.name).length <= 48); };
  try {
    const trending = await get('/trending'); ok(trending[0]);
    const fresh = await get('/new'); ok(fresh[0]);
    const found = await get('/search?q=evil'); ok(found[0]);
    ok(await get(`/${MINT}`));
    const sig = await get(`/${MINT}/signal`);
    assert.ok(!bad.test(sig.symbol) && Array.from(sig.symbol).length <= 32);
    const sigs = await get('/signals?list=trending');
    assert.ok(sigs.signals.every((s) => !bad.test(s.symbol) && Array.from(s.symbol).length <= 32));
  } finally {
    axios.get = origGet;
    store.persistSignal = origPersist; store.previousLiquidity = origPrev;
    server.close();
  }
});
