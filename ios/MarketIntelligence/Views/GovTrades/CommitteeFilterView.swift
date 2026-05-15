// CommitteeFilterView.swift
// MarketIntelligence
//
// Filter sheet for GovTradesListView — chamber, party, time range.

import SwiftUI

struct CommitteeFilterView: View {
    @ObservedObject var viewModel: GovTradesViewModel
    @Environment(\.dismiss) private var dismiss

    // Local copies so changes only apply on "Apply"
    @State private var chamber: String
    @State private var party: String
    @State private var days: Int

    private let accentColor = Color(red: 0.231, green: 0.510, blue: 0.961)

    init(viewModel: GovTradesViewModel) {
        self.viewModel = viewModel
        _chamber = State(initialValue: viewModel.selectedChamber)
        _party = State(initialValue: viewModel.selectedParty)
        _days = State(initialValue: viewModel.selectedDays)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Chamber") {
                    Picker("Chamber", selection: $chamber) {
                        Text("All").tag("All")
                        Text("Senate").tag("Senate")
                        Text("House").tag("House")
                    }
                    .pickerStyle(.segmented)
                    .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                }

                Section("Party") {
                    Picker("Party", selection: $party) {
                        Text("All").tag("All")
                        Text("Democrat").tag("Democrat")
                        Text("Republican").tag("Republican")
                    }
                    .pickerStyle(.segmented)
                    .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                }

                Section("Time Range") {
                    Picker("Days", selection: $days) {
                        Text("Last 7 days").tag(7)
                        Text("Last 30 days").tag(30)
                        Text("Last 90 days").tag(90)
                    }
                    .pickerStyle(.inline)
                }

                Section {
                    Button {
                        chamber = "All"
                        party = "All"
                        days = 30
                    } label: {
                        Text("Reset Filters")
                            .foregroundColor(.red)
                    }
                }
            }
            .navigationTitle("Filter Trades")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Apply") {
                        viewModel.selectedChamber = chamber
                        viewModel.selectedParty = party
                        viewModel.selectedDays = days
                        dismiss()
                    }
                    .font(.body.bold())
                    .foregroundColor(accentColor)
                }
            }
        }
        .presentationDetents([.medium])
    }
}
