const FILTERS = [
  { label: 'All', value: 'all' },
  { label: 'Stocks', value: 'stocks' },
  { label: 'Crypto', value: 'crypto' },
  { label: 'Commodities', value: 'commodities' },
  { label: 'Gov Trades', value: 'gov-trades' },
  { label: 'Macro', value: 'macro' },
]

export default function FilterBar({ activeFilter, onChange }) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
      {FILTERS.map((f) => (
        <button
          key={f.value}
          onClick={() => onChange(f.value)}
          className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
            activeFilter === f.value
              ? 'bg-[#3b82f6] text-white'
              : 'bg-[#1f1f1f] text-gray-400 hover:text-white hover:bg-[#2a2a2a]'
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  )
}
