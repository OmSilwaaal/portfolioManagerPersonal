const express = require('express');
const router = express.Router();
const { getCryptoCandles } = require('../services/finnhub');
const { getNewsByTicker } = require('../services/marketaux');
const { summarizeNewsItem } = require('../services/claude');
const { validateTicker } = require('../middleware/auth');
const NodeCache = require('node-cache');

const cache = new NodeCache({ stdTTL: 30 });

const CRYPTO_NAMES = {
  BTC: 'Bitcoin',
  ETH: 'Ethereum',
  SOL: 'Solana',
  DOGE: 'Dogecoin',
  ADA: 'Cardano',
  XRP: 'XRP',
  AVAX: 'Avalanche',
  MATIC: 'Polygon',
};

router.get('/:symbol', validateTicker('symbol'), async (req, res, next) => {
  try {
    const { symbol } = req.params;
    const upperSymbol = symbol.toUpperCase();

    const cacheKey = `crypto_${upperSymbol}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const [cryptoData, rawNews] = await Promise.all([
      getCryptoCandles(upperSymbol),
      getNewsByTicker(upperSymbol, 5).catch(() => []),
    ]);

    const newsWithSummaries = await Promise.all(
      rawNews.map(async (item) => {
        const aiResult = await summarizeNewsItem(item.headline, item.description);
        return {
          id: item.id,
          headline: item.headline,
          source: item.source,
          publishedAt: item.publishedAt,
          url: item.url,
          ticker: item.ticker || upperSymbol,
          summary: aiResult.summary,
          urgency: aiResult.urgency,
          reasoning: aiResult.reasoning,
          sentiment: item.sentiment,
        };
      })
    );

    const result = {
      symbol: upperSymbol,
      name: CRYPTO_NAMES[upperSymbol] || upperSymbol,
      price: cryptoData.price,
      change24h: cryptoData.change24h,
      changePercent24h: cryptoData.changePercent24h,
      volume24h: cryptoData.volume24h,
      candles: cryptoData.candles,
      news: newsWithSummaries,
    };

    cache.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
