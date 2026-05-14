# Verification Report

Generated: 2026-05-14
Spec: SPEC.md
Checked by: QA verification agent

---

## Summary

- **Total checks:** 96
- **Passed:** 34
- **Failed:** 21
- **Missing (file not created yet):** 41

---

## Critical Issues (must fix before running)

1. **`backend/src/index.js` does not exist.** The Express app entry point was never created. No server can start. All routes, middleware (CORS, rate-limiting, error handler), and DB initialization are unreachable. Must be created to wire everything together.

2. **`backend/src/middleware/rateLimit.js` does not exist.** Rate limiting was referenced in the spec but never implemented. The spec requires this file.

3. **`APIService.swift` line 113 — `fetchFeed()` decodes `[NewsItem]` directly**, but the backend `GET /api/feed` returns `{ items: [...], cachedAt: "..." }` (a wrapper object). Swift decoding will fail at runtime. Fix: add a wrapper struct `struct FeedResponse: Decodable { let items: [NewsItem] }` and return `response.items`.

4. **`APIService.swift` line 127 — `fetchCalendar()` decodes `[MacroEvent]` directly**, but the backend `GET /api/calendar` returns `{ events: [...] }`. Fix: add `struct CalendarResponse: Decodable { let events: [MacroEvent] }` and return `response.events`.

5. **`APIService.swift` line 161 — `fetchAlerts()` decodes `[PriceAlert]` directly**, but the backend `GET /api/alerts` returns `{ alerts: [...] }`. Fix: add `struct AlertsResponse: Decodable { let alerts: [PriceAlert] }` and return `response.alerts`.

6. **`APIService.swift` lines 148–153 — `fetchPortfolioImpact()` sends a POST request**, but the backend route is `GET /api/portfolio/impact` with query parameters (`?holdings=AAPL:10,BTC:0.5`). The HTTP method mismatch will cause a 404. Either change the backend to accept POST with a JSON body, or change `APIService.swift` to issue a GET with a query string.

7. **`MacroEvent.swift` field names do not match the backend `GET /api/calendar` response shape.** Backend returns `event`, `category`, `importance`, `aiBlurb`; Swift model declares `title`, `type`, `aiImpact`. Swift `Codable` decoding will fail silently (or throw) because the keys do not match. Fix: rename Swift struct fields or add `CodingKeys` to map them, and add the missing `importance` field.

8. **`StockQuote.swift` is missing the `name` field.** Backend `GET /api/stocks/:ticker` returns a `name` property (from company profile). The Swift struct does not include it. Any view attempting to display the company name will have no data, and if the decoder is strict it may fail. Add `let name: String` to `StockQuote`.

9. **`APIService.swift` line 133 — `fetchNewsForTicker()` calls `/stocks/:ticker/news`**, but the backend `GET /api/stocks/:ticker` route returns news embedded in the stock response, not at a separate `/news` sub-path. There is no `/api/stocks/:ticker/news` endpoint. The call will 404. Fix: either add that sub-route to the backend, or change `fetchNewsForTicker` to call `/stocks/\(ticker)` and extract the `news` array.

---

## Design Violations (UI rules broken)

All React web UI files are entirely missing, so no design violations can be confirmed or denied for the web app. The iOS files that exist are clean.

**iOS — no violations found** in the files that do exist (`AppConstants.swift`, model files, `APIService.swift`, `NotificationService.swift`, ViewModels).

---

## Contract Mismatches (API shape differences)

