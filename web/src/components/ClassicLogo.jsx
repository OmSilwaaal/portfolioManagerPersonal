// The regular (vector) Travauxus logo: used in the sidebar's top-left corner only. Everything else is ASCII.
export default function ClassicLogo({ size = 26 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 2L22 12L12 22L2 12Z" stroke="var(--paper)" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M12 6.5L17.5 12L12 17.5L6.5 12Z" stroke="var(--paper)" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
      <span style={{ fontFamily: 'var(--font-display)', fontStretch: '125%', fontWeight: 800, color: 'var(--paper)', letterSpacing: '0.02em', fontSize: 15, textTransform: 'uppercase' }}>
        Travauxus
      </span>
    </div>
  )
}
