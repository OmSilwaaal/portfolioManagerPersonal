const express = require('express');
const { supabase } = require('../services/supabaseAdmin');
const { getDb } = require('../db/schema');
const elo = require('../services/elo');
const { publicCards } = require('../services/identity');

const router = express.Router();
const RANGES = new Set(['day', 'week', 'month', 'all']);
// Demo traders carry all-time stats; scale them so the 24h / 7d / 30d boards are not empty either
const SEED_SCALE = { day: 0.02, week: 0.1, month: 0.35, all: 1 };
const SEED_CARD = { rekt: 'rekt', rookie: 'rookie', trader: 'trader', shark: 'shark', whale: 'whale', kraken: 'kraken', titan: 'titan', legend: 'legend' };
const SEED_FX = { rekt: 'none', rookie: 'none', trader: 'glow', shark: 'waves', whale: 'aurora', kraken: 'sparkle', titan: 'fire', legend: 'fire' };

const rowOf = (r, c) => ({
  userId: r.userId ?? null,
  username: c?.username ?? r.username ?? null,
  displayName: c?.displayName ?? (r.username ? r.username.replace(/_/g, ' ') : null),
  avatarUrl: c?.avatarUrl ?? null,
  isPro: c?.isPro ?? false,
  elo: r.elo, tier: r.tier, tierName: r.tierName, tierColor: r.color,
  clanTag: c?.clanTag ?? r.clan ?? null, clanColor: c?.clanColor ?? null,
  nameColor: c?.nameColor ?? null,
  banner: c?.banner ?? null, effect: c?.effect ?? 'none',
  trades: r.trades, wins: r.wins, losses: r.losses, winRate: r.winRate,
  totalPnl: r.totalPnl, bestWin: r.bestWin, streak: r.streak ?? 0,
});

// GET /api/elo/tiers
router.get('/tiers', (_req, res) => {
  res.json({
    start: elo.START_ELO,
    tiers: elo.TIERS,
    formula: { winPoints: 15, lossPoints: 12, minTradesForSkill: 5, minTradesForWinRateBoard: elo.MIN_TRADES_FOR_WINRATE_BOARD },
  });
});

// GET /api/elo/me — my rating, ladder progress and which trading calling cards I have earned
router.get('/me', (req, res) => {
  const db = getDb();
  const s = elo.statsFor(req.user.id, db);
  const everyone = elo.leaderboard({ db }).sort((a, b) => b.elo - a.elo);
  const pos = everyone.findIndex((r) => r.userId === req.user.id);
  res.json({
    ...s,
    streak: elo.streakOf(req.user.id, db),
    position: pos >= 0 ? pos + 1 : null,
    ranked: everyone.length,
    cards: Object.fromEntries(Object.entries(elo.TRADING_CARDS).map(([id, test]) => [id, !!test(s)])),
  });
});

// GET /api/elo/leaderboard?sort=elo|pnl|winrate|trades|best|streak&range=day|week|month|all&limit=50
router.get('/leaderboard', async (req, res, next) => {
  try {
    const sort = elo.SORTS.includes(req.query.sort) ? req.query.sort : 'elo';
    const range = RANGES.has(req.query.range) ? req.query.range : 'all';
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
    const db = getDb();

    const real = elo.leaderboard({ sort, range, db }).map((r) => ({ ...r, streak: elo.streakOf(r.userId, db) }));
    const cards = await publicCards(real.map((r) => r.userId), { supabase, db });
    let rows = real.map((r) => rowOf(r, cards.get(r.userId)));

    if (process.env.WINNERS_DEMO !== 'off') {
      const names = elo.SEED_TRADERS.map((t) => t.username);
      const { data } = await supabase.from('profiles').select('user_id, username').in('username', names);
      const taken = new Set((data ?? []).map((p) => p.username));
      const k = SEED_SCALE[range];
      rows = rows.concat(elo.SEED_TRADERS.filter((t) => !taken.has(t.username)).map((t) => {
        const tier = elo.tierFor(t.elo);
        const s = {
          ...t, userId: null, color: tier.color, tier: tier.id, tierName: tier.name,
          trades: Math.max(1, Math.round(t.trades * k)), wins: Math.max(0, Math.round(t.wins * k)), losses: Math.max(0, Math.round(t.losses * k)),
          totalPnl: t.totalPnl * k, bestWin: t.bestWin * Math.min(1, k * 2.2),
        };
        return { ...rowOf(s, null), isPro: true, banner: SEED_CARD[tier.id], effect: SEED_FX[tier.id] };
      }));
    }

    const mine = req.user.id;
    const sorted = elo.sortRows(rows, sort).slice(0, limit);
    res.json({
      sort, range,
      rows: sorted.map((r, i) => ({ ...r, rank: i + 1, mine: r.userId === mine })),
    });
  } catch (err) { next(err); }
});

module.exports = router;
