const express = require('express');
const router = express.Router();
const referrals = require('../services/referrals');

// GET /api/referrals/me — your code and how many people used it
router.get('/me', (req, res) => {
  res.json({ code: referrals.getOrCreateCode(req.user.id), ...referrals.getStats(req.user.id) });
});

// POST /api/referrals/redeem { code }
router.post('/redeem', async (req, res) => {
  if (typeof req.body?.code !== 'string' || req.body.code.length > 40) {
    return res.status(400).json({ error: true, message: 'That code is not valid.' });
  }
  const result = await referrals.redeem(req.user.id, req.body.code, req.user.created_at);
  if (!result.ok) return res.status(result.status).json({ error: true, message: result.message });
  res.json({ success: true, proUntil: result.proUntil, days: result.days });
});

module.exports = router;
