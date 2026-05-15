// WebSocketService.swift
// MarketIntelligence
//
// Lightweight WebSocket client for real-time price streaming (Finnhub).

import Foundation

@MainActor
class WebSocketService: ObservableObject {
    static let shared = WebSocketService()

    @Published var livePrices: [String: Double] = [:]
    @Published var isConnected = false

    private var webSocketTask: URLSessionWebSocketTask?
    private var reconnectAttempts = 0
    private let maxReconnectAttempts = 5
    private var subscribedTickers: [String] = []

    private init() {}

    func connect(tickers: [String]) {
        guard let apiKey = ProcessInfo.processInfo.environment["FINNHUB_API_KEY"],
              !apiKey.isEmpty else { return }
        guard let url = URL(string: "wss://ws.finnhub.io?token=\(apiKey)") else { return }
        subscribedTickers = tickers
        webSocketTask = URLSession.shared.webSocketTask(with: url)
        webSocketTask?.resume()
        isConnected = true
        for ticker in tickers {
            subscribe(to: ticker)
        }
        receiveMessages()
    }

    private func subscribe(to ticker: String) {
        let msg = "{\"type\":\"subscribe\",\"symbol\":\"\(ticker)\"}"
        webSocketTask?.send(.string(msg)) { _ in }
    }

    private func receiveMessages() {
        webSocketTask?.receive { [weak self] result in
            switch result {
            case .success(let message):
                if case .string(let text) = message {
                    self?.handleMessage(text)
                }
                self?.receiveMessages()
            case .failure:
                self?.scheduleReconnect()
            }
        }
    }

    private func handleMessage(_ text: String) {
        // Parse Finnhub trade message: {"type":"trade","data":[{"p":150.25,"s":"AAPL",...}]}
        guard let data = text.data(using: .utf8),
              let json = try? JSONDecoder().decode(FinnhubTradeMessage.self, from: data),
              json.type == "trade" else { return }
        Task { @MainActor in
            for trade in json.data ?? [] {
                self.livePrices[trade.s] = trade.p
            }
        }
    }

    private func scheduleReconnect() {
        guard reconnectAttempts < maxReconnectAttempts else { return }
        reconnectAttempts += 1
        let delay = Double(reconnectAttempts) * 2.0
        let tickers = subscribedTickers
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            self.connect(tickers: tickers)
        }
    }

    func disconnect() {
        webSocketTask?.cancel(with: .normalClosure, reason: nil)
        webSocketTask = nil
        isConnected = false
        reconnectAttempts = 0
    }
}

private struct FinnhubTradeMessage: Codable {
    let type: String
    let data: [FinnhubTrade]?
}

private struct FinnhubTrade: Codable {
    let p: Double   // price
    let s: String   // symbol
}
