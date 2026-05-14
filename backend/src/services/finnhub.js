const axios = require('axios');

const FINNHUB_BASE = 'https://finnhub.io/api/v1';

function getApiKey() {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) throw new Error('FINNHUB_API_KEY is not set in environment variables');
  return key;
}

async function getStockQuote(ticker) {
  const token = getApiKey();
  const response = await axios.get(`${FINNHUB_BASE}/quote`, {
    params: { symbol: ticker.toUpperCase(), token },
    timeout: 8000,
  });

  const data = response.data;
  return {
    ticker: ticker.toUpperCase(),
    price: data.c,
    change: data.d,
    changePercent: data.dp,
    high: data.h,
    low: data.l,
    open: data.o,
    previousClose: data.pc,
    volume: data.v || null,
  };
}

async function getCompanyProfile(ticker) {
  const token = getApiKey();
  try {
    const response = await axios.get(`${FINNHUB_BASE}/stock/profile2`, {
      params: { symbol: ticker.toUpperCase(), token },
      timeout: 8000,
    });
    return response.data;
  } catch {
    return null;
  }
}

async function getCryptoCandles(symbol) {
  const token = getApiKey();
  const to = Math.floor(Date.now() / 1000);
  const from = to - 7 * 24 * 60 * 60; // 7 days ago

  const finnhubSymbol = symbol.toUpperCase() === 'BTC'
    ? 'BINANCE:BTCUSDT'
    : symbol.toUpperCase() === 'ETH'
    ? 'BINANCE:ETHUSDT'
    : symbol.toUpperCase() === 'SOL'
    ? 'BINANCE:SOLUSDT'
    : symbol.toUpperCase() === 'DOGE'
    ? 'BINANCE:DOGEUSDT'
    : `BINANCE:${symbol.toUpperCase()}USDT`;

  const response = await axios.get(`${FINNHUB_BASE}/crypto/candle`, {
    params: {
      symbol: finnhubSymbol,
      resolution: 'D',
      from,
      to,
      token,
    },
    timeout: 8000,
  });

  const data = response.data;
  if (data.s !== 'ok') {
    throw new Error(`Finnhub crypto candle returned status: ${data.s}`);
  }

  const latestIndex = data.c.length - 1;
  const price = data.c[latestIndex];
  const previousClose = latestIndex > 0 ? data.c[latestIndex - 1] : price;
  const change24h = price - previousClose;
  const changePercent24h = previousClose !== 0 ? (change24h / previousClose) * 100 : 0;

  return {
    symbol: symbol.toUpperCase(),
    price,
    change24h,
    changePercent24h,
    volume24h: data.v ? data.v[latestIndex] : null,
    candles: data.t.map((time, i) => ({
      time: new Date(time * 1000).toISOString(),
      open: data.o[i],
      high: data.h[i],
      low: data.l[i],
      close: data.c[i],
      volume: data.v ? data.v[i] : null,
    })),
  };
}

module.exports = { getStockQuote, getCompanyProfile, getCryptoCandles };
