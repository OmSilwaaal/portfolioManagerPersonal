// AppConstants.swift
// MarketIntelligence
//
// Central configuration constants for the app.
// NO API keys are stored here — all keys live in backend/.env

import Foundation

enum AppConstants {
    static let backendBaseURL = "http://localhost:3001/api"
    static let defaultStockTickers = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA"]
    static let defaultCryptoSymbols = ["BTC", "ETH", "SOL", "DOGE"]
}
