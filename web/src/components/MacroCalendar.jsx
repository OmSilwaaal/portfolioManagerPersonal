import { useGetCalendarQuery } from '../api/feedApi'

const INK8   = 'var(--ink-800)'
const BORDER = 'var(--on-ink-border)'
const CREAM  = 'var(--paper)'
const MUTED  = 'var(--on-ink-text-3)'
const DIM    = 'var(--on-ink-text-4)'

const IMPORTANCE_COLOR = {
  High:   'var(--urgency-act)',
  Medium: 'var(--urgency-watch)',
  Low:    'var(--urgency-low)',
}

function formatDate(dateStr) {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function MacroCalendar() {
  const { data, isLoading, isError } = useGetCalendarQuery()

  if (isLoading) {
    return (
      <div style={{ background: INK8, border: `1px solid ${BORDER}`, borderRadius: 'var(--r-md)', padding: '20px 22px' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 500, letterSpacing: '0.24em', textTransform: 'uppercase', color: MUTED, marginBottom: 14 }}>Macro Calendar</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ height: 10, background: 'var(--on-ink-2)', borderRadius: 1, width: '33%' }} />
              <div style={{ height: 10, background: 'var(--on-ink-1)', borderRadius: 1, width: '66%' }} />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div style={{ background: INK8, border: `1px solid ${BORDER}`, borderRadius: 'var(--r-md)', padding: '20px 22px' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 500, letterSpacing: '0.24em', textTransform: 'uppercase', color: MUTED, marginBottom: 8 }}>Macro Calendar</div>
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: MUTED }}>Unable to load calendar events.</p>
      </div>
    )
  }

  const events = data?.events || []

  return (
    <div style={{ background: INK8, border: `1px solid ${BORDER}`, borderRadius: 'var(--r-md)', padding: '20px 22px' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 500, letterSpacing: '0.24em', textTransform: 'uppercase', color: MUTED, marginBottom: 16 }}>
        Upcoming Events
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {events.slice(0, 6).map((event) => (
          <div key={event.id} style={{ display: 'flex', gap: 14 }}>
            <div style={{ flexShrink: 0, width: 38, textAlign: 'center' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, color: 'var(--party-dem)', letterSpacing: '0.04em' }}>
                {formatDate(event.date)}
              </span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 500, color: CREAM, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {event.event}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, flexShrink: 0, letterSpacing: '0.12em', color: IMPORTANCE_COLOR[event.importance] || MUTED }}>
                  {event.importance}
                </span>
              </div>
              <p style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: MUTED, lineHeight: 1.55, margin: 0 }}>
                {event.aiBlurb}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
