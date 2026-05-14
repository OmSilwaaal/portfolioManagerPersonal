# Market Intelligence App — Project Specification

## Architecture Overview

Three components sharing a single backend:
- `backend/` — Node.js/Express REST API
- `web/` — React + Tailwind CSS + RTK Query frontend
- `ios/` — SwiftUI native iOS app

---

## Backend (Node.js/Express)

### Endpoints
- `GET /api/stocks/:ticker` — price + news + AI summary
- `GET /api/crypto/:symbol` — crypto price + news + AI summary
- `GET /api/feed` — main news feed with urgency scores
- `GET /api/calendar` — macro events (earnings, Fed meetings, CPI)
- `GET /api/portfolio/impact` — takes user holdings, returns AI impact analysis
- `POST /api/alerts` — create/manage price alerts

### External APIs
- **Finnhub** (`FINNHUB_API_KEY`) — price data, 60 req/min free tier
- **Marketaux** (`MARKETAUX_API_KEY`) — news + sentiment, free tier
- **Claude API** (`ANTHROPIC_API_KEY`) — model: `claude-sonnet-4-6`, AI summaries + urgency

### AI Prompt (per news item)
```
Summarize this financial news in 2 sentences for someone with no finance background.
Then rate the urgency for a retail investor as one of: Low, Watch, or Act Now.
Return as JSON: { "summary": string, "urgency": "Low" | "Watch" | "Act Now", "reasoning": string }
```

### Database
- SQLite (via `better-sqlite3`) for watchlists and alerts
- All API keys in `.env`, never exposed to clients

### File Structure
```
backend/
  src/
    routes/
      stocks.js
      crypto.js
      feed.js
      calendar.js
      portfolio.js
      alerts.js
    services/
      finnhub.js
      marketaux.js
      claude.js
    db/
      schema.js
      queries.js
    middleware/
      rateLimit.js
      errorHandler.js
    index.js
  .env.example
  package.json
```

---

## React Web App

### Tech Stack
- React 18 + Vite
- Tailwind CSS
- Redux Toolkit + RTK Query (state management + API caching)
- Recharts (charts)
- React Router v6

### UI Rules (STRICT — do not deviate)
- Dark mode default, light mode toggle via `prefers-color-scheme` + manual toggle
- Font: Inter (Google Fonts)
- Background: `#0f0f0f`
- Text: `#ffffff` / `#a1a1aa` (muted)
- Accent: `#3b82f6` (muted blue)
- Card borders: `#1f1f1f` — NO heavy shadows
- **NO gradients, NO glassmorphism, NO glowing effects**
- Urgency tags: plain text labels — `text-green-400` Low, `text-yellow-400` Watch, `text-red-400` Act Now
- Navigation: left sidebar desktop, bottom tab bar mobile
- Charts: Recharts, minimal gridlines, no decorative elements
- Spacing: generous padding (not cramped)

### Pages
- `Dashboard.jsx` — fully built: news feed, watchlist summary, macro calendar preview
- `Stocks.jsx` — fully built: watchlist, price movements, news feed with AI summaries
- `Crypto.jsx` — stub with placeholder UI
- `CopyTrading.jsx` — stub (includes disclaimer: "For educational purposes only. Not financial advice.")
- `Alerts.jsx` — stub with basic form UI

### Components
```
src/
  components/
    Sidebar.jsx          - left nav desktop
    BottomNav.jsx        - mobile bottom tabs
    NewsCard.jsx         - news item with AI summary + urgency tag
    UrgencyTag.jsx       - Low/Watch/Act Now label
    StockChart.jsx       - Recharts price chart
    CryptoCard.jsx       - crypto price card
    AlertBanner.jsx      - price alert notification
    MacroCalendar.jsx    - upcoming macro events
    CopyTradeCard.jsx    - trade signal card with disclaimer
    FreemiumGate.jsx     - blur overlay for locked content
    JargonTooltip.jsx    - hover tooltip for financial terms
    ThemeToggle.jsx      - dark/light mode switch
  pages/
    Dashboard.jsx
    Stocks.jsx
    Crypto.jsx
    CopyTrading.jsx
    Alerts.jsx
  api/
    baseApi.js           - RTK Query createApi setup
    stocksApi.js         - stocks endpoints
    cryptoApi.js         - crypto endpoints
    feedApi.js           - news feed endpoint
    portfolioApi.js      - portfolio impact endpoint
    alertsApi.js         - alerts CRUD
  store/
    index.js             - Redux store
    watchlistSlice.js    - local watchlist state
    themeSlice.js        - light/dark mode
  utils/
    urgencyScorer.js     - client-side urgency helpers
    jargonMap.js         - term → plain English definitions
  App.jsx
  main.jsx
  index.css
```

