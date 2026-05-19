const axios = require('axios');
const NodeCache = require('node-cache');

const cache = new NodeCache({ stdTTL: 3600 }); // 60 minutes
const BASE_URL = 'https://www.alphavantage.co/query';

const MOCK_COMMODITIES = [
  { commodity: 'WTI Crude Oil', symbol: 'WTI', price: 78.42, unit: 'USD/barrel', changePercent: -0.8, sector: 'Energy', relatedETFs: ['USO', 'XLE', 'OIH'] },
  { commodity: 'Brent Crude', symbol: 'BRENT', price: 82.15, unit: 'USD/barrel', changePercent: -0.6, sector: 'Energy', relatedETFs: ['BNO', 'XLE'] },
  { commodity: 'Gold', symbol: 'GOLD', price: 2345.60, unit: 'USD/troy oz', changePercent: 0.3, sector: 'Metals', relatedETFs: ['GLD', 'IAU', 'GDX'] },
  { commodity: 'Silver', symbol: 'SILVER', price: 28.12, unit: 'USD/troy oz', changePercent: 0.5, sector: 'Metals', relatedETFs: ['SLV', 'PSLV'] },
  { commodity: 'Natural Gas', symbol: 'NATURAL_GAS', price: 2.84, unit: 'USD/MMBtu', changePercent: 1.2, sector: 'Energy', relatedETFs: ['UNG', 'BOIL'] },
  { commodity: 'Copper', symbol: 'COPPER', price: 4.52, unit: 'USD/lb', changePercent: -0.4, sector: 'Metals', relatedETFs: ['CPER', 'COPX'] },
  { commodity: 'Wheat', symbol: 'WHEAT', price: 567.25, unit: 'USd/bu', changePercent: 2.1, sector: 'Agriculture', relatedETFs: ['WEAT', 'DBA'] },
  { commodity: 'Corn', symbol: 'CORN', price: 452.75, unit: 'USd/bu', changePercent: -1.1, sector: 'Agriculture', relatedETFs: ['CORN', 'DBA'] },
  { commodity: 'Sugar', symbol: 'SUGAR', price: 22.45, unit: 'USd/lb', changePercent: 0.7, sector: 'Agriculture', relatedETFs: ['SGG', 'DBA'] },
  { commodity: 'Coffee', symbol: 'COFFEE', price: 185.30, unit: 'USd/lb', changePercent: -0.3, sector: 'Agriculture', relatedETFs: ['JO', 'DBA'] },
  { commodity: 'Platinum', symbol: 'PLATINUM', price: 952.40, unit: 'USD/troy oz', changePercent: -0.2, sector: 'Metals', relatedETFs: ['PPLT'] },
  { commodity: 'Palladium', symbol: 'PALLADIUM', price: 1124.80, unit: 'USD/troy oz', changePercent: 0.9, sector: 'Metals', relatedETFs: ['PALL'] },
  { commodity: 'Soybeans', symbol: 'SOYBEANS', price: 1182.50, unit: 'USd/bu', changePercent: -0.5, sector: 'Agriculture', relatedETFs: ['SOYB', 'DBA'] },
  { commodity: 'Cotton', symbol: 'COTTON', price: 78.35, unit: 'USd/lb', changePercent: 1.4, sector: 'Agriculture', relatedETFs: ['BAL', 'DBA'] },
  { commodity: 'Heating Oil', symbol: 'HO1', price: 2.89, unit: 'USD/gallon', changePercent: -0.5, sector: 'Energy', relatedETFs: ['USO', 'XLE'] },
  { commodity: 'RBOB Gasoline', symbol: 'RB1', price: 2.65, unit: 'USD/gallon', changePercent: 0.3, sector: 'Energy', relatedETFs: ['UGA', 'XLE'] },
  { commodity: 'Live Cattle', symbol: 'LE1', price: 182.45, unit: 'USd/lb', changePercent: 0.8, sector: 'Agriculture', relatedETFs: ['COW', 'DBA'] },
  { commodity: 'Lean Hogs', symbol: 'HE1', price: 84.20, unit: 'USd/lb', changePercent: -1.2, sector: 'Agriculture', relatedETFs: ['COW', 'DBA'] },
  { commodity: 'Lumber', symbol: 'LBS1', price: 512.30, unit: 'USD/MBF', changePercent: 2.4, sector: 'Agriculture', relatedETFs: ['CUT', 'WOOD'] },
  { commodity: 'Orange Juice', symbol: 'OJ1', price: 385.50, unit: 'USd/lb', changePercent: -0.7, sector: 'Agriculture', relatedETFs: ['DBA'] },
  { commodity: 'Oats', symbol: 'ZO1', price: 328.75, unit: 'USd/bu', changePercent: 1.1, sector: 'Agriculture', relatedETFs: ['DBA'] },
  { commodity: 'Rough Rice', symbol: 'ZR1', price: 16.85, unit: 'USD/cwt', changePercent: -0.3, sector: 'Agriculture', relatedETFs: ['DBA'] },
  { commodity: 'Cocoa', symbol: 'CC1', price: 8420.00, unit: 'USD/MT', changePercent: -2.1, sector: 'Agriculture', relatedETFs: ['NIB'] },
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
  HO1: 'HO1', RB1: 'RB1', LE1: 'LE1', HE1: 'HE1', LBS1: 'LBS1', OJ1: 'OJ1', ZO1: 'ZO1', ZR1: 'ZR1', CC1: 'CC1',
};

const SYMBOL_META = {
  WTI: { commodity: 'WTI Crude Oil', unit: 'USD/barrel', sector: 'Energy', relatedETFs: ['USO', 'XLE', 'OIH'] },
  BRENT: { commodity: 'Brent Crude', unit: 'USD/barrel', sector: 'Energy', relatedETFs: ['BNO', 'XLE'] },
  NATURAL_GAS: { commodity: 'Natural Gas', unit: 'USD/MMBtu', sector: 'Energy', relatedETFs: ['UNG', 'BOIL'] },
  COPPER: { commodity: 'Copper', unit: 'USD/lb', sector: 'Metals', relatedETFs: ['CPER', 'COPX'] },
  WHEAT: { commodity: 'Wheat', unit: 'USd/bu', sector: 'Agriculture', relatedETFs: ['WEAT', 'DBA'] },
  CORN: { commodity: 'Corn', unit: 'USd/bu', sector: 'Agriculture', relatedETFs: ['CORN', 'DBA'] },
  SUGAR: { commodity: 'Sugar', unit: 'USd/lb', sector: 'Agriculture', relatedETFs: ['SGG', 'DBA'] },
  COFFEE: { commodity: 'Coffee', unit: 'USd/lb', sector: 'Agriculture', relatedETFs: ['JO', 'DBA'] },
  GOLD: { commodity: 'Gold', unit: 'USD/troy oz', sector: 'Metals', relatedETFs: ['GLD', 'IAU', 'GDX'] },
  SILVER: { commodity: 'Silver', unit: 'USD/troy oz', sector: 'Metals', relatedETFs: ['SLV', 'PSLV'] },
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
      sector: meta.sector || null,
      relatedETFs: meta.relatedETFs || [],
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
