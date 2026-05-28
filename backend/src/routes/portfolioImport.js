const express = require('express');
const router = express.Router();
const { getDb } = require('../db/schema');

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
    const { account = 'Imported', positions } = req.body;
    if (!Array.isArray(positions) || positions.length === 0) {
      return res.status(400).json({ error: true, message: 'positions must be a non-empty array' });
    }

    const db = getDb();
    const del = db.prepare('DELETE FROM csv_positions WHERE user_id = ? AND account = ?');
    const ins = db.prepare(`
      INSERT INTO csv_positions (user_id, account, ticker, quantity, avg_cost, price, market_value)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const upsert = db.transaction(() => {
      del.run(req.user.id, account);
      for (const p of positions) {
        if (!p.ticker) continue;
        ins.run(req.user.id, account, p.ticker.toUpperCase(), p.quantity ?? null, p.avg_cost ?? null, p.price ?? null, p.market_value ?? null);
      }
    });
    upsert();

    res.json({ success: true, imported: positions.length });
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
    if (account) {
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
