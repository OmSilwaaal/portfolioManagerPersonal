const express = require('express');
const router = express.Router();
const { getGeneralFeed } = require('../services/marketaux');
const { summarizeNewsItem, generateWeeklyBrief } = require('../services/claude');
const NodeCache = require('node-cache');

const cache = new NodeCache({ stdTTL: 300 }); // 5 min for feed
const briefCache = new NodeCache({ stdTTL: 21600 }); // 6 hours for brief

router.get('/', async (req, res, next) => {
  try {
    const cacheKey = 'feed_main';
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const rawNews = await getGeneralFeed(20);

    const newsWithSummaries = await Promise.all(
      rawNews.map(async (item) => {
        const aiResult = await summarizeNewsItem(item.headline, item.description);
        return {
          id: item.id,
          headline: item.headline,
          source: item.source,
          publishedAt: item.publishedAt,
          url: item.url,
          ticker: item.ticker,
          summary: aiResult.summary,
          urgency: aiResult.urgency,
          reasoning: aiResult.reasoning,
          sentiment: item.sentiment,
        };
      })
    );

    const urgencyOrder = { 'Act Now': 3, Watch: 2, Low: 1 };
    newsWithSummaries.sort((a, b) => (urgencyOrder[b.urgency] || 0) - (urgencyOrder[a.urgency] || 0));

    const result = { items: newsWithSummaries.slice(0, 20), cachedAt: new Date().toISOString() };
    cache.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/brief', async (req, res, next) => {
  try {
    const cached = briefCache.get('weekly_brief');
    if (cached) return res.json(cached);

    // Use feed cache if available, otherwise fetch fresh
    let headlines = [];
    const feedCached = cache.get('feed_main');
    if (feedCached?.items) {
      headlines = feedCached.items.map(i => i.headline).filter(Boolean);
    } else {
      const rawNews = await getGeneralFeed(12);
      headlines = rawNews.map(i => i.headline).filter(Boolean);
    }

    const brief = await generateWeeklyBrief(headlines);
    const result = { ...brief, generatedAt: new Date().toISOString() };
    briefCache.set('weekly_brief', result);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
