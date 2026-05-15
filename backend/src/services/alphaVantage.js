const axios = require('axios');
const NodeCache = require('node-cache');

const cache = new NodeCache({ stdTTL: 3600 }); // 60 minutes
const BASE_URL = 'https://www.alphavantage.co/query';

const MOCK_COMMODITIES = [
  { commodity: 'WTI Crude Oil', symbol: 'WTI', price: 78.42, unit: 'USD/barrel', changePercent: -0.8 },
  { commodity: 'Brent Crude', symbol: 'BRENT', price: 82.15, unit: 'USD/barrel', changePercent: -0.6 },
  { commodity: 'Gold', symbol: 'GOLD', price: 2345.60, unit: 'USD/troy oz', changePercent: 0.3 },
  { commodity: 'Silver', symbol: 'SILVER', price: 28.12, unit: 'USD/troy oz', changePercent: 0.5 },
  { commodity: 'Natural Gas', symbol: 'NATURAL_GAS', price: 2.84, unit: 'USD/MMBtu', changePercent: 1.2 },
  { commodity: 'Copper', symbol: 'COPPER', price: 4.52, unit: 'USD/lb', changePercent: -0.4 },
  { commodity: 'Wheat', symbol: 'WHEAT', price: 567.25, unit: 'USd/bu', changePercent: 2.1 },
  { commodity: 'Corn', symbol: 'CORN', price: 452.75, unit: 'USd/bu', changePercent: -1.1 },
  { commodity: 'Sugar', symbol: 'SUGAR', price: 22.45, unit: 'USd/lb', changePercent: 0.7 },
  { commodity: 'Coffee', symbol: 'COFFEE', price: 185.30, unit: 'USd/lb', changePercent: -0.3 },
];

// Maps symbol to Alpha Vantage function parameter
const SYMBOL_TO_FUNCTION = {
  WTI: 'WTI',
  BRENT: 'BRENT',
  NATURAL_GAS: 'NATURAL_GAS',
  COPPER: 'COPPER',
  WHEAT: 'WHEAT',
  CORN: 'CORN',
  SUGAR: 'SUGAR',
  COFFEE: 'COFFEE',
  ALL_COMMODITIES: 'ALL_COMMODITIES',
  GOLD: 'GOLD_PRICE',
  SILVER: 'SILVER_PRICE',
};

const SYMBOL_META = {
  WTI: { commodity: 'WTI Crude Oil', unit: 'USD/barrel' },
  BRENT: { commodity: 'Brent Crude', unit: 'USD/barrel' },
  NATURAL_GAS: { commodity: 'Natural Gas', unit: 'USD/MMBtu' },
  COPPER: { commodity: 'Copper', unit: 'USD/lb' },
  WHEAT: { commodity: 'Wheat', unit: 'USd/bu' },
  CORN: { commodity: 'Corn', unit: 'USd/bu' },
  SUGAR: { commodity: 'Sugar', unit: 'USd/lb' },
  COFFEE: { commodity: 'Coffee', unit: 'USd/lb' },
  GOLD: { commodity: 'Gold', unit: 'USD/troy oz' },
  SILVER: { commodity: 'Silver', unit: 'USD/troy oz' },
  ALL_COMMODITIES: { commodity: 'All Commodities Index', unit: 'Index' },
};

async function getCommodityPrice(commodity) {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;

  if (!apiKey) {
    const mock = MOCK_COMMODITIES.find((m) => m.symbol === commodity.toUpperCase());
    return mock || MOCK_COMMODITIES[0];
  }

  const cacheKey = `commodity_${commodity}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const fn = SYMBOL_TO_FUNCTION[commodity.toUpperCase()];
    if (!fn) throw new Error(`Unknown commodity symbol: ${commodity}`);

    const resp = await axios.get(BASE_URL, {
      params: { function: fn, interval: 'monthly', apikey: apiKey },
      timeout: 10000,
    });

    const data = resp.data;
    const dataKey = Object.keys(data).find((k) => k.toLowerCase().includes('data'));
    const entries = dataKey ? data[dataKey] : [];

    if (!entries || entries.length < 2) {
      throw new Error('Insufficient data from Alpha Vantage');
    }

    const latest = entries[0];
    const prev = entries[1];
    const price = parseFloat(latest.value);
    const prevPrice = parseFloat(prev.value);
    const changePercent = prevPrice ? ((price - prevPrice) / prevPrice) * 100 : 0;

    const meta = SYMBOL_META[commodity.toUpperCase()] || { commodity, unit: '' };

    const result = {
      commodity: meta.commodity,
      symbol: commodity.toUpperCase(),
      price,
      unit: meta.unit,
      changePercent: parseFloat(changePercent.toFixed(2)),
      lastRefreshed: latest.date,
    };

    cache.set(cacheKey, result);
    return result;
  } catch (err) {
    console.log(`Alpha Vantage error for ${commodity}:`, err.message);
    const mock = MOCK_COMMODITIES.find((m) => m.symbol === commodity.toUpperCase());
    return mock
      ? { ...mock, lastRefreshed: new Date().toISOString().split('T')[0] }
      : null;
  }
}

async function getAllCommodities() {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;

  if (!apiKey) {
    return MOCK_COMMODITIES.map((m) => ({ ...m, lastRefreshed: new Date().toISOString().split('T')[0] }));
  }

  const symbols = Object.keys(SYMBOL_TO_FUNCTION).filter((s) => s !== 'ALL_COMMODITIES');
  const results = await Promise.allSettled(symbols.map((s) => getCommodityPrice(s)));

  return results
    .map((r, i) => (r.status === 'fulfilled' && r.value ? r.value : { ...MOCK_COMMODITIES[i] }))
    .filter(Boolean);
}

module.exports = { getCommodityPrice, getAllCommodities, MOCK_COMMODITIES };
