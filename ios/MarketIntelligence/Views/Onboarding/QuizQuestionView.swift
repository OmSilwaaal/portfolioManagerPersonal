// QuizQuestionView.swift
// MarketIntelligence
//
// Contains QuizFlowView and all individual question sub-views.

import SwiftUI

// MARK: - QuizFlowView

struct QuizFlowView: View {
    @ObservedObject var viewModel: OnboardingViewModel
    var onComplete: () -> Void

    private let accentColor = Color(red: 0.231, green: 0.510, blue: 0.961)

    var body: some View {
        ZStack {
            Color(.systemBackground).ignoresSafeArea()

            VStack(spacing: 0) {
                // Progress bar
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Rectangle()
                            .fill(Color(.systemGray5))
                            .frame(height: 3)
                        Rectangle()
                            .fill(accentColor)
                            .frame(width: geo.size.width * viewModel.progress, height: 3)
                            .animation(.easeInOut, value: viewModel.progress)
                    }
                }
                .frame(height: 3)
                .padding(.horizontal)
                .padding(.top, 16)

                Spacer()

                // Question content
                Group {
                    switch viewModel.currentQuestion {
                    case 0:
                        InvestorTypeQuestion(viewModel: viewModel)
                    case 1:
                        CategoriesQuestion(viewModel: viewModel)
                    case 2:
                        WatchlistBuilderView(viewModel: viewModel)
                    case 3:
                        PriorityAlertsQuestion(viewModel: viewModel)
                    case 4:
                        UpdateFrequencyQuestion(viewModel: viewModel)
                    case 5:
                        RiskToleranceQuestion(viewModel: viewModel, onComplete: onComplete)
                    default:
                        EmptyView()
                    }
                }
                .transition(.asymmetric(
                    insertion: .move(edge: .trailing).combined(with: .opacity),
                    removal: .move(edge: .leading).combined(with: .opacity)
                ))
                .animation(.easeInOut(duration: 0.3), value: viewModel.currentQuestion)

                Spacer()

                // Back button
                if viewModel.currentQuestion > 0 {
                    Button("Back") {
                        viewModel.previousQuestion()
                    }
                    .foregroundColor(.secondary)
                    .padding(.bottom, 20)
                }
            }
        }
    }
}

// MARK: - InvestorTypeQuestion

struct InvestorTypeQuestion: View {
    @ObservedObject var viewModel: OnboardingViewModel

    private let accentColor = Color(red: 0.231, green: 0.510, blue: 0.961)

    private let options: [(label: String, value: String)] = [
        ("Just starting out", "beginner"),
        ("Invest occasionally", "occasional"),
        ("Invest regularly", "regular"),
        ("Active trader", "active"),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("How would you describe yourself?")
                .font(.title2.bold())
                .padding(.horizontal)

            Text("We'll tailor the feed to your experience level")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .padding(.horizontal)

            VStack(spacing: 12) {
                ForEach(options, id: \.value) { option in
                    let isSelected = viewModel.answers.investorType == option.value
                    Button {
                        viewModel.answers.investorType = option.value
                    } label: {
                        HStack {
                            Text(option.label)
                                .font(.body.bold())
                                .foregroundColor(isSelected ? accentColor : .primary)
                            Spacer()
                            if isSelected {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundColor(accentColor)
                            }
                        }
                        .padding()
                        .background(
                            RoundedRectangle(cornerRadius: 12)
                                .fill(isSelected ? accentColor.opacity(0.08) : Color(.secondarySystemBackground))
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(isSelected ? accentColor : Color.clear, lineWidth: 2)
                        )
                        .shadow(color: isSelected ? accentColor.opacity(0.15) : .clear, radius: 4, y: 2)
                    }
                    .animation(.easeInOut(duration: 0.15), value: isSelected)
                }
            }
            .padding(.horizontal)

            if !viewModel.answers.investorType.isEmpty {
                Button {
                    viewModel.nextQuestion()
                } label: {
                    Text("Continue")
                        .font(.headline)
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(accentColor)
                        .cornerRadius(12)
                }
                .padding(.horizontal)
                .transition(.move(edge: .bottom).combined(with: .opacity))
                .animation(.easeInOut(duration: 0.2), value: viewModel.answers.investorType.isEmpty)
            }
        }
    }
}

// MARK: - CategoriesQuestion

struct CategoriesQuestion: View {
    @ObservedObject var viewModel: OnboardingViewModel

    private let accentColor = Color(red: 0.231, green: 0.510, blue: 0.961)

