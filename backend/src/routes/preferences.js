const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const {
  getPreferences,
  createPreferences,
  updatePreferences,
} = require('../db/queries');

// GET /api/preferences/:sessionId
router.get('/:sessionId', (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const prefs = getPreferences(sessionId);

    if (!prefs) {
      return res.status(404).json({ error: 'Preferences not found for this session' });
    }

    res.json(parsePreferences(prefs));
  } catch (err) {
    next(err);
  }
});

// POST /api/preferences
router.post('/', (req, res, next) => {
  try {
    const sessionId = req.body.sessionId || uuidv4();
    const prefsData = { ...req.body, sessionId };

    const existing = getPreferences(sessionId);
    let saved;

    if (existing) {
      saved = updatePreferences(sessionId, prefsData);
    } else {
      saved = createPreferences(prefsData);
    }

    res.status(201).json({ sessionId, preferences: parsePreferences(saved) });
  } catch (err) {
    next(err);
  }
});

// PUT /api/preferences/:sessionId
router.put('/:sessionId', (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const existing = getPreferences(sessionId);

    if (!existing) {
      return res.status(404).json({ error: 'Preferences not found for this session' });
    }

    const updated = updatePreferences(sessionId, req.body);
    res.json({ sessionId, preferences: parsePreferences(updated) });
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
