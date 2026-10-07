// Returns the URL only if it is a plain http(s) link; otherwise `fallback`.
// Blocks javascript:, data:, vbscript: etc. in links built from external/user-supplied data.
export function safeUrl(value, fallback = null) {
  if (typeof value !== 'string') return fallback
  try {
    const u = new URL(value.trim())
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : fallback
  } catch {
    return fallback
  }
}
