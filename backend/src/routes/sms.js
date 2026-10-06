const express = require('express');
const router = express.Router();
const sms = require('../services/sms');

// Per-user ceiling on texts that cost money (codes + tests). The per-IP limiter alone can't stop one account
// hammering Twilio from many IPs, and a verification code to an arbitrary number is the classic SMS-pumping vector.
const sendLog = new Map();
function underSendLimit(userId, max = 5, windowMs = 60 * 60 * 1000) {
  const now = Date.now();
  const recent = (sendLog.get(userId) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) { sendLog.set(userId, recent); return false; }
  recent.push(now);
  sendLog.set(userId, recent);
  return true;
}
const TOO_MANY = { error: true, message: 'Too many text requests. Please try again in an hour.' };

// Normalises user input to E.164. Bare 10-digit numbers are assumed to be US/Canada; anything else needs a "+" prefix.
function toE164(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');
  const candidate = trimmed.startsWith('+') ? `+${digits}` : digits.length === 10 ? `+1${digits}` : null;
  return candidate && sms.E164_RE.test(candidate) ? candidate : null;
}

function status(userId) {
  const s = sms.getSettings(userId);
  return {
    configured: sms.isConfigured(),
    verified: Boolean(s?.verified),
    phoneLast4: s?.verified ? s.phone_last4 : null,
    priceAlerts: s ? Boolean(s.price_alerts) : false,
  };
}

// GET /api/sms — current SMS state for the caller (never returns the full number)
router.get('/', (req, res) => {
  res.json(status(req.user.id));
});

// POST /api/sms/send-code { phone }
router.post('/send-code', async (req, res) => {
  if (!sms.isConfigured()) return res.status(503).json({ error: true, message: 'Text alerts are not available yet.' });
  const phone = toE164(req.body?.phone);
  if (!phone) {
    return res.status(400).json({ error: true, message: 'Enter a valid phone number with country code, e.g. +1 555 123 4567.' });
  }
  if (!underSendLimit(req.user.id)) return res.status(429).json(TOO_MANY);
  try {
    await sms.startVerification(phone);
    res.json({ success: true });
  } catch (err) {
    console.error('[sms] send-code failed:', err.message);
    res.status(502).json({ error: true, message: "We couldn't send a code to that number. Check it and try again." });
  }
});

// POST /api/sms/verify { phone, code }
router.post('/verify', async (req, res) => {
  if (!sms.isConfigured()) return res.status(503).json({ error: true, message: 'Text alerts are not available yet.' });
  const phone = toE164(req.body?.phone);
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  if (!phone || !/^\d{4,10}$/.test(code)) {
    return res.status(400).json({ error: true, message: 'Enter the code we texted you.' });
  }
  try {
    const ok = await sms.checkVerification(phone, code);
    if (!ok) return res.status(400).json({ error: true, message: 'That code is incorrect or has expired.' });
    sms.saveVerifiedPhone(req.user.id, phone);
    res.json(status(req.user.id));
  } catch (err) {
    // Twilio answers 404 once a verification has expired or been used up
    const expired = err.status === 404 || err.twilioCode === 20404;
    res.status(400).json({ error: true, message: expired ? 'That code has expired. Request a new one.' : 'Could not verify that code.' });
  }
});

// PATCH /api/sms { priceAlerts }
router.patch('/', (req, res) => {
  if (typeof req.body?.priceAlerts !== 'boolean') {
    return res.status(400).json({ error: true, message: 'priceAlerts must be true or false.' });
  }
  if (!sms.getSettings(req.user.id)?.verified) {
    return res.status(400).json({ error: true, message: 'Verify a phone number first.' });
  }
  sms.setPriceAlerts(req.user.id, req.body.priceAlerts);
  res.json(status(req.user.id));
});

// POST /api/sms/test — sends a sample text so the user can confirm it works
router.post('/test', async (req, res) => {
  if (!underSendLimit(req.user.id)) return res.status(429).json(TOO_MANY);
  const sent = await sms.notifyUser(req.user.id, 'Travauxus: text alerts are on. You\'ll get a message here when a price alert hits. Reply STOP to opt out.');
  if (!sent) return res.status(400).json({ error: true, message: "Couldn't send a test text. Check your number and try again." });
  res.json({ success: true });
});

// DELETE /api/sms — remove the number
router.delete('/', (req, res) => {
  sms.removePhone(req.user.id);
  res.json(status(req.user.id));
});

module.exports = router;
