const axios = require('axios');
const NodeCache = require('node-cache');

const queryCache = new NodeCache({ stdTTL: 300 });
const coinListCache = new NodeCache({ stdTTL: 86400 });
const COIN_LIST_KEY = 'coingecko_coin_list';

function mapFinnhubType(type) {
  const t = (type || '').toLowerCase();
  if (t.includes('etp') || t.includes('etf')) return 'etf';
  if (t.includes('crypto')) return 'crypto';
  return 'stock';
}

async function searchCryptoCoins(query) {
  let coins = coinListCache.get(COIN_LIST_KEY);
  if (!coins) {
    try {
      const resp = await axios.get('https://api.coingecko.com/api/v3/coins/list', { timeout: 15000 });
      coins = resp.data || [];
      coinListCache.set(COIN_LIST_KEY, coins);
    } catch (err) {
      console.log('CoinGecko coins/list error:', err.message);
      return [];
    }
  }
  const q = query.toLowerCase();
  return coins
    .filter((c) =>
      c.symbol.toLowerCase().startsWith(q) ||
      c.name.toLowerCase().startsWith(q) ||
      c.id.toLowerCase().startsWith(q)
    )
    .slice(0, 15)
    .map((c) => ({
      ticker: c.symbol.toUpperCase(),
      name: c.name,
      exchange: 'CRYPTO',
      assetType: 'crypto',
      coinGeckoId: c.id,
    }));
}

async function searchStocks(query) {
  const token = process.env.FINNHUB_API_KEY;
  if (!token) return [];
  try {
    const resp = await axios.get('https://finnhub.io/api/v1/search', {
      params: { q: query, token },
      timeout: 8000,
    });
    return (resp.data?.result || []).slice(0, 25).map((item) => ({
      ticker: item.symbol,
      name: item.description,
      exchange: item.displaySymbol,
      assetType: mapFinnhubType(item.type),
    }));
  } catch (err) {
    console.log('Finnhub search error:', err.message);
    return [];
  }
}

async function searchSymbols(query, type = 'all') {
  if (!query || query.trim().length < 1) return [];
  const q = query.trim();
  const cacheKey = `search_${type}_${q.toLowerCase()}`;
  const cached = queryCache.get(cacheKey);
  if (cached) return cached;

  let results = [];
  const fetchStocks = type === 'all' || type === 'stocks' || type === 'etf';
  const fetchCrypto = type === 'all' || type === 'crypto';

  const [stockResults, cryptoResults] = await Promise.all([
    fetchStocks ? searchStocks(q) : Promise.resolve([]),
    fetchCrypto ? searchCryptoCoins(q) : Promise.resolve([]),
  ]);

  results = [...stockResults, ...cryptoResults];

  const seen = new Set();
  const deduped = results.filter((r) => {
    const key = `${r.assetType}_${r.ticker}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  queryCache.set(cacheKey, deduped);
  return deduped;
}

async function warmCoinList() {
  try {
    const resp = await axios.get('https://api.coingecko.com/api/v3/coins/list', { timeout: 20000 });
    coinListCache.set(COIN_LIST_KEY, resp.data || []);
    console.log(`Cached ${(resp.data || []).length} CoinGecko coins`);
  } catch (err) {
    console.log('Coin list warm-up failed (non-fatal):', err.message);
  }
}

module.exports = { searchSymbols, warmCoinList };
