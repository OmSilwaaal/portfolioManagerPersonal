const express = require('express');
const router = express.Router();
const { getAllAlerts, createAlert, deleteAlert, getAlertById } = require('../db/queries');

// GET /api/alerts — list all alerts
router.get('/', (req, res) => {
  const alerts = getAllAlerts();
  const normalized = alerts.map((a) => ({
    id: String(a.id),
    ticker: a.ticker,
    targetPrice: a.targetPrice,
    direction: a.direction,
    createdAt: a.createdAt,
    triggered: a.triggered === 1,
  }));
  res.json({ alerts: normalized });
});

// POST /api/alerts — create a new alert
router.post('/', (req, res) => {
  const { ticker, targetPrice, direction } = req.body;

  if (!ticker || !targetPrice || !direction) {
    return res.status(400).json({
      error: true,
      message: 'Missing required fields: ticker, targetPrice, direction',
    });
  }

  if (!['above', 'below'].includes(direction)) {
    return res.status(400).json({
      error: true,
      message: 'direction must be "above" or "below"',
    });
  }

  const price = parseFloat(targetPrice);
  if (isNaN(price) || price <= 0) {
    return res.status(400).json({
      error: true,
      message: 'targetPrice must be a positive number',
    });
  }

  const alert = createAlert(ticker, price, direction);
  res.status(201).json({
    id: String(alert.id),
    ticker: alert.ticker,
    targetPrice: alert.targetPrice,
    direction: alert.direction,
    createdAt: alert.createdAt,
    triggered: alert.triggered === 1,
  });
});


// DELETE /api/alerts/:id — delete an alert
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const existing = getAlertById(parseInt(id, 10));

  if (!existing) {
    return res.status(404).json({
      error: true,
      message: `Alert with id ${id} not found`,
    });
  }

  deleteAlert(parseInt(id, 10));
  res.json({ success: true, message: `Alert ${id} deleted` });
});

module.exports = router;
