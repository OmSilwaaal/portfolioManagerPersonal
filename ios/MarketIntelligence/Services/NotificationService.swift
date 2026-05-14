// NotificationService.swift
// MarketIntelligence
//
// Handles local push notifications for price alerts via UNUserNotificationCenter.

import Foundation
import UserNotifications

final class NotificationService {
    static let shared = NotificationService()

    private init() {}

    // MARK: - Permission

    /// Requests notification permission from the user.
    /// Should be called once on first app launch.
    func requestPermission() async {
        do {
            let granted = try await UNUserNotificationCenter.current()
                .requestAuthorization(options: [.alert, .sound, .badge])
            if granted {
                print("[NotificationService] Permission granted.")
            } else {
                print("[NotificationService] Permission denied by user.")
            }
        } catch {
            print("[NotificationService] Permission request error: \(error.localizedDescription)")
        }
    }

    // MARK: - Scheduling

    /// Schedules a local notification representing a price alert.
    /// The notification fires once after a short delay as a confirmation
    /// that the alert has been set; real-time triggering would require
    /// background fetch or push from the backend.
    func scheduleAlert(_ alert: PriceAlert) async {
        let content = UNMutableNotificationContent()
        content.title = "Price Alert: \(alert.ticker)"
        content.body = "Alert set: \(alert.ticker) \(alert.directionLabel) \(alert.formattedTarget)"
        content.sound = .default

        // Trigger after 1 second as a confirmation notification.
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 1, repeats: false)
        let request = UNNotificationRequest(
            identifier: "alert-\(alert.id)",
            content: content,
            trigger: trigger
        )

        do {
            try await UNUserNotificationCenter.current().add(request)
        } catch {
            print("[NotificationService] Failed to schedule alert: \(error.localizedDescription)")
        }
    }

    // MARK: - Cancellation

    /// Cancels a pending or delivered notification for the given alert ID.
    func cancelAlert(id: String) {
        let identifier = "alert-\(id)"
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [identifier])
        UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: [identifier])
    }
}
