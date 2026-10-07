const express = require('express');
const router = express.Router();
const { getRadarDb } = require('../radar/db');
const { runReport, latencySweep } = require('../radar/report');
const stream = require('../radar/stream');
const { requireAdminSecret } = require('../middleware/validate');

const { requireAuth } = require('../middleware/auth');
const radarSignals = require('../services/radarSignals');

// User-facing signal endpoints (logged-in users, same as /api/memecoins). Declared BEFORE the admin gate below.
// When the radar is off or empty they answer 200 {enabled:false, reason} so the terminal can show a hint.
// GET /api/radar/signals?sort=score|new&limit=30&maxAgeHours=24&minScore=40&safeOnly=1
router.get('/signals', requireAuth, (req, res) => {
  const q = req.query;
  res.json(radarSignals.listSignals({
    sort: q.sort === 'new' ? 'new' : 'score',
    limit: q.limit, maxAgeHours: q.maxAgeHours,
    minScore: q.minScore !== undefined && q.minScore !== '' && !Number.isNaN(Number(q.minScore)) ? Number(q.minScore) : null,
    safeOnly: q.safeOnly === '1' || q.safeOnly === 'true',
  }));
});

router.get('/token/:address', requireAuth, (req, res) => {
  const a = String(req.params.address || '');
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a)) return res.status(400).json({ error: true, message: 'Invalid Solana address' });
  res.json(radarSignals.getSignal(a));
});

// Research endpoints below — admin only. Never expose raw reports publicly until the stats justify it.
router.use(requireAdminSecret);

router.get('/status', (req, res) => {
  const db = getRadarDb();
  const now = Math.floor(Date.now() / 1000);
  res.json({
    enabled: process.env.ENABLE_RADAR === 'true',
    pumpportal: stream.status(),
    launchesLastHour: db.prepare('SELECT COUNT(*) c FROM token WHERE first_seen_ts > ?').get(now - 3600).c,
    promosSeen: db.prepare('SELECT COUNT(*) c FROM token_promo').get().c,
    metadataFetched: db.prepare('SELECT COUNT(*) c FROM token_launch WHERE meta_ts IS NOT NULL').get().c,
    tradesStored: db.prepare('SELECT COUNT(*) c FROM trade').get().c,
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
      latencySec: q.latency ? Number(q.latency) : undefined,
      sinceHours: q.sinceHours ? Number(q.sinceHours) : null,
      models: q.models ? String(q.models).split(',') : undefined,
      horizons: q.horizons ? String(q.horizons).split(',').map(Number) : undefined,
      includeTpsl: q.tpsl !== '0',
    }));
  } catch (err) { next(err); }
});

// GET /api/radar/latency?model=market_v1_safe&strategy=60m — edge vs. how late you act (5s … 5min)
router.get('/latency', (req, res, next) => {
  try {
    const q = req.query;
    res.json(latencySweep({
      model: q.model || undefined, strategy: q.strategy || undefined,
      sinceHours: q.sinceHours ? Number(q.sinceHours) : null,
      threshold: q.threshold ? Number(q.threshold) : undefined,
    }));
  } catch (err) { next(err); }
});

module.exports = router;
