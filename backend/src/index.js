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
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { sessionMiddleware } = require('./middleware/auth');

// Initialize DB on startup
require('./db/schema').getDb();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
}));
app.use(express.json());
app.use(sessionMiddleware);

// Rate limiting: 30 requests per minute per IP
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: true,
    message: 'Too many requests. Please wait a moment and try again.',
  },
});
app.use('/api', limiter);

// Routes
app.use('/api/stocks', stocksRouter);
app.use('/api/crypto', cryptoRouter);
app.use('/api/feed', feedRouter);
app.use('/api/calendar', calendarRouter);
app.use('/api/portfolio', portfolioRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api/gov-trades', govTradesRouter);
app.use('/api/commodities', commoditiesRouter);
app.use('/api/preferences', preferencesRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handlers
app.use(notFoundHandler);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Market Intelligence API running on http://localhost:${PORT}`);
});

module.exports = app;
