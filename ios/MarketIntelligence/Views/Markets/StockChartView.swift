// StockChartView.swift
// MarketIntelligence

import SwiftUI
import Charts

struct StockChartView: View {
    let data: [PricePoint]

    private var accentColor: Color {
        Color(red: 0.231, green: 0.510, blue: 0.961)
    }

    var body: some View {
        Chart(data) { point in
            LineMark(
                x: .value("Date", point.date),
                y: .value("Price", point.price)
            )
            .foregroundStyle(accentColor)
            .interpolationMethod(.catmullRom)

            AreaMark(
                x: .value("Date", point.date),
                y: .value("Price", point.price)
            )
            .foregroundStyle(
                LinearGradient(
                    colors: [accentColor.opacity(0.15), accentColor.opacity(0.0)],
                    startPoint: .top,
                    endPoint: .bottom
                )
            )
            .interpolationMethod(.catmullRom)
        }
        .chartXAxis(.hidden)
        .chartYAxis {
            AxisMarks(position: .trailing) { _ in
                AxisGridLine(stroke: StrokeStyle(lineWidth: 0.5))
                    .foregroundStyle(Color(.systemGray5))
                AxisValueLabel()
            }
        }
        .frame(height: 180)
    }
}

// MARK: - Price Data Generator

extension StockChartView {
    /// Generates a plausible 7-day price curve from a given current price.
    /// Used when the backend does not supply historical price data.
    static func generateDummyData(currentPrice: Double, days: Int = 7) -> [PricePoint] {
        var points: [PricePoint] = []
        let now = Date()
        let interval: TimeInterval = 86400 // 1 day in seconds
        var price = currentPrice * Double.random(in: 0.93...0.97)

        for i in stride(from: days, through: 0, by: -1) {
            let date = now.addingTimeInterval(-Double(i) * interval)
            // Random walk with slight upward drift
            let change = price * Double.random(in: -0.025...0.030)
            price = max(price + change, 0.01)
            points.append(PricePoint(date: date, price: price))
        }

        // Anchor the last point to current price
        if let last = points.last {
            points[points.count - 1] = PricePoint(date: last.date, price: currentPrice)
        }

        return points
    }
}

#Preview {
    let data = StockChartView.generateDummyData(currentPrice: 189.5)
    return StockChartView(data: data)
        .padding()
}
