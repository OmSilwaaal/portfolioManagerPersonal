const express = require('express');
const router = express.Router();
const { getStockQuote } = require('../services/finnhub');
const { getGeneralFeed } = require('../services/marketaux');
const { analyzePortfolioImpact } = require('../services/claude');

// GET /api/portfolio/impact?holdings=AAPL:10,BTC:0.5
router.get('/impact', async (req, res, next) => {
  try {
    const { holdings: holdingsParam } = req.query;

    if (!holdingsParam) {
      return res.status(400).json({
        error: true,
        message: 'Missing required query param: holdings (e.g. ?holdings=AAPL:10,BTC:0.5)',
      });
    }

    // Parse holdings
    const holdingsList = holdingsParam
      .split(',')
      .map((h) => {
        const [ticker, qty] = h.trim().split(':');
        return { ticker: ticker.toUpperCase(), quantity: parseFloat(qty) || 0 };
      })
      .filter((h) => h.ticker && h.quantity > 0);

    if (holdingsList.length === 0) {
      return res.status(400).json({
        error: true,
        message: 'No valid holdings found. Format: AAPL:10,BTC:0.5',
      });
    }

    // Fetch quotes and news in parallel
    const [recentNews, ...quotes] = await Promise.all([
      getGeneralFeed(10).catch(() => []),
      ...holdingsList.map((h) =>
        getStockQuote(h.ticker).catch(() => ({
          ticker: h.ticker,
          price: null,
          changePercent: null,
        }))
      ),
    ]);

    const holdingsWithPrices = holdingsList.map((h, i) => ({
      ...h,
      price: quotes[i].price,
      changePercent: quotes[i].changePercent,
      value: quotes[i].price ? quotes[i].price * h.quantity : null,
    }));

    const totalValue = holdingsWithPrices.reduce((sum, h) => sum + (h.value || 0), 0);

    const aiAnalysis = await analyzePortfolioImpact(holdingsList, recentNews);

    res.json({
      holdings: holdingsWithPrices,
      totalValue,
      analysis: aiAnalysis,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
