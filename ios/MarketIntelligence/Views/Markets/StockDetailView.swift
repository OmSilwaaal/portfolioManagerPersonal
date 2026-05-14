// StockDetailView.swift
// MarketIntelligence

import SwiftUI

struct StockDetailView: View {
    let quote: StockQuote

    @StateObject private var viewModel = StockViewModel()
    @State private var chartData: [PricePoint] = []

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                // Price header
                priceHeader

                // Chart
                VStack(alignment: .leading, spacing: 8) {
                    Text("7-Day Price")
                        .font(.caption.bold())
                        .foregroundColor(.secondary)
                        .textCase(.uppercase)
                    StockChartView(data: chartData)
                        .padding(.vertical, 4)
                }
                .padding(16)
                .background(Color(.secondarySystemBackground))
                .cornerRadius(12)

                // Stats grid
                statsGrid

                // News section
                newsSection
            }
            .padding(16)
        }
        .navigationTitle(quote.ticker)
        .navigationBarTitleDisplayMode(.large)
        .background(Color(.systemBackground))
        .onAppear {
            chartData = StockChartView.generateDummyData(currentPrice: quote.price)
            Task { await viewModel.fetchNewsFor(ticker: quote.ticker) }
        }
    }

    // MARK: - Price Header

    private var priceHeader: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(quote.name)
                .font(.subheadline)
                .foregroundColor(.secondary)
            Text(quote.formattedPrice)
                .font(.largeTitle.bold())
                .foregroundColor(.primary)
            HStack(spacing: 6) {
                Image(systemName: quote.isPositive ? "arrow.up.right" : "arrow.down.right")
                    .font(.subheadline)
                Text(quote.formattedChangePercent)
                    .font(.subheadline.bold())
            }
            .foregroundColor(quote.isPositive ? .green : .red)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground))
        .cornerRadius(12)
    }

    // MARK: - Stats Grid

    private var statsGrid: some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
            StatCell(label: "Change", value: String(format: "%+.2f", quote.change), positive: quote.isPositive)
            StatCell(label: "Volume", value: formatLargeNumber(quote.volume))
            if let cap = quote.marketCap {
                StatCell(label: "Market Cap", value: formatLargeNumber(cap))
            }
        }
    }

    // MARK: - News Section

    @ViewBuilder
    private var newsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Related News")
                .font(.headline)
                .foregroundColor(.primary)

            if viewModel.selectedNews.isEmpty {
                EmptyStateView(
                    systemImage: "newspaper",
                    title: "No News",
                    subtitle: "No recent news for \(quote.ticker)."
                )
                .frame(height: 160)
            } else {
                ForEach(viewModel.selectedNews) { item in
                    NavigationLink(destination: NewsDetailView(news: item)) {
                        NewsCardView(news: item)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    // MARK: - Helpers

    private func formatLargeNumber(_ value: Double) -> String {
        switch value {
        case 1_000_000_000_000...:
            return String(format: "%.2fT", value / 1_000_000_000_000)
        case 1_000_000_000...:
            return String(format: "%.2fB", value / 1_000_000_000)
        case 1_000_000...:
            return String(format: "%.2fM", value / 1_000_000)
        default:
            return String(format: "%.0f", value)
        }
    }
}

// MARK: - StatCell

struct StatCell: View {
    let label: String
    let value: String
    var positive: Bool? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.caption)
                .foregroundColor(.secondary)
            Text(value)
                .font(.subheadline.bold())
                .foregroundColor(
                    positive.map { $0 ? Color.green : Color.red } ?? Color.primary
                )
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground))
        .cornerRadius(10)
    }
}

#Preview {
    NavigationStack {
        StockDetailView(quote: StockQuote(
            ticker: "AAPL",
            name: "Apple Inc.",
            price: 189.50,
            change: 2.35,
            changePercent: 1.26,
            volume: 54_320_000,
            marketCap: 2_980_000_000_000
        ))
    }
}
