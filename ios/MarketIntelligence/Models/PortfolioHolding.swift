// PortfolioHolding.swift
// MarketIntelligence

import Foundation

struct PortfolioHolding: Identifiable {
    let id = UUID()
    var ticker: String
    var quantity: Double
}
