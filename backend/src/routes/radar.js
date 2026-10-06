const express = require('express');
const router = express.Router();
const { getRadarDb } = require('../radar/db');
const { runReport } = require('../radar/report');
const { requireAdminSecret } = require('../middleware/validate');

// Research endpoints — admin only. Never expose raw signal scores/reports publicly until the stats justify it.
router.use(requireAdminSecret);

router.get('/status', (req, res) => {
  const db = getRadarDb();
  const now = Math.floor(Date.now() / 1000);
  res.json({
    enabled: process.env.ENABLE_RADAR === 'true',
    tokens: db.prepare('SELECT COUNT(*) c FROM token').get().c,
    tracking: db.prepare('SELECT COUNT(*) c FROM token WHERE dead_ts IS NULL AND ? - pool_created_ts < 86400').get(now).c,
    deadGone: db.prepare("SELECT COUNT(*) c FROM token WHERE dead_reason = 'gone'").get().c,
    deadInactive: db.prepare("SELECT COUNT(*) c FROM token WHERE dead_reason = 'inactive'").get().c,
    graduated: db.prepare('SELECT COUNT(*) c FROM token WHERE migrated_ts IS NOT NULL').get().c,
    securityChecked: db.prepare('SELECT COUNT(DISTINCT token_address) c FROM token_security').get().c,
    medianDiscoveryLagSec: (() => {
      const lags = db.prepare('SELECT first_seen_ts - pool_created_ts d FROM token ORDER BY d').all().map((r) => r.d);
      return lags.length ? lags[lags.length >> 1] : null;
    })(),
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

// GET /api/radar/report?threshold=70&size=100&sinceHours=48&models=market_v1,market_v1_safe&horizons=15,60&tpsl=0
router.get('/report', (req, res, next) => {
  try {
    const q = req.query;
    res.json(runReport({
      threshold: q.threshold ? Number(q.threshold) : undefined,
      sizeUsd: q.size ? Number(q.size) : undefined,
      sinceHours: q.sinceHours ? Number(q.sinceHours) : null,
      models: q.models ? String(q.models).split(',') : undefined,
      horizons: q.horizons ? String(q.horizons).split(',').map(Number) : undefined,
      includeTpsl: q.tpsl !== '0',
    }));
  } catch (err) { next(err); }
});

module.exports = router;
