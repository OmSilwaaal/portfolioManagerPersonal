// A QR encoder, written out rather than installed.
//
// Why hand-rolled: the brief forbids new dependencies, and a QR symbol is a fully specified
// format (ISO/IEC 18004) rather than a judgement call, so there is nothing to get creatively
// wrong — only arithmetic to get right. Scope is deliberately narrow: byte mode, versions
// 1-10, which covers a 44-character Solana address and a `solana:` URI with room to spare. A
// bigger payload throws instead of silently producing a symbol no scanner can read.
//
// Error correction defaults to H (30% of codewords recoverable) because the point of this
// module is a code with a logo sitting on top of it. The logo destroys modules; the error
// correction is what buys them back. See LOGO_MAX_AREA_RATIO for the budget.

// ── GF(256) ───────────────────────────────────────────────────────────────────
// Reed-Solomon over GF(2^8) with the QR primitive polynomial x^8+x^4+x^3+x^2+1 (0x11d).
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

const gfMul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

/** Generator polynomial for `degree` error-correction codewords: prod (x - a^i). */
function rsGenerator(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

/** The `degree` error-correction codewords for one data block. */
function rsEncode(data, degree) {
  const gen = rsGenerator(degree);
  const rem = new Uint8Array(degree);
  for (const byte of data) {
    const factor = byte ^ rem[0];
    rem.copyWithin(0, 1);
    rem[degree - 1] = 0;
    if (factor !== 0) for (let i = 0; i < degree; i++) rem[i] ^= gfMul(gen[i + 1], factor);
  }
  return rem;
}

// ── format tables (ISO/IEC 18004, versions 1-10) ──────────────────────────────
const TOTAL_CODEWORDS = [0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346];

// [ecCodewordsPerBlock, blocksInGroup1, dataCodewordsInGroup1, blocksInGroup2, dataCodewordsInGroup2]
const EC_BLOCKS = {
  L: [null, [7, 1, 19, 0, 0], [10, 1, 34, 0, 0], [15, 1, 55, 0, 0], [20, 1, 80, 0, 0], [26, 1, 108, 0, 0],
    [18, 2, 68, 0, 0], [20, 2, 78, 0, 0], [24, 2, 97, 0, 0], [30, 2, 116, 0, 0], [18, 2, 68, 2, 69]],
  M: [null, [10, 1, 16, 0, 0], [16, 1, 28, 0, 0], [26, 1, 44, 0, 0], [18, 2, 32, 0, 0], [24, 2, 43, 0, 0],
    [16, 4, 27, 0, 0], [18, 4, 31, 0, 0], [22, 2, 38, 2, 39], [22, 3, 36, 2, 37], [26, 4, 43, 1, 44]],
  Q: [null, [13, 1, 13, 0, 0], [22, 1, 22, 0, 0], [18, 2, 17, 0, 0], [26, 2, 24, 0, 0], [18, 2, 15, 2, 16],
    [24, 4, 19, 0, 0], [18, 2, 14, 4, 15], [22, 4, 18, 2, 19], [20, 4, 16, 4, 17], [24, 6, 19, 2, 20]],
  H: [null, [17, 1, 9, 0, 0], [28, 1, 16, 0, 0], [22, 2, 13, 0, 0], [16, 4, 9, 0, 0], [22, 2, 11, 2, 12],
    [28, 4, 15, 0, 0], [26, 4, 13, 1, 14], [26, 4, 14, 2, 15], [24, 4, 12, 4, 13], [28, 6, 15, 2, 16]],
};

const ALIGNMENT = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

/** Two bits that identify the EC level in the format information. Not the same order as L<M<Q<H. */
const EC_INDICATOR = { L: 0b01, M: 0b00, Q: 0b11, H: 0b10 };

const MAX_VERSION = 10;
const size = (version) => version * 4 + 17;

/** Data codewords available at a (version, level), summed across both block groups. */
function dataCodewords(version, level) {
  const [ec, b1, d1, b2, d2] = EC_BLOCKS[level][version];
  return b1 * d1 + b2 * d2;
}

/** Byte-mode character-count indicator width. The jump at version 10 is in the spec. */
const countBits = (version) => (version < 10 ? 8 : 16);

/** Smallest version that fits `byteLength` bytes at `level`, or null. */
function chooseVersion(byteLength, level) {
  for (let v = 1; v <= MAX_VERSION; v++) {
    const capacity = dataCodewords(v, level) * 8 - 4 - countBits(v);
    if (byteLength * 8 <= capacity) return v;
  }
  return null;
}

// ── BCH codes for the format and version information ──────────────────────────
function bch(value, generator, genBits) {
  let v = value << genBits;
  const genLen = 32 - Math.clz32(generator);
  while (32 - Math.clz32(v) >= genLen) v ^= generator << (32 - Math.clz32(v) - genLen);
  return (value << genBits) | v;
}
/** 15-bit format information: 5 data bits (level + mask), BCH(15,5), XOR the spec mask. */
const formatBits = (level, mask) => bch((EC_INDICATOR[level] << 3) | mask, 0b10100110111, 10) ^ 0b101010000010010;
/** 18-bit version information, present only from version 7. */
const versionBits = (version) => bch(version, 0b1111100100101, 12);

// ── bit stream ────────────────────────────────────────────────────────────────
class BitBuffer {
  constructor() { this.bits = []; }
  push(value, length) { for (let i = length - 1; i >= 0; i--) this.bits.push((value >>> i) & 1); }
  get length() { return this.bits.length; }
  toCodewords(count) {
    const out = new Uint8Array(count);
    for (let i = 0; i < this.bits.length; i++) if (this.bits[i]) out[i >> 3] |= 0x80 >> (i & 7);
    return out;
  }
}

/** UTF-8 bytes. A Solana address is ASCII, but a label in a URI need not be. */
function utf8(text) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text);
  return Uint8Array.from(Buffer.from(text, 'utf8'));
}

