export default function Card({ children, className = '', onClick, hoverable = false }) {
  return (
    <div
      className={`${hoverable ? 'tvx-card cursor-pointer' : ''} ${className}`}
      style={{ background: 'var(--ink-800)', border: '1px solid var(--on-ink-border)', borderRadius: 2 }}
      onClick={onClick}
    >
      {children}
    </div>
  )
}
