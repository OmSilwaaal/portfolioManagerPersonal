import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

const DUMMY_DATA = (basePrice = 100) => {
  const data = []
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  let price = basePrice
  for (let i = 0; i < 7; i++) {
    price = price + (Math.random() - 0.48) * (basePrice * 0.02)
    data.push({ day: days[i], price: parseFloat(price.toFixed(2)) })
  }
  return data
}

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="px-3 py-2 bg-[#1f1f1f] rounded text-xs text-white border-0">
        <p className="text-[#a1a1aa]">{label}</p>
        <p className="font-medium">${payload[0].value.toLocaleString()}</p>
      </div>
    )
  }
  return null
}

export default function StockChart({ data, basePrice = 150 }) {
  const chartData = data && data.length > 0
    ? data.map((d, i) => ({
        day: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i % 7],
        price: d.close || d.price || d,
      }))
    : DUMMY_DATA(basePrice)

  return (
    <div className="w-full h-48">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
          <CartesianGrid
            horizontal={true}
            vertical={false}
            stroke="#1f1f1f"
            strokeDasharray="3 3"
          />
          <XAxis
            dataKey="day"
            tick={{ fill: '#6b7280', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#6b7280', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={55}
            tickFormatter={(v) => `$${v.toLocaleString()}`}
            domain={['auto', 'auto']}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#2a2a2a' }} />
          <Line
            type="monotone"
            dataKey="price"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: '#3b82f6', stroke: 'none' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
