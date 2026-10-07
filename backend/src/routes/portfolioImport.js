const express = require('express');
const router = express.Router();
const { getDb } = require('../db/schema');

const MAX_POSITIONS = 500;
const TICKER_RE = /^[A-Za-z0-9:.\-]{1,15}$/;

// Coerce to a finite number or null (rejects objects/arrays/NaN so they can't reach SQLite)
function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && Math.abs(n) < 1e13 ? n : null;
}

// GET /api/portfolio-import/positions
router.get('/positions', (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM csv_positions WHERE user_id = ? ORDER BY imported_at DESC').all(req.user.id);
    res.json({ positions: rows });
  } catch (err) {
    console.error('portfolio-import get error:', err.message);
    res.status(500).json({ error: true, message: 'Failed to fetch imported positions' });
  }
});

// POST /api/portfolio-import/positions — body: { account, positions: [{ticker, quantity, avg_cost, price, market_value}] }
router.post('/positions', (req, res) => {
  try {
    const { account = 'Imported', positions } = req.body ?? {};
    if (typeof account !== 'string' || !account.trim() || account.length > 60) {
      return res.status(400).json({ error: true, message: 'account must be a non-empty string up to 60 characters' });
    }
    if (!Array.isArray(positions) || positions.length === 0) {
      return res.status(400).json({ error: true, message: 'positions must be a non-empty array' });
    }
    if (positions.length > MAX_POSITIONS) {
      return res.status(400).json({ error: true, message: `Too many positions (max ${MAX_POSITIONS})` });
    }

    const rows = [];
    for (const p of positions) {
      if (!p || typeof p.ticker !== 'string' || !TICKER_RE.test(p.ticker.trim())) continue;
      rows.push([p.ticker.trim().toUpperCase(), num(p.quantity), num(p.avg_cost), num(p.price), num(p.market_value)]);
    }
    if (rows.length === 0) {
      return res.status(400).json({ error: true, message: 'No valid positions found' });
    }

    const db = getDb();
    const acct = account.trim();
    const del = db.prepare('DELETE FROM csv_positions WHERE user_id = ? AND account = ?');
    const ins = db.prepare(`
      INSERT INTO csv_positions (user_id, account, ticker, quantity, avg_cost, price, market_value)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    db.transaction(() => {
      del.run(req.user.id, acct);
      for (const r of rows) ins.run(req.user.id, acct, ...r);
    })();

    res.json({ success: true, imported: rows.length });
  } catch (err) {
    console.error('portfolio-import post error:', err.message);
    res.status(500).json({ error: true, message: 'Failed to save imported positions' });
  }
});

// DELETE /api/portfolio-import/positions?account=X — clear one or all accounts
router.delete('/positions', (req, res) => {
  try {
    const db = getDb();
    const { account } = req.query;
    if (typeof account === 'string' && account) {
      db.prepare('DELETE FROM csv_positions WHERE user_id = ? AND account = ?').run(req.user.id, account);
    } else {
      db.prepare('DELETE FROM csv_positions WHERE user_id = ?').run(req.user.id);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('portfolio-import delete error:', err.message);
    res.status(500).json({ error: true, message: 'Failed to delete positions' });
  }
});

module.exports = router;
