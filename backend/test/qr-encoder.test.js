// The QR encoder.
//
// A QR symbol that "looks like a QR code" proves nothing: the bug that cost the most time
// building this produced perfect finder patterns, perfect timing patterns and a perfectly
// plausible picture, while the format information was written in reverse bit order so no
// scanner on earth could read it. Eyeballing it would have shipped it.
//
// So the central test here is a GOLDEN COMPARISON against a reference encoder. The fixtures
// below were produced by Apple's CIQRCodeGenerator (Core Image) for the same inputs at the
// same error-correction level, and this encoder reproduces them module for module. Both a
// bare Solana address and a `solana:` URI are covered, which is everything the wallet card
// renders. Mixed-case base58 cannot be encoded in the denser alphanumeric mode, so both
// encoders independently choose byte mode and the outputs are directly comparable.
//
// Externally (see the task report) the rendered SVG was also rasterised and decoded by two
// independent decoders — OpenCV's QRCodeDetector and macOS CIDetector, the one behind the
// iPhone camera — with the Travauxus logo overlaid. That cannot run here (it needs OpenCV
// and a rasteriser), so the golden fixtures are what guards the encoder in CI.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const QR_SRC = path.join(__dirname, '..', '..', 'web', 'src', 'components', 'wallet', 'qr.js');

// qr.js is an ES module living in the Vite app; load it as one without a build step.
let qr;
test.before(async () => {
  const src = fs.readFileSync(QR_SRC, 'utf8');
  qr = await import(`data:text/javascript;base64,${Buffer.from(src).toString('base64')}`);
});

const ADDRESS = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const URI = `solana:${ADDRESS}`;

// Reference symbols from Apple's CIQRCodeGenerator at level H, one hex string per row,
// most significant bit = column 0.
const GOLDEN_ADDRESS = [
    '1fcfffde7f', '105c5d7541', '1759e73d5d', '175fac0c5d', '1756044a5d', '1055ac0c41',
    '1fd555557f', '0008c20600', '04f326abbe', '15872d032b', '176f5c969f', '1981f83628',
    '0af7fd4a65', '0e1a3bd5e9', '06cada1a61', '0a9835010b', '06df350251', '1dadc905ab',
    '13e8dbaf8f', '06bd0dc6e0', '1742724850', '01adfe226a', '0255789e85', '1e094b975b',
    '116197d24b', '0604328764', '1af65f6269', '059e151709', '1ee1c365f7', '001a696517',
    '1fd63fbd5f', '10587bc318', '174af003fe', '174cd5d085', '175da3ae97', '104c41a450',
    '1fc43f25e1',
];
const GOLDEN_URI = [
    '1fc2d01097f', '1046e910641', '17598c5125d', '1750d85155d', '174ab48f05d', '104f2941c41',
    '1fd5555557f', '0002d4e6700', '0361bd4a10c', '0d31e663e34', '0fcc039f4b8', '02890b9efe8',
    '197ff60ab4a', '1a0d75e8ad5', '01dbe14a415', '062077b5637', '1e62a8cf728', '06aa3de4117',
    '0eff5753299', '0b3c5d0ef97', '08721f213db', '0bb83d32cba', '1f468666508', '11be92b19da',
    '0d4cd847a63', '09364e9b1b0', '026a1e23ee5', '078e14ac38f', '1bd910d6b20', '1d88e978cd6',
    '1fd0f5f16cf', '180d42172bc', '1940b0743f5', '0014fb00315', '1fd0f2cef50', '1043cfc0b18',
    '17538a66ffb', '17546a6bb0f', '174b7beb437', '104cc1a47dd', '1fc7762f340',
];

const toRows = (modules) => modules.map((row) => row.join(''));
const goldenRows = (hex, n) => hex.map((h) => BigInt(`0x${h}`).toString(2).padStart(n, '0'));

test('a Solana address encodes exactly as the reference encoder does', () => {
  const q = qr.encode(ADDRESS, { level: 'H' });
  assert.strictEqual(q.size, 37, 'a 44-byte payload at level H is version 5');
  assert.strictEqual(q.version, 5);
  assert.deepStrictEqual(toRows(q.modules), goldenRows(GOLDEN_ADDRESS, 37));
});

test('a solana: URI encodes exactly as the reference encoder does', () => {
  const q = qr.encode(URI, { level: 'H' });
  assert.strictEqual(q.version, 6);
  assert.strictEqual(q.size, 41);
  assert.deepStrictEqual(toRows(q.modules), goldenRows(GOLDEN_URI, 41));
});

test('the format information matches the published BCH values', () => {
  // These four are the reference strings from the specification. The reversed-bit-order bug
  // passed every one of them, which is why the golden comparison above exists as well.
  assert.strictEqual(qr.formatBits('L', 0).toString(2).padStart(15, '0'), '111011111000100');
  assert.strictEqual(qr.formatBits('M', 0).toString(2).padStart(15, '0'), '101010000010010');
  assert.strictEqual(qr.formatBits('Q', 0).toString(2).padStart(15, '0'), '011010101011111');
  assert.strictEqual(qr.formatBits('H', 0).toString(2).padStart(15, '0'), '001011010001001');
  // Every format string must be a valid BCH(15,5) codeword once the spec mask is removed.
  for (const level of ['L', 'M', 'Q', 'H']) {
    for (let mask = 0; mask < 8; mask++) {
      let v = qr.formatBits(level, mask) ^ 0b101010000010010;
      while (v.toString(2).length >= 11 && v !== 0) v ^= 0b10100110111 << (v.toString(2).length - 11);
      assert.strictEqual(v, 0, `${level}/${mask} is not a valid codeword`);
    }
  }
});