| # | Endpoint | Backend shape | Client expectation | Severity |
|---|----------|---------------|--------------------|----------|
| 1 | `GET /api/feed` | `{ items: [...], cachedAt: string }` | `APIService.swift`: expects `[NewsItem]` | FAIL — runtime decode crash |
| 2 | `GET /api/calendar` | `{ events: [...] }` | `APIService.swift`: expects `[MacroEvent]` | FAIL — runtime decode crash |
| 3 | `GET /api/calendar` fields | `event`, `category`, `importance`, `aiBlurb` | `MacroEvent.swift`: `title`, `type`, `aiImpact` | FAIL — all fields nil/error |
| 4 | `GET /api/alerts` | `{ alerts: [...] }` | `APIService.swift`: expects `[PriceAlert]` | FAIL — runtime decode crash |
| 5 | `GET /api/portfolio/impact` (GET + query) | Backend: GET with `?holdings=` param | `APIService.swift`: sends POST with JSON body | FAIL — 404 / method mismatch |
| 6 | `GET /api/stocks/:ticker` | Includes `name`, `high`, `low`, `open`, `previousClose` | `StockQuote.swift`: no `name` field | FAIL — company name unavailable |
| 7 | `GET /api/stocks/:ticker/news` | Does NOT exist | `APIService.swift` `fetchNewsForTicker` calls it | FAIL — 404 |
| 8 | `PriceAlert.direction` | Backend stores raw string `"above"` / `"below"` | `Alert.swift` decodes as `AlertDirection` enum | PASS — enum raw values match |
| 9 | Urgency string values | `"Low"`, `"Watch"`, `"Act Now"` in backend validation | `Urgency` enum raw values in `NewsItem.swift` | PASS — exact match |

---

## Missing Files

### Backend (6 missing)
- `backend/src/index.js` — **CRITICAL**: server entry point never created
- `backend/src/middleware/rateLimit.js` — rate limiting middleware
- `backend/src/routes/watchlist.js` — watchlist routes (queries.js implements watchlist DB functions but no HTTP route exists for them)

### React Web App (entire directory missing)
- `web/` directory does not exist at all
- `web/package.json`
- `web/vite.config.js`
- `web/src/App.jsx`
- `web/src/main.jsx`
- `web/src/index.css`
- `web/src/components/Sidebar.jsx`
- `web/src/components/BottomNav.jsx`
- `web/src/components/NewsCard.jsx`
- `web/src/components/UrgencyTag.jsx`
- `web/src/components/StockChart.jsx`
- `web/src/components/CryptoCard.jsx`
- `web/src/components/AlertBanner.jsx`
- `web/src/components/MacroCalendar.jsx`
- `web/src/components/CopyTradeCard.jsx`
- `web/src/components/FreemiumGate.jsx`
- `web/src/components/JargonTooltip.jsx`
- `web/src/components/ThemeToggle.jsx`
- `web/src/pages/Dashboard.jsx`
- `web/src/pages/Stocks.jsx`
- `web/src/pages/Crypto.jsx`
- `web/src/pages/CopyTrading.jsx`
- `web/src/pages/Alerts.jsx`
- `web/src/api/baseApi.js`
- `web/src/api/stocksApi.js`
- `web/src/api/cryptoApi.js`
- `web/src/api/feedApi.js`
- `web/src/api/portfolioApi.js`
- `web/src/api/alertsApi.js`
- `web/src/store/index.js`
- `web/src/store/watchlistSlice.js`
- `web/src/store/themeSlice.js`
- `web/src/utils/urgencyScorer.js`
- `web/src/utils/jargonMap.js`