/** Data codewords: mode + count + payload + terminator + pad bits + the 0xEC/0x11 pad run. */
function buildDataCodewords(bytes, version, level) {
  const total = dataCodewords(version, level);
  const buf = new BitBuffer();
  buf.push(0b0100, 4);                       // byte mode
  buf.push(bytes.length, countBits(version));
  for (const b of bytes) buf.push(b, 8);
  // Terminator, truncated if the symbol is nearly full.
  buf.push(0, Math.min(4, total * 8 - buf.length));
  while (buf.length % 8 !== 0) buf.push(0, 1);
  const codewords = buf.toCodewords(total);
  // The spec's alternating pad bytes, which keep the unused tail from looking like a pattern.
  for (let i = buf.length / 8, alt = 0; i < total; i++, alt++) codewords[i] = alt % 2 === 0 ? 0xec : 0x11;
  return codewords;
}

/** Split into blocks, error-correct each, then interleave as the spec requires. */
function interleave(codewords, version, level) {
  const [ecPerBlock, b1, d1, b2, d2] = EC_BLOCKS[level][version];
  const dataBlocks = [];
  let at = 0;
  for (let i = 0; i < b1; i++) { dataBlocks.push(codewords.subarray(at, at + d1)); at += d1; }
  for (let i = 0; i < b2; i++) { dataBlocks.push(codewords.subarray(at, at + d2)); at += d2; }
  const ecBlocks = dataBlocks.map((b) => rsEncode(b, ecPerBlock));

  const out = [];
  const maxData = Math.max(d1, d2);
  // Column-major across blocks: byte 0 of every block, then byte 1 of every block, ...
  for (let i = 0; i < maxData; i++) for (const b of dataBlocks) if (i < b.length) out.push(b[i]);
  for (let i = 0; i < ecPerBlock; i++) for (const b of ecBlocks) out.push(b[i]);
  return Uint8Array.from(out);
}

