import { NavLink, Link, useNavigate, useLocation } from 'react-router-dom'
import ClassicLogo from './ClassicLogo'
import { useDispatch, useSelector } from 'react-redux'
import { resetPreferences } from '../store/preferencesSlice'
import { setFeedFilter, setFeedSubFilter, setFeedExpanded, toggleFeedExpanded } from '../store/feedSlice'
import { supabase } from '../utils/supabase/client'
import { useAuth } from '../contexts/AuthContext'
import { useGetMyProfileQuery } from '../api/profilesApi'
import { useGetProfileQuery } from '../api/profilesApi'
import { useGetUnreadMessagesQuery } from '../api/socialApi'
import { getIdentity, initialsOf } from '../utils/identity'
import { Glyph } from '../ascii/glyphs'
import { AsciiAura } from '../ascii/effects'
import { ClanTag, EloBadge } from './PlayerName'
import { prefetchRoute } from '../routePrefetch'

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
  { path: '/portfolio', label: 'Portfolio', glyph: 'portfolio' },
  { path: '/terminal', label: 'Axiom Terminal', glyph: 'terminal' },
]

const COMMUNITY_ITEMS = [
  { path: '/friends', label: 'Friends', glyph: 'dm', tour: 'friends' },
  { path: '/leaderboard', label: 'Leaderboard', glyph: 'trophy', tour: 'leaderboard' },
  { path: '/clans', label: 'Clans', glyph: 'groups', tour: 'clans' },
  { path: '/elos', label: 'Elos', glyph: 'elo', tour: 'elos' },
  { path: '/settings', label: 'Settings', glyph: 'settings', tour: 'settings' },
]

// Name and @handle sit on top of the aura: opaque enough backing and a hard shadow keep them readable over any animation
const OVER = { position: 'relative', zIndex: 2, width: 'fit-content', maxWidth: '100%', fontFamily: 'var(--font-sans)', background: 'rgba(11,11,11,0.62)', padding: '0 4px', textShadow: '0 0 3px #000, 0 1px 2px #000' }

const SECTION_LABEL = {
  fontFamily: 'var(--font-sans)', fontSize: 10, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase',
  color: 'var(--on-ink-text-4)', padding: '0 12px', marginBottom: 4, marginTop: 8,
}

function UserAvatar({ user, size = 32, src = null }) {
  const meta = user?.user_metadata ?? {}
  // `src` lets callers show the avatar saved on the user's profile, which overrides the auth provider's photo
  const avatarUrl = src || meta.avatar_url || meta.picture || null
  const name = getIdentity(user, null).name
  const initials = initialsOf(name)

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
      style={{ width: size, height: size, borderRadius: '50%', background: 'var(--on-ink-2)', border: '1px solid var(--on-ink-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--paper)', fontWeight: 700, fontSize: size * 0.38 }}
    >
      {initials || '?'}
    </div>
  )
}

export { UserAvatar }

