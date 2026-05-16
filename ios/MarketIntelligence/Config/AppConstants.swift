// AppConstants.swift
// MarketIntelligence
//
// Central configuration constants for the app.
// NO API keys are stored here — all keys live in backend/.env

import Foundation

enum AppConstants {
    #if DEBUG
    static let backendBaseURL = "http://localhost:3001/api"
    #else
    static let backendBaseURL = "https://YOUR-BACKEND.up.railway.app/api"
    #endif
    static let defaultStockTickers = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA"]
    static let defaultCryptoSymbols = ["BTC", "ETH", "SOL", "DOGE"]
}