// ── matrix ────────────────────────────────────────────────────────────────────
// Cells are 0/1 for data, and `reserved` marks everything a function pattern owns so the
// data-placement walk can skip it.
function newMatrix(version) {
  const n = size(version);
  return {
    n,
    cells: Array.from({ length: n }, () => new Uint8Array(n)),
    reserved: Array.from({ length: n }, () => new Uint8Array(n)),
  };
}

function set(m, r, c, value, reserve = true) {
  m.cells[r][c] = value ? 1 : 0;
  if (reserve) m.reserved[r][c] = 1;
}

function placeFinder(m, row, col) {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const rr = row + r;
      const cc = col + c;
      if (rr < 0 || cc < 0 || rr >= m.n || cc >= m.n) continue;
      // 7x7 concentric square, plus the one-module light separator from the -1/7 ring.
      const inRing = r >= 0 && r <= 6 && c >= 0 && c <= 6;
      const dark = inRing && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
      set(m, rr, cc, dark);
    }
  }
}

function placeAlignment(m, version) {
  const centers = ALIGNMENT[version];
  for (const r of centers) {
    for (const c of centers) {
      // The three finder corners already own these positions.
      if ((r === 6 && c === 6) || (r === 6 && c === centers[centers.length - 1]) || (r === centers[centers.length - 1] && c === 6)) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          set(m, r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
        }
      }
    }
  }
}

function placeFunctionPatterns(m, version) {
  placeFinder(m, 0, 0);
  placeFinder(m, 0, m.n - 7);
  placeFinder(m, m.n - 7, 0);
  // Timing patterns: alternating modules along row 6 and column 6.
  for (let i = 8; i < m.n - 8; i++) {
    set(m, 6, i, i % 2 === 0);
    set(m, i, 6, i % 2 === 0);
  }
  placeAlignment(m, version);
  // Reserve the format-information areas; the values go in after a mask is chosen.
  // Copy 1 wraps the top-left finder: (8,0..5), (8,7), (8,8), (7,8), (5..0,8).
  for (let i = 0; i < 9; i++) {
    if (!m.reserved[8][i]) set(m, 8, i, 0);
    if (!m.reserved[i][8]) set(m, i, 8, 0);
  }
  // Copy 2 is split 8/7, not 8/8: EIGHT modules in the row left of the top-right finder and
  // SEVEN in the column above the bottom-left one. The 15th position in that column,
  // (n-8, 8), is the dark module — reserving eight here would overwrite it and the symbol
  // would not decode at all.
  for (let i = 0; i < 8; i++) set(m, 8, m.n - 1 - i, 0);
  for (let i = 0; i < 7; i++) set(m, m.n - 1 - i, 8, 0);
  // The dark module, always set, always here.
  set(m, m.n - 8, 8, 1);
  if (version >= 7) {
    const bits = versionBits(version);
    for (let i = 0; i < 18; i++) {
      const bit = (bits >> i) & 1;
      set(m, Math.floor(i / 3), m.n - 11 + (i % 3), bit);
      set(m, m.n - 11 + (i % 3), Math.floor(i / 3), bit);
    }
  }
}

/** The zig-zag walk: two-module columns right to left, alternating up and down. */
function placeData(m, codewords) {
  let bit = 0;
  const total = codewords.length * 8;
  let upward = true;
  for (let right = m.n - 1; right >= 1; right -= 2) {
    const colPair = right === 6 ? [5, 4] : [right, right - 1]; // column 6 is the timing pattern
    if (right === 6) right -= 1;
    for (let step = 0; step < m.n; step++) {
      const r = upward ? m.n - 1 - step : step;
      for (const c of colPair) {
        if (m.reserved[r][c]) continue;
        const value = bit < total ? (codewords[bit >> 3] >> (7 - (bit & 7))) & 1 : 0;
        m.cells[r][c] = value;
        bit++;
      }
    }
    upward = !upward;
  }
}

const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

