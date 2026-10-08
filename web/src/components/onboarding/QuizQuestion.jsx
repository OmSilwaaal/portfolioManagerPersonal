const BORDER = 'var(--on-ink-border)'

// One question: square, bordered choices in the ink/paper theme. Single = radio, multi = checkbox.
export default function QuizQuestion({ question, options, type, onAnswer, selected }) {
  const isSelected = (value) => (type === 'single' ? selected === value : Array.isArray(selected) && selected.includes(value))

  const handleSelect = (value) => {
    if (type === 'single') return onAnswer(value)
    const current = Array.isArray(selected) ? selected : []
    onAnswer(current.includes(value) ? current.filter((v) => v !== value) : [...current, value])
  }

  return (
    <div className="w-full" style={{ maxWidth: 560 }} role={type === 'single' ? 'radiogroup' : 'group'} aria-label={question}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontStretch: '125%', fontWeight: 800, fontSize: 'clamp(24px, 4.4vw, 34px)', lineHeight: 1.1, letterSpacing: '-0.02em', textTransform: 'uppercase', color: 'var(--paper)', margin: '0 0 28px', textWrap: 'balance' }}>
        {question}
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {options.map((option) => {
          const on = isSelected(option.value)
          return (
            <button
              key={option.value}
              role={type === 'single' ? 'radio' : 'checkbox'}
              aria-checked={on}
              onClick={() => handleSelect(option.value)}
              style={{
                display: 'flex', alignItems: 'center', gap: 14, width: '100%', textAlign: 'left', padding: '14px 16px', cursor: 'pointer',
                fontFamily: 'var(--font-sans)', fontSize: 15, fontWeight: 600, borderRadius: 2,
                background: on ? 'var(--paper)' : 'var(--ink-800)', color: on ? 'var(--ink-900)' : 'var(--on-ink-text-1, var(--paper))',
                border: `1px solid ${on ? 'var(--paper)' : BORDER}`, transition: 'background 120ms, border-color 120ms',
              }}
              onMouseEnter={(e) => { if (!on) e.currentTarget.style.borderColor = 'var(--paper)' }}
              onMouseLeave={(e) => { if (!on) e.currentTarget.style.borderColor = BORDER }}
            >
              <span aria-hidden="true" style={{ fontFamily: "'Courier Prime', 'Courier New', monospace", fontWeight: 700, flexShrink: 0, width: 28 }}>
                {type === 'multi' ? (on ? '[x]' : '[ ]') : on ? '(*)' : '( )'}
              </span>
              <span>{option.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
