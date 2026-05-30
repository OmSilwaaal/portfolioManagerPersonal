const express = require('express');
const router = express.Router();
const { getStockQuote } = require('../services/finnhub');
const { getGeneralFeed } = require('../services/marketaux');
const { summarizeNewsItem, analyzePortfolioImpact } = require('../services/claude');
const NodeCache = require('node-cache');

const impactCache = new NodeCache({ stdTTL: 180 }); // 3-min cache per holdings set

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

    const holdingsList = holdingsParam
      .split(',')
      .map((h) => {
        const [ticker, qty] = h.trim().split(':');
        return { ticker: ticker.toUpperCase(), quantity: parseFloat(qty) || 0 };
      })
      .filter((h) => h.ticker && h.quantity > 0);

    if (holdingsList.length === 0) {
      return res.status(400).json({ error: true, message: 'No valid holdings found. Format: AAPL:10,BTC:0.5' });
    }

    const cacheKey = `impact:${holdingsParam}`;
    const cached = impactCache.get(cacheKey);
    if (cached) return res.json(cached);

    // Fetch quotes and recent news in parallel
    const [rawNews, ...quotes] = await Promise.all([
      getGeneralFeed(20).catch(() => []),
      ...holdingsList.map((h) =>
        getStockQuote(h.ticker).catch(() => ({ ticker: h.ticker, price: null, changePercent: null }))
      ),
    ]);

    // Build holdings with real prices and dollar values
    const holdingsWithPrices = holdingsList.map((h, i) => ({
      ...h,
      price: quotes[i].price,
      changePercent: quotes[i].changePercent,
      value: quotes[i].price ? quotes[i].price * h.quantity : null,
    }));

    const totalValue = holdingsWithPrices.reduce((sum, h) => sum + (h.value || 0), 0);

    // Score the news with AI so portfolio analysis gets pre-computed summaries + urgency
    const tickers = new Set(holdingsList.map((h) => h.ticker));
    const scoredNews = await Promise.all(
      rawNews.slice(0, 15).map(async (item) => {
        const ai = await summarizeNewsItem(item.headline, item.description, item.sentiment);
        return { ...item, ...ai };
      })
    );

    // Prioritise news that explicitly mentions held tickers
    scoredNews.sort((a, b) => {
      const aRelevant = tickers.has(a.ticker) ? 1 : 0;
      const bRelevant = tickers.has(b.ticker) ? 1 : 0;
      const urgencyOrder = { 'Act Now': 3, Watch: 2, Low: 1 };
      return (bRelevant * 10 + (urgencyOrder[b.urgency] || 0)) - (aRelevant * 10 + (urgencyOrder[a.urgency] || 0));
    });

    // Pass holdings WITH prices to the AI
    const aiAnalysis = await analyzePortfolioImpact(holdingsWithPrices, scoredNews);

    const result = { holdings: holdingsWithPrices, totalValue, analysis: aiAnalysis };
    impactCache.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
