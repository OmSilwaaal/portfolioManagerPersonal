// Elo: a competitive rating built from every realized paper trade (wins AND losses).
//   elo = max(0, 500 + 15 per win - 12 per loss + total PnL (USD) x skill)
//   skill rewards consistency: 0.5 + win rate (0.5 to 1.5) on profit; on losses a high win rate softens the damage.
//   Under 5 trades there is not enough signal, so skill is a flat 1.
// Tiers climb by powers of ten after 1,000, so the ladder never runs out.
const { getDb } = require('../db/schema');

const START_ELO = 500;
const WIN_POINTS = 15;
const LOSS_POINTS = 12;
const MIN_TRADES_FOR_SKILL = 5;
const MIN_TRADES_FOR_WINRATE_BOARD = 5;

// `card` is the calling card the tier unlocks (a scene id in web/src/ascii/scenes.js)
const TIERS = [
  { id: 'rekt',    name: 'Rekt',    min: 0,           card: 'rekt',    color: '#f87171', blurb: 'Down bad. Every legend has a rock bottom.' },
  { id: 'rookie',  name: 'Rookie',  min: 500,         card: 'rookie',  color: '#d6a15c', blurb: 'Everyone starts here, with 500 Elo and a dream.' },
  { id: 'trader',  name: 'Trader',  min: 1000,        card: 'trader',  color: '#7dd3fc', blurb: 'Consistent green candles. You know what you are doing.' },
  { id: 'shark',   name: 'Shark',   min: 10000,       card: 'shark',   color: '#38bdf8', blurb: 'You smell blood in the order book.' },
  { id: 'whale',   name: 'Whale',   min: 100000,      card: 'whale',   color: '#818cf8', blurb: 'Your trades move markets.' },
  { id: 'kraken',  name: 'Kraken',  min: 1000000,     card: 'kraken',  color: '#c084fc', blurb: 'Something enormous stirs below the chart.' },
  { id: 'titan',   name: 'Titan',   min: 10000000,    card: 'titan',   color: '#fb923c', blurb: 'Gravity applies to everyone but you.' },
  { id: 'legend',  name: 'Legend',  min: 100000000,   card: 'legend',  color: '#fde047', blurb: 'The ladder has no ceiling. You found it anyway.' },
];

function tierFor(elo) {
  let t = TIERS[0];
  for (const x of TIERS) if (elo >= x.min) t = x;
  return t;
}

/** Elo from raw counts. `totalPnl` is realized USD profit minus losses. */
function computeElo({ wins = 0, losses = 0, totalPnl = 0 } = {}) {
  const trades = wins + losses;
  const winRate = trades ? wins / trades : 0;
  let mult = 1;
  if (trades >= MIN_TRADES_FOR_SKILL) mult = totalPnl >= 0 ? 0.5 + winRate : 1.5 - winRate;
  const raw = START_ELO + WIN_POINTS * wins - LOSS_POINTS * losses + totalPnl * mult;
  return Math.max(0, Math.round(raw));
}

/** Where a rating sits on the ladder: current tier, next tier and how far through the climb it is. */
function progress(elo) {
  const tier = tierFor(elo);
  const i = TIERS.indexOf(tier);
  const next = TIERS[i + 1] ?? null;
  const floor = i === 0 ? 0 : tier.min;
  const pct = next ? Math.min(100, Math.max(0, Math.round(((elo - floor) / (next.min - floor)) * 100))) : 100;
  return { tier: tier.id, tierName: tier.name, color: tier.color, next: next ? { id: next.id, name: next.name, at: next.min, needed: Math.max(0, next.min - elo) } : null, pct };
}

const SQL_STATS = `
  SELECT COUNT(*) AS trades,
         COALESCE(SUM(pnl_usd > 0), 0) AS wins,
         COALESCE(SUM(pnl_usd < 0), 0) AS losses,
         COALESCE(SUM(pnl_usd), 0) AS totalPnl,
         COALESCE(MAX(pnl_usd), 0) AS bestWin,
         COALESCE(MIN(pnl_usd), 0) AS worstLoss
    FROM trade_results`;

