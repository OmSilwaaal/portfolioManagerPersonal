const express = require('express');
const router = express.Router();
const { getGeneralFeed } = require('../services/marketaux');
const { batchSummarizeNews, generateWeeklyBrief } = require('../services/claude');
const NodeCache = require('node-cache');

// 20-min feed cache — news doesn't change meaningfully every 5 min,
// and longer TTL means far fewer expensive AI batch calls per day.
const cache = new NodeCache({ stdTTL: 1200 });
const briefCache = new NodeCache({ stdTTL: 21600 }); // 6 hours — unchanged

// Deduplicate articles: same ticker within a 2-hour window → keep highest sentiment signal
function deduplicateNews(items) {
  const seen = new Map();
  for (const item of items) {
    const hour = item.publishedAt ? Math.floor(new Date(item.publishedAt).getTime() / 7200000) : 0;
    const key = `${item.ticker || item.headline.slice(0, 40)}:${hour}`;
    const existing = seen.get(key);
    if (!existing || Math.abs(item.sentiment || 0) > Math.abs(existing.sentiment || 0)) {
      seen.set(key, item);
    }
  }
  return Array.from(seen.values());
}

router.get('/', async (req, res, next) => {
  try {
    const cacheKey = 'feed_main';
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const rawNews = await getGeneralFeed(30);
    const deduped = deduplicateNews(rawNews).slice(0, 20);

    // ONE batch call instead of 20 individual calls — ~6× fewer input tokens
    const scores = await batchSummarizeNews(deduped);

    const newsWithSummaries = deduped
      .map((item, i) => ({ ...item, ...scores[i] }))
      .filter((item) => item.relevant !== false);

    const urgencyOrder = { 'Act Now': 3, Watch: 2, Low: 1 };
    newsWithSummaries.sort((a, b) => (urgencyOrder[b.urgency] || 0) - (urgencyOrder[a.urgency] || 0));

    const result = { items: newsWithSummaries, cachedAt: new Date().toISOString() };
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

    // Reuse feed cache if available — avoids a second round of AI calls
    let scoredItems = [];
    const feedCached = cache.get('feed_main');
    if (feedCached?.items?.length) {
      scoredItems = feedCached.items;
    } else {
      const rawNews = await getGeneralFeed(20);
      const deduped = deduplicateNews(rawNews).slice(0, 15);
      const scores = await batchSummarizeNews(deduped);
      scoredItems = deduped.map((item, i) => ({ ...item, ...scores[i] })).filter((i) => i.relevant !== false);
    }

    const brief = await generateWeeklyBrief(scoredItems);
    const result = { ...brief, generatedAt: new Date().toISOString() };
    briefCache.set('weekly_brief', result);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
