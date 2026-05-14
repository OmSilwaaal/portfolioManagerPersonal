// Alert.swift
// MarketIntelligence

import Foundation

struct PriceAlert: Codable, Identifiable {
    let id: String
    let ticker: String
    let targetPrice: Double
    let direction: AlertDirection
    let createdAt: String
    let triggered: Bool

    var formattedTarget: String {
        String(format: "$%.2f", targetPrice)
    }

    var directionLabel: String {
        direction == .above ? "above" : "below"
    }
}

enum AlertDirection: String, Codable {
    case above
    case below
}

struct CreateAlertRequest: Codable {
    let ticker: String
    let targetPrice: Double
    let direction: String
}
