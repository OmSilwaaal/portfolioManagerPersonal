const express = require('express');
const { searchSymbols } = require('../services/search');

const router = express.Router();

router.get('/', async (req, res, next) => {
  const { q, type = 'all' } = req.query;
  if (!q || q.trim().length < 1) return res.json({ results: [] });
  try {
    const results = await searchSymbols(q.trim(), type);
    res.json({ results });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
