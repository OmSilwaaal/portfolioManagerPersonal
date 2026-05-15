// CopySignal.swift
// MarketIntelligence

import Foundation

struct CopySignal: Codable, Identifiable {
    let id: String
    let traderName: String
    let traderWinRate: Double
    let asset: String
    let ticker: String
    let direction: String       // "BUY" or "SELL"
    let confidence: Double      // 0.0 - 1.0
    let reasoning: String
    let timestamp: String
    let isDisclaimer: Bool      // always true — for educational only
}
