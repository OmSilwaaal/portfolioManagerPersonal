// CryptoDetailView.swift
// MarketIntelligence

import SwiftUI
import Charts

struct CryptoDetailView: View {
    let quote: CryptoQuote

    @StateObject private var viewModel = CryptoViewModel()
    @State private var chartData: [PricePoint] = []

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                // Price header
                priceHeader

                // Chart stub
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

                // Stats
                statsGrid

                // News
                newsSection
            }
            .padding(16)
        }
        .navigationTitle(quote.symbol)
        .navigationBarTitleDisplayMode(.large)
        .background(Color(.systemBackground))
        .onAppear {
            chartData = StockChartView.generateDummyData(currentPrice: quote.price)
            Task { await viewModel.fetchNewsFor(symbol: quote.symbol) }
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
                Text("24h")
                    .font(.caption)
                    .foregroundColor(.secondary)
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
            StatCell(
                label: "24h Change",
                value: String(format: "%+.4f", quote.change24h),
                positive: quote.isPositive
            )
            StatCell(
                label: "24h Volume",
                value: formatLargeNumber(quote.volume24h)
            )
        }
    }

    // MARK: - News Section

    @ViewBuilder
    private var newsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Related News")
                .font(.headline)
                .foregroundColor(.primary)

            if viewModel.isLoading {
                ProgressView()
                    .frame(maxWidth: .infinity, minHeight: 80)
            } else if viewModel.selectedNews.isEmpty {
                EmptyStateView(
                    systemImage: "newspaper",
                    title: "No News",
                    subtitle: "No recent news for \(quote.symbol)."
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
            return String(format: "%.2f", value)
        }
    }
}

#Preview {
    NavigationStack {
        CryptoDetailView(quote: CryptoQuote(
            symbol: "BTC",
            name: "Bitcoin",
            price: 67_420.50,
            change24h: 1_230.40,
            changePercent24h: 1.86,
            volume24h: 28_400_000_000
        ))
    }
}
