// NewsCardView.swift
// MarketIntelligence

import SwiftUI

struct NewsCardView: View {
    let news: NewsItem
    @State private var expanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Source + time row
            HStack {
                Text(news.source)
                    .font(.caption.bold())
                    .foregroundColor(.secondary)
                Spacer()
                Text(news.relativeTime)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            // Ticker badge (if present)
            if let ticker = news.ticker, !ticker.isEmpty {
                Text(ticker)
                    .font(.caption.bold())
                    .foregroundColor(Color(red: 0.231, green: 0.510, blue: 0.961))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Color(red: 0.231, green: 0.510, blue: 0.961).opacity(0.12))
                    .cornerRadius(4)
            }

            // Headline
            Text(news.headline)
                .font(.subheadline.bold())
                .foregroundColor(.primary)
                .lineLimit(2)

            // Urgency tag
            UrgencyTagView(urgency: news.urgency)

            // AI summary — always visible, 2 sentences
            Text(news.summary)
                .font(.footnote)
                .foregroundColor(.secondary)
                .lineLimit(expanded ? nil : 3)

            // Expandable "What does this mean?" section
            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    expanded.toggle()
                }
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: expanded ? "chevron.up" : "chevron.down")
                        .font(.caption2)
                    Text(expanded ? "Show less" : "What does this mean?")
                        .font(.caption.bold())
                }
                .foregroundColor(Color(red: 0.231, green: 0.510, blue: 0.961))
            }
            .buttonStyle(.plain)

            if expanded {
                VStack(alignment: .leading, spacing: 6) {
                    Divider()
                    Text(news.reasoning)
                        .font(.footnote)
                        .foregroundColor(.primary)
                    HStack(spacing: 4) {
                        Image(systemName: sentimentIcon)
                            .font(.caption)
                        Text("Sentiment: \(sentimentLabel)")
                            .font(.caption)
                    }
                    .foregroundColor(sentimentColor)
                }
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .padding(16)
        .background(Color(.secondarySystemBackground))
        .cornerRadius(12)
    }

    // MARK: - Sentiment Helpers

    private var sentimentLabel: String {
        switch news.sentiment {
        case 0.3...: return "Positive"
        case ..<(-0.3): return "Negative"
        default: return "Neutral"
        }
    }

    private var sentimentColor: Color {
        switch news.sentiment {
        case 0.3...: return .green
        case ..<(-0.3): return .red
        default: return .secondary
        }
    }

    private var sentimentIcon: String {
        switch news.sentiment {
        case 0.3...: return "arrow.up.circle"
        case ..<(-0.3): return "arrow.down.circle"
        default: return "minus.circle"
        }
    }
}

#Preview {
    NewsCardView(news: NewsItem(
        id: "1",
        headline: "Apple reports record quarterly revenue beating analyst expectations",
        source: "Reuters",
        publishedAt: ISO8601DateFormatter().string(from: Date().addingTimeInterval(-7200)),
        url: "https://reuters.com",
        ticker: "AAPL",
        summary: "Apple posted its highest ever quarterly revenue of $120 billion. Analysts had expected $115 billion.",
        urgency: .watch,
        reasoning: "Strong revenue beat typically signals continued investor confidence and may drive short-term price appreciation.",
        sentiment: 0.7
    ))
    .padding()
}
