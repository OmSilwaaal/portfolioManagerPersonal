// Public-facing identity: a display name and an @handle — never the email address.
const usable = (n) => typeof n === 'string' && n.trim() && !n.includes('@')

export function getIdentity(user, profile) {
  const meta = user?.user_metadata ?? {}
  const name = [profile?.display_name, meta.full_name, meta.name, meta.display_name].find(usable)?.trim() ?? null
  const handle = profile?.username ? `@${profile.username}` : null
  return { name: name ?? 'Trader', handle, hasName: Boolean(name) }
}

export const initialsOf = (name) =>
  (name ?? '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '?'
