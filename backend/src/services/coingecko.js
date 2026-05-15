const axios = require('axios');
const NodeCache = require('node-cache');

const priceCache = new NodeCache({ stdTTL: 120 });   // 2 minutes for prices
const marketCache = new NodeCache({ stdTTL: 1800 }); // 30 minutes for market data

const BASE_URL = 'https://api.coingecko.com/api/v3';
const FEAR_GREED_URL = 'https://api.alternative.me/fng/';

const TICKER_TO_COINGECKO = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  BNB: 'binancecoin',
  XRP: 'ripple',
  AVAX: 'avalanche-2',
  DOGE: 'dogecoin',
  ADA: 'cardano',
  MATIC: 'matic-network',
};

const COINGECKO_META = {
  bitcoin: { symbol: 'BTC', name: 'Bitcoin' },
  ethereum: { symbol: 'ETH', name: 'Ethereum' },
  solana: { symbol: 'SOL', name: 'Solana' },
  binancecoin: { symbol: 'BNB', name: 'BNB' },
  ripple: { symbol: 'XRP', name: 'XRP' },
  'avalanche-2': { symbol: 'AVAX', name: 'Avalanche' },
  dogecoin: { symbol: 'DOGE', name: 'Dogecoin' },
  cardano: { symbol: 'ADA', name: 'Cardano' },
  'matic-network': { symbol: 'MATIC', name: 'Polygon' },
};

function buildHeaders() {
  const apiKey = process.env.COINGECKO_API_KEY;
  return apiKey ? { 'x-cg-demo-api-key': apiKey } : {};
}

async function getCryptoPrice(coinId) {
  // Accept ticker or coinGecko ID
  const resolvedId = TICKER_TO_COINGECKO[coinId.toUpperCase()] || coinId.toLowerCase();
  const cacheKey = `price_${resolvedId}`;

  const cached = priceCache.get(cacheKey);
  if (cached) return cached;

  try {
    const resp = await axios.get(`${BASE_URL}/simple/price`, {
      params: {
        ids: resolvedId,
        vs_currencies: 'usd',
        include_24hr_change: true,
        include_market_cap: true,
        include_24hr_vol: true,
      },
      headers: buildHeaders(),
      timeout: 10000,
    });

    const data = resp.data[resolvedId];
    if (!data) throw new Error(`No data returned for ${resolvedId}`);

    const meta = COINGECKO_META[resolvedId] || { symbol: resolvedId.toUpperCase(), name: resolvedId };

    const result = {
      symbol: meta.symbol,
      name: meta.name,
      price: data.usd,
      change24h: data.usd_24h_change ? parseFloat(data.usd_24h_change.toFixed(2)) : 0,
      changePercent24h: data.usd_24h_change ? parseFloat(data.usd_24h_change.toFixed(2)) : 0,
      marketCap: data.usd_market_cap || null,
      volume24h: data.usd_24h_vol || null,
    };

    priceCache.set(cacheKey, result);
    return result;
  } catch (err) {
    console.log(`CoinGecko price error for ${resolvedId}:`, err.message);
    return null;
  }
}

async function getFearGreedIndex() {
  const cacheKey = 'fear_greed';
  const cached = marketCache.get(cacheKey);
  if (cached) return cached;

  try {
    const resp = await axios.get(FEAR_GREED_URL, {
      params: { limit: 1 },
      timeout: 8000,
    });

    const item = resp.data && resp.data.data && resp.data.data[0];
    if (!item) throw new Error('No fear/greed data');

    const result = {
      value: parseInt(item.value, 10),
      classification: item.value_classification,
      timestamp: new Date(parseInt(item.timestamp, 10) * 1000).toISOString(),
    };

    marketCache.set(cacheKey, result);
    return result;
  } catch (err) {
    console.log('Fear & Greed index error:', err.message);
    return { value: 50, classification: 'Neutral', timestamp: new Date().toISOString() };
  }
}

async function getCryptoMarketData(coinIds) {
  const resolvedIds = coinIds.map(
    (id) => TICKER_TO_COINGECKO[id.toUpperCase()] || id.toLowerCase()
  );

  const cacheKey = `market_${resolvedIds.sort().join(',')}`;
  const cached = marketCache.get(cacheKey);
  if (cached) return cached;

  try {
    const resp = await axios.get(`${BASE_URL}/coins/markets`, {
      params: {
        vs_currency: 'usd',
        ids: resolvedIds.join(','),
        order: 'market_cap_desc',
        per_page: resolvedIds.length,
        page: 1,
        price_change_percentage: '24h',
      },
      headers: buildHeaders(),
      timeout: 10000,
    });

    const results = (resp.data || []).map((coin) => ({
      symbol: coin.symbol.toUpperCase(),
      name: coin.name,
      price: coin.current_price,
      change24h: parseFloat((coin.price_change_percentage_24h || 0).toFixed(2)),
      changePercent24h: parseFloat((coin.price_change_percentage_24h || 0).toFixed(2)),
      marketCap: coin.market_cap,
      volume24h: coin.total_volume,
      image: coin.image,
    }));

    marketCache.set(cacheKey, results);
    return results;
  } catch (err) {
    console.log('CoinGecko market data error:', err.message);
    return [];
  }
}

module.exports = { getCryptoPrice, getFearGreedIndex, getCryptoMarketData, TICKER_TO_COINGECKO };
