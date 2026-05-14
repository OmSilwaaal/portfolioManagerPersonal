// AlertsView.swift
// MarketIntelligence

import SwiftUI

struct AlertsView: View {
    @StateObject private var viewModel = AlertsViewModel()
    @State private var showCreateSheet = false

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading && viewModel.alerts.isEmpty {
                    LoadingView()
                } else if let error = viewModel.error, viewModel.alerts.isEmpty {
                    ErrorView(message: error) {
                        Task { await viewModel.loadAlerts() }
                    }
                } else if viewModel.alerts.isEmpty {
                    emptyState
                } else {
                    alertsList
                }
            }
            .navigationTitle("Alerts")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        showCreateSheet = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showCreateSheet) {
                CreateAlertView(viewModel: viewModel)
            }
            .task {
                await viewModel.loadAlerts()
            }
        }
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack {
            EmptyStateView(
                systemImage: "bell.slash",
                title: "No Alerts",
                subtitle: "Tap + to create a price alert for any stock or crypto."
            )
            Button {
                showCreateSheet = true
            } label: {
                Label("Create Alert", systemImage: "plus.circle")
                    .font(.subheadline.bold())
                    .foregroundColor(.white)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 10)
                    .background(Color(red: 0.231, green: 0.510, blue: 0.961))
                    .cornerRadius(8)
            }
            .padding(.bottom, 40)
        }
    }

    // MARK: - Alerts List

    private var alertsList: some View {
        List {
            ForEach(viewModel.alerts) { alert in
                AlertRowView(alert: alert) {
                    viewModel.deleteAlert(id: alert.id)
                }
                .listRowBackground(Color(.secondarySystemBackground))
                .listRowSeparator(.hidden)
                .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 16))
            }
            .onDelete(perform: viewModel.deleteAlert)
        }
        .listStyle(.plain)
        .refreshable {
            await viewModel.loadAlerts()
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

// MARK: - AlertRowView

struct AlertRowView: View {
    let alert: PriceAlert
    let onDelete: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            // Bell icon with triggered state
            ZStack {
                Circle()
                    .fill(alert.triggered
                          ? Color.green.opacity(0.15)
                          : Color(red: 0.231, green: 0.510, blue: 0.961).opacity(0.12))
                    .frame(width: 44, height: 44)
                Image(systemName: alert.triggered ? "bell.fill" : "bell")
                    .font(.subheadline)
                    .foregroundColor(alert.triggered
                                     ? .green
                                     : Color(red: 0.231, green: 0.510, blue: 0.961))
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(alert.ticker)
                    .font(.subheadline.bold())
                    .foregroundColor(.primary)
                Text("\(alert.directionLabel.capitalized) \(alert.formattedTarget)")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 2) {
                if alert.triggered {
                    Text("Triggered")
                        .font(.caption.bold())
                        .foregroundColor(.green)
                } else {
                    Text("Active")
                        .font(.caption.bold())
                        .foregroundColor(Color(red: 0.231, green: 0.510, blue: 0.961))
                }
                Text(alert.createdAt.prefix(10))
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }
        }
        .padding(12)
        .background(Color(.secondarySystemBackground))
        .cornerRadius(10)
    }
}

#Preview {
    AlertsView()
}
