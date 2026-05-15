const axios = require('axios');
const NodeCache = require('node-cache');
const crypto = require('crypto');

const cache = new NodeCache({ stdTTL: 3600 }); // 60 minutes
const CACHE_KEY = 'gov_trades_all';
const SENATE_URL = 'https://senate-stock-watcher-data.s3-us-west-2.amazonaws.com/aggregate/all_transactions.json';
const HOUSE_URL  = 'https://house-stock-watcher-data.s3-us-west-2.amazonaws.com/data/all_transactions.json';

function computeUrgency(disclosureLagDays, amountRange, transactionType) {
  const highAmounts = ['$50,001', '$100,001', '$250,001', '$500,001', '$1,000,001', '$5,000,001'];
  const isHighAmount = highAmounts.some((amt) => amountRange && amountRange.includes(amt));

  if (disclosureLagDays < 30 && isHighAmount) return 'Act Now';
  if (disclosureLagDays < 60 || (transactionType && transactionType.toLowerCase().includes('purchase')))
    return 'Watch';
  return 'Low';
}

function computeDisclosureLag(tradeDate, disclosureDate) {
  try {
    const t = new Date(tradeDate);
    const d = new Date(disclosureDate);
    if (isNaN(t.getTime()) || isNaN(d.getTime())) return 0;
    return Math.max(0, Math.round((d - t) / (1000 * 60 * 60 * 24)));
  } catch {
    return 0;
  }
}

function normalizeTransaction(raw) {
  const officialName = raw.senator || raw.representative || raw.name || 'Unknown';
  const ticker = (raw.ticker || '').trim().toUpperCase();
  const tradeDate = raw.transaction_date || raw.trade_date || '';
  const disclosureDate = raw.disclosure_date || raw.filed_date || '';
  const disclosureLagDays = computeDisclosureLag(tradeDate, disclosureDate);
  const transactionType = raw.type || raw.transaction_type || '';
  const amountRange = raw.amount || '';

  const hashInput = `${officialName}${ticker}${tradeDate}${transactionType}`;
  const id = crypto.createHash('md5').update(hashInput).digest('hex');

  // Determine chamber from data source fields
  let chamber = 'Senate';
  if (raw.chamber) {
    chamber = raw.chamber;
  } else if (raw.representative) {
    chamber = 'House';
  }

  // Normalize transaction type
  let normalizedType = transactionType;
  if (/sale.*partial/i.test(transactionType)) normalizedType = 'Sale (Partial)';
  else if (/sale/i.test(transactionType)) normalizedType = 'Sale';
  else if (/purchase/i.test(transactionType)) normalizedType = 'Purchase';

  return {
    id,
    officialName,
    title: chamber === 'Senate' ? 'Senator' : 'Representative',
    chamber,
    party: raw.party || 'Unknown',
    ticker,
    assetName: raw.asset_description || raw.asset_name || ticker,
    transactionType: normalizedType,
    tradeDate,
    disclosureDate,
    disclosureLagDays,
    amountRange,
    committeeOverlap: false,
    urgency: computeUrgency(disclosureLagDays, amountRange, normalizedType),
    source: 'Senate Stock Watcher',
  };
}

async function fetchAndCache() {
  const [senateResp, houseResp] = await Promise.allSettled([
    axios.get(SENATE_URL, { timeout: 15000 }),
    axios.get(HOUSE_URL,  { timeout: 15000 }),
  ]);

  const senateRaw = senateResp.status === 'fulfilled' && Array.isArray(senateResp.value.data)
    ? senateResp.value.data
    : [];
  const houseRaw = houseResp.status === 'fulfilled' && Array.isArray(houseResp.value.data)
    ? houseResp.value.data.map((r) => ({ ...r, chamber: 'House' }))
    : [];

  const normalized = [...senateRaw, ...houseRaw]
    .filter((r) => r && (r.ticker || r.asset_description))
    .map(normalizeTransaction)
    .filter((t) => t.ticker && t.ticker !== 'N/A');

  cache.set(CACHE_KEY, normalized);
  return normalized;
}

async function getAllTrades() {
  const cached = cache.get(CACHE_KEY);
  if (cached) return cached;
  return fetchAndCache();
}

async function getRecentGovTrades(limit = 50, filters = {}) {
  let trades = await getAllTrades();

  if (filters.chamber) {
    trades = trades.filter((t) => t.chamber.toLowerCase() === filters.chamber.toLowerCase());
  }
  if (filters.party) {
    trades = trades.filter((t) => t.party.toLowerCase() === filters.party.toLowerCase());
  }
  if (filters.ticker) {
    trades = trades.filter((t) => t.ticker.toUpperCase() === filters.ticker.toUpperCase());
  }
  if (filters.days) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - parseInt(filters.days, 10));
    trades = trades.filter((t) => {
      const d = new Date(t.tradeDate);
      return !isNaN(d.getTime()) && d >= cutoff;
    });
  }

  // Sort by disclosure date descending
  trades.sort((a, b) => {
    const da = new Date(a.disclosureDate || a.tradeDate);
    const db = new Date(b.disclosureDate || b.tradeDate);
    return db - da;
  });

  return trades.slice(0, limit);
}

async function getTradesByOfficial(officialName) {
  const trades = await getAllTrades();
  return trades
    .filter((t) => t.officialName.toLowerCase().includes(officialName.toLowerCase()))
    .sort((a, b) => new Date(b.tradeDate) - new Date(a.tradeDate));
}

async function refreshGovTradesCache() {
  cache.del(CACHE_KEY);
  return fetchAndCache();
}

module.exports = { getRecentGovTrades, getTradesByOfficial, refreshGovTradesCache };
