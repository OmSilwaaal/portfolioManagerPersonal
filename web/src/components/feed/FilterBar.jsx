const FILTERS = [
  { label: 'All',         id: 'all' },
  { label: 'Stocks',      id: 'stocks' },
  { label: 'Crypto',      id: 'crypto' },
  { label: 'Gov Trades',  id: 'gov-trades' },
  { label: 'Commodities', id: 'commodities' },
  { label: 'Macro',       id: 'macro' },
]

export default function FilterBar({ activeFilter, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {FILTERS.map(f => {
        const active = activeFilter === f.id
        return (
          <button
            key={f.id}
            onClick={() => onChange && onChange(f.id)}
            style={{
              fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600,
              padding: '7px 14px', borderRadius: 999,
              border: `1px solid ${active ? 'var(--paper)' : 'var(--on-ink-border)'}`,
              background: active ? 'var(--paper)' : 'transparent',
              color: active ? 'var(--ink-900)' : 'var(--on-ink-text-3)',
              cursor: 'pointer', transition: 'all .15s',
            }}
          >
            {f.label}
          </button>
        )
      })}
    </div>
  )
}
