/**
 * News aggregator — replaces the paid MarketAux API with two free sources:
 *
 *  1. Finnhub  /news  (already integrated, free tier, has ticker symbols)
 *  2. RSS feeds from Reuters Business + CNBC Markets + Yahoo Finance (no key needed)
 *
 * Exports the same getGeneralFeed / getNewsByTicker interface as before
 * so no other files need changing.
 */

const axios = require('axios');
const Parser = require('rss-parser');

const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const rssParser = new Parser({ timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } });

// Free RSS feeds — no API key required
const RSS_FEEDS = [
  { url: 'https://feeds.reuters.com/reuters/businessNews',   source: 'Reuters' },
  { url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', source: 'CNBC' },
  { url: 'https://finance.yahoo.com/news/rssindex',          source: 'Yahoo Finance' },
];

// Known ticker symbols found in headlines/descriptions — used to tag RSS articles
// Simple word-boundary match: looks for $AAPL or "AAPL" in ALL-CAPS (2-5 chars) near known terms
const TICKER_RE = /\$([A-Z]{1,5})\b|\b([A-Z]{2,5})\s+(?:stock|shares|Corp|Inc|Ltd|ETF|NYSE|NASDAQ)/g;

function extractTicker(text) {
  if (!text) return null;
  const matches = [...text.matchAll(TICKER_RE)];
  if (!matches.length) return null;
  const symbol = matches[0][1] || matches[0][2];
  // Filter out common false positives (English words, country codes, etc.)
  const FALSE_POSITIVES = new Set(['THE','AND','FOR','ARE','BUT','NOT','YOU','ALL','CAN','HER','WAS','ONE','OUR','OUT','DAY','GET','HAS','HIM','HIS','HOW','ITS','LET','MAY','NEW','NOW','OLD','SEE','SET','TWO','USE','WAY','WHO','WHO','WHY','WILL','WITH','CEO','CFO','IPO','GDP','CPI','IMF','WHO','FED','SEC','IRS','FDA']);
  return FALSE_POSITIVES.has(symbol) ? null : symbol;
}

function getApiKey() {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) throw new Error('FINNHUB_API_KEY is not set');
  return key;
}

// Entity / noise filters (same as before)
const NOISE_PATTERNS = [
  /recipe/i, /how to (make|cook|bake|prepare)/i, /restaurant/i,
  /travel guide/i, /celebrity/i, /sports score/i, /movie review/i,
];

function isRelevant(headline) {
  return !NOISE_PATTERNS.some((re) => re.test(headline));
}

// ── Finnhub news ──────────────────────────────────────────────────────────────

async function fetchFinnhubCategory(category, token) {
  try {
    const res = await axios.get(`${FINNHUB_BASE}/news`, {
      params: { category, token },
      timeout: 10000,
    });
    return res.data || [];
  } catch (err) {
    console.warn(`[news] Finnhub ${category} failed:`, err.message);
    return [];
  }
}

function normalizeFinnhub(articles) {
  return articles
    .filter((a) => a.headline && isRelevant(a.headline))
    .map((a) => ({
      id: String(a.id || Date.now() + Math.random()),
      headline: a.headline,
      source: a.source || 'Finnhub',
      publishedAt: a.datetime ? new Date(a.datetime * 1000).toISOString() : new Date().toISOString(),
      url: a.url || '',
      image_url: a.image || null,
      ticker: a.related || extractTicker(a.headline) || null,
      description: a.summary || '',
      sentiment: 0, // Finnhub news doesn't include sentiment scores
    }));
}

// ── RSS feeds ─────────────────────────────────────────────────────────────────

async function fetchRssFeed({ url, source }) {
  try {
    const feed = await rssParser.parseURL(url);
    return (feed.items || [])
      .filter((item) => item.title && isRelevant(item.title))
      .map((item) => ({
        id: item.guid || item.link || String(Date.now() + Math.random()),
        headline: item.title,
        source,
        publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
        url: item.link || '',
        image_url: null,
        ticker: extractTicker(item.title) || extractTicker(item.contentSnippet) || null,
        description: item.contentSnippet || item.summary || '',
        sentiment: 0,
      }));
  } catch (err) {
    console.warn(`[news] RSS ${source} failed:`, err.message);
    return [];
  }
}

// ── Public interface ──────────────────────────────────────────────────────────

async function getGeneralFeed(limit = 20) {
  const token = getApiKey();

  // Fetch Finnhub general + merger categories + all RSS feeds in parallel
  const [general, mergers, ...rssResults] = await Promise.all([
    fetchFinnhubCategory('general', token),
    fetchFinnhubCategory('merger', token),
    ...RSS_FEEDS.map(fetchRssFeed),
  ]);

  const finnhubArticles = normalizeFinnhub([...general, ...mergers]);
  const rssArticles = rssResults.flat();

  // Merge, deduplicate by headline similarity, sort newest-first
  const allArticles = [...finnhubArticles, ...rssArticles];
  const seen = new Set();
  const deduped = allArticles.filter((a) => {
    const key = a.headline.slice(0, 60).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  deduped.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  return deduped.slice(0, limit);
}

async function getNewsByTicker(ticker, limit = 5) {
  const token = getApiKey();
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  try {
    const res = await axios.get(`${FINNHUB_BASE}/company-news`, {
      params: { symbol: ticker.toUpperCase(), from, to, token },
      timeout: 10000,
    });
    return normalizeFinnhub((res.data || []).slice(0, limit));
  } catch (err) {
    console.warn(`[news] Finnhub company-news ${ticker} failed:`, err.message);
    return [];
  }
}

module.exports = { getGeneralFeed, getNewsByTicker };
