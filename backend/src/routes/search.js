const express = require('express');
const { searchSymbols } = require('../services/search');

const router = express.Router();

router.get('/', async (req, res, next) => {
  const { q, type = 'all' } = req.query;
  // Query params can be arrays/objects (?q=a&q=b) — only accept short plain strings
  if (typeof q !== 'string' || q.trim().length < 1) return res.json({ results: [] });
  if (q.length > 50) return res.status(400).json({ error: true, message: 'Search query too long.' });
  if (!['all', 'stocks', 'etf', 'crypto'].includes(type)) {
    return res.status(400).json({ error: true, message: 'Invalid search type.' });
  }
  try {
    const results = await searchSymbols(q.trim(), type);
    res.json({ results });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
