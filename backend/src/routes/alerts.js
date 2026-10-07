const express = require('express');
const router = express.Router();
const {
  getAlertsByUser,
  countAlertsByUser,
  getAlertForUser,
  createAlert,
  deleteAlertForUser,
} = require('../db/queries');
const { isTicker } = require('../middleware/validate');

const MAX_ALERTS_PER_USER = 50;

const normalize = (a) => ({
  id: String(a.id),
  ticker: a.ticker,
  targetPrice: a.targetPrice,
  direction: a.direction,
  createdAt: a.createdAt,
  triggered: a.triggered === 1,
});

// GET /api/alerts — the caller's alerts only
router.get('/', (req, res) => {
  res.json({ alerts: getAlertsByUser(req.user.id).map(normalize) });
});

// POST /api/alerts — create a new alert
router.post('/', (req, res) => {
  const { ticker, targetPrice, direction } = req.body ?? {};

  if (!ticker || !targetPrice || !direction) {
    return res.status(400).json({ error: true, message: 'Missing required fields: ticker, targetPrice, direction' });
  }
  if (!isTicker(ticker)) {
    return res.status(400).json({ error: true, message: 'Invalid ticker symbol.' });
  }
  if (!['above', 'below'].includes(direction)) {
    return res.status(400).json({ error: true, message: 'direction must be "above" or "below"' });
  }

  const price = Number(targetPrice);
  if (!Number.isFinite(price) || price <= 0 || price > 1e9) {
    return res.status(400).json({ error: true, message: 'targetPrice must be a positive number' });
  }
  if (countAlertsByUser(req.user.id) >= MAX_ALERTS_PER_USER) {
    return res.status(400).json({ error: true, message: `You can have at most ${MAX_ALERTS_PER_USER} alerts.` });
  }

  const alert = createAlert(req.user.id, ticker, price, direction);
  res.status(201).json(normalize(alert));
});

// DELETE /api/alerts/:id — delete one of the caller's alerts
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: true, message: 'Invalid alert id.' });

  // 404 for both "doesn't exist" and "belongs to someone else" so ids can't be probed
  if (!getAlertForUser(id, req.user.id)) {
    return res.status(404).json({ error: true, message: 'Alert not found.' });
  }
  deleteAlertForUser(id, req.user.id);
  res.json({ success: true });
});

module.exports = router;
