// CryptoListView.swift
// MarketIntelligence

import SwiftUI

struct CryptoListView: View {
    @StateObject private var viewModel = CryptoViewModel()

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading && viewModel.cryptoList.isEmpty {
                    LoadingView()
                } else if let error = viewModel.error, viewModel.cryptoList.isEmpty {
                    ErrorView(message: error) {
                        Task { await viewModel.loadCrypto() }
                    }
                } else if viewModel.cryptoList.isEmpty {
                    EmptyStateView(
                        systemImage: "bitcoinsign.circle",
                        title: "No Crypto Data",
                        subtitle: "Pull down to load the latest crypto prices."
                    )
                } else {
                    listContent
                }
            }
            .navigationTitle("Crypto")
            .task {
                await viewModel.loadCrypto()
            }
        }
    }

    // MARK: - List Content

    private var listContent: some View {
        List {
            ForEach(viewModel.cryptoList) { crypto in
                NavigationLink(destination: CryptoDetailView(quote: crypto)) {
                    CryptoRowView(quote: crypto)
                }
                .listRowBackground(Color(.secondarySystemBackground))
                .listRowSeparator(.hidden)
                .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 16))
            }
        }
        .listStyle(.plain)
        .refreshable {
            await viewModel.loadCrypto()
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
}

// MARK: - CryptoRowView

struct CryptoRowView: View {
    let quote: CryptoQuote

    private var symbolIcon: String {
        switch quote.symbol.uppercased() {
        case "BTC": return "bitcoinsign.circle.fill"
        case "ETH": return "e.circle.fill"
        case "SOL": return "s.circle.fill"
        default: return "dollarsign.circle.fill"
        }
    }

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: symbolIcon)
                .font(.system(size: 36))
                .foregroundColor(Color(red: 0.231, green: 0.510, blue: 0.961))
                .frame(width: 44, height: 44)

            VStack(alignment: .leading, spacing: 2) {
                Text(quote.symbol)
                    .font(.subheadline.bold())
                    .foregroundColor(.primary)
                Text(quote.name)
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .lineLimit(1)
            }

            Spacer()

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
    CryptoListView()
}
