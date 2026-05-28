require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const stocksRouter = require('./routes/stocks');
const cryptoRouter = require('./routes/crypto');
const feedRouter = require('./routes/feed');
const calendarRouter = require('./routes/calendar');
const portfolioRouter = require('./routes/portfolio');
const alertsRouter = require('./routes/alerts');
const govTradesRouter = require('./routes/govTrades');
const commoditiesRouter = require('./routes/commodities');
const preferencesRouter = require('./routes/preferences');
const searchRouter = require('./routes/search');
const { router: paperTradingRouter } = require('./routes/paperTrading');
const groupsRouter = require('./routes/groups');
const profilesRouter = require('./routes/profiles');
const notificationsRouter = require('./routes/notifications');
const { router: explainRouter } = require('./routes/stockExplainer');
const { router: stripeRouter } = require('./routes/stripe');
const snaptradeRouter = require('./routes/snaptrade');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { sessionMiddleware, requireAuth } = require('./middleware/auth');
const { getBudgetStatus } = require('./services/claude');

// Initialize DB on startup
require('./db/schema').getDb();
const { warmCoinList } = require('./services/search');
warmCoinList();
const { startAlertPoller } = require('./services/alertPoller');
startAlertPoller();

const app = express();
const PORT = process.env.PORT || 3001;

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  process.env.FRONTEND_URL,
  process.env.FRONTEND_URL_WWW,
  // Always allow both www and non-www variants of travauxus.com
  'https://travauxus.com',
  'https://www.travauxus.com',
].filter(Boolean);

app.use(cors({ origin: allowedOrigins, credentials: true }));
// Raw body for webhook signature verification — MUST come before express.json()
app.use('/api/paper-trading/webhook', express.raw({ type: 'application/json' }))
app.use('/api/stripe/pro-webhook', express.raw({ type: 'application/json' }))
app.use(express.json({ limit: '50kb' })); // cap request body size
app.use(sessionMiddleware);

// ── RATE LIMITERS ─────────────────────────────────────────────────────────────
function makeLimiter(windowMs, max, message) {
  return rateLimit({ windowMs, max, standardHeaders: true, legacyHeaders: false, message: { error: true, message } });
}

// Global safety net — 60 req/min per IP across all routes
const globalLimiter = makeLimiter(60 * 1000, 60, 'Too many requests. Please slow down.');

// Feed: cached for 5 min, so 3 requests per 5 min per IP is plenty
const feedLimiter = makeLimiter(5 * 60 * 1000, 3, 'Too many feed requests. Try again in a few minutes.');

// Per-ticker AI routes: 10 per minute per IP
const aiLimiter = makeLimiter(60 * 1000, 10, 'Too many requests. Please wait a moment and try again.');

// Commodities: 3 per minute (each call triggers multiple Claude requests)
const commoditiesLimiter = makeLimiter(60 * 1000, 3, 'Too many commodities requests. Please wait a moment.');

app.use('/api', globalLimiter);

// ── ROUTES ────────────────────────────────────────────────────────────────────

// AI-heavy routes — require valid Supabase session + tight rate limits
app.use('/api/feed', feedLimiter, requireAuth, feedRouter);
app.use('/api/stocks', aiLimiter, requireAuth, stocksRouter);
app.use('/api/crypto', aiLimiter, requireAuth, cryptoRouter);
app.use('/api/commodities', commoditiesLimiter, requireAuth, commoditiesRouter);
app.use('/api/gov-trades', aiLimiter, requireAuth, govTradesRouter);

// Lower-cost routes — still require auth to prevent enumeration
app.use('/api/alerts', requireAuth, alertsRouter);
app.use('/api/preferences', requireAuth, preferencesRouter);
app.use('/api/portfolio', requireAuth, portfolioRouter);

// Public routes — no auth needed
app.use('/api/calendar', calendarRouter);
app.use('/api/search', searchRouter);
app.use('/api/paper-trading', paperTradingRouter);
app.use('/api/groups', requireAuth, groupsRouter);
app.use('/api/profiles', requireAuth, profilesRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/explain', aiLimiter, explainRouter);
app.use('/api/stripe', stripeRouter);
app.use('/api/snaptrade', requireAuth, snaptradeRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), budget: getBudgetStatus() });
});

// Error handlers
app.use(notFoundHandler);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Market Intelligence API running on http://localhost:${PORT}`);
});

module.exports = app;

