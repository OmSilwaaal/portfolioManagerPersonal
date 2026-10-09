require('dotenv').config();
// Polyfill WebSocket for Node 20 (required by Supabase, @solana/web3.js, etc.)
if (typeof globalThis.WebSocket === 'undefined') {
  const ws = require('ws');
  global.WebSocket = ws;
  globalThis.WebSocket = ws;
}
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const stocksRouter = require('./routes/stocks');
const cryptoRouter = require('./routes/crypto');
const feedRouter = require('./routes/feed');
const calendarRouter = require('./routes/calendar');
const portfolioRouter = require('./routes/portfolio');
const alertsRouter = require('./routes/alerts');
const smsRouter = require('./routes/sms');
const friendsRouter = require('./routes/friends');
const messagesRouter = require('./routes/messages');
const winnersRouter = require('./routes/winners');
const referralsRouter = require('./routes/referrals');
const { manage: recoveryRouter, signIn: recoverSignInRouter } = require('./routes/recovery');
const govTradesRouter = require('./routes/govTrades');
const radarRouter = require('./routes/radar');
const commoditiesRouter = require('./routes/commodities');
const preferencesRouter = require('./routes/preferences');
const searchRouter = require('./routes/search');
const { router: paperTradingRouter } = require('./routes/paperTrading');
const clansRouter = require('./routes/clans');
const eloRouter = require('./routes/elo');
const profilesRouter = require('./routes/profiles');
const notificationsRouter = require('./routes/notifications');
const { router: explainRouter } = require('./routes/stockExplainer');
const { router: stripeRouter } = require('./routes/stripe');
const snaptradeRouter = require('./routes/snaptrade');
const portfolioImportRouter = require('./routes/portfolioImport');
const userRouter = require('./routes/user');
const memecoinsRouter = require('./routes/memecoins');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { sessionMiddleware, requireAuth } = require('./middleware/auth');

// Initialize DB on startup, then keep rotating backups of it beside it on the volume
require('./db/backup').startBackups(require('./db/schema').getDb());
const { warmCoinList } = require('./services/search');
warmCoinList();
const { startAlertPoller } = require('./services/alertPoller');
startAlertPoller();
const { startMemecoinAlertPoller } = require('./services/memecoinAlertPoller');
startMemecoinAlertPoller();

// High-speed Solana pipeline — experimental/mock code (random triggers, throwaway keypairs).
// Opt-in only; never runs unless ENABLE_SOLANA_PIPELINE=true.
if (process.env.ENABLE_SOLANA_PIPELINE === 'true') {
  const { startGrpcStreamer } = require('./services/grpcStreamer');
  const { watchRedisForAlpha } = require('./services/executionEngine');
  startGrpcStreamer().catch(err => console.error('[GRPC STREAMER] Init Error:', err));
  watchRedisForAlpha();
}

// New pump.fun launches from Helius into the live stream. Opt-in via ENABLE_HELIUS_LAUNCHES=true
// (and a key); without both, the server behaves exactly as it did. Only polls while someone
// is actually holding the stream open.
require('./services/heliusLaunches').startHeliusLaunches({
  onLaunch: (launch) => require('./services/memecoinStream').pushLaunch(launch),
  hasListeners: () => require('./services/memecoinStream').stats().clients > 0,
});

// Memecoin radar collector (Solana new pools → snapshots). Opt-in via ENABLE_RADAR=true.
require('./radar').startRadar();
// Enable the optional smart-money / social radar feature groups when their collectors are on (RADAR_EXTRA_FEATURES=off disables)
try { require('./radar').configureExtraFeatures(); } catch (err) { console.error('[radar] extra features not configured:', err.message); }
require('./services/snapshotCollector').startSnapshotCollector();

const app = express();
const PORT = process.env.PORT || 3001;
const isProd = process.env.NODE_ENV === 'production';

// Behind Railway/Vercel proxies: trust the first hop so rate limiting keys on the real client IP
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({
  // This is a JSON API — lock down everything; nothing here should ever be framed or script-executed
  contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // frontend (different origin) must read responses
}));

