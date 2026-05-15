// OnboardingCompleteView.swift
// MarketIntelligence

import SwiftUI

struct OnboardingCompleteView: View {
    var body: some View {
        VStack(spacing: 24) {
            ProgressView()
                .scaleEffect(1.5)
                .tint(Color(red: 0.231, green: 0.510, blue: 0.961))
            Text("Building your feed...")
                .font(.title3.bold())
            Text("Personalizing your market intelligence experience")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemBackground))
    }
}

#Preview {
    OnboardingCompleteView()
}
