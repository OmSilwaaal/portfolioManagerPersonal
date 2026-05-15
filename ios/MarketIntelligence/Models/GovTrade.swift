// GovTrade.swift
// MarketIntelligence

import Foundation
import SwiftUI

struct GovTrade: Codable, Identifiable {
    let id: String
    let officialName: String
    let title: String           // "Senator" or "Representative"
    let chamber: String         // "Senate" or "House"
    let party: String           // "Democrat", "Republican", "Independent"
    let ticker: String
    let assetName: String
    let transactionType: String // "Purchase", "Sale", "Sale (Partial)"
    let tradeDate: String
    let disclosureDate: String
    let disclosureLagDays: Int
    let amountRange: String
    let committeeOverlap: Bool
    let urgency: String         // "Low", "Watch", "Act Now"
    let source: String

    var urgencyLevel: Urgency {
        Urgency(rawValue: urgency) ?? .low
    }

    var partyColor: Color {
        switch party.lowercased() {
        case "democrat": return .blue
        case "republican": return .red
        default: return .gray
        }
    }

    var isLateDisclosure: Bool { disclosureLagDays > 30 }

    var formattedTradeDate: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        guard let date = formatter.date(from: tradeDate) else { return tradeDate }
        let display = DateFormatter()
        display.dateStyle = .medium
        return display.string(from: date)
    }

    var formattedDisclosureDate: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        guard let date = formatter.date(from: disclosureDate) else { return disclosureDate }
        let display = DateFormatter()
        display.dateStyle = .medium
        return display.string(from: date)
    }
}

struct GovTradesResponse: Codable {
    let trades: [GovTrade]
    let total: Int
    let disclaimer: String
}

struct TraderStat: Codable, Identifiable {
    var id: String { name }
    let name: String
    let tradeCount: Int
}

struct TickerStat: Codable, Identifiable {
    var id: String { ticker }
    let ticker: String
    let tradeCount: Int
}

struct GovTradesSummary: Codable {
    let totalTrades: Int
    let topTraders: [TraderStat]
    let topTickers: [TickerStat]
    let period: String
    let disclaimer: String?
    let partyBreakdown: [String: Int]?
    let urgencyBreakdown: [String: Int]?
}
