// GovTradesListView.swift
// MarketIntelligence

import SwiftUI

// MARK: - GovTradesListView

struct GovTradesListView: View {
    @StateObject private var viewModel = GovTradesViewModel()

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading && viewModel.trades.isEmpty {
                    LoadingView()
                } else if let error = viewModel.error, viewModel.trades.isEmpty {
                    ErrorView(message: error) {
                        Task { await viewModel.loadTrades() }
                    }
                } else {
                    tradesList
                }
            }
            .navigationTitle("Gov. Trades")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Menu {
                        Picker("Chamber", selection: $viewModel.selectedChamber) {
                            Text("All").tag("All")
                            Text("Senate").tag("Senate")
                            Text("House").tag("House")
                        }
                        Picker("Party", selection: $viewModel.selectedParty) {
                            Text("All").tag("All")
                            Text("Democrat").tag("Democrat")
                            Text("Republican").tag("Republican")
                        }
                        Picker("Time Range", selection: $viewModel.selectedDays) {
                            Text("Last 7 days").tag(7)
                            Text("Last 30 days").tag(30)
                            Text("Last 90 days").tag(90)
                        }
                    } label: {
                        Image(systemName: "line.3.horizontal.decrease.circle")
                    }
                }
            }
        }
        .task { await viewModel.loadTrades() }
        .onChange(of: viewModel.selectedChamber) { _, _ in Task { await viewModel.loadTrades() } }
        .onChange(of: viewModel.selectedParty) { _, _ in Task { await viewModel.loadTrades() } }
        .onChange(of: viewModel.selectedDays) { _, _ in Task { await viewModel.loadTrades() } }
    }

    @ViewBuilder
    private var tradesList: some View {
        List {
            // Disclaimer
            Section {
                Text("This data is sourced from public STOCK Act disclosures. This is not evidence of illegal activity or investment advice.")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            // Summary stats
            if let summary = viewModel.summary {
                Section("Overview") {
                    HStack {
                        Label("\(summary.totalTrades) trades", systemImage: "chart.bar")
                        Spacer()
                        Text(summary.period).font(.caption).foregroundColor(.secondary)
                    }
                }
            }

            // Search
            Section {
                TextField("Search ticker or official name", text: $viewModel.tickerSearch)
            }

            // Trades
            Section("Recent Trades") {
                if viewModel.filteredTrades.isEmpty {
                    EmptyStateView(
                        systemImage: "building.columns",
                        title: "No Trades Found",
                        subtitle: "Try adjusting your filters."
                    )
                } else {
                    ForEach(viewModel.filteredTrades) { trade in
                        NavigationLink(destination: GovTradeDetailView(trade: trade)) {
                            GovTradeRowView(trade: trade)
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .refreshable { await viewModel.loadTrades() }
    }
}

// MARK: - GovTradeRowView

struct GovTradeRowView: View {
    let trade: GovTrade

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            // Party indicator
            Circle()
                .fill(trade.partyColor)
                .frame(width: 10, height: 10)
                .padding(.top, 4)

            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(trade.officialName)
                        .font(.subheadline.bold())
                        .lineLimit(1)
                    Spacer()
                    UrgencyTagView(urgency: trade.urgencyLevel)
                }

                Text("\(trade.chamber) · \(trade.party)")
                    .font(.caption)
                    .foregroundColor(.secondary)

                HStack(spacing: 8) {
                    Text(trade.transactionType.uppercased())
                        .font(.caption.bold())
                        .foregroundColor(
                            trade.transactionType.lowercased().contains("purchase") ? .green : .red
                        )
                    Text(trade.ticker)
                        .font(.caption.bold())
                        .foregroundColor(Color(red: 0.231, green: 0.510, blue: 0.961))
                    Text(trade.amountRange)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                if trade.isLateDisclosure {
                    Text("⚠ Disclosed \(trade.disclosureLagDays) days after trade")
                        .font(.caption)
                        .foregroundColor(.orange)
                }
            }
        }
        .padding(.vertical, 4)
    }
}

#Preview {
    GovTradesListView()
}
