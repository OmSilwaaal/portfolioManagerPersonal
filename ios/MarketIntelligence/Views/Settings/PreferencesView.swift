// PreferencesView.swift
// MarketIntelligence
//
// Read-only display of current user preferences from UserDefaults / API.

import SwiftUI

struct PreferencesView: View {
    @State private var preferences: UserPreferences?
    @State private var isLoading = true
    @State private var error: String?

    private let accentColor = Color(red: 0.231, green: 0.510, blue: 0.961)

    var body: some View {
        Group {
            if isLoading {
                LoadingView()
            } else if let error {
                ErrorView(message: error) {
                    Task { await loadPreferences() }
                }
            } else if let prefs = preferences {
                preferencesContent(prefs)
            } else {
                EmptyStateView(
                    systemImage: "person.crop.circle.badge.questionmark",
                    title: "No Preferences",
                    subtitle: "Complete the onboarding quiz to set up your profile."
                )
            }
        }
        .navigationTitle("My Profile")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadPreferences() }
    }

    @ViewBuilder
    private func preferencesContent(_ prefs: UserPreferences) -> some View {
        List {
            Section("Investor Profile") {
                prefsRow(label: "Type", value: formatInvestorType(prefs.investorType))
                prefsRow(label: "Risk Tolerance", value: formatRiskTolerance(prefs.riskTolerance))
                prefsRow(label: "Update Frequency", value: formatFrequency(prefs.updateFrequency))
            }

            Section("Watchlist (\(prefs.watchlist.count))") {
                if prefs.watchlist.isEmpty {
                    Text("No assets added")
                        .foregroundColor(.secondary)
                        .font(.subheadline)
                } else {
                    ForEach(prefs.watchlist) { item in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(item.ticker)
                                    .font(.subheadline.bold())
                                    .foregroundColor(accentColor)
                                Text(item.name)
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                            Spacer()
                            Text(item.assetType.capitalized)
                                .font(.caption)
                                .foregroundColor(.secondary)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 3)
                                .background(Color(.tertiarySystemBackground))
                                .cornerRadius(6)
                        }
                    }
                }
            }

            Section("Followed Categories") {
                if prefs.watchedCategories.isEmpty {
                    Text("None selected")
                        .foregroundColor(.secondary)
                        .font(.subheadline)
                } else {
                    ForEach(prefs.watchedCategories, id: \.self) { category in
                        Label(formatCategory(category), systemImage: categoryIcon(category))
                    }
                }
            }

            Section("Priority Alerts") {
                if prefs.priorityAlerts.isEmpty {
                    Text("None selected")
                        .foregroundColor(.secondary)
                        .font(.subheadline)
                } else {
                    ForEach(prefs.priorityAlerts, id: \.self) { alert in
                        Text(formatAlert(alert))
                            .font(.subheadline)
                    }
                }
            }

            Section {
                Text("To update these preferences, retake the onboarding quiz from Settings.")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .listStyle(.insetGrouped)
    }

    private func loadPreferences() async {
        isLoading = true
        error = nil
        let sessionId = UserDefaults.standard.string(forKey: "sessionId") ?? ""
        guard !sessionId.isEmpty else {
            isLoading = false
            return
        }
        do {
            preferences = try await APIService.shared.fetchPreferences(sessionId: sessionId)
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }

    @ViewBuilder
    private func prefsRow(label: String, value: String) -> some View {
        HStack {
            Text(label)
                .foregroundColor(.secondary)
            Spacer()
            Text(value.isEmpty ? "—" : value)
                .font(.subheadline.bold())
        }
    }

    private func formatInvestorType(_ raw: String) -> String {
        switch raw {
        case "beginner": return "Just Starting Out"
        case "occasional": return "Occasional Investor"
        case "regular": return "Regular Investor"
        case "active": return "Active Trader"
        default: return raw.capitalized
        }
    }

    private func formatRiskTolerance(_ raw: String) -> String {
        switch raw {
        case "conservative": return "Conservative"
        case "moderate": return "Moderate"
        case "aggressive": return "Aggressive"
        case "speculative": return "Speculative"
        default: return raw.capitalized
        }
    }

    private func formatFrequency(_ raw: String) -> String {
        switch raw {
        case "realtime": return "Real-time"
        case "several": return "A few times a day"
        case "daily": return "Daily digest"
        case "weekly": return "Weekly summary"
        default: return raw.capitalized
        }
    }

    private func formatCategory(_ raw: String) -> String {
        switch raw {
        case "stocks": return "US Stocks"
        case "crypto": return "Crypto"
        case "commodities": return "Commodities"
        case "gov-trades": return "Gov. Insider Trades"
        case "forex": return "Forex"
        case "etfs": return "ETFs & Index Funds"
        case "options": return "Options Flow"
        default: return raw.capitalized
        }
    }

    private func categoryIcon(_ raw: String) -> String {
        switch raw {
        case "stocks": return "chart.line.uptrend.xyaxis"
        case "crypto": return "bitcoinsign.circle"
        case "commodities": return "cylinder"
        case "gov-trades": return "building.columns"
        case "forex": return "dollarsign.circle"
        case "etfs": return "square.grid.2x2"
        case "options": return "arrow.triangle.2.circlepath"
        default: return "circle"
        }
    }

    private func formatAlert(_ raw: String) -> String {
        switch raw {
        case "breaking-price": return "Breaking price news"
        case "gov-trades": return "Gov official trades"
        case "volume-spikes": return "Volume spikes"
        case "earnings": return "Earnings dates"
        case "macro": return "Fed & macro events"
        case "price-move": return "Price move alerts"
        case "analyst-upgrades": return "Analyst upgrades"
        default: return raw
        }
    }
}
