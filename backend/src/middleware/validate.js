const crypto = require('crypto');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TICKER_RE = /^[A-Za-z0-9:.\-]{1,15}$/;

const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);
const isTicker = (v) => typeof v === 'string' && TICKER_RE.test(v);

// Constant-time string comparison (avoids leaking secret prefix via response timing)
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Only allow plain http(s) URLs (blocks javascript:, data:, etc.) — returns the URL or null
function safeHttpUrl(v, maxLen = 500) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s || s.length > maxLen) return null;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:' ? s : null;
  } catch {
    return null;
  }
}

module.exports = { isUuid, isTicker, safeEqual, safeHttpUrl };

// Express middleware: requires header `x-admin-secret` to match ADMIN_SECRET (constant-time compare)
function requireAdminSecret(req, res, next) {
  const secret = process.env.ADMIN_SECRET;
  const provided = req.headers['x-admin-secret'];
  if (!secret || typeof provided !== 'string' || !safeEqual(provided, secret)) {
    return res.status(403).json({ error: true, message: 'Forbidden.' });
  }
  next();
}

module.exports.requireAdminSecret = requireAdminSecret;
