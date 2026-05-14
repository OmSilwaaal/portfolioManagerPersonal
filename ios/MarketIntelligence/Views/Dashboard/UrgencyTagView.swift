// UrgencyTagView.swift
// MarketIntelligence

import SwiftUI

struct UrgencyTagView: View {
    let urgency: Urgency

    var body: some View {
        Text(urgency.displayText)
            .font(.caption.bold())
            .foregroundColor(urgency.color)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(urgency.color.opacity(0.12))
            .cornerRadius(4)
    }
}

#Preview {
    HStack(spacing: 12) {
        UrgencyTagView(urgency: .low)
        UrgencyTagView(urgency: .watch)
        UrgencyTagView(urgency: .actNow)
    }
    .padding()
}
