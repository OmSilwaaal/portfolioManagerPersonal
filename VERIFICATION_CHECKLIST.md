# Verification Checklist — Market Intelligence App

Generated from SPEC.md. Each item will be marked [x] (pass), [FAIL] (issue found), or [MISSING] (file not yet created).

---

## Security Checks

- [ ] No API keys hardcoded anywhere in `web/` source files
- [ ] No API keys hardcoded anywhere in `ios/` source files
- [ ] `.env` file listed in `.gitignore`
- [ ] `.env.example` exists with placeholder values only
- [ ] Backend reads all keys from `process.env`
- [ ] `AppConstants.swift` contains no API keys
- [ ] No API keys in `package.json`, `vite.config.js`, or any Swift files

---

## Backend Correctness

- [ ] Route file `backend/src/routes/stocks.js` exists
- [ ] Route file `backend/src/routes/crypto.js` exists
- [ ] Route file `backend/src/routes/feed.js` exists
- [ ] Route file `backend/src/routes/calendar.js` exists
- [ ] Route file `backend/src/routes/portfolio.js` exists
- [ ] Route file `backend/src/routes/alerts.js` exists
- [ ] `GET /api/stocks/:ticker` endpoint returns correct JSON shape
- [ ] `GET /api/crypto/:symbol` endpoint returns correct JSON shape
- [ ] `GET /api/feed` endpoint returns correct JSON shape
- [ ] `GET /api/calendar` endpoint exists and returns macro events
- [ ] `GET /api/portfolio/impact` endpoint exists
- [ ] `POST /api/alerts` endpoint exists and returns correct JSON shape
- [ ] `GET /api/alerts` endpoint exists (CRUD - list)
- [ ] `DELETE /api/alerts/:id` endpoint exists (CRUD - delete)
- [ ] `backend/src/index.js` exists and wires up all routes
- [ ] Claude service has error fallback `{ summary: "...", urgency: "Low", reasoning: "..." }`
- [ ] Rate limiting middleware is configured (`backend/src/middleware/rateLimit.js` exists)
- [ ] CORS is configured for `localhost:5173`
- [ ] SQLite schema creates `watchlist` table
- [ ] SQLite schema creates `alerts` table
- [ ] `.env.example` has `FINNHUB_API_KEY` placeholder
- [ ] `.env.example` has `MARKETAUX_API_KEY` placeholder
- [ ] `.env.example` has `ANTHROPIC_API_KEY` placeholder
- [ ] `.env.example` has `PORT` placeholder
- [ ] No hardcoded API keys in any backend service file

---

## React Web App — UI Compliance

- [ ] Background is `#0f0f0f` in dark mode (NOT a gradient)
- [ ] Accent color is `#3b82f6` (NOT a different blue)
- [ ] NO CSS `linear-gradient` usage anywhere
- [ ] NO CSS `radial-gradient` usage anywhere
- [ ] NO CSS `backdrop-filter` usage anywhere
- [ ] NO CSS `box-shadow` with blur > 3px
- [ ] `UrgencyTag.jsx` renders plain colored text — no `background-color` on the urgency label
- [ ] Font is Inter — no decorative fonts
- [ ] Cards have `border: 1px solid #1f1f1f` — not `box-shadow`
- [ ] `BottomNav.jsx` exists for mobile navigation
- [ ] `StockChart.jsx` uses Recharts, not a third-party library
- [ ] RTK Query used for all API calls (not `useEffect` + `fetch`)
- [ ] `FreemiumGate.jsx` exists and uses blur overlay (not `display:none`)
- [ ] `CopyTrading.jsx` includes disclaimer text "For educational purposes only. Not financial advice."

---

## React Web App — Completeness

