// Unusual-activity score (0-100) for a token, from market data only.
// NOT a price prediction: it measures how abnormal current volume / price movement / flow is
// relative to the token's own recent baseline. Pure functions, no I/O, no look-ahead
// (candles with time > now are ignored).
const crypto = require('crypto');

const MODEL_VERSION = 'activity-v0';

const CONFIG = {
  // Component weights (renormalised over the components that are available)
  weights: {
    volume_accel: 0.35,
    price_accel: 0.25,
    buy_sell_imbalance: 0.15,
    realized_vol: 0.15,
    liquidity_delta: 0.10,
  },
  // Level thresholds on composite (lower bound of each level)
  levels: [
    { min: 75, level: 'HOT' },
    { min: 50, level: 'ACTIVE' },
    { min: 25, level: 'WARMING' },
    { min: 0, level: 'QUIET' },
  ],
  volumeRatioForMax: 8,      // 5m volume 8x typical -> component 100
  priceZForMax: 4,           // |z| of 5m return of 4 -> component 100
  minReturnStd: 0.002,       // floor on per-candle return std so dead-flat tokens don't give huge z
  volSdLow: 0.01,            // per-5m-candle log-return std mapping to 0
  volSdHigh: 0.10,           // ... and to 100
  liquidityDeltaForMax: 0.5, // |liquidity change| of 50% -> 100
  imbalanceMinTrades: 5,     // below this the imbalance is not computed
  imbalanceFullTrust: 30,    // trades needed for the imbalance to count at full strength
  baselineBuckets: 12,       // up to 1h of 5m buckets for "typical" volume
  minBaselineBuckets: 3,
  minReturnSamples: 6,
  risk: {
    lowLiquidityUsd: 20_000,
    veryNewMinutes: 60,
    spikeReturn: 0.30,       // >= +30% over ~5m ...
    spikeReturn1h: 1.0,      // ... or >= +100% over 1h
    spikeSellImbalance: -0.2,// ... together with sell-heavy flow
    washVol1hToLiq: 30,      // 1h volume > 30x liquidity
    washVol5mToLiq: 5,       // or 5m volume > 5x liquidity
  },
};

const clamp = (x, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, x));
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const round = (x, d = 2) => (isNum(x) ? Number(x.toFixed(d)) : null);

function median(a) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function stdev(a) {
  if (a.length < 2) return null;
  const mean = a.reduce((s, x) => s + x, 0) / a.length;
  return Math.sqrt(a.reduce((s, x) => s + (x - mean) ** 2, 0) / (a.length - 1));
}

function cleanCandles(candles, nowSec) {
  if (!Array.isArray(candles)) return [];
  return candles
    .filter((c) => c && isNum(c.time) && c.time <= nowSec && isNum(c.close) && c.close > 0)
    .sort((a, b) => a.time - b.time);
}

// Aggregate candles into 5-minute buckets (volume summed, close = last close).
function to5m(candles) {
  const buckets = new Map();
  for (const c of candles) {
    const k = Math.floor(c.time / 300) * 300;
    const b = buckets.get(k) || { time: k, volume: 0, close: c.close, open: c.open };
    b.volume += isNum(c.volume) ? c.volume : 0;
    b.close = c.close;
    buckets.set(k, b);
  }
  return [...buckets.values()].sort((a, b) => a.time - b.time);
}

const logReturns = (cs) => {
  const r = [];
  for (let i = 1; i < cs.length; i++) r.push(Math.log(cs[i].close / cs[i - 1].close));
  return r;
};

/**
 * @param {object} input
 *  token:      normalised token from memecoinData (price, liquidity_usd, volume_5m, volume_1h,
 *              change_5m, change_1h, buys_5m, sells_5m, buy_count, sell_count, pair.created_at)
 *  candles5m:  [{time(s), open, high, low, close, volume}] optional
 *  candles1m:  same, optional
 *  prevLiquidityUsd: liquidity from an earlier snapshot, optional
 *  now:        ms epoch (default Date.now()); candles after it are ignored
 * @returns {{score, level, components, riskFlags, confidence, asOf, modelVersion, features, featureVectorHash}}
 */
