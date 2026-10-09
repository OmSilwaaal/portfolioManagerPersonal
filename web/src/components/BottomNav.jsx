import { NavLink } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { UserAvatar } from './Sidebar'
import { Glyph } from '../ascii/glyphs'
import { prefetchRoute } from '../routePrefetch'

const tabs = [
  { path: '/feed', label: 'Feed', glyph: 'feed' },
  { path: '/terminal', label: 'Terminal', glyph: 'terminal' },
  { path: '/friends', label: 'Friends', glyph: 'dm' },
  { path: '/leaderboard', label: 'Ranks', glyph: 'trophy' },
  { path: '/clans', label: 'Clans', glyph: 'groups' },
  { path: '/settings', label: 'Settings', glyph: 'settings' },
]

export default function BottomNav() {
  const { user } = useAuth()

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50" style={{ background: 'var(--ink-800)', borderTop: '1px solid var(--on-ink-border)' }}>
      <div className="flex items-center justify-around h-16">
        {tabs.map((tab) => (
          <NavLink
            key={tab.path}
            to={tab.path}
            end
            onPointerEnter={() => prefetchRoute(tab.path)}
            onFocus={() => prefetchRoute(tab.path)}
            onTouchStart={() => prefetchRoute(tab.path)}
            className="flex flex-col items-center gap-1 px-2 py-1.5"
            style={({ isActive }) => ({ color: isActive ? 'var(--paper)' : 'var(--on-ink-text-3)', textDecoration: 'none', minWidth: 52 })}
          >
            {({ isActive }) =>
              tab.path === '/settings' && user ? (
                <>
                  <div style={{ borderRadius: '50%', boxShadow: isActive ? '0 0 0 2px var(--paper)' : 'none' }}>
                    <UserAvatar user={user} size={26} />
                  </div>
                  <span style={{ fontFamily: 'var(--font-sans)', fontSize: 10, fontWeight: 700 }}>{tab.label}</span>
                </>
              ) : (
                <>
                  <Glyph name={tab.glyph} size={7} shimmer={isActive} style={{ opacity: isActive ? 1 : 0.7 }} />
                  <span style={{ fontFamily: 'var(--font-sans)', fontSize: 10, fontWeight: 700 }}>{tab.label}</span>
                </>
              )
            }
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
