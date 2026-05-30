const express = require('express');
const router = express.Router();
const { getGeneralFeed } = require('../services/marketaux');
const { summarizeNewsItem, generateWeeklyBrief } = require('../services/claude');
const NodeCache = require('node-cache');

const cache = new NodeCache({ stdTTL: 300 });      // 5 min for feed
const briefCache = new NodeCache({ stdTTL: 21600 }); // 6 hours for brief

// Deduplicate articles: if two items share the same ticker and were published
// within 2 hours of each other, keep only the one with higher sentiment signal.
function deduplicateNews(items) {
  const seen = new Map(); // key: ticker+hourBucket → best item so far
  for (const item of items) {
    const hour = item.publishedAt ? Math.floor(new Date(item.publishedAt).getTime() / 7200000) : 0;
    const key = `${item.ticker || item.headline.slice(0, 40)}:${hour}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, item);
    } else {
      // Prefer the item with a stronger sentiment signal (abs value)
      const existingStrength = Math.abs(existing.sentiment || 0);
      const newStrength = Math.abs(item.sentiment || 0);
      if (newStrength > existingStrength) seen.set(key, item);
    }
  }
  return Array.from(seen.values());
}

router.get('/', async (req, res, next) => {
  try {
    const cacheKey = 'feed_main';
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const rawNews = await getGeneralFeed(30); // fetch more so dedup leaves enough

    // Deduplicate before scoring to avoid wasting AI calls on near-identical stories
    const deduped = deduplicateNews(rawNews);

    const newsWithSummaries = await Promise.all(
      deduped.slice(0, 20).map(async (item) => {
        const aiResult = await summarizeNewsItem(item.headline, item.description, item.sentiment);
        return {
          id: item.id,
          headline: item.headline,
          source: item.source,
          publishedAt: item.publishedAt,
          url: item.url,
          image_url: item.image_url || null,
          ticker: item.ticker,
          summary: aiResult.summary,
          urgency: aiResult.urgency,
          reasoning: aiResult.reasoning,
          upside: aiResult.upside || null,
          sentiment: item.sentiment,
        };
      })
    );

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

    // Use already-scored feed items if available — richer signal than raw headlines
    let scoredItems = [];
    const feedCached = cache.get('feed_main');
    if (feedCached?.items?.length) {
      scoredItems = feedCached.items;
    } else {
      const rawNews = await getGeneralFeed(20);
      const deduped = deduplicateNews(rawNews);
      scoredItems = await Promise.all(
        deduped.slice(0, 15).map(async (item) => {
          const ai = await summarizeNewsItem(item.headline, item.description, item.sentiment);
          return { ...item, ...ai };
        })
      );
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
