const express = require('express');
const router = express.Router();
const {
  getPreferences,
  createPreferences,
  updatePreferences,
} = require('../db/queries');

// Preferences are keyed by the authenticated user's id. Any :sessionId a client sends is ignored,
// so one user can never read or overwrite another user's preferences.
const MAX_LIST = 50;
const MAX_STR = 40;

function cleanStr(v) {
  return typeof v === 'string' && v.length <= MAX_STR ? v : null;
}

function cleanStrList(v) {
  if (!Array.isArray(v)) return null;
  return v.filter((x) => typeof x === 'string' && x.length <= MAX_STR).slice(0, MAX_LIST);
}

function cleanWatchlist(v) {
  if (!Array.isArray(v)) return null;
  return v
    .filter((x) => x && typeof x.ticker === 'string' && /^[A-Za-z0-9:.\-]{1,15}$/.test(x.ticker))
    .slice(0, 200)
    .map((x) => ({
      ticker: x.ticker.toUpperCase(),
      assetType: cleanStr(x.assetType) ?? 'stock',
      name: typeof x.name === 'string' ? x.name.slice(0, 100) : x.ticker.toUpperCase(),
    }));
}

function sanitize(body, userId) {
  const b = body ?? {};
  return {
    sessionId: userId,
    investorType: cleanStr(b.investorType),
    riskTolerance: cleanStr(b.riskTolerance),
    updateFrequency: cleanStr(b.updateFrequency),
    watchedCategories: cleanStrList(b.watchedCategories),
    priorityAlerts: cleanStrList(b.priorityAlerts),
    watchlist: cleanWatchlist(b.watchlist),
  };
}

// GET /api/preferences/:sessionId  (param ignored — always the caller's own)
router.get('/:sessionId', (req, res, next) => {
  try {
    const prefs = getPreferences(req.user.id);
    if (!prefs) return res.status(404).json({ error: true, message: 'Preferences not found.' });
    res.json(parsePreferences(prefs));
  } catch (err) {
    next(err);
  }
});

// POST /api/preferences
router.post('/', (req, res, next) => {
  try {
    const prefsData = sanitize(req.body, req.user.id);
    const existing = getPreferences(req.user.id);
    const saved = existing ? updatePreferences(req.user.id, prefsData) : createPreferences(prefsData);
    res.status(201).json({ sessionId: req.user.id, preferences: parsePreferences(saved) });
  } catch (err) {
    next(err);
  }
});

// PUT /api/preferences/:sessionId  (param ignored — always the caller's own)
router.put('/:sessionId', (req, res, next) => {
  try {
    if (!getPreferences(req.user.id)) {
      return res.status(404).json({ error: true, message: 'Preferences not found.' });
    }
    const updated = updatePreferences(req.user.id, sanitize(req.body, req.user.id));
    res.json({ sessionId: req.user.id, preferences: parsePreferences(updated) });
  } catch (err) {
    next(err);
  }
});

function parsePreferences(row) {
  if (!row) return null;
  return {
    sessionId: row.sessionId,
    investorType: row.investorType || null,
    riskTolerance: row.riskTolerance || null,
    updateFrequency: row.updateFrequency || null,
    watchedCategories: safeParseJSON(row.watchedCategories, []),
    priorityAlerts: safeParseJSON(row.priorityAlerts, []),
    watchlist: safeParseJSON(row.watchlistJson, []),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function safeParseJSON(val, fallback) {
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

module.exports = router;
