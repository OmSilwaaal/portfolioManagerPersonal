export default function Logo({ size = 'md', tone = 'paper' }) {
  const sizes = { sm: { icon: 22, fs: 14 }, md: { icon: 26, fs: 16 }, lg: { icon: 30, fs: 19 } }
  const { icon, fs } = sizes[size] || sizes.md
  const stroke = tone === 'ink' ? 'var(--ink-900)' : 'var(--paper)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <svg width={icon} height={icon} viewBox="0 0 24 24" fill="none">
        <path d="M12 2L22 12L12 22L2 12Z" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M12 6.5L17.5 12L12 17.5L6.5 12Z" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
      <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, color: stroke, letterSpacing: '-0.01em', fontSize: fs }}>
        Travauxus
      </span>
    </div>
  )
}
