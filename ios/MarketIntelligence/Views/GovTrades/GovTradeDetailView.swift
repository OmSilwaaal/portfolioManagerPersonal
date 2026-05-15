// GovTradeDetailView.swift
// MarketIntelligence

import SwiftUI

struct GovTradeDetailView: View {
    let trade: GovTrade

    @StateObject private var stockViewModel = StockViewModel()
    @State private var trackerAdded = false

    private let accentColor = Color(red: 0.231, green: 0.510, blue: 0.961)

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {

                // MARK: Official header
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 8) {
                        Circle()
                            .fill(trade.partyColor)
                            .frame(width: 12, height: 12)
                        Text(trade.title)
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }

                    Text(trade.officialName)
                        .font(.title2.bold())

                    Text("\(trade.chamber) · \(trade.party)")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
                .padding(.horizontal)
                .padding(.top, 8)

                Divider().padding(.horizontal)

                // MARK: Trade summary card
                VStack(alignment: .leading, spacing: 14) {
                    Text("Trade Summary")
                        .font(.headline)

                    HStack {
                        tradeDetailRow(label: "Ticker", value: trade.ticker, valueColor: accentColor)
                        Spacer()
                        VStack(alignment: .trailing, spacing: 2) {
                            Text("Type")
                                .font(.caption)
                                .foregroundColor(.secondary)
                            Text(trade.transactionType.uppercased())
                                .font(.subheadline.bold())
                                .foregroundColor(
                                    trade.transactionType.lowercased().contains("purchase") ? .green : .red
                                )
                        }
                    }

                    Divider()

                    tradeDetailRow(label: "Asset", value: trade.assetName)
                    tradeDetailRow(label: "Amount Range", value: trade.amountRange)
                    tradeDetailRow(label: "Trade Date", value: trade.formattedTradeDate)
                    tradeDetailRow(label: "Disclosure Date", value: trade.formattedDisclosureDate)
                    tradeDetailRow(label: "Disclosure Lag", value: "\(trade.disclosureLagDays) days")

                    if trade.committeeOverlap {
                        HStack(spacing: 6) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .foregroundColor(.orange)
                            Text("Committee overlap detected — official may sit on a committee related to this sector.")
                                .font(.caption)
                                .foregroundColor(.orange)
                        }
                        .padding(10)
                        .background(Color.orange.opacity(0.1))
                        .cornerRadius(8)
                    }
                }
                .padding()
                .background(Color(.secondarySystemBackground))
                .cornerRadius(14)
                .padding(.horizontal)

                // MARK: Late disclosure warning
                if trade.isLateDisclosure {
                    HStack(spacing: 10) {
                        Image(systemName: "clock.badge.exclamationmark")
                            .font(.title3)
                            .foregroundColor(.orange)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Late Disclosure")
                                .font(.subheadline.bold())
                                .foregroundColor(.orange)
                            Text("This trade was disclosed \(trade.disclosureLagDays) days after it occurred. STOCK Act requires disclosure within 45 days.")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                    .padding()
                    .background(Color.orange.opacity(0.08))
                    .cornerRadius(12)
                    .padding(.horizontal)
                }

                // MARK: Urgency
                HStack {
                    Text("Signal Urgency")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                    Spacer()
                    UrgencyTagView(urgency: trade.urgencyLevel)
                }
                .padding(.horizontal)

                // MARK: Track ticker button
                Button {
                    Task {
                        await stockViewModel.addTicker(trade.ticker)
                        trackerAdded = true
                    }
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: trackerAdded ? "checkmark.circle.fill" : "plus.circle")
                        Text(trackerAdded ? "Added to Watchlist" : "Track \(trade.ticker)")
                    }
                    .font(.headline)
                    .foregroundColor(trackerAdded ? .white : accentColor)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(trackerAdded ? accentColor : accentColor.opacity(0.1))
                    .cornerRadius(12)
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(trackerAdded ? Color.clear : accentColor, lineWidth: 1.5)
                    )
                }
                .disabled(trackerAdded)
                .animation(.easeInOut(duration: 0.2), value: trackerAdded)
                .padding(.horizontal)

                // MARK: Source
                if !trade.source.isEmpty {
                    Text("Source: \(trade.source)")
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .padding(.horizontal)
                }

                // MARK: Disclaimer
                VStack(alignment: .leading, spacing: 6) {
                    Label("Disclaimer", systemImage: "info.circle")
                        .font(.caption.bold())
                        .foregroundColor(.secondary)
                    Text("This data is sourced from public STOCK Act disclosures filed with the House or Senate. Disclosure of a trade is a legal requirement, not evidence of wrongdoing or insider trading. This is not investment advice.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                .padding()
                .background(Color(.tertiarySystemBackground))
                .cornerRadius(10)
                .padding(.horizontal)
                .padding(.bottom, 24)
            }
        }
        .navigationTitle("Trade Detail")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            // Check if ticker is already tracked
            trackerAdded = stockViewModel.trackedTickers.contains(trade.ticker.uppercased())
        }
    }

    @ViewBuilder
    private func tradeDetailRow(label: String, value: String, valueColor: Color = .primary) -> some View {
        HStack {
            Text(label)
                .font(.subheadline)
                .foregroundColor(.secondary)
            Spacer()
            Text(value)
                .font(.subheadline.bold())
                .foregroundColor(valueColor)
        }
    }
}