### iOS (many views and ViewModels missing)
- `ios/MarketIntelligence/MarketIntelligenceApp.swift` — app entry point missing
- `ios/MarketIntelligence/Views/Dashboard/DashboardView.swift` — spec says FULLY BUILT
- `ios/MarketIntelligence/Views/Dashboard/NewsCardView.swift` — spec says FULLY BUILT
- `ios/MarketIntelligence/Views/Dashboard/UrgencyTagView.swift` — spec says FULLY BUILT
- `ios/MarketIntelligence/Views/Markets/StocksListView.swift` — spec says FULLY BUILT
- `ios/MarketIntelligence/Views/Markets/StockDetailView.swift` — spec says FULLY BUILT
- `ios/MarketIntelligence/Views/Markets/StockChartView.swift` — spec says FULLY BUILT
- `ios/MarketIntelligence/Views/Crypto/CryptoListView.swift` — stub
- `ios/MarketIntelligence/Views/Crypto/CryptoDetailView.swift` — stub
- `ios/MarketIntelligence/Views/Alerts/AlertsView.swift` — stub
- `ios/MarketIntelligence/Views/Alerts/CreateAlertView.swift` — stub
- `ios/MarketIntelligence/Views/Shared/TabBarView.swift`
- `ios/MarketIntelligence/Views/Shared/LoadingView.swift`
- `ios/MarketIntelligence/Views/Shared/EmptyStateView.swift`
- `ios/MarketIntelligence/Views/Shared/ErrorView.swift`
- `ios/MarketIntelligence/ViewModels/CryptoViewModel.swift`
- `ios/MarketIntelligence/ViewModels/AlertsViewModel.swift`

---

## Warnings (non-blocking)

1. **`backend/.gitignore` only covers the `backend/` subdirectory.** There is no root-level `.gitignore`. If the repo root is the git root, a root `.gitignore` should also list `.env` to prevent accidental commits from any subdirectory.

2. **`backend/src/db/queries.js` implements watchlist CRUD functions** (`getAllWatchlist`, `addToWatchlist`, `removeFromWatchlist`) but there is no HTTP route file for watchlist endpoints. The spec does not list watchlist as a route, but the iOS `StockViewModel.swift` persists tickers in `UserDefaults` rather than calling the backend — this is a design divergence worth noting.

3. **`backend/src/routes/calendar.js` uses hardcoded static data** for macro events with dates in May–June 2026. This is acceptable as a stub but will become stale over time. Consider adding a note to refresh these or connect to a live events API.

4. **`backend/src/services/finnhub.js` `getStockQuote()` does not return `name` or `marketCap`** directly — these come from `getCompanyProfile()` in the stocks route. However, the `StockQuote` spec contract lists `name` and `marketCap` as required fields. This is handled in `stocks.js` by merging, but `finnhub.js`'s output shape should not be confused with the final `StockQuote` contract.

5. **`ios/MarketIntelligence/Models/PortfolioHolding.swift` is not `Codable`**. The struct uses `let id = UUID()` with `@Observable` pattern but does not conform to `Codable`. This is non-blocking for local-only use, but if the backend contract ever requires sending/receiving portfolio holdings as JSON, the lack of `Codable` will require a refactor.

6. **`DashboardViewModel.swift` calls `APIService.shared.fetchFeed()`**, which will crash at runtime due to contract mismatch #1 (see Critical Issues). This blocks the entire Dashboard from loading.