    private let categories: [(label: String, value: String, icon: String)] = [
        ("US Stocks", "stocks", "chart.line.uptrend.xyaxis"),
        ("Crypto", "crypto", "bitcoinsign.circle"),
        ("Commodities", "commodities", "cylinder"),
        ("Gov. Insider Trades", "gov-trades", "building.columns"),
        ("Forex", "forex", "dollarsign.circle"),
        ("ETFs & Index Funds", "etfs", "square.grid.2x2"),
        ("Options Flow", "options", "arrow.triangle.2.circlepath"),
    ]

    let columns = [GridItem(.flexible()), GridItem(.flexible())]

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("What do you want to follow?")
                .font(.title2.bold())
                .padding(.horizontal)

            Text("Select all that interest you")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .padding(.horizontal)

            LazyVGrid(columns: columns, spacing: 12) {
                ForEach(categories, id: \.value) { category in
                    let isSelected = viewModel.answers.watchedCategories.contains(category.value)
                    Button {
                        viewModel.toggleCategory(category.value)
                    } label: {
                        HStack(spacing: 10) {
                            Image(systemName: category.icon)
                                .font(.body)
                                .foregroundColor(isSelected ? accentColor : .secondary)
                                .frame(width: 20)
                            Text(category.label)
                                .font(.subheadline)
                                .foregroundColor(isSelected ? accentColor : .primary)
                                .lineLimit(2)
                                .multilineTextAlignment(.leading)
                            Spacer()
                            if isSelected {
                                Image(systemName: "checkmark")
                                    .font(.caption.bold())
                                    .foregroundColor(accentColor)
                            }
                        }
                        .padding(12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(
                            RoundedRectangle(cornerRadius: 10)
                                .fill(isSelected ? accentColor.opacity(0.08) : Color(.secondarySystemBackground))
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 10)
                                .stroke(isSelected ? accentColor : Color.clear, lineWidth: 1.5)
                        )
                    }
                    .animation(.easeInOut(duration: 0.15), value: isSelected)
                }
            }
            .padding(.horizontal)

            Button {
                viewModel.nextQuestion()
            } label: {
                Text(viewModel.answers.watchedCategories.isEmpty ? "Skip" : "Continue (\(viewModel.answers.watchedCategories.count) selected)")
                    .font(.headline)
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(accentColor)
                    .cornerRadius(12)
            }
            .padding(.horizontal)
        }
    }
}

// MARK: - PriorityAlertsQuestion

struct PriorityAlertsQuestion: View {
    @ObservedObject var viewModel: OnboardingViewModel

    private let accentColor = Color(red: 0.231, green: 0.510, blue: 0.961)

    private let alertOptions: [(label: String, value: String, icon: String)] = [
        ("Breaking price news", "breaking-price", "bolt"),
        ("Gov official trades", "gov-trades", "building.columns"),
        ("Volume spikes", "volume-spikes", "waveform.path.ecg"),
        ("Earnings dates", "earnings", "calendar.badge.clock"),
        ("Fed & macro events", "macro", "globe"),
        ("Price move alerts", "price-move", "arrow.up.right"),
        ("Analyst upgrades", "analyst-upgrades", "star.fill"),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("What alerts matter most?")
                .font(.title2.bold())
                .padding(.horizontal)

            Text("Choose the events you want to be notified about")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .padding(.horizontal)

            VStack(spacing: 10) {
                ForEach(alertOptions, id: \.value) { option in
                    let isSelected = viewModel.answers.priorityAlerts.contains(option.value)
                    Button {
                        viewModel.toggleAlert(option.value)
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: option.icon)
                                .font(.body)
                                .foregroundColor(isSelected ? accentColor : .secondary)
                                .frame(width: 24)
                            Text(option.label)
                                .font(.subheadline)
                                .foregroundColor(.primary)
                            Spacer()
                            Image(systemName: isSelected ? "checkmark.square.fill" : "square")
                                .foregroundColor(isSelected ? accentColor : Color(.systemGray3))
                        }
                        .padding(.vertical, 12)
                        .padding(.horizontal)
                        .background(
                            RoundedRectangle(cornerRadius: 10)
                                .fill(isSelected ? accentColor.opacity(0.06) : Color(.secondarySystemBackground))
                        )
                    }
                    .animation(.easeInOut(duration: 0.15), value: isSelected)
                }
            }
            .padding(.horizontal)

            Button {
                viewModel.nextQuestion()
            } label: {
                Text(viewModel.answers.priorityAlerts.isEmpty ? "Skip" : "Continue (\(viewModel.answers.priorityAlerts.count) selected)")
                    .font(.headline)
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(accentColor)
                    .cornerRadius(12)
            }
            .padding(.horizontal)
        }
    }
}

// MARK: - UpdateFrequencyQuestion

struct UpdateFrequencyQuestion: View {
    @ObservedObject var viewModel: OnboardingViewModel

