# Verification Checklist V2
# Market Intelligence App — Phase 2 New Features
Generated: 2026-05-14

---

## No Double-Implementation

- [ ] `govTrades.js` backend service exists in `backend/src/services/`
- [ ] `govTrades.js` route exists in `backend/src/routes/`
- [ ] React `GovTradeCard.jsx` component is new, not duplicating NewsCard
- [ ] iOS `GovTradesListView.swift` is new, not duplicating StocksListView
- [ ] Onboarding quiz is only in `Onboarding.jsx` (web) and `QuizFlowView` (iOS) — not duplicated
- [ ] Feed page (`Feed.jsx`) is distinct from existing `Dashboard.jsx` — both should exist separately
- [ ] `preferencesSlice.js` is distinct from `watchlistSlice.js`

---

## Security (Critical)

- [ ] No API keys in any React file or Swift file
- [ ] `backend/.env` not committed (only `.env.example`)
- [ ] Session IDs generated client-side with `crypto.randomUUID()`, not predictable
- [ ] Gov trades data disclaimer present on every trade card (web AND iOS)
- [ ] Copy trading disclaimer present where applicable

---

## Backend Contract (New Endpoints)

- [ ] `GET /api/gov-trades` returns `{ trades: [...], total: N, disclaimer: string }`
- [ ] `GET /api/gov-trades/summary` returns `{ totalTrades, topTraders, mostTradedTickers, dateRange }`
- [ ] `GET /api/commodities` returns array or wrapped object of commodity quotes
- [ ] `GET /api/preferences/:sessionId` returns stored preferences
- [ ] `POST /api/preferences` returns saved preferences with sessionId
- [ ] New routes registered in `backend/src/index.js`
- [ ] New SQLite tables in `backend/src/db/schema.js`: `user_preferences`, `gov_trades_cache`

---

## iOS API Contract

- [ ] `APIService.fetchGovTrades()` decodes `{ trades: [...], disclaimer }` and returns `[GovTrade]`
- [ ] `APIService.fetchGovTradesSummary()` decodes `GovTradesSummary` correctly
- [ ] `APIService.savePreferences()` sends UserPreferences and returns UserPreferences
- [ ] `GovTrade.urgencyLevel` computed property maps string to `UrgencyLevel` enum
- [ ] `GovTrade.partyColor` computed property works for Democrat/Republican/unknown

---

## iOS Onboarding

- [ ] `MarketIntelligenceApp.swift` checks `UserDefaults.bool(forKey: "onboardingComplete")`
- [ ] Shows `OnboardingFlowView` if false, `TabBarView` if true
- [ ] `OnboardingViewModel.saveAndComplete()` sets `UserDefaults "onboardingComplete" = true`
- [ ] All 6 quiz questions implemented (investor type, categories, watchlist, alerts, frequency, risk)
- [ ] Quiz progress bar advances correctly

---

## iOS TabBarView

- [ ] Now has 5 tabs: Feed | Markets | Gov Trades | Alerts | Settings
- [ ] `GovTradesListView` is the Gov Trades tab
- [ ] `SettingsView` is the Settings tab
- [ ] Accent color set on TabView

---

## React Onboarding

- [ ] Onboarding page at `/onboarding` route
- [ ] No Sidebar or BottomNav rendered on `/onboarding`
- [ ] 6 questions implemented with correct transitions
- [ ] "Building your feed..." loading screen after Q6
- [ ] Preferences saved via POST `/api/preferences`
- [ ] sessionId stored in localStorage
- [ ] After completion, redirect to `/feed`

---

## React Routing

- [ ] `/feed` route exists and renders `Feed.jsx`
- [ ] `/gov-trades` route exists and renders `GovTrades.jsx`
- [ ] `/commodities` route exists and renders `Commodities.jsx`
- [ ] `/settings` route exists and renders `Settings.jsx`
- [ ] App checks `onboardingComplete` from Redux/localStorage and redirects to `/onboarding` if false

---

## React Gov Trades Page

- [ ] Disclaimer banner always visible
- [ ] Filter bar with Chamber/Party/Days/Ticker search
- [ ] `GovTradeCard` renders party color dot, official name, urgency tag, trade details
- [ ] Late disclosure (>30 days) shown in amber
- [ ] Connects to RTK Query `govTradesApi`

---

## Claude Service Updates

- [ ] `summarizeNewsItem` now uses `claude-haiku-4-5-20251001` (not Sonnet) with system prompt caching
- [ ] `summarizeGovTrade` uses `claude-sonnet-4-6` for complex reasoning
- [ ] Both functions coexist without conflict
- [ ] Fallback responses present on both

---

## UI Compliance (New Pages)

- [ ] Gov Trades page: `#0f0f0f` bg (dark mode), no gradients
- [ ] Onboarding quiz: full-screen per question, clean transitions
- [ ] `PaywallBlur` component uses CSS blur, not display:none
- [ ] `SentimentBadge` is plain colored text, no background badge
- [ ] `FilterBar` pills use `#1f1f1f` inactive, `#3b82f6` active
