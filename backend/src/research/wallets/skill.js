'use strict';
// Pure skill computation. Timestamps are unix seconds. Only trades with ts < asOfTs are used.

const DEFAULTS = {
  minTrades: 8,            // min closed round trips overall
  minBuckets: 3,           // time buckets needed for consistency
  minHoldoutTrades: 3,     // min round trips in each holdout window
  minWinRate: 0.45,
  minSortino: 0.3,
  maxTopTradeShare: 0.5,
  minConsistency: 0.6,     // share of buckets with positive pnl
  sortinoCap: 10,
};

// FIFO pairing per token. Returns closed round trips (one per sell fill matched against buys).
function pairTrades(trades, asOfTs) {
  const rows = trades
    .filter((t) => t && t.ts < asOfTs && t.amount_token > 0 && t.price_usd > 0)
    .sort((a, b) => a.ts - b.ts);
  const lots = new Map(); // token -> [{qty, price}]
  const trips = [];
  for (const t of rows) {
    if (!lots.has(t.token_id)) lots.set(t.token_id, []);
    const q = lots.get(t.token_id);
    if (t.side === 'buy') {
      q.push({ qty: t.amount_token, price: t.price_usd });
    } else if (t.side === 'sell') {
      let rem = t.amount_token;
      let cost = 0, matched = 0;
      while (rem > 1e-12 && q.length) {
        const lot = q[0];
        const take = Math.min(lot.qty, rem);
        cost += take * lot.price; matched += take;
        lot.qty -= take; rem -= take;
        if (lot.qty <= 1e-12) q.shift();
      }
      if (matched > 0 && cost > 0) {
        const proceeds = matched * t.price_usd;
        trips.push({ token_id: t.token_id, close_ts: t.ts, cost, pnl: proceeds - cost, ret: (proceeds - cost) / cost });
      }
    }
  }
  return trips;
}

function sortinoLike(trips, cap) {
  if (!trips.length) return 0;
  const mean = trips.reduce((s, r) => s + r.ret, 0) / trips.length;
  const dd = Math.sqrt(trips.reduce((s, r) => s + (r.ret < 0 ? r.ret * r.ret : 0), 0) / trips.length);
  if (dd === 0) return mean > 0 ? cap : 0;
  return Math.max(-cap, Math.min(cap, mean / dd));
}

// Fraction of equal-width time buckets (over the trips' close-time span) with positive pnl.
// score is 0 if fewer than minBuckets non-empty buckets.
function consistency(trips, k, minBuckets) {
  if (trips.length < minBuckets) return { score: 0, buckets: 0 };
  const lo = Math.min(...trips.map((t) => t.close_ts));
  const hi = Math.max(...trips.map((t) => t.close_ts));
  if (hi === lo) return { score: 0, buckets: 0 };
  const sums = new Array(k).fill(null);
  for (const t of trips) {
    const i = Math.min(k - 1, Math.floor(((t.close_ts - lo) / (hi - lo)) * k));
    sums[i] = (sums[i] || 0) + t.pnl;
  }
  const filled = sums.filter((s) => s !== null);
  if (filled.length < minBuckets) return { score: 0, buckets: filled.length };
  return { score: filled.filter((s) => s > 0).length / filled.length, buckets: filled.length };
}

function basicStats(trips, cfg) {
  const n = trips.length;
  const pnl = trips.reduce((s, r) => s + r.pnl, 0);
  const wins = trips.filter((r) => r.pnl > 0).length;
  const maxWin = trips.reduce((m, r) => Math.max(m, r.pnl), 0);
  const topShare = pnl > 0 ? Math.min(1, maxWin / pnl) : (maxWin > 0 ? 1 : 0);
  return {
    n, pnl,
    win_rate: n ? wins / n : 0,
    sortino: sortinoLike(trips, cfg.sortinoCap),
    top_trade_share: topShare,
  };
}

function passesBase(s, cons, cfg) {
  return s.n >= cfg.minTrades && s.pnl > 0 && s.win_rate >= cfg.minWinRate && s.sortino >= cfg.minSortino &&
    s.top_trade_share <= cfg.maxTopTradeShare && cons.score >= cfg.minConsistency;
}

// Holdout: split round trips by close order at the median; the earlier window must qualify
// on its own and the later window must also be profitable with acceptable win rate/sortino.
function holdout(trips, cfg) {
  if (trips.length < cfg.minTrades) return false;
  const sorted = [...trips].sort((a, b) => a.close_ts - b.close_ts);
  const mid = Math.floor(sorted.length / 2);
  const early = sorted.slice(0, mid), late = sorted.slice(mid);
  if (late.length < cfg.minHoldoutTrades || early.length < cfg.minHoldoutTrades) return false;
  const e = basicStats(early, cfg), l = basicStats(late, cfg);
  const earlyOk = e.pnl > 0 && e.win_rate >= cfg.minWinRate && e.sortino >= cfg.minSortino;
  const lateOk = l.pnl > 0 && l.win_rate >= cfg.minWinRate && l.sortino > 0 && l.top_trade_share <= 0.8;
  return earlyOk && lateOk;
}

function computeSkill(trades, asOfTs, options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const trips = pairTrades(trades, asOfTs);
  const s = basicStats(trips, cfg);
  const cons = consistency(trips, 3, cfg.minBuckets);
  const passed_holdout = holdout(trips, cfg);
  const base = passesBase(s, cons, cfg);
  // score in [0,1]; zero unless holdout and base thresholds pass (never smart otherwise)
  let skill_score = 0;
  if (passed_holdout && base) {
    const sortinoN = Math.min(1, s.sortino / 3);
    skill_score = 0.35 * sortinoN + 0.25 * s.win_rate + 0.25 * cons.score + 0.15 * (1 - s.top_trade_share);
    skill_score = Math.max(0, Math.min(1, skill_score));
  }
  return {
    as_of_ts: asOfTs,
    n_trades: s.n,
    win_rate: s.win_rate,
    sortino_like: s.sortino,
    consistency_score: cons.score,
    realized_pnl_usd: s.pnl,
    top_trade_share: s.top_trade_share,
    passed_holdout: passed_holdout ? 1 : 0,
    skill_score,
    is_smart: passed_holdout && base,
  };
}

const isSmart = (snap, minScore = 0.5) => !!snap && snap.passed_holdout === 1 && snap.skill_score >= minScore;

module.exports = { computeSkill, pairTrades, holdout, consistency, isSmart, DEFAULTS };