- [ ] `web/src/components/Sidebar.jsx` exists
- [ ] `web/src/components/BottomNav.jsx` exists
- [ ] `web/src/components/NewsCard.jsx` exists
- [ ] `web/src/components/UrgencyTag.jsx` exists
- [ ] `web/src/components/StockChart.jsx` exists (uses Recharts)
- [ ] `web/src/components/CryptoCard.jsx` exists
- [ ] `web/src/components/AlertBanner.jsx` exists
- [ ] `web/src/components/MacroCalendar.jsx` exists
- [ ] `web/src/components/CopyTradeCard.jsx` exists
- [ ] `web/src/components/FreemiumGate.jsx` exists
- [ ] `web/src/components/JargonTooltip.jsx` exists
- [ ] `web/src/components/ThemeToggle.jsx` exists
- [ ] `web/src/pages/Dashboard.jsx` fully implemented with real data fetching
- [ ] `web/src/pages/Stocks.jsx` fully implemented with watchlist + news
- [ ] `web/src/pages/Crypto.jsx` exists (stub acceptable)
- [ ] `web/src/pages/CopyTrading.jsx` exists with disclaimer
- [ ] `web/src/pages/Alerts.jsx` exists with create form
- [ ] `web/src/api/baseApi.js` exists (RTK Query createApi setup)
- [ ] `web/src/api/stocksApi.js` exists
- [ ] `web/src/api/cryptoApi.js` exists
- [ ] `web/src/api/feedApi.js` exists
- [ ] `web/src/api/portfolioApi.js` exists
- [ ] `web/src/api/alertsApi.js` exists
- [ ] `web/src/store/index.js` exists (Redux store)
- [ ] `web/src/store/watchlistSlice.js` exists
- [ ] `web/src/store/themeSlice.js` exists
- [ ] `web/src/utils/urgencyScorer.js` exists
- [ ] `web/src/utils/jargonMap.js` has at least 15 terms
- [ ] `web/src/App.jsx` exists with React Router routes
- [ ] `web/src/main.jsx` exists
- [ ] `web/src/index.css` exists
- [ ] `web/package.json` exists
- [ ] `ThemeToggle.jsx` dispatches to Redux store (not local state)

---

## Swift iOS App — Compliance

- [ ] Uses `.systemBackground` not hardcoded dark colors
- [ ] SF Symbols used for all tab icons
- [ ] No API keys in any Swift file
- [ ] `Urgency` enum has `color` computed property
- [ ] `APIService.swift` exists and uses `actor` keyword
- [ ] All models (`Stock.swift`, `CryptoAsset.swift`, `NewsItem.swift`, `Alert.swift`, etc.) are `Codable`
- [ ] `DashboardView.swift` exists and is fully built with real API calls
- [ ] `StocksListView.swift` exists and is fully built
- [ ] `StockDetailView.swift` exists and is fully built with chart
- [ ] `StockChartView.swift` exists and uses native `Charts` framework
- [ ] No force-unwraps (`!`) on optional API response fields in Swift files
- [ ] `NotificationService.swift` exists and uses `UNUserNotificationCenter`
- [ ] `MarketIntelligenceApp.swift` exists (app entry point)
- [ ] `ios/MarketIntelligence/Models/Alert.swift` exists
- [ ] `ios/MarketIntelligence/Models/PortfolioHolding.swift` exists
- [ ] `ios/MarketIntelligence/Models/MacroEvent.swift` exists
- [ ] `TabBarView.swift` exists in Shared/
- [ ] `LoadingView.swift` exists in Shared/
- [ ] `EmptyStateView.swift` exists in Shared/
- [ ] `ErrorView.swift` exists in Shared/
- [ ] `DashboardViewModel.swift` exists
- [ ] `StockViewModel.swift` exists
- [ ] `CryptoViewModel.swift` exists
- [ ] `AlertsViewModel.swift` exists
- [ ] `NewsCardView.swift` exists
- [ ] `UrgencyTagView.swift` exists
- [ ] `CryptoListView.swift` exists (stub acceptable)
- [ ] `CryptoDetailView.swift` exists (stub acceptable)
- [ ] `AlertsView.swift` exists (stub acceptable)
- [ ] `CreateAlertView.swift` exists (stub acceptable)

---

## Data Contract Alignment

- [ ] `NewsItem` JSON fields in backend response match Swift `NewsItem` struct fields
- [ ] `NewsItem` JSON fields in backend response match React frontend type definitions
- [ ] `StockQuote` JSON fields from Finnhub transform match Swift `StockQuote` struct
- [ ] `StockQuote` JSON fields from Finnhub transform match React frontend model
- [ ] `CryptoQuote` JSON fields match between backend and Swift `CryptoQuote` struct
- [ ] `PriceAlert` POST body shape matches between React form and backend route handler
- [ ] `PriceAlert` response shape matches between backend and Swift `Alert` model
- [ ] Urgency values are exactly `"Low"`, `"Watch"`, `"Act Now"` — consistent across backend, React, and Swift
- [ ] Backend `StockQuote` response includes `name` field (from company profile merge)
- [ ] Backend `StockQuote` response includes `marketCap` field (from company profile)
- [ ] `finnhub.js` `getStockQuote()` output matches the `StockQuote` spec shape exactly (currently missing `name` and `marketCap`)

---

## gitignore / Security Infrastructure

- [ ] Root-level `.gitignore` exists (or `backend/.gitignore` covers `.env`)
- [ ] `.env` not committed to repository
- [ ] No real API key values in `.env.example` (only placeholder strings)
