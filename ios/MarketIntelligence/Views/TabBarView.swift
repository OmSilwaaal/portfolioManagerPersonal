// TabBarView.swift
// MarketIntelligence

import SwiftUI

struct TabBarView: View {
    private let accentColor = Color(red: 0.231, green: 0.510, blue: 0.961)

    var body: some View {
        TabView {
            DashboardView()
                .tabItem {
                    Label("Feed", systemImage: "house")
                }

            StocksListView()
                .tabItem {
                    Label("Markets", systemImage: "chart.line.uptrend.xyaxis")
                }

            GovTradesListView()
                .tabItem {
                    Label("Gov Trades", systemImage: "building.columns")
                }

            AlertsView()
                .tabItem {
                    Label("Alerts", systemImage: "bell")
                }

            SettingsView()
                .tabItem {
                    Label("Settings", systemImage: "gearshape")
                }
        }
        .tint(accentColor)
    }
}

#Preview {
    TabBarView()
}
