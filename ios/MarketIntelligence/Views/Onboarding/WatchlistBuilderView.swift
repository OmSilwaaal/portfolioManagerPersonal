// WatchlistBuilderView.swift
// MarketIntelligence

import SwiftUI

struct WatchlistBuilderView: View {
    @ObservedObject var viewModel: OnboardingViewModel

    @State private var searchText = ""

    let suggestions: [(ticker: String, name: String, type: String)] = [
        ("AAPL", "Apple", "stock"), ("NVDA", "NVIDIA", "stock"),
        ("TSLA", "Tesla", "stock"), ("MSFT", "Microsoft", "stock"),
        ("AMZN", "Amazon", "stock"), ("GOOGL", "Alphabet", "stock"),
        ("META", "Meta", "stock"), ("SPY", "S&P 500 ETF", "stock"),
        ("BTC", "Bitcoin", "crypto"), ("ETH", "Ethereum", "crypto"),
        ("SOL", "Solana", "crypto"), ("BNB", "BNB", "crypto"),
        ("DOGE", "Dogecoin", "crypto"), ("WTI", "Crude Oil", "commodity"),
        ("GOLD", "Gold", "commodity"), ("SILVER", "Silver", "commodity"),
    ]

    var filteredSuggestions: [(ticker: String, name: String, type: String)] {
        if searchText.isEmpty { return suggestions }
        return suggestions.filter {
            $0.ticker.localizedCaseInsensitiveContains(searchText) ||
            $0.name.localizedCaseInsensitiveContains(searchText)
        }
    }

    private let accentColor = Color(red: 0.231, green: 0.510, blue: 0.961)

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("What do you want to track?")
                .font(.title2.bold())
                .padding(.horizontal)

            Text("Add assets to your personal watchlist")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .padding(.horizontal)

            // Current watchlist tags
            if !viewModel.answers.watchlist.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(viewModel.answers.watchlist) { item in
                            HStack(spacing: 4) {
                                Text(item.ticker).font(.caption.bold())
                                Button {
                                    viewModel.removeWatchlistItem(item.ticker)
                                } label: {
                                    Image(systemName: "xmark").font(.caption2)
                                }
                            }
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(accentColor.opacity(0.2))
                            .foregroundColor(accentColor)
                            .cornerRadius(20)
                        }
                    }
                    .padding(.horizontal)
                }
            }

            // Search
            TextField("Search tickers (AAPL, BTC, GOLD...)", text: $searchText)
                .textFieldStyle(.roundedBorder)
                .padding(.horizontal)
                .textInputAutocapitalization(.characters)

            // Suggestions grid
            LazyVGrid(
                columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())],
                spacing: 8
            ) {
                ForEach(filteredSuggestions, id: \.ticker) { suggestion in
                    let isAdded = viewModel.answers.watchlist.contains(where: { $0.ticker == suggestion.ticker })
                    Button {
                        if isAdded {
                            viewModel.removeWatchlistItem(suggestion.ticker)
                        } else {
                            viewModel.addWatchlistItem(
                                WatchlistItem(
                                    ticker: suggestion.ticker,
                                    assetType: suggestion.type,
                                    name: suggestion.name
                                )
                            )
                        }
                    } label: {
                        VStack(spacing: 2) {
                            Text(suggestion.ticker).font(.caption.bold())
                            Text(suggestion.name).font(.caption2).lineLimit(1)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .background(isAdded ? accentColor.opacity(0.2) : Color(.secondarySystemBackground))
                        .foregroundColor(isAdded ? accentColor : .primary)
                        .cornerRadius(8)
                        .overlay(
                            RoundedRectangle(cornerRadius: 8)
                                .stroke(isAdded ? accentColor : Color.clear, lineWidth: 1)
                        )
                    }
                }
            }
            .padding(.horizontal)

            Button {
                viewModel.nextQuestion()
            } label: {
                Text("Continue (\(viewModel.answers.watchlist.count) selected)")
                    .font(.headline)
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(accentColor)
                    .cornerRadius(12)
            }
            .padding(.horizontal)
        }
    }
}
