export default function PageHeader({ title, subtitle, action }) {
  return (
    <div className="px-6 py-6 flex items-start justify-between" style={{ borderBottom: '1px solid var(--on-ink-border)' }}>
      <div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontStretch: '125%', fontWeight: 800, fontSize: 22, letterSpacing: '-0.01em', textTransform: 'uppercase', color: 'var(--paper)', margin: 0 }}>{title}</h1>
        {subtitle && (
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--on-ink-text-3)', margin: '4px 0 0' }}>{subtitle}</p>
        )}
      </div>
      {action && (
        <div className="flex items-center">{action}</div>
      )}
    </div>
  )
}
