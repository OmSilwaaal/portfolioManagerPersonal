const axios = require('axios');

const MARKETAUX_BASE = 'https://api.marketaux.com/v1';

// MarketAux entity types that represent actual traded securities
const FINANCIAL_ENTITY_TYPES = new Set(['equity', 'etf', 'index', 'crypto', 'commodity', 'forex', 'fund']);

// Headlines containing these phrases are almost never financial market news
const NOISE_PATTERNS = [
  /recipe/i, /how to (make|cook|bake|prepare)/i, /restaurant/i, /food review/i,
  /travel guide/i, /best places to visit/i, /celebrity/i, /fashion/i,
  /sports score/i, /movie review/i, /book review/i, /horoscope/i,
];

function getApiKey() {
  const key = process.env.MARKETAUX_API_KEY;
  if (!key) throw new Error('MARKETAUX_API_KEY is not set in environment variables');
  return key;
}

function isFinancialArticle(article) {
  // Must have at least one entity that is a recognised financial instrument
  const entities = article.entities || [];
  if (entities.length === 0) return false;

  const hasFinancialEntity = entities.some((e) => {
    const type = (e.type || '').toLowerCase();
    const hasSymbol = e.symbol && e.symbol.length >= 1 && e.symbol.length <= 6;
    return hasSymbol || FINANCIAL_ENTITY_TYPES.has(type);
  });

  if (!hasFinancialEntity) return false;

  // Quick headline sanity check
  const headline = article.title || '';
  if (NOISE_PATTERNS.some((re) => re.test(headline))) return false;

  return true;
}

async function getNewsByTicker(ticker, limit = 5) {
  const api_token = getApiKey();
  const response = await axios.get(`${MARKETAUX_BASE}/news/all`, {
    params: {
      symbols: ticker.toUpperCase(),
      api_token,
      limit,
      language: 'en',
      filter_entities: true,
    },
    timeout: 10000,
  });

  return normalizeArticles((response.data.data || []).filter(isFinancialArticle));
}

async function getGeneralFeed(limit = 20) {
  const api_token = getApiKey();

  // Fetch more than needed so filtering still leaves enough
  const fetchLimit = Math.min(limit * 2, 100);

  const response = await axios.get(`${MARKETAUX_BASE}/news/all`, {
    params: {
      api_token,
      limit: fetchLimit,
      language: 'en',
      filter_entities: true,
      // Restrict to financial topics supported by MarketAux
      topics: 'earnings,dividends,mergers_and_acquisitions,equity_offering,analyst_ratings,insider_trading,layoffs,ipos,economics,central_bank,stock_market',
    },
    timeout: 10000,
  });

  const financial = (response.data.data || []).filter(isFinancialArticle);
  return normalizeArticles(financial).slice(0, limit);
}

function normalizeArticles(articles) {
  return articles.map((article) => {
    const entities = article.entities || [];
    // Pick the entity with the strongest sentiment signal as the primary ticker
    const primary = entities
      .filter((e) => e.symbol)
      .sort((a, b) => Math.abs(b.sentiment_score || 0) - Math.abs(a.sentiment_score || 0))[0] || entities[0];

    return {
      id: article.uuid || String(Date.now() + Math.random()),
      headline: article.title || '',
      source: article.source || 'Unknown',
      publishedAt: article.published_at || new Date().toISOString(),
      url: article.url || '',
      image_url: article.image_url || null,
      ticker: primary?.symbol || null,
      description: article.description || article.snippet || '',
      sentiment: primary?.sentiment_score || 0,
    };
  });
}

module.exports = { getNewsByTicker, getGeneralFeed };
