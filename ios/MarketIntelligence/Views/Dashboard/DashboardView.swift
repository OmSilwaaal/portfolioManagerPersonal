// DashboardView.swift
// MarketIntelligence

import SwiftUI

// MARK: - MacroEventCard

struct MacroEventCard: View {
    let event: MacroEvent

    private var typeIcon: String {
        switch event.type.lowercased() {
        case "earnings": return "chart.bar.fill"
        case "fed", "fomc": return "building.columns.fill"
        case "cpi", "inflation": return "percent"
        default: return "calendar"
        }
    }

    private var typeColor: Color {
        switch event.type.lowercased() {
        case "earnings": return Color(red: 0.231, green: 0.510, blue: 0.961)
        case "fed", "fomc": return .orange
        case "cpi", "inflation": return .purple
        default: return .secondary
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: typeIcon)
                    .font(.caption.bold())
                    .foregroundColor(typeColor)
                Text(event.type.uppercased())
                    .font(.caption2.bold())
                    .foregroundColor(typeColor)
            }
            Text(event.title)
                .font(.footnote.bold())
                .foregroundColor(.primary)
                .lineLimit(2)
                .frame(maxWidth: .infinity, alignment: .leading)
            HStack(spacing: 4) {
                Image(systemName: "calendar")
                    .font(.caption2)
                    .foregroundColor(.secondary)
                Text(event.formattedDate)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            if !event.aiImpact.isEmpty {
                Text(event.aiImpact)
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .lineLimit(2)
            }
        }
        .padding(12)
        .frame(width: 180, alignment: .leading)
        .background(Color(.secondarySystemBackground))
        .cornerRadius(10)
    }
}

// MARK: - DashboardView

struct DashboardView: View {
    @StateObject private var viewModel = DashboardViewModel()

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading && viewModel.newsFeed.isEmpty {
                    LoadingView()
                } else if let error = viewModel.error, viewModel.newsFeed.isEmpty {
                    ErrorView(message: error) {
                        Task { await viewModel.loadDashboard() }
                    }
                } else {
                    contentView
                }
            }
            .navigationTitle("MarketIQ")
            .navigationBarTitleDisplayMode(.large)
        }
        .task {
            await viewModel.loadDashboard()
        }
    }

    // MARK: - Content

    @ViewBuilder
    private var contentView: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                // Macro events horizontal scroll
                if !viewModel.macroEvents.isEmpty {
                    macroEventsSection
                }

                // Error banner (non-blocking if we have data)
                if let error = viewModel.error {
                    HStack(spacing: 8) {
                        Image(systemName: "exclamationmark.triangle")
                            .foregroundColor(.red)
                        Text(error)
                            .font(.caption)
                            .foregroundColor(.red)
                    }
                    .padding(12)
                    .background(Color.red.opacity(0.08))
                    .cornerRadius(8)
                    .padding(.horizontal, 16)
                }

                // News feed
                if viewModel.newsFeed.isEmpty && !viewModel.isLoading {
                    EmptyStateView(
                        systemImage: "newspaper",
                        title: "No News Yet",
                        subtitle: "Pull down to refresh and load the latest market news."
                    )
                    .frame(height: 300)
                } else {
                    newsFeedSection
                }
            }
            .padding(.top, 8)
        }
        .refreshable {
            await viewModel.loadDashboard()
        }
    }

    // MARK: - Macro Events Section

    private var macroEventsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Upcoming Events")
                    .font(.headline)
                    .foregroundColor(.primary)
                Spacer()
            }
            .padding(.horizontal, 16)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(viewModel.macroEvents) { event in
                        MacroEventCard(event: event)
                    }
                }
                .padding(.horizontal, 16)
            }
        }
    }

    // MARK: - News Feed Section

    private var newsFeedSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Latest News")
                    .font(.headline)
                    .foregroundColor(.primary)
                if viewModel.isLoading {
                    ProgressView()
                        .scaleEffect(0.8)
                }
                Spacer()
            }
            .padding(.horizontal, 16)

            ForEach(viewModel.newsFeed) { item in
                NavigationLink(destination: NewsDetailView(news: item)) {
                    NewsCardView(news: item)
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 16)
            }
        }
    }
}

// MARK: - NewsDetailView

struct NewsDetailView: View {
    let news: NewsItem

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                // Metadata
                HStack {
                    Text(news.source)
                        .font(.subheadline.bold())
                        .foregroundColor(Color(red: 0.231, green: 0.510, blue: 0.961))
                    Spacer()
                    Text(news.relativeTime)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                // Urgency + ticker
                HStack(spacing: 8) {
                    UrgencyTagView(urgency: news.urgency)
                    if let ticker = news.ticker, !ticker.isEmpty {
                        Text(ticker)
                            .font(.caption.bold())
                            .foregroundColor(Color(red: 0.231, green: 0.510, blue: 0.961))
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color(red: 0.231, green: 0.510, blue: 0.961).opacity(0.12))
                            .cornerRadius(4)
                    }
                }

                // Headline
                Text(news.headline)
                    .font(.title3.bold())
                    .foregroundColor(.primary)

                Divider()

                // AI Summary
                VStack(alignment: .leading, spacing: 6) {
                    Text("AI Summary")
                        .font(.caption.bold())
                        .foregroundColor(.secondary)
                        .textCase(.uppercase)
                    Text(news.summary)
                        .font(.body)
                        .foregroundColor(.primary)
                }
                .padding(12)
                .background(Color(.secondarySystemBackground))
                .cornerRadius(10)

                // Reasoning
                VStack(alignment: .leading, spacing: 6) {
                    Text("What does this mean?")
                        .font(.caption.bold())
                        .foregroundColor(.secondary)
                        .textCase(.uppercase)
                    Text(news.reasoning)
                        .font(.body)
                        .foregroundColor(.primary)
                }
                .padding(12)
                .background(Color(.secondarySystemBackground))
                .cornerRadius(10)

                // Read full article link
                if let url = URL(string: news.url) {
                    Link(destination: url) {
                        HStack {
                            Text("Read Full Article")
                                .font(.subheadline.bold())
                            Image(systemName: "arrow.up.right")
                                .font(.caption)
                        }
                        .foregroundColor(Color(red: 0.231, green: 0.510, blue: 0.961))
                    }
                }
            }
            .padding(16)
        }
        .navigationTitle("News")
        .navigationBarTitleDisplayMode(.inline)
        .background(Color(.systemBackground))
    }
}

#Preview {
    DashboardView()
}
