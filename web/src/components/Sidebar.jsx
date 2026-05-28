import { NavLink, Link, useNavigate, useLocation } from 'react-router-dom'
import Logo from './Logo'
import { useDispatch, useSelector } from 'react-redux'
import { resetPreferences } from '../store/preferencesSlice'
import { setFeedFilter, setFeedSubFilter, setFeedExpanded, toggleFeedExpanded } from '../store/feedSlice'
import { supabase } from '../utils/supabase/client'
import { useAuth } from '../contexts/AuthContext'
import { useGetMyProfileQuery } from '../api/profilesApi'
import { useGetGroupsQuery } from '../api/groupsApi'

const BORDER = 'var(--on-ink-border)'

const FEED_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'stocks', label: 'Stocks' },
  { id: 'crypto', label: 'Crypto' },
  { id: 'gov-trades', label: 'Gov Trades' },
  { id: 'commodities', label: 'Commodities' },
  { id: 'macro', label: 'Macro' },
]

const TOOLS_ITEMS = [
  {
    path: '/portfolio',
    label: 'Portfolio',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="7" width="20" height="14" rx="2"/>
        <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
        <line x1="12" y1="12" x2="12" y2="16"/>
        <line x1="10" y1="14" x2="14" y2="14"/>
      </svg>
    ),
  },
  {
    path: '/stocks',
    label: 'Watchlist',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>
      </svg>
    ),
  },
  {
    path: '/alerts',
    label: 'Alerts',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
    ),
  },
  {
    path: '/paper-trading',
    label: 'Paper Trading',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
      </svg>
    ),
  },
]

const COMMUNITY_ITEMS = [
  {
    path: '/groups',
    label: 'Groups',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
  },
  {
    path: '/settings',
    label: 'Settings',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    ),
  },
]

function UserAvatar({ user, size = 32 }) {
  const meta = user?.user_metadata ?? {}
  const avatarUrl = meta.avatar_url ?? meta.picture ?? null
  const name = meta.full_name ?? meta.name ?? meta.display_name ?? user?.email ?? '?'
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        width={size}
        height={size}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
        referrerPolicy="no-referrer"
      />
    )
  }
  return (
    <div
      style={{ width: size, height: size, borderRadius: '50%', background: 'var(--on-ink-2)', border: '1px solid var(--on-ink-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--paper)', fontWeight: 600, fontSize: size * 0.38 }}
    >
      {initials || '?'}
    </div>
  )
}

export { UserAvatar }

function NavItem({ item, hasAlert }) {
  return (
    <NavLink
      to={item.path}
      end
      className="relative flex items-center gap-3 px-3 py-2 text-sm font-medium transition-all duration-150"
      style={({ isActive }) => isActive ? {
        background: 'var(--on-ink-2)',
        color: 'var(--paper)',
        borderRadius: 'var(--r-sm)',
      } : {
        color: 'var(--on-ink-text-3)',
        borderRadius: 'var(--r-sm)',
      }}
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span
              style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: 2, height: 16, background: 'var(--paper)', borderRadius: 1 }}
            />
          )}
          <span style={{ position: 'relative', color: isActive ? 'var(--paper)' : 'var(--on-ink-text-3)' }}>
            {item.icon}
            {hasAlert && !isActive && (
              <span style={{ position: 'absolute', top: -4, right: -4, width: 6, height: 6, background: 'var(--urgency-act)', borderRadius: '50%' }} />
            )}
          </span>
          <span>{item.label}</span>
        </>
      )}
    </NavLink>
  )
}

