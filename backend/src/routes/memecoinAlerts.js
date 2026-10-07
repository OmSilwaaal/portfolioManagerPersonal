// Per-user memecoin alert preferences and the in-app alert feed.
const express = require('express');
const router = express.Router();
const {
  getMemeAlertPrefs,
  upsertMemeAlertPrefs,
  listMemeAlertEvents,
  markMemeAlertsRead,
} = require('../db/queries');
const { DEFAULT_PREFS, normalisePrefs } = require('../services/memecoinAlerts');
const { getSettings, isConfigured } = require('../services/sms');

const BOUNDS = {
  move_pct_5m: [1, 1000],
  move_pct_1h: [1, 5000],
  min_score: [1, 100],
  min_confidence: [0, 1],
  min_liquidity: [0, 100_000_000],
  cooldown_min: [1, 1440],
};

const shape = (row) => {
  const p = normalisePrefs(row);
  return {
    enabled: p.enabled,
    sms: p.sms,
    movePct5m: p.move_pct_5m,
    movePct1h: p.move_pct_1h,
    minScore: p.min_score,
    minConfidence: p.min_confidence,
    minLiquidity: p.min_liquidity,
    cooldownMin: p.cooldown_min,
  };
};

const shapeEvent = (e) => ({
  id: String(e.id),
  address: e.address,
  symbol: e.symbol,
  kind: e.kind,
  direction: e.direction,
  window: e.window,
  changePct: e.change_pct,
  score: e.score,
  confidence: e.confidence,
  message: e.message,
  createdAt: e.created_ts,
  read: e.read_ts != null,
});

// GET /api/memecoin-alerts/prefs
router.get('/prefs', (req, res) => {
  const row = getMemeAlertPrefs(req.user.id);
  res.json({
    prefs: shape(row),
    // The UI needs to know whether offering SMS is even meaningful.
    sms: {
      available: isConfigured(),
      verified: Boolean(getSettings(req.user.id)?.verified),
    },
    isDefault: row === null,
  });
});

// PUT /api/memecoin-alerts/prefs
router.put('/prefs', (req, res) => {
  const b = req.body || {};
  const pick = (camel) => b[camel];

  const incoming = {
    enabled: b.enabled === undefined ? undefined : (b.enabled ? 1 : 0),
    sms: b.sms === undefined ? undefined : (b.sms ? 1 : 0),
    move_pct_5m: pick('movePct5m'),
    move_pct_1h: pick('movePct1h'),
    min_score: pick('minScore'),
    min_confidence: pick('minConfidence'),
    min_liquidity: pick('minLiquidity'),
    cooldown_min: pick('cooldownMin'),
  };

  for (const [key, [lo, hi]] of Object.entries(BOUNDS)) {
    const v = incoming[key];
    if (v === undefined) continue;
    const n = Number(v);
    if (!Number.isFinite(n) || n < lo || n > hi) {
      return res.status(400).json({ error: `${key} must be a number between ${lo} and ${hi}` });
    }
    incoming[key] = n;
  }

  // Merge over what is stored (or the defaults) so a partial update is safe.
  const current = { ...DEFAULT_PREFS, ...(getMemeAlertPrefs(req.user.id) || {}) };
  const merged = { ...current };
  for (const [k, v] of Object.entries(incoming)) if (v !== undefined) merged[k] = v;
  delete merged.user_id;
  delete merged.updated_at;

  // SMS can only be switched on once a phone is verified, or alerts would silently drop.
  if (merged.sms === 1 && !getSettings(req.user.id)?.verified) {
    return res.status(409).json({ error: 'Verify a phone number in Settings before enabling SMS alerts' });
  }

  res.json({ prefs: shape(upsertMemeAlertPrefs(req.user.id, merged)) });
});

// GET /api/memecoin-alerts/events?limit=50
router.get('/events', (req, res) => {
  const events = listMemeAlertEvents(req.user.id, req.query.limit).map(shapeEvent);
  res.json({ events, unread: events.filter((e) => !e.read).length });
});

// POST /api/memecoin-alerts/read  { before?: epochMs }
router.post('/read', (req, res) => {
  const before = Number(req.body?.before);
  const ts = Number.isFinite(before) ? before : Date.now();
  res.json({ marked: markMemeAlertsRead(req.user.id, ts) });
});

module.exports = router;
