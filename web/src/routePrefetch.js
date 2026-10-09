/* Every page sits in its own chunk, so a first visit fetches it only once the link is clicked and
   the user waits out a round trip. Registering each route's importer here lets idle time and hover
   start that fetch earlier; the browser's module registry makes the import on navigation a no-op. */

const importers = new Map()
const started = new Set()

function metered() {
  try {
    return Boolean(navigator.connection?.saveData)
  } catch {
    return false
  }
}

export function registerRoute(path, importer) {
  importers.set(path, importer)
  return importer
}

// Links point at concrete paths ("/profile/abc"), routes are registered as patterns ("/profile/:userId").
function resolve(path) {
  if (importers.has(path)) return path
  const parts = path.split('/')
  for (const key of importers.keys()) {
    if (!key.includes(':')) continue
    const pattern = key.split('/')
    if (pattern.length === parts.length && pattern.every((seg, i) => seg.startsWith(':') || seg === parts[i])) return key
  }
  return null
}

export function prefetchRoute(path) {
  if (!path || metered()) return
  const key = resolve(path)
  if (!key || started.has(key)) return
  started.add(key)
  // Stay silent on failure: the import on the real navigation is what should surface the error.
  importers.get(key)().catch(() => started.delete(key))
}

/* Everything one click away from the app chrome, in the order people reach for it. /terminal is
   deliberately absent — its wallet stack is a few megabytes, far too much to pull speculatively. */
const IDLE_ROUTES = ['/feed', '/portfolio', '/leaderboard', '/friends', '/clans', '/elos', '/settings']

function whenIdle(cb) {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(cb, { timeout: 2000 })
  else setTimeout(cb, 300)
}

let warming = false

export function warmRoutesWhenIdle() {
  if (warming || metered()) return
  warming = true
  const queue = [...IDLE_ROUTES]
  // One chunk per idle slice, so warming never queues ahead of something the user is doing.
  const next = () => {
    const path = queue.shift()
    if (!path) return
    prefetchRoute(path)
    whenIdle(next)
  }
  whenIdle(next)
}