export default function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const dispatch = useDispatch()
  const { user } = useAuth()
  const isPro = useSelector((state) => state.preferences.isPro)
  const { activeFilter, subFilter, expanded: feedExpanded } = useSelector((state) => state.feed)
  const watchlistStocks = useSelector((state) => state.watchlist.stocks)
  const { data: profile } = useGetMyProfileQuery(undefined, { skip: !user })

  const meta = user?.user_metadata ?? {}
  const email = user?.email ?? null

  const displayName = profile?.username
    ? `@${profile.username}`
    : (profile?.display_name ?? meta.full_name ?? meta.name ?? meta.display_name ?? null)
  const avatarUrl = profile?.avatar_url || meta.avatar_url || meta.picture || null

  const { data: groups = [] } = useGetGroupsQuery(undefined, { skip: !user, pollingInterval: 60000 })

  const SEEN_KEY = user ? `miq_seen_notifs_${user.id}` : null
  const hasGroupAlert = groups.some((g) => {
    const postCount = g.postCount ?? 0
    const stored = parseInt(localStorage.getItem(`miq_pc_${g.id}`) || '0', 10)
    return postCount > stored
  })

  const isFeed = location.pathname === '/feed'

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    dispatch(resetPreferences())
    navigate('/', { replace: true })
  }

  const handleFeedFilterClick = (filterId) => {
    dispatch(setFeedFilter(filterId))
    navigate('/feed')
  }

  const handleTickerClick = (ticker) => {
    dispatch(setFeedFilter('stocks'))
    dispatch(setFeedSubFilter(subFilter === ticker ? null : ticker))
    navigate('/feed')
  }

  return (
    <aside
      className="hidden md:flex flex-col w-[200px] fixed left-0 top-0 bottom-0 z-40 overflow-y-auto border-r"
      style={{ background: 'var(--ink-800)', borderColor: 'var(--on-ink-border)' }}
    >
      {/* Logo */}
      <div className="flex items-center px-5 py-5 border-b" style={{ borderColor: 'var(--on-ink-border)' }}>
        <Link to="/" onClick={() => sessionStorage.removeItem('tvx_intro')} style={{ textDecoration: 'none' }}>
          <Logo />
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">

        {/* Markets */}
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 500, letterSpacing: '0.24em', textTransform: 'uppercase', color: 'var(--on-ink-text-4)', padding: '0 12px', marginBottom: 4, marginTop: 8 }}>Markets</p>
        <div className="space-y-0.5">
          {/* Feed — expandable */}
          <div>
            <NavLink
              to="/feed"
              end
              onClick={() => dispatch(isFeed ? toggleFeedExpanded() : setFeedExpanded(true))}
              className="relative flex items-center gap-3 px-3 py-2 text-sm font-medium transition-all duration-150"
              style={({ isActive }) => isActive ? {
                background: 'var(--on-ink-2)',
                color: 'var(--paper)',
                borderRadius: 'var(--r-sm)',
              } : {
                color: 'var(--on-ink-text-3)',
                borderRadius: 'var(--r-sm)',
              }}
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: 2, height: 16, background: 'var(--paper)', borderRadius: 1 }} />
                  )}
                  <span style={{ color: isActive ? 'var(--paper)' : 'var(--on-ink-text-3)' }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                      <polyline points="9 22 9 12 15 12 15 22"/>
                    </svg>
                  </span>
                  <span>Feed</span>
                </>
              )}
            </NavLink>

            {/* Feed sub-items */}
            <div style={{ maxHeight: feedExpanded ? '500px' : '0px', opacity: feedExpanded ? 1 : 0, overflow: 'hidden', transition: 'max-height 0.28s ease, opacity 0.2s ease' }}>
              <div style={{ marginLeft: 12, marginTop: 2, borderLeft: '1px solid var(--on-ink-border)', paddingLeft: 8, paddingBottom: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {FEED_FILTERS.map((f) => {
                  const isActive = isFeed && activeFilter === f.id
                  return (
                    <div key={f.id}>
                      <button
                        onClick={() => handleFeedFilterClick(f.id)}
                        style={{ width: '100%', textAlign: 'left', fontFamily: 'var(--font-mono)', fontSize: 11, padding: '5px 8px', borderRadius: 'var(--r-sm)', border: 0, cursor: 'pointer', background: isActive ? 'var(--on-ink-2)' : 'transparent', color: isActive ? 'var(--paper)' : 'var(--on-ink-text-3)', transition: 'all 150ms' }}
                      >
                        {f.label}
                      </button>
                      {f.id === 'stocks' && isActive && watchlistStocks.length > 0 && (
                        <div style={{ marginLeft: 8, marginTop: 2, borderLeft: '1px solid var(--on-ink-border)', paddingLeft: 8, display: 'flex', flexDirection: 'column', gap: 1 }}>
                          {watchlistStocks.slice(0, 10).map((ticker) => {
                            const isTickerActive = subFilter === ticker
                            return (
                              <button
                                key={ticker}
                                onClick={() => handleTickerClick(ticker)}
                                style={{ width: '100%', textAlign: 'left', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', padding: '4px 8px', borderRadius: 'var(--r-sm)', border: 0, cursor: 'pointer', background: isTickerActive ? 'var(--on-ink-3)' : 'transparent', color: isTickerActive ? 'var(--paper)' : 'var(--on-ink-text-4)', transition: 'all 150ms' }}
                              >
                                {ticker}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Tools */}
        <div style={{ margin: '8px 0', borderTop: '1px solid var(--on-ink-border)' }} />
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 500, letterSpacing: '0.24em', textTransform: 'uppercase', color: 'var(--on-ink-text-4)', padding: '0 12px', marginBottom: 4, marginTop: 8 }}>Tools</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {TOOLS_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end
              onClick={() => dispatch(setFeedExpanded(false))}
              className="relative flex items-center gap-3 px-3 py-2 text-sm font-medium transition-all duration-150"
              style={({ isActive }) => isActive ? { background: 'var(--on-ink-2)', color: 'var(--paper)', borderRadius: 'var(--r-sm)' } : { color: 'var(--on-ink-text-3)', borderRadius: 'var(--r-sm)' }}
            >
              {({ isActive }) => (
                <>
                  {isActive && <span style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: 2, height: 16, background: 'var(--paper)', borderRadius: 1 }} />}
                  <span style={{ color: isActive ? 'var(--paper)' : 'var(--on-ink-text-3)' }}>{item.icon}</span>
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>

        {/* Community */}
        <div style={{ margin: '8px 0', borderTop: '1px solid var(--on-ink-border)' }} />
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 500, letterSpacing: '0.24em', textTransform: 'uppercase', color: 'var(--on-ink-text-4)', padding: '0 12px', marginBottom: 4, marginTop: 8 }}>Community</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {COMMUNITY_ITEMS.map((item) => {
            const isGroups = item.path === '/groups'
            const showBadge = isGroups && hasGroupAlert
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end
                onClick={() => dispatch(setFeedExpanded(false))}
                className="relative flex items-center gap-3 px-3 py-2 text-sm font-medium transition-all duration-150"
                style={({ isActive }) => isActive ? { background: 'var(--on-ink-2)', color: 'var(--paper)', borderRadius: 'var(--r-sm)' } : { color: 'var(--on-ink-text-3)', borderRadius: 'var(--r-sm)' }}
              >
                {({ isActive }) => {
                  if (isActive && isGroups && SEEN_KEY) {
                    groups.forEach((g) => {
                      localStorage.setItem(`miq_pc_${g.id}`, String(g.postCount ?? 0))
                    })
                  }
                  return (
                    <>
                      {isActive && <span style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: 2, height: 16, background: 'var(--paper)', borderRadius: 1 }} />}
                      <span style={{ position: 'relative', color: isActive ? 'var(--paper)' : 'var(--on-ink-text-3)' }}>
                        {item.icon}
                        {showBadge && !isActive && (
                          <span style={{ position: 'absolute', top: -4, right: -4, width: 6, height: 6, background: 'var(--urgency-act)', borderRadius: '50%' }} />
                        )}
                      </span>
                      <span>{item.label}</span>
                    </>
                  )
                }}
              </NavLink>
            )
          })}
        </div>
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 space-y-2 border-t" style={{ borderColor: 'var(--on-ink-border)' }}>
        {isPro ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 'var(--r-sm)', background: 'var(--on-ink-2)', border: `1px solid ${BORDER}` }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--on-ink-text-2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 4l3 12h14l3-12-6 5-4-5-4 5-6-5z"/>
              <path d="M5 20h14"/>
            </svg>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--on-ink-text-2)' }}>Pro Member</span>
          </div>
        ) : (
          <Link
            to="/pricing"
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 'var(--r-sm)', background: 'var(--on-ink-1)', border: `1px solid ${BORDER}`, textDecoration: 'none', transition: 'all 150ms' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--on-ink-2)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--on-ink-1)' }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--on-ink-text-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 4l3 12h14l3-12-6 5-4-5-4 5-6-5z"/>
              <path d="M5 20h14"/>
            </svg>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--on-ink-text-3)' }}>Upgrade to Pro</span>
          </Link>
        )}

        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px' }}>
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={displayName || ''}
                width={32}
                height={32}
                style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                referrerPolicy="no-referrer"
                onError={(e) => { e.target.style.display = 'none' }}
              />
            ) : (
              <UserAvatar user={user} size={32} />
            )}
            <div style={{ minWidth: 0 }}>
              {displayName && (
                <p style={{ fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 500, color: 'var(--on-ink-text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}>{displayName}</p>
              )}
              {email && (
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--on-ink-text-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}>{email}</p>
              )}
            </div>
          </div>
        )}

        <button
          onClick={handleSignOut}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', borderRadius: 'var(--r-sm)', border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--on-ink-text-4)', fontFamily: 'var(--font-sans)', fontSize: 13, transition: 'all 150ms' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--on-ink-1)'; e.currentTarget.style.color = 'var(--on-ink-text-2)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--on-ink-text-4)' }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          <span style={{ fontWeight: 500 }}>Sign out</span>
        </button>

        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--on-ink-text-4)', padding: '4px 12px' }}>
          Not financial advice. Educational use only.
        </p>
      </div>
    </aside>
  )
}
