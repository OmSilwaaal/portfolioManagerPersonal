import { useSelector } from 'react-redux'

// Themed Suspense fallback for lazy routes. Inside the app shell it sits on the
// layout background; fullScreen paints its own ground so there is no unthemed flash.
export default function PageFallback({ fullScreen = false }) {
  const isDark = useSelector((state) => state.theme.isDark)
  const ground = fullScreen ? (isDark ? 'bg-[#0f0f0f]' : 'bg-white') : ''
  return (
    <div
      role="status"
      aria-label="Loading"
      className={`flex flex-1 items-center justify-center ${fullScreen ? 'min-h-screen' : 'min-h-[60vh]'} ${ground}`}
    >
      <div className="w-8 h-8 border-2 border-[#3b82f6] border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
