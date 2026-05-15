// GovTradesViewModel.swift
// MarketIntelligence

import Foundation

@MainActor
class GovTradesViewModel: ObservableObject {
    @Published var trades: [GovTrade] = []
    @Published var summary: GovTradesSummary?
    @Published var isLoading = false
    @Published var error: String?

    // Filters
    @Published var selectedChamber: String = "All"
    @Published var selectedParty: String = "All"
    @Published var selectedDays: Int = 30
    @Published var tickerSearch: String = ""

    var filteredTrades: [GovTrade] {
        trades.filter { trade in
            (selectedChamber == "All" || trade.chamber == selectedChamber) &&
            (selectedParty == "All" || trade.party == selectedParty) &&
            (tickerSearch.isEmpty ||
             trade.ticker.localizedCaseInsensitiveContains(tickerSearch) ||
             trade.officialName.localizedCaseInsensitiveContains(tickerSearch))
        }
    }

    func loadTrades() async {
        isLoading = true
        error = nil
        do {
            async let tradesTask = APIService.shared.fetchGovTrades(days: selectedDays)
            async let summaryTask = APIService.shared.fetchGovTradesSummary()
            let (fetchedTrades, fetchedSummary) = try await (tradesTask, summaryTask)
            trades = fetchedTrades
            summary = fetchedSummary
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }
}