// ── CORS ──────────────────────────────────────────────────────────────────────
// Explicit allow-list. Add more origins via CORS_EXTRA_ORIGINS (comma-separated).
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  process.env.FRONTEND_URL,
  process.env.FRONTEND_URL_WWW,
  'https://travauxus.com',
  'https://www.travauxus.com',
  ...(process.env.CORS_EXTRA_ORIGINS || '').split(',').map((o) => o.trim()),
].filter(Boolean);

// Wildcard preview-deployment origins are only allowed outside production —
// anyone can host an app on *.vercel.app / *.railway.app.
const previewPatterns = isProd ? [] : [
  /^https:\/\/.*\.railway\.app$/,
  /^https:\/\/.*\.vercel\.app$/,
];

app.use(cors({
  origin: (origin, callback) => {
    // No Origin header = curl / server-to-server / Stripe webhooks (auth is via Bearer token or signature)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    if (previewPatterns.some(re => re.test(origin))) return callback(null, true);
    callback(null, false); // omit CORS headers rather than throwing a 500
  },
}));
// Raw body for webhook signature verification — MUST come before express.json()
app.use('/api/paper-trading/webhook', express.raw({ type: 'application/json' }))
app.use('/api/stripe/pro-webhook', express.raw({ type: 'application/json' }))
app.use(express.json({ limit: '60kb' })); // cap request body size (profile avatars are ~45KB max)
app.use(sessionMiddleware);

// ── LIVE STREAM ───────────────────────────────────────────────────────────────
// Mounted ahead of the limiters on purpose: a connection the browser holds open for
// minutes must not spend the 60 req/min budget that the rest of the terminal needs.
// It carries public market data only (the same trending/new/token/candle/trade payloads
// the public-ish REST routes return), so it needs no session, and it enforces its own
// per-IP connection cap instead — see services/memecoinStream.
const memecoinStream = require('./services/memecoinStream');
app.get('/api/memecoins/stream', memecoinStream.handler);

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

// Brute-force / abuse targets
const joinLimiter = makeLimiter(15 * 60 * 1000, 20, 'Too many attempts. Please try again later.');
const promoLimiter = makeLimiter(15 * 60 * 1000, 10, 'Too many attempts. Please try again later.');
const destructiveLimiter = makeLimiter(60 * 60 * 1000, 5, 'Too many requests. Please try again later.');
const tradeLimiter = makeLimiter(60 * 1000, 30, 'Too many trade requests. Please slow down.');
// Every code / test text costs real money — keep these tight
const smsSendLimiter = makeLimiter(60 * 60 * 1000, 6, 'Too many text requests. Please try again in an hour.');
// Phrase sign-in is a credential-guessing target; friend search is a user-enumeration target
const recoverLimiter = makeLimiter(15 * 60 * 1000, 8, 'Too many attempts. Please try again later.');
const friendSearchLimiter = makeLimiter(60 * 1000, 30, 'Searching too fast. Please slow down.');
const referralLimiter = makeLimiter(60 * 60 * 1000, 10, 'Too many attempts. Please try again later.');
const recoveryCreateLimiter = makeLimiter(60 * 60 * 1000, 6, 'Too many requests. Please try again later.');
const smsVerifyLimiter = makeLimiter(15 * 60 * 1000, 10, 'Too many attempts. Please try again later.');

app.use('/api', globalLimiter);
app.use('/api/clans/:id/join', joinLimiter);
app.use('/api/stripe/redeem-code', promoLimiter);
app.use('/api/user', destructiveLimiter);
app.use('/api/recover/login', recoverLimiter);
app.use('/api/friends/search', friendSearchLimiter);
app.use('/api/referrals/redeem', referralLimiter);
app.post('/api/recovery', recoveryCreateLimiter);
app.use('/api/sms/send-code', smsSendLimiter);
app.use('/api/sms/test', smsSendLimiter);
app.use('/api/sms/verify', smsVerifyLimiter);
app.use('/api/paper-trading/buy', tradeLimiter);
app.use('/api/paper-trading/sell', tradeLimiter);
app.use('/api/paper-trading/purchase-cash', tradeLimiter);

// ── ROUTES ────────────────────────────────────────────────────────────────────

