const express = require('express');
const { supabase } = require('../services/supabaseAdmin');
const wins = require('../services/wins');
const memeData = require('../services/memecoinData');

const { optionalAuth } = require('../middleware/auth');

const router = express.Router();
const RANGES = new Set(['day', 'week', 'month', 'all']);

// GET /api/winners?range=day|week|month|all&limit=30
// Biggest profitable paper trades, each with USD and SOL profit already worked out.
router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const range = RANGES.has(req.query.range) ? req.query.range : 'all';
    let solPrice = null;
    try { solPrice = await memeData.getSolPrice(); } catch { /* fall back to the service default */ }
    const out = await wins.listWins({ range, limit: req.query.limit, solPrice, supabase });
    // The board is public, but account ids are not. A signed-in caller gets them
    // so the UI can tell which rows are theirs; anonymous callers get the same
    // rows with the ids withheld.
    if (!req.user) out.wins = out.wins.map(({ userId, ...w }) => w);
    res.json(out);
  } catch (err) { next(err); }
});

module.exports = router;
