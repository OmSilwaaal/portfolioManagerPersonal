import { useSelector } from 'react-redux'
import { useAuth } from '../contexts/AuthContext'
import { useGetFriendsQuery, useGetMyReferralQuery } from '../api/socialApi'
import { useGetGroupsQuery } from '../api/groupsApi'

// Calling cards you unlock by using the app. `stat` names a value from useAchievementStats().
export const ACHIEVEMENTS = [
  { id: 'sunrise',  name: 'Day One',        scene: 'sunrise',  stat: 'always',    goal: 1,  how: 'Create your account' },
  { id: 'skyline',  name: 'First Contact',  scene: 'skyline',  stat: 'friends',   goal: 1,  how: 'Add 1 friend' },
  { id: 'ocean',    name: 'Inner Circle',   scene: 'ocean',    stat: 'friends',   goal: 5,  how: 'Add 5 friends' },
  { id: 'orbit',    name: 'Constellation',  scene: 'orbit',    stat: 'friends',   goal: 10, how: 'Add 10 friends' },
  { id: 'forest',   name: 'Joined the Club', scene: 'forest',  stat: 'groups',    goal: 1,  how: 'Join a group' },
  { id: 'dunes',    name: 'Regular',        scene: 'dunes',    stat: 'groups',    goal: 3,  how: 'Join 3 groups' },
  { id: 'storm',    name: 'Watchtower',     scene: 'storm',    stat: 'watchlist', goal: 10, how: 'Track 10 tickers' },
  { id: 'aurora',   name: 'Evangelist',     scene: 'aurora',   stat: 'referrals', goal: 3,  how: 'Get 3 friends to join with your code' },
  { id: 'capitol',  name: 'Thirty Days',    scene: 'capitol',  stat: 'ageDays',   goal: 30, how: 'Be a member for 30 days' },
  { id: 'gilded',   name: 'Gilded',         scene: 'gilded',   stat: 'pro',       goal: 1,  how: 'Become a Pro member' },
]

export function useAchievementStats() {
  const { user } = useAuth()
  const isPro = useSelector((s) => s.preferences.isPro)
  const watchlist = useSelector((s) => s.watchlist?.stocks?.length ?? 0)
  const { data: friends } = useGetFriendsQuery(undefined, { skip: !user })
  const { data: groups } = useGetGroupsQuery(undefined, { skip: !user })
  const { data: referral } = useGetMyReferralQuery(undefined, { skip: !user })
  const created = user?.created_at ? Date.parse(user.created_at) : NaN
  return {
    always: 1,
    friends: friends?.friends?.length ?? 0,
    groups: Array.isArray(groups) ? groups.length : (groups?.groups?.length ?? 0),
    watchlist,
    referrals: referral?.referralCount ?? 0,
    ageDays: Number.isFinite(created) ? Math.floor((Date.now() - created) / 86400000) : 0,
    pro: isPro ? 1 : 0,
  }
}

export function evaluate(a, stats) {
  const value = stats[a.stat] ?? 0
  return { value: Math.min(value, a.goal), goal: a.goal, unlocked: value >= a.goal }
}

/** Achievement inputs for any user, from the public profile payload (/profiles/:id). */
export function statsFromProfile(profile) {
  const s = profile?.stats ?? {}
  const joined = profile?.joined_at ? Date.parse(profile.joined_at) : NaN
  return {
    always: 1,
    friends: s.friends ?? 0,
    groups: s.groups ?? 0,
    watchlist: s.watchlist ?? 0,
    referrals: s.referrals ?? 0,
    ageDays: Number.isFinite(joined) ? Math.floor((Date.now() - joined) / 86400000) : 0,
    pro: profile?.is_pro ? 1 : 0,
  }
}
