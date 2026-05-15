// UserPreferences.swift
// MarketIntelligence

import Foundation

struct UserPreferences: Codable {
    var sessionId: String
    var investorType: String        // "beginner", "occasional", "regular", "active"
    var riskTolerance: String       // "conservative", "moderate", "aggressive", "speculative"
    var updateFrequency: String     // "realtime", "several", "daily", "weekly"
    var watchedCategories: [String] // ["stocks", "crypto", "commodities", "gov-trades"]
    var priorityAlerts: [String]
    var watchlist: [WatchlistItem]
    var onboardingComplete: Bool

    static var empty: UserPreferences {
        UserPreferences(
            sessionId: UUID().uuidString,
            investorType: "",
            riskTolerance: "",
            updateFrequency: "",
            watchedCategories: [],
            priorityAlerts: [],
            watchlist: [],
            onboardingComplete: false
        )
    }
}

struct WatchlistItem: Codable, Identifiable {
    var id: String { ticker }
    let ticker: String
    let assetType: String   // "stock", "crypto", "commodity"
    let name: String
}
