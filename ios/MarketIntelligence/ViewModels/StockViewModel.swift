// StockViewModel.swift
// MarketIntelligence

import Foundation

@MainActor
final class StockViewModel: ObservableObject {
    @Published var watchlist: [StockQuote] = []
    @Published var selectedNews: [NewsItem] = []
    @Published var isLoading = false
    @Published var error: String?

    /// Tickers that are currently being tracked.
    @Published var trackedTickers: [String]

    let defaultTickers = AppConstants.defaultStockTickers

    // MARK: - Init

    init() {
        // Load persisted tickers from UserDefaults; fall back to defaults.
        let saved = UserDefaults.standard.stringArray(forKey: "watchlistTickers")
        trackedTickers = saved ?? AppConstants.defaultStockTickers
    }

    // MARK: - Watchlist Loading

    /// Fetches quotes for all tracked tickers in parallel.
    func loadWatchlist() async {
        isLoading = true
        error = nil
        do {
            var quotes: [StockQuote] = []
            try await withThrowingTaskGroup(of: StockQuote.self) { group in
                for ticker in trackedTickers {
                    group.addTask {
                        return try await APIService.shared.fetchStock(ticker)
                    }
                }
                for try await quote in group {
                    quotes.append(quote)
                }
            }
            // Maintain the order of trackedTickers
            let ordered = trackedTickers.compactMap { t in quotes.first { $0.ticker == t } }
            watchlist = ordered
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }

    // MARK: - News

    /// Fetches the latest news for a given ticker.
    /// Uses the stock detail endpoint (which returns news inline) — there is no separate /news route.
    func fetchNewsFor(ticker: String) async {
        if let cached = watchlist.first(where: { $0.ticker == ticker.uppercased() }) {
            selectedNews = cached.newsItems
            return
        }
        do {
            let detail = try await APIService.shared.fetchStock(ticker)
            selectedNews = detail.newsItems
        } catch {
            selectedNews = []
        }
    }

    // MARK: - Ticker Management

    /// Adds a new ticker to the watchlist and persists it.
    func addTicker(_ ticker: String) async {
        let upper = ticker.uppercased().trimmingCharacters(in: .whitespaces)
        guard !upper.isEmpty, !trackedTickers.contains(upper) else { return }
        trackedTickers.append(upper)
        persistTickers()
        await loadWatchlist()
    }

    /// Removes tickers at the given index set (for List swipe-to-delete).
    func removeTickers(at offsets: IndexSet) {
        trackedTickers.remove(atOffsets: offsets)
        watchlist.remove(atOffsets: offsets)
        persistTickers()
    }

    // MARK: - Persistence

    private func persistTickers() {
        UserDefaults.standard.set(trackedTickers, forKey: "watchlistTickers")
    }
}
