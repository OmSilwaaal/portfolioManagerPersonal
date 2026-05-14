// CryptoAsset.swift
// MarketIntelligence

import Foundation

struct CryptoQuote: Codable, Identifiable {
    var id: String { symbol }
    let symbol: String
    let name: String
    let price: Double
    let change24h: Double
    let changePercent24h: Double
    let volume24h: Double

    var isPositive: Bool { change24h >= 0 }

    var formattedPrice: String {
        if price >= 1000 {
            return String(format: "$%.2f", price)
        } else if price >= 1 {
            return String(format: "$%.4f", price)
        } else {
            return String(format: "$%.6f", price)
        }
    }

    var formattedChangePercent: String {
        let sign = isPositive ? "+" : ""
        return "\(sign)\(String(format: "%.2f", changePercent24h))%"
    }
}
