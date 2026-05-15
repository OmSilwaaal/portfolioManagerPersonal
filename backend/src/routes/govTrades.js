const express = require('express');
const router = express.Router();
const { getRecentGovTrades, getTradesByOfficial, refreshGovTradesCache } = require('../services/govTrades');

const DISCLAIMER =
  'This data is sourced from public STOCK Act disclosures. This is not evidence of illegal activity or investment advice.';

// GET /api/gov-trades
router.get('/', async (req, res, next) => {
  try {
    const { chamber, party, ticker, days, limit = '50', page = '1' } = req.query;
    const parsedLimit = Math.min(parseInt(limit, 10) || 50, 200);
    const parsedPage = Math.max(parseInt(page, 10) || 1, 1);

    const filters = {};
    if (chamber) filters.chamber = chamber;
    if (party) filters.party = party;
    if (ticker) filters.ticker = ticker;
    if (days) filters.days = days;

    // Fetch with higher limit for server-side pagination
    const all = await getRecentGovTrades(parsedLimit * parsedPage, filters);
    const start = (parsedPage - 1) * parsedLimit;
    const trades = all.slice(start, start + parsedLimit);

    res.json({
      disclaimer: DISCLAIMER,
      total: all.length,
      page: parsedPage,
      limit: parsedLimit,
      trades,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/gov-trades/summary
router.get('/summary', async (req, res, next) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const allTrades = await getRecentGovTrades(1000);
    const recent = allTrades.filter((t) => {
      const d = new Date(t.disclosureDate || t.tradeDate);
      return !isNaN(d.getTime()) && d >= thirtyDaysAgo;
    });

    // Top traders by trade count
    const traderCounts = {};
    recent.forEach((t) => {
      traderCounts[t.officialName] = (traderCounts[t.officialName] || 0) + 1;
    });
    const topTraders = Object.entries(traderCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([name, count]) => ({ name, tradeCount: count }));

    // Most traded tickers
    const tickerCounts = {};
    recent.forEach((t) => {
      if (t.ticker) tickerCounts[t.ticker] = (tickerCounts[t.ticker] || 0) + 1;
    });
    const topTickers = Object.entries(tickerCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([ticker, count]) => ({ ticker, tradeCount: count }));

    // Breakdown by party
    const partyBreakdown = {};
    recent.forEach((t) => {
      partyBreakdown[t.party] = (partyBreakdown[t.party] || 0) + 1;
    });

    // Urgency breakdown
    const urgencyBreakdown = { 'Act Now': 0, Watch: 0, Low: 0 };
    recent.forEach((t) => {
      urgencyBreakdown[t.urgency] = (urgencyBreakdown[t.urgency] || 0) + 1;
    });

    res.json({
      disclaimer: DISCLAIMER,
      period: 'Last 30 days',
      totalTrades: recent.length,
      topTraders,
      topTickers,
      partyBreakdown,
      urgencyBreakdown,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/gov-trades/official/:name
router.get('/official/:name', async (req, res, next) => {
  try {
    const { name } = req.params;
    const trades = await getTradesByOfficial(decodeURIComponent(name));

    res.json({
      disclaimer: DISCLAIMER,
      officialName: name,
      total: trades.length,
      trades,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/gov-trades/refresh (internal / admin use)
router.post('/refresh', async (req, res, next) => {
  try {
    const trades = await refreshGovTradesCache();
    res.json({ message: 'Cache refreshed', count: trades.length });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