### Monetization Stubs
- `FreemiumGate.jsx` — blur content after 5 items for free users
- Pro badge `<span className="pro-badge">PRO</span>` on premium features
- Broker CTA buttons with `href="#affiliate-placeholder"`

---

## iOS App (SwiftUI)

### Requirements
- iOS 16+ minimum deployment target
- MVVM architecture with `@Observable` / `@StateObject`
- `async/await` for all API calls
- Native `Charts` framework (no third-party)
- `UNUserNotificationCenter` for push notifications
- `SwiftData` for local persistence (watchlist, alerts)
- SF Symbols for all icons
- SF Pro system font only

### Design Rules (STRICT — Apple HIG)
- Use `.systemBackground`, `.secondarySystemBackground` — auto light/dark
- Accent: `Color(red: 0.23, green: 0.51, blue: 0.96)` matches `#3b82f6`
- NO custom shadows, NO heavy gradients
- Native `List`, `NavigationStack`, `TabView`
- App must feel completely native iOS

### Urgency Enum
```swift
enum Urgency: String, Codable {
    case low = "Low"
    case watch = "Watch"
    case actNow = "Act Now"
    
    var color: Color {
        switch self {
        case .low: return .green
        case .watch: return .yellow
        case .actNow: return .red
        }
    }
}
```

### Tab Structure
- Tab 1: Dashboard (SF Symbol: `house`)
- Tab 2: Markets / Stocks (SF Symbol: `chart.line.uptrend.xyaxis`)
- Tab 3: Crypto (SF Symbol: `bitcoinsign.circle`)
- Tab 4: Alerts (SF Symbol: `bell`)

### File Structure
```
ios/MarketIntelligence/
  MarketIntelligenceApp.swift
  Models/
    Stock.swift
    CryptoAsset.swift
    NewsItem.swift        -- includes Urgency enum
    Alert.swift
    PortfolioHolding.swift
    MacroEvent.swift
  Views/
    Dashboard/
      DashboardView.swift       -- FULLY BUILT
      NewsCardView.swift        -- FULLY BUILT
      UrgencyTagView.swift      -- FULLY BUILT
    Markets/
      StocksListView.swift      -- FULLY BUILT
      StockDetailView.swift     -- FULLY BUILT
      StockChartView.swift      -- FULLY BUILT (native Charts)
    Crypto/
      CryptoListView.swift      -- stub
      CryptoDetailView.swift    -- stub
    Alerts/
      AlertsView.swift          -- stub
      CreateAlertView.swift     -- stub
    Shared/
      TabBarView.swift
      LoadingView.swift
      EmptyStateView.swift
      ErrorView.swift
  ViewModels/
    DashboardViewModel.swift
    StockViewModel.swift
    CryptoViewModel.swift
    AlertsViewModel.swift
  Services/
    APIService.swift            -- all backend API calls (async/await)
    NotificationService.swift   -- UNUserNotificationCenter
  Config/
    AppConstants.swift          -- base URL, constants (NO API keys here)
```

---

## Shared Data Models (JSON contract between backend and both frontends)

### NewsItem
```json
{
  "id": "string",
  "headline": "string",
  "source": "string",
  "publishedAt": "ISO8601 string",
  "url": "string",
  "ticker": "string | null",
  "summary": "string",
  "urgency": "Low | Watch | Act Now",
  "reasoning": "string",
  "sentiment": "number (-1 to 1)"
}
```

### StockQuote
```json
{
  "ticker": "string",
  "name": "string",
  "price": "number",
  "change": "number",
  "changePercent": "number",
  "volume": "number",
  "marketCap": "number | null"
}
```

### CryptoQuote
```json
{
  "symbol": "string",
  "name": "string",
  "price": "number",
  "change24h": "number",
  "changePercent24h": "number",
  "volume24h": "number"
}
```

### PriceAlert
```json
{
  "id": "string",
  "ticker": "string",
  "targetPrice": "number",
  "direction": "above | below",
  "createdAt": "ISO8601 string",
  "triggered": "boolean"
}
```

---

## Security Rules
1. All API keys (FINNHUB, MARKETAUX, ANTHROPIC) — backend `.env` only
2. Swift app never contains any API key — only calls `http://localhost:3001/api`
3. React build never contains any API key — only calls `/api` (proxied to backend)
4. `.env` listed in `.gitignore`
5. `.env.example` with placeholder values committed

## Disclaimers Required
- All copy trading content: "This is for educational purposes only and is not financial advice."
- Visible on CopyTrading page and CopyTradeCard component