/** The four penalty rules. Lower is better; the spec picks the minimum across all 8 masks. */
function penalty(cells, n) {
  let score = 0;

  // Rule 1: runs of five or more same-coloured modules in a row or column.
  const runScore = (get) => {
    let total = 0;
    for (let a = 0; a < n; a++) {
      let run = 1;
      for (let b = 1; b < n; b++) {
        if (get(a, b) === get(a, b - 1)) run++;
        else { if (run >= 5) total += run - 2; run = 1; }
      }
      if (run >= 5) total += run - 2;
    }
    return total;
  };
  score += runScore((a, b) => cells[a][b]) + runScore((a, b) => cells[b][a]);

  // Rule 2: every 2x2 block of one colour.
  for (let r = 0; r < n - 1; r++) {
    for (let c = 0; c < n - 1; c++) {
      const v = cells[r][c];
      if (v === cells[r][c + 1] && v === cells[r + 1][c] && v === cells[r + 1][c + 1]) score += 3;
    }
  }

  // Rule 3: the finder-like 1:1:3:1:1 pattern with four light modules on either side.
  const A = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const B = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
  const matches = (get, i, j, pat) => { for (let k = 0; k < 11; k++) if (get(i, j + k) !== pat[k]) return false; return true; };
  for (let a = 0; a < n; a++) {
    for (let b = 0; b <= n - 11; b++) {
      if (matches((x, y) => cells[x][y], a, b, A) || matches((x, y) => cells[x][y], a, b, B)) score += 40;
      if (matches((x, y) => cells[y][x], a, b, A) || matches((x, y) => cells[y][x], a, b, B)) score += 40;
    }
  }

  // Rule 4: deviation of the dark-module proportion from 50%.
  let dark = 0;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) dark += cells[r][c];
  score += Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5) * 10;

  return score;
}

function applyFormat(m, level, mask) {
  const bits = formatBits(level, mask);
  for (let i = 0; i < 15; i++) {
    const bit = (bits >> i) & 1;
    // Copy 1 starts at the TOP of column 8 with the least significant bit, runs down to
    // (8,8), then turns left along row 8 and ends with the most significant bit at (8,0).
    // The direction matters: writing this sequence backwards still produces a symbol whose
    // finder and timing patterns are perfect, so it looks right and no scanner can read it.
    // Both the row and the column skip index 6, which belongs to the timing pattern.
    if (i < 6) m.cells[i][8] = bit;
    else if (i === 6) m.cells[7][8] = bit;
    else if (i === 7) m.cells[8][8] = bit;
    else if (i === 8) m.cells[8][7] = bit;
    else m.cells[8][14 - i] = bit;          // i = 9..14 -> columns 5 down to 0
    // Copy 2 is split 8/7, not 8/8: bits 0-7 run leftward along row 8 from the right edge,
    // bits 8-14 run down column 8 from row n-7. The position between the two halves,
    // (n-8, 8), is the dark module and is not part of the format information.
    if (i < 8) m.cells[8][m.n - 1 - i] = bit;
    else m.cells[m.n - 15 + i][8] = bit;    // i = 8..14 -> rows n-7 down to n-1
  }
}

/**
 * Encode `text` into a QR matrix.
 * @returns {{ size: number, modules: number[][], version: number, level: string, mask: number }}
 *          `modules[r][c]` is 1 for a dark module.
 */
function encode(text, { level = 'H' } = {}) {
  if (typeof text !== 'string' || text.length === 0) throw new Error('qr: nothing to encode');
  if (!EC_BLOCKS[level]) throw new Error(`qr: unknown error-correction level ${level}`);
  const bytes = utf8(text);
  const version = chooseVersion(bytes.length, level);
  if (!version) throw new Error(`qr: ${bytes.length} bytes does not fit in version ${MAX_VERSION} at level ${level}`);

  const codewords = interleave(buildDataCodewords(bytes, version, level), version, level);
  if (codewords.length !== TOTAL_CODEWORDS[version]) {
    // A mismatch here means a table is wrong, which would produce an unreadable symbol.
    // Better to throw than to render something that looks like a QR code and is not one.
    throw new Error(`qr: internal codeword count mismatch (${codewords.length} vs ${TOTAL_CODEWORDS[version]})`);
  }

  const base = newMatrix(version);
  placeFunctionPatterns(base, version);
  placeData(base, codewords);

  // Try all eight masks and keep the one the spec's penalty rules prefer.
  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const cells = base.cells.map((row, r) => Uint8Array.from(row, (v, c) => (base.reserved[r][c] ? v : v ^ (MASKS[mask](r, c) ? 1 : 0))));
    const trial = { n: base.n, cells, reserved: base.reserved };
    applyFormat(trial, level, mask);
    const score = penalty(cells, base.n);
    if (!best || score < best.score) best = { score, mask, cells };
  }

  return {
    size: base.n,
    version,
    level,
    mask: best.mask,
    modules: best.cells.map((row) => Array.from(row)),
  };
}