function shapeStats(r, extra = {}) {
  const trades = Number(r.trades) || 0;
  const wins = Number(r.wins) || 0;
  const losses = Number(r.losses) || 0;
  const totalPnl = Number(r.totalPnl) || 0;
  const elo = computeElo({ wins, losses, totalPnl });
  return {
    trades, wins, losses, totalPnl,
    bestWin: Number(r.bestWin) || 0, worstLoss: Number(r.worstLoss) || 0,
    winRate: trades ? wins / trades : 0,
    elo, ...progress(elo), ...extra,
  };
}

function peakFor(userId, db = getDb()) {
  return db.prepare('SELECT peak FROM elo_peaks WHERE user_id = ?').get(userId)?.peak ?? null;
}

/** Full rating card for one user. `peak` never drops, so earned calling cards stay earned after a rank down. */
function statsFor(userId, db = getDb()) {
  const s = shapeStats(db.prepare(`${SQL_STATS} WHERE user_id = ?`).get(userId));
  const peak = Math.max(peakFor(userId, db) ?? 0, s.elo, START_ELO);
  return { ...s, peak, peakTier: tierFor(peak).id };
}

/**
 * Log a realized sell, win or loss. Never throws: a failed log must not fail the trade it describes.
 * Returns { before, after } ratings so callers can show a rank up / rank down.
 */
function recordTrade(t, dbArg) {
  try {
    const db = dbArg || getDb();
    const pnl = Number(t.pnlUsd);
    if (!t.userId || !Number.isFinite(pnl) || Math.abs(pnl) < 0.005) return null;
    const before = statsFor(String(t.userId), db);
    db.prepare('INSERT INTO trade_results (user_id, kind, symbol, pnl_usd, pnl_pct) VALUES (?, ?, ?, ?, ?)')
      .run(String(t.userId), t.kind === 'meme' ? 'meme' : 'stock', t.symbol ? String(t.symbol).slice(0, 24).toUpperCase() : null, pnl, Number.isFinite(Number(t.pnlPct)) ? Number(t.pnlPct) : null);
    const after = statsFor(String(t.userId), db);
    if (after.elo > (peakFor(String(t.userId), db) ?? 0)) {
      db.prepare(`INSERT INTO elo_peaks (user_id, peak, updated_at) VALUES (?, ?, datetime('now'))
                  ON CONFLICT(user_id) DO UPDATE SET peak = excluded.peak, updated_at = excluded.updated_at`).run(String(t.userId), after.elo);
    }
    return { before: before.elo, after: after.elo, tier: after.tier, rankedUp: after.elo > before.elo && after.tier !== before.tier && TIERS.findIndex((x) => x.id === after.tier) > TIERS.findIndex((x) => x.id === before.tier), rankedDown: TIERS.findIndex((x) => x.id === after.tier) < TIERS.findIndex((x) => x.id === before.tier) };
  } catch (err) {
    console.error('[elo] record failed', err.message);
    return null;
  }
}

const RANGE_SECONDS = { day: 86400, week: 7 * 86400, month: 30 * 86400 };
const SORTS = ['elo', 'pnl', 'winrate', 'trades', 'best', 'streak'];

/** Win streak right now (consecutive wins, newest first). */
function streakOf(userId, db = getDb()) {
  let n = 0;
  for (const r of db.prepare('SELECT pnl_usd FROM trade_results WHERE user_id = ? ORDER BY id DESC LIMIT 200').all(userId)) {
    if (r.pnl_usd > 0) n++; else break;
  }
  return n;
}