7. **`StockViewModel.swift` calls `APIService.shared.fetchNewsForTicker()`**, which will 404 at runtime (see Critical Issue #9). News tab will always show empty.

8. **`backend/src/routes/alerts.js` returns `id` as a `String`** (via `String(a.id)`) in list and create responses, but `Alert.swift` / `PriceAlert` decodes `id` as `String` — this is consistent and correct.

9. **`backend` has no root-level `.gitignore`** at `C:\Users\poper\OneDrive\Documents\application_trading\.gitignore`. Only `backend/.gitignore` exists. If the project root is used as a git repo, `.env` files outside `backend/` would not be excluded.

---

## Full Checklist Results

### Security Checks

- [MISSING] No API keys hardcoded anywhere in `web/` source files — `web/` does not exist yet; cannot verify
- [x] No API keys hardcoded anywhere in `ios/` source files — all Swift files checked, no keys present
- [x] `.env` file listed in `backend/.gitignore` — confirmed on line 1
- [x] `.env.example` exists with placeholder values only — all 4 values are placeholder strings
- [x] Backend reads all keys from `process.env` — `finnhub.js`, `marketaux.js`, `claude.js` all use `process.env.*`
- [x] `AppConstants.swift` contains no API keys — only `backendBaseURL` and default ticker arrays
- [MISSING] No API keys in `vite.config.js` — file doesn't exist yet

### Backend Correctness

- [x] Route file `backend/src/routes/stocks.js` exists
- [x] Route file `backend/src/routes/crypto.js` exists
- [x] Route file `backend/src/routes/feed.js` exists
- [x] Route file `backend/src/routes/calendar.js` exists
- [x] Route file `backend/src/routes/portfolio.js` exists
- [x] Route file `backend/src/routes/alerts.js` exists
- [x] `GET /api/stocks/:ticker` endpoint returns NewsItem-shaped news array with correct fields
- [x] `GET /api/crypto/:symbol` endpoint returns CryptoQuote-shaped response
- [x] `GET /api/feed` endpoint returns news items (wrapped in `{ items, cachedAt }`)
- [x] `GET /api/calendar` endpoint exists and returns macro events
- [x] `GET /api/portfolio/impact` endpoint exists (as GET with query params)
- [x] `POST /api/alerts` endpoint exists and returns PriceAlert shape
- [x] `GET /api/alerts` endpoint exists (list)
- [x] `DELETE /api/alerts/:id` endpoint exists
- [FAIL] `backend/src/index.js` does not exist — server cannot start
- [x] Claude service has error fallback `{ summary: "Summary unavailable", urgency: "Low", reasoning: "AI service temporarily unavailable" }` — confirmed in `claude.js` line 14–18
- [FAIL] Rate limiting middleware `backend/src/middleware/rateLimit.js` does not exist
- [FAIL] CORS configuration unknown — `index.js` does not exist, so CORS setup cannot be verified
- [x] SQLite schema creates `watchlist` table — confirmed in `schema.js` lines 19–23
- [x] SQLite schema creates `alerts` table — confirmed in `schema.js` lines 25–32
- [x] `.env.example` has `FINNHUB_API_KEY` placeholder
- [x] `.env.example` has `MARKETAUX_API_KEY` placeholder
- [x] `.env.example` has `ANTHROPIC_API_KEY` placeholder
- [x] `.env.example` has `PORT` placeholder
- [x] No hardcoded API keys in any backend service file

### React Web App — UI Compliance

- [MISSING] Background is `#0f0f0f` — `web/` not created
- [MISSING] Accent color is `#3b82f6` — `web/` not created
- [MISSING] No CSS `linear-gradient` usage — `web/` not created
- [MISSING] No CSS `radial-gradient` usage — `web/` not created
- [MISSING] No CSS `backdrop-filter` usage — `web/` not created
- [MISSING] No CSS `box-shadow` with blur > 3px — `web/` not created
- [MISSING] `UrgencyTag.jsx` renders plain colored text — `web/` not created
- [MISSING] Font is Inter — `web/` not created
- [MISSING] Cards have `border: 1px solid #1f1f1f` — `web/` not created
- [MISSING] `BottomNav.jsx` exists for mobile navigation — `web/` not created
- [MISSING] `StockChart.jsx` uses Recharts — `web/` not created
- [MISSING] RTK Query used for all API calls — `web/` not created
- [MISSING] `FreemiumGate.jsx` uses blur overlay — `web/` not created
- [MISSING] `CopyTrading.jsx` includes disclaimer — `web/` not created

### React Web App — Completeness

- [MISSING] `web/src/components/Sidebar.jsx`
- [MISSING] `web/src/components/BottomNav.jsx`
- [MISSING] `web/src/components/NewsCard.jsx`
- [MISSING] `web/src/components/UrgencyTag.jsx`
- [MISSING] `web/src/components/StockChart.jsx`
- [MISSING] `web/src/components/CryptoCard.jsx`
- [MISSING] `web/src/components/AlertBanner.jsx`
- [MISSING] `web/src/components/MacroCalendar.jsx`
- [MISSING] `web/src/components/CopyTradeCard.jsx`
- [MISSING] `web/src/components/FreemiumGate.jsx`
- [MISSING] `web/src/components/JargonTooltip.jsx`
- [MISSING] `web/src/components/ThemeToggle.jsx`
- [MISSING] `web/src/pages/Dashboard.jsx`
- [MISSING] `web/src/pages/Stocks.jsx`
- [MISSING] `web/src/pages/Crypto.jsx`
- [MISSING] `web/src/pages/CopyTrading.jsx`
- [MISSING] `web/src/pages/Alerts.jsx`
- [MISSING] `web/src/api/baseApi.js`
- [MISSING] `web/src/api/stocksApi.js`
- [MISSING] `web/src/api/cryptoApi.js`
- [MISSING] `web/src/api/feedApi.js`
- [MISSING] `web/src/api/portfolioApi.js`
- [MISSING] `web/src/api/alertsApi.js`
- [MISSING] `web/src/store/index.js`
- [MISSING] `web/src/store/watchlistSlice.js`
- [MISSING] `web/src/store/themeSlice.js`
- [MISSING] `web/src/utils/urgencyScorer.js`
- [MISSING] `web/src/utils/jargonMap.js` — cannot verify 15-term requirement
- [MISSING] `web/src/App.jsx`
- [MISSING] `web/src/main.jsx`
- [MISSING] `web/src/index.css`
- [MISSING] `web/package.json`
- [MISSING] `ThemeToggle.jsx` dispatches to Redux store

### Swift iOS App — Compliance

- [x] No API keys in any Swift file — all files checked
- [x] `Urgency` enum has `color` computed property — confirmed in `NewsItem.swift` lines 51–57
- [x] `APIService.swift` uses `actor` keyword — confirmed on line 36
- [x] `NewsItem` is `Codable` — confirmed (`struct NewsItem: Codable`)
- [x] `StockQuote` is `Codable` — confirmed (`struct StockQuote: Codable`)
- [x] `CryptoQuote` is `Codable` — confirmed (`struct CryptoQuote: Codable`)
- [x] `PriceAlert` is `Codable` — confirmed in `Alert.swift`
- [x] `MacroEvent` is `Codable` — confirmed in `MacroEvent.swift`
- [FAIL] `PortfolioHolding` is NOT `Codable` — `PortfolioHolding.swift` declares no protocol conformance beyond `Identifiable`
- [MISSING] `DashboardView.swift` — spec says FULLY BUILT, file does not exist
- [MISSING] `StocksListView.swift` — spec says FULLY BUILT, file does not exist
- [MISSING] `StockDetailView.swift` — spec says FULLY BUILT, file does not exist
- [MISSING] `StockChartView.swift` — spec says FULLY BUILT using native Charts, file does not exist
- [MISSING] `MarketIntelligenceApp.swift` — app entry point not created
- [x] `NotificationService.swift` uses `UNUserNotificationCenter` — confirmed on lines 20, 53, 64–65
- [MISSING] `TabBarView.swift`
- [MISSING] `LoadingView.swift`
- [MISSING] `EmptyStateView.swift`
- [MISSING] `ErrorView.swift`
- [MISSING] `CryptoViewModel.swift`
- [MISSING] `AlertsViewModel.swift`
- [MISSING] `NewsCardView.swift`
- [MISSING] `UrgencyTagView.swift`
- [MISSING] `CryptoListView.swift` (stub)
- [MISSING] `CryptoDetailView.swift` (stub)
- [MISSING] `AlertsView.swift` (stub)
- [MISSING] `CreateAlertView.swift` (stub)
- [x] No force-unwraps on optional API response fields in files that exist — confirmed in APIService.swift, all models use optionals safely
- [FAIL] `APIService.swift` line 113: `fetchFeed()` returns wrong type — decodes `[NewsItem]` but backend wraps in `{ items, cachedAt }`
- [FAIL] `APIService.swift` line 127: `fetchCalendar()` returns wrong type — decodes `[MacroEvent]` but backend wraps in `{ events }`
- [FAIL] `APIService.swift` line 161: `fetchAlerts()` returns wrong type — decodes `[PriceAlert]` but backend wraps in `{ alerts }`
- [FAIL] `APIService.swift` line 151: `fetchPortfolioImpact()` sends POST, backend only handles GET
- [FAIL] `APIService.swift` line 133: `fetchNewsForTicker()` calls non-existent `/stocks/:ticker/news` route
- [FAIL] `MacroEvent.swift`: field names `title`, `type`, `aiImpact` do not match backend keys `event`, `category`, `aiBlurb`; `importance` field entirely missing

### Data Contract Alignment

- [FAIL] `NewsItem` Swift decode of `GET /api/feed` will fail — wrapper object mismatch
- [x] `NewsItem` field names match backend response shape in `stocks.js` and `feed.js` — `id`, `headline`, `source`, `publishedAt`, `url`, `ticker`, `summary`, `urgency`, `reasoning`, `sentiment` all present
- [FAIL] `StockQuote.swift` missing `name` field — backend returns it, Swift model cannot store it
- [x] `CryptoQuote` fields match backend `crypto.js` response shape — `symbol`, `name`, `price`, `change24h`, `changePercent24h`, `volume24h` all present
- [FAIL] `MacroEvent.swift` field names mismatch with `calendar.js` response
- [x] `PriceAlert` POST body (`ticker`, `targetPrice`, `direction`) matches `alerts.js` route handler expectations
- [FAIL] `PriceAlert` GET list response: `APIService.swift` decodes raw array, backend wraps in `{ alerts: [...] }`
- [x] Urgency values `"Low"`, `"Watch"`, `"Act Now"` are consistent: `claude.js` validates against these, `NewsItem.swift` enum raw values match exactly
- [x] `AlertDirection` enum `above`/`below` matches backend constraint check in `alerts.js`

---

## Action Items for Coding Agents

### Backend Agent — Must Fix
1. Create `backend/src/index.js` with: `require('dotenv').config()`, Express app, CORS for `localhost:5173`, rate limiter, all 6 route mounts, error handler, DB init call, server listen on `process.env.PORT || 3001`.
2. Create `backend/src/middleware/rateLimit.js` using `express-rate-limit` (already in `package.json`).
3. Decide on `portfolio/impact` HTTP method: if keeping as GET, ensure Swift agent is told to use GET + query string. If switching to POST, update the route to `req.body` parsing.
4. Either add `GET /api/stocks/:ticker/news` as a sub-route, OR inform Swift agent that news is embedded in the main stock response.

### iOS Agent — Must Fix
1. `APIService.swift` line 113 — wrap feed decode: `struct FeedResponse: Decodable { let items: [NewsItem] }` then `let r: FeedResponse = try await get("/feed"); return r.items`
2. `APIService.swift` line 127 — wrap calendar decode: `struct CalendarResponse: Decodable { let events: [MacroEvent] }` then `return r.events`
3. `APIService.swift` line 161 — wrap alerts decode: `struct AlertsResponse: Decodable { let alerts: [PriceAlert] }` then `return r.alerts`
4. `APIService.swift` line 148 — change `fetchPortfolioImpact` to GET with query string, or align with backend agent's decision on HTTP method.
5. `APIService.swift` line 133 — change `fetchNewsForTicker` path to `/stocks/\(ticker)` and decode a struct that has a `news` field, not a bare `[NewsItem]`.
6. `MacroEvent.swift` — fix field names to match backend: rename `title` → `event`, `type` → `category`, `aiImpact` → `aiBlurb`, add `let importance: String`.
7. `Stock.swift` — add `let name: String` to `StockQuote`.
8. Create all missing view and ViewModel files listed above.
9. Create `MarketIntelligenceApp.swift` app entry point.

### React Agent — Must Create Everything
The entire `web/` directory is absent. All React source files need to be built from scratch per the spec.
