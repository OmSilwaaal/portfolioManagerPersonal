const axios = require('axios');

const MARKETAUX_BASE = 'https://api.marketaux.com/v1';

function getApiKey() {
  const key = process.env.MARKETAUX_API_KEY;
  if (!key) throw new Error('MARKETAUX_API_KEY is not set in environment variables');
  return key;
}

async function getNewsByTicker(ticker, limit = 5) {
  const api_token = getApiKey();
  const response = await axios.get(`${MARKETAUX_BASE}/news/all`, {
    params: {
      symbols: ticker.toUpperCase(),
      api_token,
      limit,
      language: 'en',
    },
    timeout: 10000,
  });

  return normalizeArticles(response.data.data || []);
}

async function getGeneralFeed(limit = 20) {
  const api_token = getApiKey();
  const response = await axios.get(`${MARKETAUX_BASE}/news/all`, {
    params: {
      api_token,
      limit,
      language: 'en',
      filter_entities: true,
    },
    timeout: 10000,
  });

  return normalizeArticles(response.data.data || []);
}

function normalizeArticles(articles) {
  return articles.map((article) => ({
    id: article.uuid || String(Date.now() + Math.random()),
    headline: article.title || '',
    source: article.source || 'Unknown',
    publishedAt: article.published_at || new Date().toISOString(),
    url: article.url || '',
    ticker: article.entities && article.entities.length > 0
      ? article.entities[0].symbol
      : null,
    description: article.description || article.snippet || '',
    sentiment: article.entities && article.entities.length > 0
      ? article.entities[0].sentiment_score || 0
      : 0,
  }));
}

module.exports = { getNewsByTicker, getGeneralFeed };
