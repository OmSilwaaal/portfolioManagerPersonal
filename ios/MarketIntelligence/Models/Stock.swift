// Stock.swift
// MarketIntelligence

import Foundation

struct StockQuote: Codable, Identifiable {
    var id: String { ticker }
    let ticker: String
    let name: String
    let price: Double
    let change: Double
    let changePercent: Double
    let volume: Double
    let marketCap: Double?
    let high: Double?
    let low: Double?
    let open: Double?
    let previousClose: Double?
    let news: [NewsItem]?

    var isPositive: Bool { change >= 0 }
    var newsItems: [NewsItem] { news ?? [] }

    var formattedPrice: String {
        String(format: "$%.2f", price)
    }

    var formattedChangePercent: String {
        let sign = isPositive ? "+" : ""
        return "\(sign)\(String(format: "%.2f", changePercent))%"
    }
}

extension StockQuote {
    init(ticker: String, name: String, price: Double, change: Double,
         changePercent: Double, volume: Double, marketCap: Double? = nil) {
        self.ticker = ticker
        self.name = name
        self.price = price
        self.change = change
        self.changePercent = changePercent
        self.volume = volume
        self.marketCap = marketCap
        self.high = nil
        self.low = nil
        self.open = nil
        self.previousClose = nil
        self.news = nil
    }
}

/// A single price point used for chart rendering.
struct PricePoint: Identifiable {
    let id = UUID()
    let date: Date
    let price: Double
}
