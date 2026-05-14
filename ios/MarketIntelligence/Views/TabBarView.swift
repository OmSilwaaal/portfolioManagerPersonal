// TabBarView.swift
// MarketIntelligence

import SwiftUI

struct TabBarView: View {
    @State private var selectedTab = 0

    private let accentColor = Color(red: 0.231, green: 0.510, blue: 0.961)

    var body: some View {
        TabView(selection: $selectedTab) {
            DashboardView()
                .tabItem {
                    Label("Dashboard", systemImage: "house")
                }
                .tag(0)

            StocksListView()
                .tabItem {
                    Label("Markets", systemImage: "chart.line.uptrend.xyaxis")
                }
                .tag(1)

            CryptoListView()
                .tabItem {
                    Label("Crypto", systemImage: "bitcoinsign.circle")
                }
                .tag(2)

            AlertsView()
                .tabItem {
                    Label("Alerts", systemImage: "bell")
                }
                .tag(3)
        }
        .tint(accentColor)
    }
}

#Preview {
    TabBarView()
}
