const MAP = {
  'Act Now': { color: 'var(--urgency-act)',   border: 'rgba(211,92,74,0.4)',   bg: 'rgba(211,92,74,0.12)' },
  'Watch':   { color: 'var(--urgency-watch)', border: 'rgba(214,184,122,0.4)', bg: 'rgba(214,184,122,0.10)' },
  'Low':     { color: 'var(--urgency-low)',   border: 'rgba(158,174,132,0.4)', bg: 'rgba(158,174,132,0.08)' },
}

export default function UrgencyTag({ urgency = 'Low' }) {
  const s = MAP[urgency] || MAP['Low']
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 500,
      letterSpacing: '0.24em', textTransform: 'uppercase',
      padding: '5px 9px', borderRadius: 2,
      color: s.color, border: `1px solid ${s.border}`, background: s.bg,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.color }} />
      {urgency}
    </span>
  )
}
