// CreateAlertView.swift
// MarketIntelligence

import SwiftUI

struct CreateAlertView: View {
    @ObservedObject var viewModel: AlertsViewModel
    @Environment(\.dismiss) private var dismiss

    @State private var ticker = ""
    @State private var targetPriceText = ""
    @State private var direction: AlertDirection = .above
    @State private var showValidationError = false

    private var isFormValid: Bool {
        let tickerValid = !ticker.trimmingCharacters(in: .whitespaces).isEmpty
        let priceValid = Double(targetPriceText) != nil
        return tickerValid && priceValid
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Alert Details") {
                    TextField("Ticker (e.g. AAPL)", text: $ticker)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.characters)

                    TextField("Target Price (e.g. 200.00)", text: $targetPriceText)
                        .keyboardType(.decimalPad)

                    Picker("Trigger When Price Is", selection: $direction) {
                        Text("Above Target").tag(AlertDirection.above)
                        Text("Below Target").tag(AlertDirection.below)
                    }
                    .pickerStyle(.segmented)
                }

                Section {
                    alertPreviewRow
                } header: {
                    Text("Preview")
                }

                if showValidationError {
                    Section {
                        Text("Please enter a valid ticker and price.")
                            .foregroundColor(.red)
                            .font(.caption)
                    }
                }
            }
            .navigationTitle("Create Alert")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        guard isFormValid, let price = Double(targetPriceText) else {
                            showValidationError = true
                            return
                        }
                        showValidationError = false
                        Task {
                            await viewModel.createAlert(
                                ticker: ticker.uppercased(),
                                targetPrice: price,
                                direction: direction
                            )
                            dismiss()
                        }
                    }
                }
            }
        }
    }

    // MARK: - Preview Row

    @ViewBuilder
    private var alertPreviewRow: some View {
        if isFormValid, let price = Double(targetPriceText) {
            HStack(spacing: 8) {
                Image(systemName: "bell.fill")
                    .foregroundColor(Color(red: 0.231, green: 0.510, blue: 0.961))
                Text("\(ticker.uppercased()) \(direction.rawValue) $\(String(format: "%.2f", price))")
                    .font(.subheadline)
                    .foregroundColor(.primary)
            }
        } else {
            Text("Fill in the fields above to see a preview.")
                .font(.caption)
                .foregroundColor(.secondary)
        }
    }
}

#Preview {
    CreateAlertView(viewModel: AlertsViewModel())
}
