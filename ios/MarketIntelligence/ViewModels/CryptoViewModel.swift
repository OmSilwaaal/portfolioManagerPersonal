// CryptoViewModel.swift
// MarketIntelligence

import Foundation

@MainActor
final class CryptoViewModel: ObservableObject {
    @Published var cryptoList: [CryptoQuote] = []
    @Published var selectedNews: [NewsItem] = []
    @Published var isLoading = false
    @Published var error: String?

    let defaultSymbols = AppConstants.defaultCryptoSymbols

    // MARK: - Loading

    func loadCrypto() async {
        isLoading = true
        error = nil
        do {
            var quotes: [CryptoQuote] = []
            try await withThrowingTaskGroup(of: CryptoQuote.self) { group in
                for symbol in defaultSymbols {
                    group.addTask {
                        return try await APIService.shared.fetchCrypto(symbol)
                    }
                }
                for try await quote in group {
                    quotes.append(quote)
                }
            }
            let ordered = defaultSymbols.compactMap { s in quotes.first { $0.symbol == s } }
            cryptoList = ordered
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }

    func fetchNewsFor(symbol: String) async {
        do {
            selectedNews = try await APIService.shared.fetchNewsForTicker(symbol)
        } catch {
            selectedNews = []
        }
    }
}