// One navigation row: active = inverted block, hover = faint wash
function NavRow({ to, glyph, label, onClick, badge, children, end = true, tour }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      onPointerEnter={() => prefetchRoute(to)}
      onFocus={() => prefetchRoute(to)}
      onTouchStart={() => prefetchRoute(to)}
      className="tvx-navrow"
      data-tour={tour}
      style={({ isActive }) => ({
        position: 'relative', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', textDecoration: 'none',
        fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 700, letterSpacing: 0,
        borderRadius: 2, whiteSpace: 'nowrap',
        background: isActive ? 'var(--paper)' : 'transparent',
        color: isActive ? 'var(--ink-900)' : 'var(--on-ink-text-2)',
      })}
    >
      {({ isActive }) => (
        <>
          <span style={{ position: 'relative', width: 30, display: 'flex', justifyContent: 'center', opacity: isActive ? 1 : 0.95 }}>
            <Glyph name={glyph} size={8} shimmer={isActive} />
            {badge && !isActive && <span style={{ position: 'absolute', top: -3, right: -1, fontSize: 12, lineHeight: 1, color: 'var(--urgency-act)', fontWeight: 700 }}>*</span>}
          </span>
          <span>{label}</span>
          {children && children(isActive)}
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
  const effect = useSelector((state) => state.cosmetics.effect)
  const { activeFilter, subFilter, expanded: feedExpanded } = useSelector((state) => state.feed)
  const watchlistStocks = useSelector((state) => state.watchlist.stocks)
  const { data: profile } = useGetMyProfileQuery(undefined, { skip: !user })

  const meta = user?.user_metadata ?? {}
  const { name: displayName, handle } = getIdentity(user, profile)
  const avatarUrl = profile?.avatar_url || meta.avatar_url || meta.picture || null

  const { data: me } = useGetProfileQuery(user?.id, { skip: !user })
  const { data: unreadData } = useGetUnreadMessagesQuery(undefined, { skip: !user, pollingInterval: 30000, skipPollingIfUnfocused: true })
  const unread = (unreadData?.unread ?? 0) + (unreadData?.requests ?? 0) // unread DMs + pending friend requests

  const isFeed = location.pathname === '/feed'
  const showAura = isPro && effect && effect !== 'none'

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

  const subBtn = (active) => ({
    width: '100%', textAlign: 'left', fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: active ? 700 : 400, padding: '5px 8px',
    borderRadius: 2, border: 0, cursor: 'pointer', transition: 'background 120ms',
    background: active ? 'var(--on-ink-3)' : 'transparent', color: active ? 'var(--paper)' : 'var(--on-ink-text-3)',
  })

  return (
    <aside
      className="hidden md:flex flex-col w-[200px] fixed left-0 top-0 bottom-0 z-40 overflow-y-auto border-r"
      style={{ background: 'var(--ink-800)', borderColor: BORDER }}
    >
      {/* Logo */}
      <div className="flex items-center px-4 py-4 border-b" style={{ borderColor: BORDER }}>
        <Link to="/" onClick={() => sessionStorage.removeItem('tvx_intro')} style={{ textDecoration: 'none' }}>
          <ClassicLogo />
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 overflow-y-auto">
        <p style={SECTION_LABEL}>Markets</p>
        <div>
          <NavRow
            to="/feed"
            glyph="feed"
            label="Feed"
            tour="feed"
            onClick={() => dispatch(isFeed ? toggleFeedExpanded() : setFeedExpanded(true))}
          />
          <div style={{ maxHeight: feedExpanded ? '500px' : '0px', opacity: feedExpanded ? 1 : 0, overflow: 'hidden', transition: 'max-height 0.28s ease, opacity 0.2s ease' }}>
            <div style={{ marginLeft: 24, marginTop: 2, borderLeft: `1px dashed ${BORDER}`, paddingLeft: 8, paddingBottom: 4, display: 'flex', flexDirection: 'column', gap: 1 }}>
              {FEED_FILTERS.map((f) => {
                const isActive = isFeed && activeFilter === f.id
                return (
                  <div key={f.id}>
                    <button onClick={() => handleFeedFilterClick(f.id)} style={subBtn(isActive)}>{f.label}</button>
                    {f.id === 'stocks' && isActive && watchlistStocks.length > 0 && (
                      <div style={{ marginLeft: 8, marginTop: 2, borderLeft: `1px dashed ${BORDER}`, paddingLeft: 8, display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {watchlistStocks.slice(0, 10).map((ticker) => (
                          <button key={ticker} onClick={() => handleTickerClick(ticker)} style={{ ...subBtn(subFilter === ticker), fontSize: 11, letterSpacing: '0.06em' }}>
                            {ticker}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div style={{ margin: '10px 0 2px', borderTop: `1px solid ${BORDER}` }} />
        <p style={SECTION_LABEL}>Tools</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {TOOLS_ITEMS.map((item) => (
            <NavRow key={item.path} to={item.path} glyph={item.glyph} label={item.label} tour={item.path === '/portfolio' ? 'portfolio' : 'terminal'} onClick={() => dispatch(setFeedExpanded(false))} />
          ))}
        </div>

        <div style={{ margin: '10px 0 2px', borderTop: `1px solid ${BORDER}` }} />
        <p style={SECTION_LABEL}>Community</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {COMMUNITY_ITEMS.map((item) => (
            <NavRow
              key={item.path}
              to={item.path}
              glyph={item.glyph}
              label={item.label}
              tour={item.tour}
              badge={item.path === '/friends' && unread > 0}
              onClick={() => dispatch(setFeedExpanded(false))}
            />
          ))}
        </div>
      </nav>

      {/* Footer */}
      <div className="px-3 py-3 space-y-2 border-t" style={{ borderColor: BORDER }}>
        {isPro ? (
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px', borderRadius: 2, border: `1px solid ${BORDER}`, background: 'var(--ink-800)' }}>
            <Glyph name="crown" size={7} palette="gold" shimmer />
            <span style={{ fontFamily: 'var(--font-display)', fontStretch: '125%', fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--paper)' }}>Pro Member</span>
          </div>
        ) : (
          <Link
            to="/pricing"
            onPointerEnter={() => prefetchRoute('/pricing')}
            onFocus={() => prefetchRoute('/pricing')}
            className="tvx-navrow"
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px', borderRadius: 2, border: `1px dashed ${BORDER}`, textDecoration: 'none' }}
          >
            <Glyph name="crown" size={7} palette="mono" />
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 700, color: 'var(--on-ink-text-2)' }}>Upgrade to Pro</span>
          </Link>
        )}

        {user && (
          <Link to={`/profile/${user.id}`} title="View your profile" onPointerEnter={() => prefetchRoute(`/profile/${user.id}`)} onFocus={() => prefetchRoute(`/profile/${user.id}`)} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', textDecoration: 'none' }}>
            {showAura && <AsciiAura effect={effect} bleed={{ top: 18, side: 12, bottom: 10 }} style={{ zIndex: 0 }} />}
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={displayName || ''}
                  width={32}
                  height={32}
                  style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, boxShadow: isPro ? '0 0 0 2px var(--ink-800), 0 0 0 3px var(--paper)' : 'none' }}
                  referrerPolicy="no-referrer"
                  onError={(e) => { e.target.style.display = 'none' }}
                />
              ) : (
                <UserAvatar user={user} size={32} />
              )}
              <div style={{ minWidth: 0 }}>
                {displayName && (
                  <p style={{ ...OVER, fontSize: 13, fontWeight: 700, color: me?.name_color || 'var(--paper)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}>
                    {me?.clan && <ClanTag tag={me.clan.tag} color={me.clan.color} size="sm" />}{displayName}
                  </p>
                )}
                <p style={{ ...OVER, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--on-ink-text-2)', overflow: 'hidden', whiteSpace: 'nowrap', lineHeight: 1.3 }}>
                  {handle && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{handle}</span>}
                  {me?.elo && <EloBadge elo={me.elo.elo} tier={me.elo.tier} size="sm" />}
                </p>
              </div>
            </div>
          </Link>
        )}

        <button
          onClick={handleSignOut}
          className="tvx-navrow"
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '6px 12px', borderRadius: 2, border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--on-ink-text-3)', fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700 }}
        >
          <span style={{ width: 34, display: 'flex', justifyContent: 'center' }}><Glyph name="signout" size={8} /></span>
          <span>Sign out</span>
        </button>

        <p style={{ fontFamily: 'var(--font-sans)', fontSize: 10, color: 'var(--on-ink-text-4)', padding: '2px 12px' }}>
          Not financial advice. Educational use only.
        </p>
      </div>
    </aside>
  )
}
