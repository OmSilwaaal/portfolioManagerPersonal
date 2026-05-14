// AlertsViewModel.swift
// MarketIntelligence

import Foundation

@MainActor
final class AlertsViewModel: ObservableObject {
    @Published var alerts: [PriceAlert] = []
    @Published var isLoading = false
    @Published var error: String?

    // MARK: - Loading

    func loadAlerts() async {
        isLoading = true
        error = nil
        do {
            alerts = try await APIService.shared.fetchAlerts()
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }

    // MARK: - Creating

    func createAlert(ticker: String, targetPrice: Double, direction: AlertDirection) async {
        let request = CreateAlertRequest(
            ticker: ticker.uppercased(),
            targetPrice: targetPrice,
            direction: direction.rawValue
        )
        do {
            let newAlert = try await APIService.shared.createAlert(request)
            alerts.append(newAlert)
            await NotificationService.shared.scheduleAlert(newAlert)
        } catch {
            self.error = error.localizedDescription
        }
    }

    // MARK: - Deleting

    func deleteAlert(at offsets: IndexSet) {
        let toDelete = offsets.map { alerts[$0] }
        Task {
            for alert in toDelete {
                do {
                    try await APIService.shared.deleteAlert(id: alert.id)
                    NotificationService.shared.cancelAlert(id: alert.id)
                } catch {
                    self.error = error.localizedDescription
                }
            }
        }
        alerts.remove(atOffsets: offsets)
    }

    func deleteAlert(id: String) {
        Task {
            do {
                try await APIService.shared.deleteAlert(id: id)
                NotificationService.shared.cancelAlert(id: id)
                alerts.removeAll { $0.id == id }
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}
