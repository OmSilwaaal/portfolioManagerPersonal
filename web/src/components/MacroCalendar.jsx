import { useGetCalendarQuery } from '../api/feedApi'

function formatDate(dateStr) {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const importanceColor = {
  High: 'text-red-500',
  Medium: 'text-yellow-400',
  Low: 'text-green-400',
}

export default function MacroCalendar() {
  const { data, isLoading, isError } = useGetCalendarQuery()

  if (isLoading) {
    return (
      <div className="p-4 bg-surface dark:bg-surface bg-[#f9f9f9] border border-border-subtle dark:border-border-subtle border-[#e5e7eb] rounded-md">
        <h3 className="text-sm font-medium text-white dark:text-white text-[#0f0f0f] mb-3">Macro Calendar</h3>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="h-3 bg-[#1f1f1f] rounded w-1/3 mb-1" />
              <div className="h-3 bg-[#1f1f1f] rounded w-2/3" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="p-4 bg-surface dark:bg-surface bg-[#f9f9f9] border border-border-subtle dark:border-border-subtle border-[#e5e7eb] rounded-md">
        <h3 className="text-sm font-medium mb-2">Macro Calendar</h3>
        <p className="text-xs text-[#a1a1aa]">Unable to load calendar events.</p>
      </div>
    )
  }

  const events = data?.events || []

  return (
    <div className="p-4 bg-surface dark:bg-surface bg-[#f9f9f9] border border-border-subtle dark:border-border-subtle border-[#e5e7eb] rounded-md">
      <h3 className="text-sm font-semibold text-white dark:text-white text-[#0f0f0f] mb-3">
        Upcoming Events
      </h3>
      <div className="space-y-4">
        {events.slice(0, 6).map((event) => (
          <div key={event.id} className="flex gap-3">
            <div className="flex-shrink-0 w-10 text-center">
              <span className="text-xs font-medium text-[#3b82f6]">
                {formatDate(event.date)}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium text-white dark:text-white text-[#0f0f0f] truncate">
                  {event.event}
                </span>
                <span className={`text-xs flex-shrink-0 ${importanceColor[event.importance] || 'text-[#a1a1aa]'}`}>
                  {event.importance}
                </span>
              </div>
              <p className="text-xs text-[#a1a1aa] leading-relaxed">
                {event.aiBlurb}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
