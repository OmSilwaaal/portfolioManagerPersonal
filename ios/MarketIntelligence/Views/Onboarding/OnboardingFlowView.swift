// OnboardingFlowView.swift
// MarketIntelligence
//
// Entry view. Checks UserDefaults for onboarding completion.
// If complete, goes to the main TabBarView. Otherwise runs the quiz.

import SwiftUI

struct OnboardingFlowView: View {
    @StateObject private var viewModel = OnboardingViewModel()
    @State private var showMainApp = UserDefaults.standard.bool(forKey: "onboardingComplete")

    var body: some View {
        if showMainApp {
            TabBarView()
        } else {
            QuizFlowView(viewModel: viewModel, onComplete: {
                Task {
                    await viewModel.saveAndComplete()
                    if viewModel.error == nil {
                        showMainApp = true
                    }
                }
            })
        }
    }
}

#Preview {
    OnboardingFlowView()
}
