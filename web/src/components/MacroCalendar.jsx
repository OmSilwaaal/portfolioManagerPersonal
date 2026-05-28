import { useGetCalendarQuery } from '../api/feedApi'

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
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()
}

export default function MacroCalendar({ compact = false }) {
  const { data, isLoading, isError } = useGetCalendarQuery()

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ borderTop: `1px solid ${BORDER}`, padding: '14px 0', display: 'flex', gap: 12 }}>
            <div style={{ height: 9, width: 38, background: 'var(--on-ink-2)', flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1 }}>
              <div style={{ height: 11, width: '70%', background: 'var(--on-ink-2)', marginBottom: 6 }} />
              <div style={{ height: 9, width: '50%', background: 'var(--on-ink-1)' }} />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.10em', textTransform: 'uppercase', color: MUTED, paddingTop: 14, borderTop: `1px solid ${BORDER}` }}>
        — Unavailable
      </p>
    )
  }

  const events = (data?.events || []).slice(0, compact ? 5 : 8)

  return (
    <div>
      {events.map((event) => (
        <div key={event.id} style={{ borderTop: `1px solid ${BORDER}`, padding: '13px 0', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600, letterSpacing: '0.14em', color: DIM, flexShrink: 0, paddingTop: 2, minWidth: 44 }}>
            {formatDate(event.date)}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600, color: CREAM, letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {event.event}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: IMPORTANCE_COLOR[event.importance] || MUTED, flexShrink: 0 }}>
                {event.importance}
              </span>
            </div>
            {event.aiBlurb && (
              <p style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: MUTED, lineHeight: 1.6, margin: 0 }}>
                {event.aiBlurb}
              </p>
            )}
          </div>
        </div>
      ))}
      {events.length === 0 && (
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.10em', textTransform: 'uppercase', color: DIM, paddingTop: 14, borderTop: `1px solid ${BORDER}`, margin: 0 }}>
          — No upcoming events
        </p>
      )}
    </div>
  )
}