// The logo budget. At level H the symbol tolerates roughly 30% of its codewords being
// destroyed, but that allowance also has to absorb print quality, screen scaling and the
// scanner's own binarisation, so the covered area is kept well inside it. 20% of the symbol
// AREA is about a 45% width — this is checked by the test suite against a real decoder
// rather than taken on trust.
const LOGO_MAX_AREA_RATIO = 0.2;
/** Largest logo side, as a fraction of the symbol's side, that stays inside the area budget. */
const logoMaxSideRatio = (areaRatio = LOGO_MAX_AREA_RATIO) => Math.sqrt(areaRatio);

// What we actually ship: a 28% side, which is 7.8% of the area — comfortably inside the 20%
// budget rather than at its edge. The margin is not timidity. A sweep against a real decoder
// (see backend/test/qr-encoder.test.js and the report) put the failure point between 40% and
// 44% of the side at ten pixels per module, but it moved DOWN as the rendering got smaller:
// at eight pixels per module the larger symbols already failed at 44%. A QR on a phone screen
// at an awkward angle has less to work with than a clean raster, so the shipped figure leaves
// room for the scanning conditions we do not control.
const DEFAULT_LOGO_SIDE_RATIO = 0.28;

/** Clamp any requested logo side to the error-correction budget. */
function clampLogoSide(ratio) {
  const r = Number.isFinite(ratio) && ratio > 0 ? ratio : DEFAULT_LOGO_SIDE_RATIO;
  return Math.min(r, logoMaxSideRatio());
}

/** Four light modules on every side. Part of the spec, not padding: without the quiet zone
 * a scanner cannot find the symbol's edge against whatever it is printed on. */
const QUIET_ZONE = 4;

/**
 * Everything needed to draw the symbol, as plain numbers and one path string. Kept separate
 * from the React component so the exact geometry that ships can be rasterised and scanned by
 * the test suite — a QR that is only inspected by eye has not been verified at all.
 */
function qrGeometry(value, { logo = true, logoRatio = DEFAULT_LOGO_SIDE_RATIO } = {}) {
  const qr = encode(value, { level: 'H' });
  const total = qr.size + QUIET_ZONE * 2;
  const logoSide = logo ? clampLogoSide(logoRatio) * qr.size : 0;
  const logoXY = (total - logoSide) / 2;

  // One path for every dark module rather than one rect each: a version 6 symbol has around
  // 700 dark modules, and 700 DOM nodes inside a card that re-renders is a real cost.
  const parts = [];
  for (let r = 0; r < qr.size; r++) {
    for (let c = 0; c < qr.size; c++) {
      if (qr.modules[r][c]) parts.push(`M${c + QUIET_ZONE} ${r + QUIET_ZONE}h1v1h-1z`);
    }
  }
  return { ...qr, total, path: parts.join(''), logoSide, logoXY, quiet: QUIET_ZONE };
}

export {
  encode, chooseVersion, dataCodewords, countBits, MAX_VERSION,
  LOGO_MAX_AREA_RATIO, logoMaxSideRatio, DEFAULT_LOGO_SIDE_RATIO, clampLogoSide,
  qrGeometry, QUIET_ZONE,
  formatBits, versionBits, rsEncode, gfMul,
};
