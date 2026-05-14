// DashboardViewModel.swift
// MarketIntelligence

import Foundation

@MainActor
final class DashboardViewModel: ObservableObject {
    @Published var newsFeed: [NewsItem] = []
    @Published var macroEvents: [MacroEvent] = []
    @Published var isLoading = false
    @Published var error: String?

    // MARK: - Data Loading

    func loadDashboard() async {
        isLoading = true
        error = nil
        do {
            async let feed = APIService.shared.fetchFeed()
            async let calendar = APIService.shared.fetchCalendar()
            let (fetchedFeed, fetchedCalendar) = try await (feed, calendar)
            newsFeed = fetchedFeed
            macroEvents = fetchedCalendar
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }
}