test('the version information matches the published values', () => {
  assert.strictEqual(qr.versionBits(7).toString(16), '7c94');
  assert.strictEqual(qr.versionBits(10).toString(16), 'a4d3');
});

test('the dark module is set and the finder patterns are where they belong', () => {
  for (const text of [ADDRESS, URI, 'HELLO']) {
    const q = qr.encode(text, { level: 'H' });
    const n = q.size;
    assert.strictEqual(q.modules[n - 8][8], 1, 'the dark module must be dark');
    // Three finders, each a dark ring around a dark 3x3 core, with a light separator.
    for (const [br, bc] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
      assert.strictEqual(q.modules[br][bc], 1);
      assert.strictEqual(q.modules[br + 1][bc + 1], 0, 'the ring must be hollow');
      assert.strictEqual(q.modules[br + 3][bc + 3], 1, 'the core must be dark');
    }
    // Timing patterns alternate, starting dark at index 8.
    for (let i = 8; i < n - 8; i++) {
      assert.strictEqual(q.modules[6][i], i % 2 === 0 ? 1 : 0, `row-6 timing at ${i}`);
      assert.strictEqual(q.modules[i][6], i % 2 === 0 ? 1 : 0, `col-6 timing at ${i}`);
    }
  }
});

test('version selection grows with the payload and refuses what will not fit', () => {
  const sizeFor = (len) => qr.encode('a'.repeat(len), { level: 'H' }).version;
  assert.strictEqual(sizeFor(7), 1);
  assert.strictEqual(sizeFor(14), 2);
  assert.strictEqual(sizeFor(44), 5);
  assert.strictEqual(sizeFor(58), 6);
  assert.strictEqual(sizeFor(119), 10, 'the largest version this encoder supports');
  // Past capacity it throws rather than emitting a symbol nothing can read.
  assert.throws(() => qr.encode('a'.repeat(120), { level: 'H' }), /does not fit/);
  assert.throws(() => qr.encode('', { level: 'H' }), /nothing to encode/);
  assert.throws(() => qr.encode(ADDRESS, { level: 'Z' }), /unknown error-correction level/);
});

test('every version this encoder can emit is internally consistent', () => {
  // The codeword count is checked inside encode(); this walks every version to be sure no
  // table entry is wrong, since a bad table would produce a plausible but unreadable symbol.
  for (let v = 1; v <= qr.MAX_VERSION; v++) {
    for (const level of ['L', 'M', 'Q', 'H']) {
      const capacity = qr.dataCodewords(v, level) * 8 - 4 - qr.countBits(v);
      const bytes = Math.floor(capacity / 8);
      const q = qr.encode('a'.repeat(bytes), { level });
      assert.ok(q.version <= v, `${bytes} bytes at ${level} should fit in version ${v}, got ${q.version}`);
      assert.strictEqual(q.size, q.version * 4 + 17);
    }
  }
});

test('the logo budget stays inside the error-correction allowance', () => {
  // Level H recovers about 30% of codewords. The shipped logo covers well under that, and
  // anything larger that a caller asks for is clamped rather than honoured.
  assert.ok(qr.DEFAULT_LOGO_SIDE_RATIO ** 2 <= qr.LOGO_MAX_AREA_RATIO);
  assert.ok(qr.DEFAULT_LOGO_SIDE_RATIO ** 2 < 0.1, 'the default should be comfortably inside the budget');
  assert.strictEqual(qr.clampLogoSide(0.9), qr.logoMaxSideRatio());
  assert.strictEqual(qr.clampLogoSide(0.1), 0.1);
  for (const junk of [0, -1, NaN, null, undefined, 'big']) {
    assert.strictEqual(qr.clampLogoSide(junk), qr.DEFAULT_LOGO_SIDE_RATIO);
  }
});

test('the drawing geometry covers the whole symbol and centres the logo', () => {
  const g = qr.qrGeometry(ADDRESS, { logo: true });
  assert.strictEqual(g.total, g.size + qr.QUIET_ZONE * 2, 'four light modules on every side');
  assert.strictEqual(g.quiet, 4);
  // One path command per dark module, and the count matches the matrix.
  const dark = g.modules.flat().filter(Boolean).length;
  assert.strictEqual(g.path.match(/M/g).length, dark);
  assert.ok(dark > 0);
  // The logo is square, centred, and within the clamp.
  assert.strictEqual(g.logoXY, (g.total - g.logoSide) / 2);
  assert.ok(g.logoSide / g.size <= qr.logoMaxSideRatio() + 1e-9);
  // Asking for no logo leaves the symbol untouched.
  assert.strictEqual(qr.qrGeometry(ADDRESS, { logo: false }).logoSide, 0);
});
