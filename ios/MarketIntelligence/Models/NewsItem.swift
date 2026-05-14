// NewsItem.swift
// MarketIntelligence

import SwiftUI

struct NewsItem: Codable, Identifiable {
    let id: String
    let headline: String
    let source: String
    let publishedAt: String
    let url: String
    let ticker: String?
    let summary: String
    let urgency: Urgency
    let reasoning: String
    let sentiment: Double

    /// Returns a human-readable relative timestamp, e.g. "2h ago", "just now".
    var relativeTime: String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        var date = formatter.date(from: publishedAt)
        if date == nil {
            // fallback without fractional seconds
            let fallback = ISO8601DateFormatter()
            date = fallback.date(from: publishedAt)
        }
        guard let date else { return publishedAt }
        let interval = -date.timeIntervalSinceNow
        switch interval {
        case ..<60:
            return "just now"
        case 60..<3600:
            let mins = Int(interval / 60)
            return "\(mins)m ago"
        case 3600..<86400:
            let hrs = Int(interval / 3600)
            return "\(hrs)h ago"
        default:
            let days = Int(interval / 86400)
            return "\(days)d ago"
        }
    }
}

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

    var displayText: String { rawValue }
}
