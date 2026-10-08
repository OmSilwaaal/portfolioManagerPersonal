import { LogoMark } from '../ascii/glyphs'

// The Travauxus mark, set in ASCII. `tone` only affects the wordmark colour (ink on paper, paper on ink).
export default function Logo({ size = 'md', tone = 'paper' }) {
  const sizes = { sm: { mark: 7, fs: 13 }, md: { mark: 9, fs: 15 }, lg: { mark: 11, fs: 19 } }
  const { mark, fs } = sizes[size] || sizes.md
  const color = tone === 'ink' ? 'var(--ink-900)' : 'var(--paper)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <LogoMark size={mark} />
      <span style={{ fontFamily: 'var(--font-display)', fontStretch: '125%', fontWeight: 800, color, letterSpacing: '0.02em', fontSize: fs, textTransform: 'uppercase' }}>
        Travauxus
      </span>
    </div>
  )
}
