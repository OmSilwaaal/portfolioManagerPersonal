// StocksListView.swift
// MarketIntelligence

import SwiftUI

struct StocksListView: View {
    @StateObject private var viewModel = StockViewModel()
    @State private var showAddSheet = false
    @State private var newTickerInput = ""

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading && viewModel.watchlist.isEmpty {
                    LoadingView()
                } else if let error = viewModel.error, viewModel.watchlist.isEmpty {
                    ErrorView(message: error) {
                        Task { await viewModel.loadWatchlist() }
                    }
                } else if viewModel.watchlist.isEmpty {
                    EmptyStateView(
                        systemImage: "chart.line.uptrend.xyaxis",
                        title: "No Stocks",
                        subtitle: "Tap + to add tickers to your watchlist."
                    )
                } else {
                    listContent
                }
            }
            .navigationTitle("Markets")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        showAddSheet = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showAddSheet) {
                addTickerSheet
            }
            .task {
                await viewModel.loadWatchlist()
            }
        }
    }

    // MARK: - List Content

    private var listContent: some View {
        List {
            ForEach(viewModel.watchlist) { quote in
                NavigationLink(destination: StockDetailView(quote: quote)) {
                    StockRowView(quote: quote)
                }
                .listRowBackground(Color(.secondarySystemBackground))
                .listRowSeparator(.hidden)
                .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 16))
            }
            .onDelete(perform: viewModel.removeTickers)
        }
        .listStyle(.plain)
        .refreshable {
            await viewModel.loadWatchlist()
        }
        .overlay(alignment: .bottom) {
            if viewModel.isLoading {
                ProgressView()
                    .padding(8)
                    .background(Color(.secondarySystemBackground))
                    .cornerRadius(8)
                    .padding(.bottom, 16)
            }
        }
    }

    // MARK: - Add Ticker Sheet

    private var addTickerSheet: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Ticker symbol (e.g. TSLA)", text: $newTickerInput)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.characters)
                } header: {
                    Text("Add to Watchlist")
                } footer: {
                    Text("Enter the stock ticker symbol you want to track.")
                }
            }
            .navigationTitle("Add Stock")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        newTickerInput = ""
                        showAddSheet = false
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        let ticker = newTickerInput.uppercased().trimmingCharacters(in: .whitespaces)
                        if !ticker.isEmpty {
                            Task {
                                await viewModel.addTicker(ticker)
                            }
                        }
                        newTickerInput = ""
                        showAddSheet = false
                    }
                    .disabled(newTickerInput.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
        .presentationDetents([.medium])
    }
}

// MARK: - StockRowView

struct StockRowView: View {
    let quote: StockQuote

    var body: some View {
        HStack(spacing: 12) {
            // Ticker circle icon
            ZStack {
                Circle()
                    .fill(Color(red: 0.231, green: 0.510, blue: 0.961).opacity(0.12))
                    .frame(width: 44, height: 44)
                Text(String(quote.ticker.prefix(2)))
                    .font(.subheadline.bold())
                    .foregroundColor(Color(red: 0.231, green: 0.510, blue: 0.961))
            }

            // Name + ticker
            VStack(alignment: .leading, spacing: 2) {
                Text(quote.ticker)
                    .font(.subheadline.bold())
                    .foregroundColor(.primary)
                Text(quote.name)
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .lineLimit(1)
            }

            Spacer()

            // Price + change
            VStack(alignment: .trailing, spacing: 2) {
                Text(quote.formattedPrice)
                    .font(.subheadline.bold())
                    .foregroundColor(.primary)
                HStack(spacing: 2) {
                    Image(systemName: quote.isPositive ? "arrow.up.right" : "arrow.down.right")
                        .font(.caption2)
                    Text(quote.formattedChangePercent)
                        .font(.caption.bold())
                }
                .foregroundColor(quote.isPositive ? .green : .red)
            }

            Image(systemName: "chevron.right")
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .padding(12)
        .background(Color(.secondarySystemBackground))
        .cornerRadius(10)
    }
}

#Preview {
    StocksListView()
}
