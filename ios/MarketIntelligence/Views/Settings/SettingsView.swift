// SettingsView.swift
// MarketIntelligence

import SwiftUI

struct SettingsView: View {
    @State private var showOnboarding = false
    private let sessionId = UserDefaults.standard.string(forKey: "sessionId") ?? ""

    private let accentColor = Color(red: 0.231, green: 0.510, blue: 0.961)

    var body: some View {
        NavigationStack {
            List {
                Section("My Profile") {
                    NavigationLink("My Interests & Watchlist") {
                        PreferencesView()
                    }
                    Button("Retake Onboarding Quiz") {
                        UserDefaults.standard.set(false, forKey: "onboardingComplete")
                        showOnboarding = true
                    }
                    .foregroundColor(accentColor)
                }

                Section("Notifications") {
                    Label("Price Alerts", systemImage: "bell")
                    Label("Gov Trade Alerts", systemImage: "building.columns")
                    Label("Breaking News", systemImage: "newspaper")
                }

                Section("Subscription") {
                    HStack {
                        Label("Current Plan", systemImage: "star")
                        Spacer()
                        Text("Free").foregroundColor(.secondary)
                    }
                    Button("Upgrade to Pro — $9.99/mo") {}
                        .foregroundColor(accentColor)
                    Button("Upgrade to Premium — $19.99/mo") {}
                        .foregroundColor(accentColor)
                }

                Section("Legal") {
                    Link("Privacy Policy", destination: URL(string: "https://example.com/privacy")!)
                    Link("Terms of Service", destination: URL(string: "https://example.com/terms")!)
                    Text("Market data is for informational purposes only. Not financial advice.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                Section {
                    Text("Version 1.0.0").foregroundColor(.secondary)
                }
            }
            .navigationTitle("Settings")
        }
        .fullScreenCover(isPresented: $showOnboarding) {
            OnboardingFlowView()
        }
    }
}

#Preview {
    SettingsView()
}
