// MarketIntelligenceApp.swift
// MarketIntelligence
//
// Entry point for the MarketIntelligence iOS app.
// Minimum deployment: iOS 16
// Architecture: MVVM with @ObservableObject + async/await

import SwiftUI

@main
struct MarketIntelligenceApp: App {
    @State private var onboardingComplete = UserDefaults.standard.bool(forKey: "onboardingComplete")

    var body: some Scene {
        WindowGroup {
            if onboardingComplete {
                TabBarView()
            } else {
                OnboardingFlowView()
            }
        }
        .task {
            await NotificationService.shared.requestPermission()
        }
    }
}
