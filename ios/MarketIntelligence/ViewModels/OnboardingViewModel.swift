// OnboardingViewModel.swift
// MarketIntelligence

import Foundation
import SwiftUI

@MainActor
class OnboardingViewModel: ObservableObject {
    @Published var currentQuestion = 0
    @Published var answers = UserPreferences.empty
    @Published var isSaving = false
    @Published var error: String?

    let totalQuestions = 6

    var progress: Double { Double(currentQuestion) / Double(totalQuestions) }

    func nextQuestion() {
        if currentQuestion < totalQuestions - 1 {
            currentQuestion += 1
        }
    }

    func previousQuestion() {
        if currentQuestion > 0 {
            currentQuestion -= 1
        }
    }

    func saveAndComplete() async {
        isSaving = true
        error = nil
        do {
            answers.onboardingComplete = true
            let saved = try await APIService.shared.savePreferences(answers)
            UserDefaults.standard.set(saved.sessionId, forKey: "sessionId")
            UserDefaults.standard.set(true, forKey: "onboardingComplete")
        } catch {
            self.error = error.localizedDescription
        }
        isSaving = false
    }

    func toggleCategory(_ category: String) {
        if answers.watchedCategories.contains(category) {
            answers.watchedCategories.removeAll { $0 == category }
        } else {
            answers.watchedCategories.append(category)
        }
    }

    func toggleAlert(_ alert: String) {
        if answers.priorityAlerts.contains(alert) {
            answers.priorityAlerts.removeAll { $0 == alert }
        } else {
            answers.priorityAlerts.append(alert)
        }
    }

    func addWatchlistItem(_ item: WatchlistItem) {
        if !answers.watchlist.contains(where: { $0.ticker == item.ticker }) {
            answers.watchlist.append(item)
        }
    }

    func removeWatchlistItem(_ ticker: String) {
        answers.watchlist.removeAll { $0.ticker == ticker }
    }
}