// Demo traders so the board has depth before real volume arrives (WINNERS_DEMO=off removes them). Elo is computed from these counts like anyone else's.
const SEED_TRADERS = [
  { username: 'larp',             trades: [540, 190, 2150000], best: 482000, streak: 11, clan: 'KRKN' },
  { username: 'ada_whale',        trades: [380, 150, 340000],  best: 91000,  streak: 6,  clan: 'WHLE' },
  { username: 'degen_dan',        trades: [610, 330, 88000],   best: 51000,  streak: 4,  clan: 'DGEN' },
  { username: 'dogwifdave',       trades: [260, 120, 41000],   best: 14800,  streak: 9,  clan: 'DGEN' },
  { username: 'wallstreet_wanda', trades: [190, 70, 22500],    best: 6400,   streak: 7,  clan: 'WHLE' },
  { username: 'jupiter_jess',     trades: [160, 95, 12400],    best: 3900,   streak: 3,  clan: 'KRKN' },
  { username: 'forest_fiona',     trades: [88, 41, 5200],      best: 1650,   streak: 5,  clan: null },
  { username: 'dune_dealer',      trades: [70, 62, 1900],      best: 2100,   streak: 2,  clan: 'DGEN' },
  { username: 'storm_chaser',     trades: [44, 40, 380],       best: 1480,   streak: 1,  clan: null },
  { username: 'aurora_ace',       trades: [31, 38, -420],      best: 2750,   streak: 0,  clan: null },
  { username: 'paper_hands_pete', trades: [12, 29, -610],      best: 140,    streak: 0,  clan: null },
].map(({ username, trades: [wins, losses, totalPnl], best, streak, clan }) => {
  const trades = wins + losses;
  return { username, trades, wins, losses, totalPnl, bestWin: best, worstLoss: -Math.round(Math.abs(totalPnl) / 40 + 40), winRate: wins / trades, streak, clan, elo: computeElo({ wins, losses, totalPnl }) };
});

/**
 * Rank everyone who has traded. Returns rows sorted by `sort`, each with the raw stats; identity (names, clan,
 * cosmetics) is attached by the route.
 */
function leaderboard({ sort = 'elo', range = 'all', limit = 50, db = getDb() } = {}) {
  const secs = RANGE_SECONDS[range];
  const since = secs ? new Date(Date.now() - secs * 1000).toISOString().replace('T', ' ').slice(0, 19) : null;
  const rows = db.prepare(
    `SELECT user_id, COUNT(*) AS trades, SUM(pnl_usd > 0) AS wins, SUM(pnl_usd < 0) AS losses,
            SUM(pnl_usd) AS totalPnl, MAX(pnl_usd) AS bestWin, MIN(pnl_usd) AS worstLoss
       FROM trade_results ${since ? 'WHERE created_at >= ?' : ''} GROUP BY user_id`
  ).all(...(since ? [since] : []));

  const out = rows.map((r) => {
    // the rating is always all-time; the other boards are scoped to the window
    const all = since ? statsFor(r.user_id, db) : null;
    const s = shapeStats(r);
    return { userId: r.user_id, ...s, elo: all ? all.elo : s.elo, ...(all ? progress(all.elo) : {}), streak: sort === 'streak' ? streakOf(r.user_id, db) : undefined };
  });
  return out;
}

function sortRows(rows, sort) {
  const by = {
    elo: (a, b) => b.elo - a.elo,
    pnl: (a, b) => b.totalPnl - a.totalPnl,
    winrate: (a, b) => b.winRate - a.winRate || b.trades - a.trades,
    trades: (a, b) => b.trades - a.trades,
    best: (a, b) => b.bestWin - a.bestWin,
    streak: (a, b) => (b.streak ?? 0) - (a.streak ?? 0),
  }[SORTS.includes(sort) ? sort : 'elo'];
  const pool = sort === 'winrate' ? rows.filter((r) => r.trades >= MIN_TRADES_FOR_WINRATE_BOARD) : rows;
  return [...pool].sort(by);
}

// Calling cards that are earned through trading rather than social stats. `test` gets statsFor().
const TRADING_CARDS = {
  rekt:     (s) => s.losses >= 1,
  rookie:   (s) => s.peak >= 500,
  trader:   (s) => s.peak >= 1000,
  shark:    (s) => s.peak >= 10000,
  whale:    (s) => s.peak >= 100000,
  kraken:   (s) => s.peak >= 1000000,
  titan:    (s) => s.peak >= 10000000,
  legend:   (s) => s.peak >= 100000000,
  summit:   (s) => s.peak >= 500,
  rugpull:  (s) => s.losses >= 3,
  volcano:  (s) => s.bestWin >= 1000,
  lion:     (s) => s.wins >= 10,
  tiger:    (s) => s.trades >= 20 && s.winRate >= 0.6,
};

module.exports = {
  START_ELO, TIERS, SORTS, SEED_TRADERS, TRADING_CARDS, MIN_TRADES_FOR_WINRATE_BOARD,
  tierFor, computeElo, progress, statsFor, recordTrade, leaderboard, sortRows, streakOf, peakFor,
};
