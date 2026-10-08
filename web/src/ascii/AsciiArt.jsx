import { cssGradient } from './palettes'

// Hand-set ASCII art as gradient-coloured text. `shimmer` slides the gradient along the characters.
export default function AsciiArt({ lines, palette = 'blue', size = 9, shimmer = false, angle = 100, label, style, className }) {
  const text = Array.isArray(lines) ? lines.join('\n') : lines
  return (
    <pre
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={className}
      style={{
        margin: 0,
        fontFamily: "'Courier Prime', 'Courier New', monospace",
        fontWeight: 700,
        fontSize: size,
        lineHeight: 1.08,
        letterSpacing: 0,
        whiteSpace: 'pre',
        userSelect: 'none',
        backgroundImage: cssGradient(palette, angle),
        backgroundSize: shimmer ? '220% 100%' : '100% 100%',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        color: 'transparent',
        animation: shimmer ? 'tvx-shimmer 7s linear infinite' : undefined,
        ...style,
      }}
    >
      {text}
    </pre>
  )
}