    private let accentColor = Color(red: 0.231, green: 0.510, blue: 0.961)

    private let options: [(label: String, value: String, subtitle: String)] = [
        ("Real-time", "realtime", "Prices and alerts as they happen"),
        ("A few times a day", "several", "Morning, midday, and evening digests"),
        ("Daily digest", "daily", "One summary at the end of the day"),
        ("Weekly summary", "weekly", "Key highlights every week"),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("How often do you want updates?")
                .font(.title2.bold())
                .padding(.horizontal)

            Text("You can change this anytime in Settings")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .padding(.horizontal)

            VStack(spacing: 12) {
                ForEach(options, id: \.value) { option in
                    let isSelected = viewModel.answers.updateFrequency == option.value
                    Button {
                        viewModel.answers.updateFrequency = option.value
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(option.label)
                                    .font(.body.bold())
                                    .foregroundColor(isSelected ? accentColor : .primary)
                                Text(option.subtitle)
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                            Spacer()
                            Image(systemName: isSelected ? "circle.inset.filled" : "circle")
                                .foregroundColor(isSelected ? accentColor : Color(.systemGray3))
                        }
                        .padding()
                        .background(
                            RoundedRectangle(cornerRadius: 12)
                                .fill(isSelected ? accentColor.opacity(0.08) : Color(.secondarySystemBackground))
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(isSelected ? accentColor : Color.clear, lineWidth: 2)
                        )
                    }
                    .animation(.easeInOut(duration: 0.15), value: isSelected)
                }
            }
            .padding(.horizontal)

            if !viewModel.answers.updateFrequency.isEmpty {
                Button {
                    viewModel.nextQuestion()
                } label: {
                    Text("Continue")
                        .font(.headline)
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(accentColor)
                        .cornerRadius(12)
                }
                .padding(.horizontal)
                .transition(.move(edge: .bottom).combined(with: .opacity))
                .animation(.easeInOut(duration: 0.2), value: viewModel.answers.updateFrequency.isEmpty)
            }
        }
    }
}

// MARK: - RiskToleranceQuestion

struct RiskToleranceQuestion: View {
    @ObservedObject var viewModel: OnboardingViewModel
    var onComplete: () -> Void

    private let accentColor = Color(red: 0.231, green: 0.510, blue: 0.961)

    private let options: [(label: String, value: String, description: String)] = [
        ("Conservative", "conservative", "Stable, lower-risk assets"),
        ("Moderate", "moderate", "Mix of stable and growth"),
        ("Aggressive", "aggressive", "Comfortable with volatility"),
        ("Speculative", "speculative", "Crypto, options, high-risk plays"),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("What's your risk tolerance?")
                .font(.title2.bold())
                .padding(.horizontal)

            Text("This shapes what opportunities we surface for you")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .padding(.horizontal)

            VStack(spacing: 12) {
                ForEach(options, id: \.value) { option in
                    let isSelected = viewModel.answers.riskTolerance == option.value
                    Button {
                        viewModel.answers.riskTolerance = option.value
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(option.label)
                                    .font(.body.bold())
                                    .foregroundColor(isSelected ? accentColor : .primary)
                                Text(option.description)
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                            Spacer()
                            Image(systemName: isSelected ? "circle.inset.filled" : "circle")
                                .foregroundColor(isSelected ? accentColor : Color(.systemGray3))
                        }
                        .padding()
                        .background(
                            RoundedRectangle(cornerRadius: 12)
                                .fill(isSelected ? accentColor.opacity(0.08) : Color(.secondarySystemBackground))
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(isSelected ? accentColor : Color.clear, lineWidth: 2)
                        )
                    }
                    .animation(.easeInOut(duration: 0.15), value: isSelected)
                }
            }
            .padding(.horizontal)

            if !viewModel.answers.riskTolerance.isEmpty {
                Button {
                    onComplete()
                } label: {
                    if viewModel.isSaving {
                        HStack(spacing: 8) {
                            ProgressView()
                                .tint(.white)
                            Text("Saving...")
                        }
                        .font(.headline)
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(accentColor)
                        .cornerRadius(12)
                    } else {
                        Text("Finish Setup")
                            .font(.headline)
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(accentColor)
                            .cornerRadius(12)
                    }
                }
                .disabled(viewModel.isSaving)
                .padding(.horizontal)
                .transition(.move(edge: .bottom).combined(with: .opacity))
                .animation(.easeInOut(duration: 0.2), value: viewModel.answers.riskTolerance.isEmpty)

                if let errorMessage = viewModel.error {
                    Text(errorMessage)
                        .font(.caption)
                        .foregroundColor(.red)
                        .padding(.horizontal)
                }
            }
        }
    }
}
