import { NavLink, Link, useNavigate, useLocation } from 'react-router-dom'
import Logo from './Logo'
import { useDispatch, useSelector } from 'react-redux'
import { resetPreferences } from '../store/preferencesSlice'
import { setFeedFilter, setFeedSubFilter, setFeedExpanded, toggleFeedExpanded } from '../store/feedSlice'
import { supabase } from '../utils/supabase/client'
import { useAuth } from '../contexts/AuthContext'
import { useGetMyProfileQuery } from '../api/profilesApi'
import { useGetGroupsQuery } from '../api/groupsApi'

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
        className="rounded-full object-cover flex-shrink-0"
        style={{ width: size, height: size }}
        referrerPolicy="no-referrer"
      />
    )
  }
  return (
    <div
      className="rounded-full bg-white/10 border border-white/15 flex items-center justify-center flex-shrink-0 text-white font-semibold"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
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
      className={({ isActive }) =>
        `relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
          isActive
            ? 'text-white'
            : 'text-white/35 hover:text-white/70 hover:bg-white/[0.04]'
        }`
      }
      style={({ isActive }) => isActive ? {
        background: 'rgba(255,255,255,0.07)',
        backdropFilter: 'blur(8px)',
      } : {}}
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span
              className="absolute left-0 top-1/2 -translate-y-1/2 w-[2.5px] h-4 rounded-full"
              style={{ background: 'rgba(255,255,255,0.8)' }}
            />
          )}
          <span className={`relative ${isActive ? 'text-white' : ''}`}>
            {item.icon}
            {hasAlert && !isActive && (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
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
      style={{
        background: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderColor: 'rgba(255,255,255,0.08)',
      }}
    >
      {/* Logo */}
      <div className="flex items-center px-5 py-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <Logo />
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">

        {/* Markets */}
        <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-white/20 px-3 mb-1 mt-2">Markets</p>
        <div className="space-y-0.5">
          {/* Feed — expandable */}
          <div>
            <NavLink
              to="/feed"
              end
              onClick={() => dispatch(isFeed ? toggleFeedExpanded() : setFeedExpanded(true))}
              className={({ isActive }) =>
                `relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                  isActive ? 'text-white' : 'text-white/35 hover:text-white/70 hover:bg-white/[0.04]'
                }`
              }
              style={({ isActive }) => isActive ? {
                background: 'rgba(255,255,255,0.07)',
                backdropFilter: 'blur(8px)',
              } : {}}
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-[2.5px] h-4 rounded-full"
                      style={{ background: 'rgba(255,255,255,0.8)' }}
                    />
                  )}
                  <span className={isActive ? 'text-white' : ''}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                      <polyline points="9 22 9 12 15 12 15 22"/>
                    </svg>
                  </span>
                  <span>Feed</span>
                </>
              )}
            </NavLink>

            {/* Feed sub-items — always rendered, animated via max-height */}
            <div
              style={{
                maxHeight: feedExpanded ? '500px' : '0px',
                opacity: feedExpanded ? 1 : 0,
                overflow: 'hidden',
                transition: 'max-height 0.28s ease, opacity 0.2s ease',
              }}
            >
              <div className="ml-3 mt-0.5 border-l border-white/[0.06] pl-2 space-y-0.5 pb-1">
                {FEED_FILTERS.map((f) => {
                  const isActive = isFeed && activeFilter === f.id
                  return (
                    <div key={f.id}>
                      <button
                        onClick={() => handleFeedFilterClick(f.id)}
                        className={`w-full text-left text-xs py-1.5 px-2 rounded-md transition-all font-medium ${
                          isActive
                            ? 'text-white bg-white/[0.06]'
                            : 'text-white/35 hover:text-white/60 hover:bg-white/[0.03]'
                        }`}
                      >
                        {f.label}
                      </button>
                      {/* Watchlist tickers under Stocks */}
                      {f.id === 'stocks' && isActive && watchlistStocks.length > 0 && (
                        <div className="ml-2 mt-0.5 border-l border-white/[0.04] pl-2 space-y-0.5">
                          {watchlistStocks.slice(0, 10).map((ticker) => {
                            const isTickerActive = subFilter === ticker
                            return (
                              <button
                                key={ticker}
                                onClick={() => handleTickerClick(ticker)}
                                className={`w-full text-left text-[11px] py-1 px-2 rounded transition-all font-mono tracking-wide ${
                                  isTickerActive
                                    ? 'text-white bg-white/[0.08]'
                                    : 'text-white/25 hover:text-white/55'
                                }`}
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
        <div className="my-2 mx-0 border-t border-white/[0.06]" />
        <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-white/20 px-3 mb-1 mt-2">Tools</p>
        <div className="space-y-0.5">
          {TOOLS_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end
              onClick={() => dispatch(setFeedExpanded(false))}
              className={({ isActive }) =>
                `relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? 'text-white'
                    : 'text-white/35 hover:text-white/70 hover:bg-white/[0.04]'
                }`
              }
              style={({ isActive }) => isActive ? {
                background: 'rgba(255,255,255,0.07)',
                backdropFilter: 'blur(8px)',
              } : {}}
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-[2.5px] h-4 rounded-full"
                      style={{ background: 'rgba(255,255,255,0.8)' }}
                    />
                  )}
                  <span className={isActive ? 'text-white' : ''}>{item.icon}</span>
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>

        {/* Community */}
        <div className="my-2 mx-0 border-t border-white/[0.06]" />
        <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-white/20 px-3 mb-1 mt-2">Community</p>
        <div className="space-y-0.5">
          {COMMUNITY_ITEMS.map((item) => {
            const isGroups = item.path === '/groups'
            const showBadge = isGroups && hasGroupAlert
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end
                onClick={() => dispatch(setFeedExpanded(false))}
                className={({ isActive }) =>
                  `relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                    isActive
                      ? 'text-white'
                      : 'text-white/35 hover:text-white/70 hover:bg-white/[0.04]'
                  }`
                }
                style={({ isActive }) => isActive ? {
                  background: 'rgba(255,255,255,0.07)',
                  backdropFilter: 'blur(8px)',
                } : {}}
              >
                {({ isActive }) => {
                  if (isActive && isGroups && SEEN_KEY) {
                    groups.forEach((g) => {
                      localStorage.setItem(`miq_pc_${g.id}`, String(g.postCount ?? 0))
                    })
                  }
                  return (
                    <>
                      {isActive && (
                        <span
                          className="absolute left-0 top-1/2 -translate-y-1/2 w-[2.5px] h-4 rounded-full"
                          style={{ background: 'rgba(255,255,255,0.8)' }}
                        />
                      )}
                      <span className={`relative ${isActive ? 'text-white' : ''}`}>
                        {item.icon}
                        {showBadge && !isActive && (
                          <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
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
      <div className="px-3 py-4 space-y-2 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        {isPro ? (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 4l3 12h14l3-12-6 5-4-5-4 5-6-5z"/>
              <path d="M5 20h14"/>
            </svg>
            <span className="text-xs font-semibold text-white/70 tracking-wide">Pro Member</span>
          </div>
        ) : (
          <Link
            to="/pricing"
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg transition-all duration-150 group"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.09)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 4l3 12h14l3-12-6 5-4-5-4 5-6-5z"/>
              <path d="M5 20h14"/>
            </svg>
            <span className="text-xs font-semibold text-white/60 tracking-wide">Upgrade to Pro</span>
          </Link>
        )}

        {user && (
          <div className="flex items-center gap-3 px-3 py-2">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={displayName || ''}
                width={32}
                height={32}
                className="rounded-full object-cover flex-shrink-0"
                style={{ width: 32, height: 32 }}
                referrerPolicy="no-referrer"
                onError={(e) => { e.target.style.display = 'none' }}
              />
            ) : (
              <UserAvatar user={user} size={32} />
            )}
            <div className="min-w-0">
              {displayName && (
                <p className="text-sm font-medium text-white/80 truncate leading-tight">{displayName}</p>
              )}
              {email && (
                <p className="text-[11px] text-white/30 truncate leading-tight">{email}</p>
              )}
            </div>
          </div>
        )}

        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-all duration-150"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          <span className="font-medium">Sign out</span>
        </button>

        <p className="text-[10px] text-white/15 px-3 pt-1">
          Not financial advice. Educational use only.
        </p>
      </div>
    </aside>
  )
}
