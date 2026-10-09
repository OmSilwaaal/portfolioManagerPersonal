const axios = require('axios');

function sessionMiddleware(req, res, next) {
  req.sessionId = req.headers['x-session-id'] || null;
  next();
}

// Verifies the Supabase JWT sent as "Authorization: Bearer <token>"
// Rejects unauthenticated requests before they can trigger AI calls
async function requireAuth(req, res, next) {
  // Routes are mounted behind requireAuth at the app level AND per-route; verify the token only once
  if (req.user) return next();

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: true, message: 'Authentication required.' });
  }

  const token = authHeader.slice(7).trim();
  if (!token || token.length > 4096) {
    return res.status(401).json({ error: true, message: 'Authentication required.' });
  }
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    // If Supabase env vars aren't set, fail closed (deny rather than allow)
    console.error('SUPABASE_URL or SUPABASE_ANON_KEY not set — cannot verify auth');
    return res.status(503).json({ error: true, message: 'Auth service not configured.' });
  }

  try {
    const { data } = await axios.get(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
      },
      timeout: 5000,
    });
    if (!data?.id) {
      return res.status(401).json({ error: true, message: 'Invalid or expired session. Please sign in again.' });
    }
    req.user = data;
    next();
  } catch {
    return res.status(401).json({ error: true, message: 'Invalid or expired session. Please sign in again.' });
  }
}

/**
 * Attaches req.user when a valid session is presented, and carries on when it
 * is not. For public endpoints that still want to know who is asking — the
 * winners board shows everyone the same rows, but only tells a signed-in
 * caller which of them are theirs.
 */
async function optionalAuth(req, res, next) {
  if (req.user || !req.headers.authorization?.startsWith('Bearer ')) return next()
  const fakeRes = { status: () => ({ json: () => {} }) }   // swallow the 401 path
  try { await requireAuth(req, fakeRes, () => {}) } catch { /* anonymous */ }
  next()
}

// Validates ticker/symbol path params — only A-Z, 0-9, dash, dot, colon; max 15 chars
function validateTicker(param = 'ticker') {
  return (req, res, next) => {
    const value = req.params[param];
    if (value && !/^[A-Za-z0-9:.\-]{1,15}$/.test(value)) {
      return res.status(400).json({ error: true, message: 'Invalid ticker symbol.' });
    }
    next();
  };
}

module.exports = { sessionMiddleware, requireAuth, optionalAuth, validateTicker };