function computeSignal(input = {}) {
  const token = input.token || {};
  const now = isNum(input.now) ? input.now : Date.now();
  const nowSec = now / 1000;
  const W = CONFIG.weights;

  const c1 = cleanCandles(input.candles1m, nowSec);
  let c5 = cleanCandles(input.candles5m, nowSec);
  if (c5.length < 4 && c1.length) c5 = to5m(c1);
  // keep only the last hour (+ current bucket) as the baseline window
  const hourAgo = nowSec - 3600;
  const c5w = c5.filter((c) => c.time >= hourAgo - 300);

  const features = {
    volume_ratio: null, ret_5m: null, ret_z: null, return_std: null,
    realized_vol: null, liquidity_delta: null, imbalance: null, trades_n: null,
  };
  const comps = { volume_accel: null, price_accel: null, realized_vol: null, liquidity_delta: null, buy_sell_imbalance: null };
  const notes = [];

  // ── volume_accel ──
  let curVol = isNum(token.volume_5m) ? token.volume_5m : null;
  let baseline = null;
  if (c5w.length >= 2) {
    const prior = c5w.slice(0, -1).slice(-CONFIG.baselineBuckets).map((c) => c.volume);
    if (curVol === null) curVol = c5w[c5w.length - 1].volume;
    if (prior.length >= CONFIG.minBaselineBuckets) baseline = median(prior);
  }
  let volEstimated = false;
  if (baseline === null && isNum(token.volume_1h) && token.volume_1h > 0) {
    baseline = token.volume_1h / 12; // coarse typical 5m volume from list data
    volEstimated = true;
  }
  if (curVol !== null && baseline !== null) {
    const floor = Math.max(baseline, 1); // $1 floor avoids divide-by-zero on dead tokens
    const ratio = curVol / floor;
    features.volume_ratio = round(ratio, 3);
    comps.volume_accel = ratio <= 1 ? 0 : clamp((Math.log2(ratio) / Math.log2(CONFIG.volumeRatioForMax)) * 100);
    if (volEstimated) notes.push('volume baseline estimated from 1h total');
  }

  // ── price_accel & realized_vol ──
  const series = c1.length >= CONFIG.minReturnSamples + 6 ? c1 : c5w;
  const stepMin = series === c1 ? 1 : 5;
  let ret = null;
  if (series.length >= 2) {
    const last = series[series.length - 1];
    const target = last.time - 300;
    let ref = null;
    for (let i = series.length - 2; i >= 0; i--) { ref = series[i]; if (series[i].time <= target) break; }
    if (ref && ref.close > 0) ret = Math.log(last.close / ref.close);
  }
  if (ret === null && isNum(token.change_5m)) ret = Math.log(Math.max(1 + token.change_5m / 100, 1e-6));
  features.ret_5m = round(ret, 4);

  const k = 5 / stepMin; // candles per 5 minutes
  const hist = series.slice(0, Math.max(0, series.length - Math.ceil(k))); // exclude the recent window
  const histWin = hist.filter((c) => c.time >= hourAgo - 300);
  const rets = logReturns(histWin);
  if (rets.length >= CONFIG.minReturnSamples) {
    const sd = stdev(rets);
    features.return_std = round(sd, 5);
    if (ret !== null) {
      const sd5 = Math.max(sd * Math.sqrt(k), CONFIG.minReturnStd);
      const z = ret / sd5;
      features.ret_z = round(z, 3);
      comps.price_accel = clamp((Math.abs(z) / CONFIG.priceZForMax) * 100);
    }
    // realized vol normalised to a 5m horizon
    const sd5m = sd * Math.sqrt(k);
    features.realized_vol = round(sd5m, 5);
    comps.realized_vol = clamp(((sd5m - CONFIG.volSdLow) / (CONFIG.volSdHigh - CONFIG.volSdLow)) * 100);
  } else if (ret !== null) {
    notes.push('too little candle history for price z-score');
  }

  // ── liquidity_delta ──
  if (isNum(input.prevLiquidityUsd) && input.prevLiquidityUsd > 0 && isNum(token.liquidity_usd)) {
    const d = (token.liquidity_usd - input.prevLiquidityUsd) / input.prevLiquidityUsd;
    features.liquidity_delta = round(d, 4);
    comps.liquidity_delta = clamp((Math.abs(d) / CONFIG.liquidityDeltaForMax) * 100);
  }

  // ── buy_sell_imbalance ──
  let buys = token.buys_5m; let sells = token.sells_5m;
  if (!(isNum(buys) && isNum(sells) && buys + sells >= CONFIG.imbalanceMinTrades)) {
    buys = token.buy_count; sells = token.sell_count;
  }
  if (isNum(buys) && isNum(sells) && buys + sells >= CONFIG.imbalanceMinTrades) {
    const n = buys + sells;
    const imb = (buys - sells) / n;
    features.imbalance = round(imb, 4);
    features.trades_n = n;
    comps.buy_sell_imbalance = clamp(Math.abs(imb) * Math.min(1, n / CONFIG.imbalanceFullTrust) * 100);
  }

  // ── combine ──
  let wSum = 0; let acc = 0;
  for (const key of Object.keys(W)) {
    if (comps[key] !== null) { wSum += W[key]; acc += W[key] * comps[key]; }
  }
  const score = wSum > 0 ? clamp(acc / wSum) : 0;
  const totalW = Object.values(W).reduce((s, x) => s + x, 0);
  // Confidence: share of weight available, but volume & price are mandatory-ish for a high value
  let confidence = wSum / totalW;
  if (comps.volume_accel === null) confidence *= 0.6;
  if (comps.price_accel === null) confidence *= 0.8;
  if (volEstimated) confidence *= 0.85;
  if (!c5w.length && !c1.length) confidence *= 0.85;
  confidence = wSum > 0 ? clamp(confidence, 0, 1) : 0;

  const level = CONFIG.levels.find((l) => score >= l.min).level;

  const components = {};
  for (const key of Object.keys(W)) {
    components[key] = { score: comps[key] === null ? null : round(comps[key], 1), weight: W[key] };
  }

  // ── risk flags (independent of score) ──
  const R = CONFIG.risk;
  const riskFlags = [];
  if (isNum(token.liquidity_usd) && token.liquidity_usd < R.lowLiquidityUsd) {
    riskFlags.push({ code: 'LOW_LIQUIDITY', label: 'Low liquidity', detail: `Liquidity under $${R.lowLiquidityUsd / 1000}k` });
  }
  const created = token.pair?.created_at;
  if (isNum(created) && created > 0) {
    const ageMin = (now - created) / 60000;
    if (ageMin >= 0 && ageMin < R.veryNewMinutes) {
      riskFlags.push({ code: 'VERY_NEW', label: 'Very new', detail: `Pool is ${Math.max(1, Math.round(ageMin))}m old` });
    }
  }
  const spike = (ret !== null && Math.exp(ret) - 1 >= R.spikeReturn)
    || (isNum(token.change_1h) && token.change_1h / 100 >= R.spikeReturn1h);
  const imbForFlag = features.imbalance;
  if (spike && imbForFlag !== null && imbForFlag <= R.spikeSellImbalance) {
    riskFlags.push({ code: 'SPIKE_SELL_HEAVY', label: 'Spike with heavy selling', detail: 'Sharp price rise while sells dominate flow' });
  }
  if (isNum(token.liquidity_usd) && token.liquidity_usd > 0) {
    const r1 = isNum(token.volume_1h) ? token.volume_1h / token.liquidity_usd : 0;
    const r5 = curVol !== null ? curVol / token.liquidity_usd : 0;
    if (r1 > R.washVol1hToLiq || r5 > R.washVol5mToLiq) {
      riskFlags.push({ code: 'WASH_TRADE_HINT', label: 'Volume far above liquidity', detail: 'Volume is very large relative to liquidity; can indicate wash trading' });
    }
  }

  const out = {
    score: round(score, 1),
    level,
    components,
    riskFlags,
    confidence: round(confidence, 2),
    asOf: now,
    modelVersion: MODEL_VERSION,
    features,
    notes,
  };
  out.featureVectorHash = hashFeatures(features);
  return out;
}

// Deterministic hash of the (already rounded) feature vector.
function hashFeatures(features) {
  const keys = Object.keys(features).sort();
  const s = keys.map((k) => `${k}=${features[k] === null ? '' : features[k]}`).join('|');
  return crypto.createHash('sha256').update(s).digest('hex').slice(0, 32);
}

/** List-data-only scoring (no candles): same function, lower confidence by construction. */
function computeListSignal(token, now) {
  return computeSignal({ token, now });
}

module.exports = { computeSignal, computeListSignal, hashFeatures, CONFIG, MODEL_VERSION };
