// Returns the URL only if it is a plain http(s) link, otherwise null (blocks javascript:/data: links).
export function safeUrl(value) {
  if (typeof value !== 'string') return null
  try {
    const u = new URL(value.trim())
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null
  } catch {
    return null
  }
}
