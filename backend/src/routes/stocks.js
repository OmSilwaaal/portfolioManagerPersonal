const express = require('express');
const router = express.Router();
const { getStockQuote, getCompanyProfile } = require('../services/finnhub');
const { getNewsByTicker } = require('../services/marketaux');
const { summarizeNewsItem } = require('../services/claude');
const NodeCache = require('node-cache');

const cache = new NodeCache({ stdTTL: 30 }); // 30s cache for stock quotes

router.get('/:ticker', async (req, res, next) => {
  try {
    const { ticker } = req.params;
    const upperTicker = ticker.toUpperCase();

    const cacheKey = `stock_${upperTicker}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    // Fetch in parallel
    const [quote, profile, rawNews] = await Promise.all([
      getStockQuote(upperTicker),
      getCompanyProfile(upperTicker),
      getNewsByTicker(upperTicker, 5).catch(() => []),
    ]);

    // Run AI summaries for each news item
    const newsWithSummaries = await Promise.all(
      rawNews.map(async (item) => {
        const aiResult = await summarizeNewsItem(item.headline, item.description);
        return {
          id: item.id,
          headline: item.headline,
          source: item.source,
          publishedAt: item.publishedAt,
          url: item.url,
          ticker: item.ticker || upperTicker,
          summary: aiResult.summary,
          urgency: aiResult.urgency,
          reasoning: aiResult.reasoning,
          sentiment: item.sentiment,
        };
      })
    );

    const result = {
      ticker: upperTicker,
      name: profile ? profile.name : upperTicker,
      price: quote.price,
      change: quote.change,
      changePercent: quote.changePercent,
      volume: quote.volume,
      marketCap: profile ? profile.marketCapitalization : null,
      high: quote.high,
      low: quote.low,
      open: quote.open,
      previousClose: quote.previousClose,
      news: newsWithSummaries,
    };

    cache.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