// AI-heavy routes — require valid Supabase session + tight rate limits
app.use('/api/feed', feedLimiter, requireAuth, feedRouter);
app.use('/api/stocks', aiLimiter, requireAuth, stocksRouter);
app.use('/api/crypto', aiLimiter, requireAuth, cryptoRouter);
app.use('/api/commodities', commoditiesLimiter, requireAuth, commoditiesRouter);
app.use('/api/gov-trades', aiLimiter, requireAuth, govTradesRouter);
app.use('/api/radar', radarRouter); // admin-secret protected inside the router

// Lower-cost routes — still require auth to prevent enumeration
app.use('/api/alerts', requireAuth, alertsRouter);
app.use('/api/memecoin-alerts', requireAuth, require('./routes/memecoinAlerts'));
app.use('/api/sms', requireAuth, smsRouter);
app.use('/api/friends', requireAuth, friendsRouter);
app.use('/api/messages', requireAuth, messagesRouter);
app.use('/api/referrals', requireAuth, referralsRouter);
app.use('/api/recovery', recoveryRouter);
app.use('/api/recover', recoverSignInRouter); // public: signing in with a recovery phrase
app.use('/api/preferences', requireAuth, preferencesRouter);
app.use('/api/portfolio', requireAuth, portfolioRouter);

// Public routes — no auth needed
// The winners board is the public shop window: handles, calling cards and
// profit on the biggest paper trades. Nothing here is private to an account.
app.use('/api/winners', winnersRouter);
app.use('/api/calendar', calendarRouter);
app.use('/api/search', searchRouter);
app.use('/api/paper-trading', paperTradingRouter);
app.use('/api/clans', requireAuth, clansRouter);
app.use('/api/elo', requireAuth, eloRouter);
app.use('/api/profiles', requireAuth, profilesRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/explain', aiLimiter, explainRouter);
app.use('/api/stripe', stripeRouter);
app.use('/api/snaptrade', requireAuth, snaptradeRouter);
app.use('/api/portfolio-import', requireAuth, portfolioImportRouter);
app.use('/api/user', requireAuth, userRouter);
app.use('/api/memecoins', requireAuth, memecoinsRouter);
app.use('/api/research/eval', requireAuth, require('./routes/researchEval'));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handlers
app.use(notFoundHandler);
app.use(errorHandler);

// ── RESEARCH COLLECTORS (each is off unless its env flag is set) ──────────────
try {
  const { getDb: getResearchDb } = require('./db/schema');
  const rdb = getResearchDb();
  const { initWalletSchema } = require('./research/wallets/schema');
  const { initSocialSchema } = require('./research/social/schema');
  const { initEvalSchema } = require('./research/eval/schema');
  initWalletSchema(rdb); initSocialSchema(rdb); initEvalSchema(rdb);
  require('./research/wallets/collector').start(rdb);
  const socialOn = require('./research/social/collector').start(rdb, {
    skilledWalletIds: () => rdb.prepare(
      'SELECT DISTINCT wallet_id FROM wallet_skill_snapshot WHERE passed_holdout = 1'
    ).all().map((r) => r.wallet_id),
    knownTokens: () => rdb.prepare('SELECT contract_address AS address, symbol FROM token').all(),
  });
  console.log(`[social] collector ${socialOn ? 'started' : 'disabled (SOCIAL_COLLECTOR != 1)'}`);
  console.log(`[eval] hourly job ${require('./research/eval/report').start(rdb) ? 'started' : 'disabled (EVAL_JOB != 1)'}`);
  console.log(`[winnerFirst] job ${require('./research/eval/winnerFirst').start(() => require('./radar/db').getRadarDb(), rdb) ? 'started' : 'disabled (WINNER_FIRST_JOB != 1)'}`);
  // one compact "what is on / is data flowing" block at startup and every 30 min (RESEARCH_SELFCHECK_MS=0 disables)
  require('./research/selfCheck').start({
    getContext: () => {
      const feat = require('./radar/features');
      const src = typeof feat.getExtraSource === 'function' ? feat.getExtraSource() : null;
      return { db: rdb, extraGroups: src ? src.groups : [], liveModel: src ? feat.liveModelFor(src.groups) : 'market_v2' };
    },
  });
} catch (err) {
  console.error('[research] failed to start collectors:', err.message);
}

app.listen(PORT, () => {
  console.log(`Market Intelligence API running on http://localhost:${PORT}`);
});

module.exports = app;

