// APIService.swift
// MarketIntelligence
//
// All backend API calls go through this actor.
// No API keys are stored here — the backend handles all external integrations.

import Foundation

// MARK: - API Errors

enum APIError: LocalizedError {
    case invalidURL(String)
    case requestFailed(Int)
    case decodingFailed(String)
    case networkUnavailable
    case serverError(String)

    var errorDescription: String? {
        switch self {
        case .invalidURL(let url):
            return "Invalid URL: \(url)"
        case .requestFailed(let code):
            return "Request failed with status code \(code)"
        case .decodingFailed(let detail):
            return "Failed to decode response: \(detail)"
        case .networkUnavailable:
            return "Network unavailable. Check your connection."
        case .serverError(let message):
            return "Server error: \(message)"
        }
    }
}

// MARK: - APIService

actor APIService {
    static let shared = APIService()

    private let baseURL = AppConstants.backendBaseURL

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        return d
    }()

    // MARK: - Private Helpers

    private func url(_ path: String) throws -> URL {
        let raw = "\(baseURL)\(path)"
        guard let url = URL(string: raw) else {
            throw APIError.invalidURL(raw)
        }
        return url
    }

    private func get<T: Decodable>(_ path: String) async throws -> T {
        let url = try url(path)
        let (data, response) = try await URLSession.shared.data(from: url)
        guard let http = response as? HTTPURLResponse else {
            throw APIError.networkUnavailable
        }
        guard (200..<300).contains(http.statusCode) else {
            throw APIError.requestFailed(http.statusCode)
        }
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decodingFailed(error.localizedDescription)
        }
    }

    private func post<Body: Encodable, Response: Decodable>(
        _ path: String,
        body: Body
    ) async throws -> Response {
        let url = try url(path)
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw APIError.networkUnavailable
        }
        guard (200..<300).contains(http.statusCode) else {
            throw APIError.requestFailed(http.statusCode)
        }
        do {
            return try decoder.decode(Response.self, from: data)
        } catch {
            throw APIError.decodingFailed(error.localizedDescription)
        }
    }

    private func delete(_ path: String) async throws {
        let url = try url(path)
        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"
        let (_, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw APIError.networkUnavailable
        }
        guard (200..<300).contains(http.statusCode) else {
            throw APIError.requestFailed(http.statusCode)
        }
    }

    // MARK: - Response Wrappers (match backend envelope shapes)

    private struct FeedResponse: Decodable {
        let items: [NewsItem]
    }

    private struct CalendarResponse: Decodable {
        let events: [MacroEvent]
    }

    private struct AlertsResponse: Decodable {
        let alerts: [PriceAlert]
    }

    private struct ImpactResponse: Decodable {
        let analysis: String
    }

    // MARK: - Public API

    /// Fetches the main news feed. Backend returns `{ items: [...], cachedAt }`.
    func fetchFeed() async throws -> [NewsItem] {
        let response: FeedResponse = try await get("/feed")
        return response.items
    }

    /// Fetches a single stock quote by ticker symbol.
    func fetchStock(_ ticker: String) async throws -> StockQuote {
        return try await get("/stocks/\(ticker)")
    }

    /// Fetches a single crypto quote by symbol (e.g. "BTC").
    func fetchCrypto(_ symbol: String) async throws -> CryptoQuote {
        return try await get("/crypto/\(symbol)")
    }

    /// Fetches macro calendar events. Backend returns `{ events: [...] }`.
    func fetchCalendar() async throws -> [MacroEvent] {
        let response: CalendarResponse = try await get("/calendar")
        return response.events
    }

    /// Fetches portfolio impact analysis. Backend is GET with query param `?holdings=AAPL:10,BTC:0.5`.
    func fetchPortfolioImpact(holdings: [PortfolioHolding]) async throws -> String {
        let holdingsParam = holdings
            .map { "\($0.ticker):\($0.quantity)" }
            .joined(separator: ",")
        guard let encoded = holdingsParam.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) else {
            throw APIError.invalidURL("Could not encode holdings param")
        }
        let response: ImpactResponse = try await get("/portfolio/impact?holdings=\(encoded)")
        return response.analysis
    }

    /// Creates a new price alert on the backend.
    func createAlert(_ alert: CreateAlertRequest) async throws -> PriceAlert {
        return try await post("/alerts", body: alert)
    }

    /// Fetches all existing price alerts. Backend returns `{ alerts: [...] }`.
    func fetchAlerts() async throws -> [PriceAlert] {
        let response: AlertsResponse = try await get("/alerts")
        return response.alerts
    }

    /// Deletes a price alert by its ID.
    func deleteAlert(id: String) async throws {
        try await delete("/alerts/\(id)")
    }

    // MARK: - Gov Trades

    /// Fetches government official trades from public STOCK Act disclosures.
    func fetchGovTrades(
        days: Int = 30,
        chamber: String? = nil,
        party: String? = nil,
        ticker: String? = nil
    ) async throws -> [GovTrade] {
        var path = "/gov-trades?days=\(days)"
        if let chamber { path += "&chamber=\(chamber)" }
        if let party { path += "&party=\(party)" }
        if let ticker { path += "&ticker=\(ticker)" }
        struct Response: Decodable { let trades: [GovTrade]; let disclaimer: String }
        let response: Response = try await get(path)
        return response.trades
    }

    /// Fetches aggregate summary stats for government trades.
    func fetchGovTradesSummary() async throws -> GovTradesSummary {
        return try await get("/gov-trades/summary")
    }

    // MARK: - Preferences

    /// Saves onboarding preferences to the backend and returns the server-assigned preferences.
    func savePreferences(_ prefs: UserPreferences) async throws -> UserPreferences {
        return try await post("/preferences", body: prefs)
    }

    /// Fetches previously saved preferences for the given session ID.
    func fetchPreferences(sessionId: String) async throws -> UserPreferences {
        return try await get("/preferences/\(sessionId)")
    }

    // MARK: - Commodities

    /// Fetches current commodity quotes.
    func fetchCommodities() async throws -> [CommodityQuote] {
        struct Response: Decodable { let commodities: [CommodityQuote] }
        let response: Response = try await get("/commodities")
        return response.commodities
    }
}

// MARK: - CommodityQuote

struct CommodityQuote: Codable, Identifiable {
    var id: String { symbol }
    let symbol: String
    let commodity: String
    let price: Double
    let unit: String
    let changePercent: Double
    let macroContext: String?
}
