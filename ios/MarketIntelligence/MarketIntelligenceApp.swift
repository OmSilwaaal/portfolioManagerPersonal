// MarketIntelligenceApp.swift
// MarketIntelligence
//
// Entry point for the MarketIntelligence iOS app.
// Minimum deployment: iOS 16
// Architecture: MVVM with @ObservableObject + async/await

import SwiftUI

@main
struct MarketIntelligenceApp: App {
    init() {
        // Request notification permission on first launch.
        // Runs asynchronously and respects the system permission dialog.
        Task {
            await NotificationService.shared.requestPermission()
        }
    }

    var body: some Scene {
        WindowGroup {
            TabBarView()
        }
    }
}
