const express = require('express');
const router = express.Router();
const { getRadarDb } = require('../radar/db');
const { runReport } = require('../radar/report');

// Research endpoints — admin only. Never expose raw signal scores/reports publicly until the stats justify it.
router.use((req, res, next) => {
  const secret = process.env.ADMIN_SECRET;
  if (!secret || req.headers['x-admin-secret'] !== secret) {
    return res.status(403).json({ error: true, message: 'Forbidden.' });
  }
  next();
});

router.get('/status', (req, res) => {
  const db = getRadarDb();
  const now = Math.floor(Date.now() / 1000);
  res.json({
    enabled: process.env.ENABLE_RADAR === 'true',
    tokens: db.prepare('SELECT COUNT(*) c FROM token').get().c,
    dead: db.prepare('SELECT COUNT(*) c FROM token WHERE dead_ts IS NOT NULL').get().c,
    snapshots: db.prepare('SELECT COUNT(*) c FROM market_snapshot').get().c,
    firstSnapshotAgeHours: (() => {
      const r = db.prepare('SELECT MIN(ts) m FROM market_snapshot').get().m;
      return r ? +((now - r) / 3600).toFixed(1) : null;
    })(),
    lastSnapshotAgeSec: (() => {
      const r = db.prepare('SELECT MAX(ts) m FROM market_snapshot').get().m;
      return r ? now - r : null;
    })(),
  });
});

// GET /api/radar/report?threshold=70&size=100&sinceHours=48&models=market_v1,buy_only&horizons=15,60
router.get('/report', (req, res, next) => {
  try {
    const q = req.query;
    res.json(runReport({
      threshold: q.threshold ? Number(q.threshold) : undefined,
      sizeUsd: q.size ? Number(q.size) : undefined,
      sinceHours: q.sinceHours ? Number(q.sinceHours) : null,
      models: q.models ? String(q.models).split(',') : undefined,
      horizons: q.horizons ? String(q.horizons).split(',').map(Number) : undefined,
    }));
  } catch (err) { next(err); }
});

module.exports = router;
