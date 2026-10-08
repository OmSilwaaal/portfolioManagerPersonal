const express = require('express');
const { supabase } = require('../services/supabaseAdmin');
const wins = require('../services/wins');
const memeData = require('../services/memecoinData');

const router = express.Router();
const RANGES = new Set(['day', 'week', 'month', 'all']);

// GET /api/winners?range=day|week|month|all&limit=30
// Biggest profitable paper trades, each with USD and SOL profit already worked out.
router.get('/', async (req, res, next) => {
  try {
    const range = RANGES.has(req.query.range) ? req.query.range : 'all';
    let solPrice = null;
    try { solPrice = await memeData.getSolPrice(); } catch { /* fall back to the service default */ }
    res.json(await wins.listWins({ range, limit: req.query.limit, solPrice, supabase }));
  } catch (err) { next(err); }
});

module.exports = router;
