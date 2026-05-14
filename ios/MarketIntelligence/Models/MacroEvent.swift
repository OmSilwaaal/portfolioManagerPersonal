// MacroEvent.swift
// MarketIntelligence

import Foundation

struct MacroEvent: Codable, Identifiable {
    let id: String
    let date: String
    let title: String       // backend key: "event"
    let type: String        // backend key: "category"
    let importance: String
    let aiImpact: String    // backend key: "aiBlurb"
    let ticker: String?

    enum CodingKeys: String, CodingKey {
        case id, date, importance, ticker
        case title = "event"
        case type = "category"
        case aiImpact = "aiBlurb"
    }

    var formattedDate: String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        var date = formatter.date(from: self.date)
        if date == nil {
            let fallback = ISO8601DateFormatter()
            date = fallback.date(from: self.date)
        }
        guard let date else { return self.date }
        let display = DateFormatter()
        display.dateFormat = "MMM d"
        return display.string(from: date)
    }
}
