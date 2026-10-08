import { useSelector } from 'react-redux'
import { useAuth } from '../contexts/AuthContext'
import { useGetProfileQuery } from '../api/profilesApi'

// Calling cards you unlock by using the app. `stat` names a value from useAchievementStats() / statsFromProfile().
// Equipping a card (and showing it on the leaderboard) is a Pro perk; anyone can earn them.
export const GROUPS = [
  { id: 'account', title: 'Account', note: 'Earned by using Travauxus.' },
  { id: 'moment',  title: 'Moments', note: 'Earned by how you trade.' },
  { id: 'rank',    title: 'Elo ranks', note: 'One card per rung of the ladder. Rank down and you keep the ones you earned.' },
]

export const ACHIEVEMENTS = [
  { id: 'sunrise',  group: 'account', name: 'Day One',          scene: 'sunrise',  stat: 'always',    goal: 1,  how: 'Create your account' },
  { id: 'skyline',  group: 'account', name: 'First Contact',    scene: 'skyline',  stat: 'friends',   goal: 1,  how: 'Add 1 friend' },
  { id: 'ocean',    group: 'account', name: 'Inner Circle',     scene: 'ocean',    stat: 'friends',   goal: 5,  how: 'Add 5 friends' },
  { id: 'orbit',    group: 'account', name: 'Constellation',    scene: 'orbit',    stat: 'friends',   goal: 10, how: 'Add 10 friends' },
  { id: 'forest',   group: 'account', name: 'Joined the Clan',  scene: 'forest',   stat: 'clans',     goal: 1,  how: 'Join a clan' },
  { id: 'dunes',    group: 'account', name: 'Regular',          scene: 'dunes',    stat: 'wins',      goal: 5,  how: 'Close 5 winning trades' },
  { id: 'storm',    group: 'account', name: 'Watchtower',       scene: 'storm',    stat: 'watchlist', goal: 10, how: 'Track 10 tickers' },
  { id: 'aurora',   group: 'account', name: 'Evangelist',       scene: 'aurora',   stat: 'referrals', goal: 3,  how: 'Get 3 friends to join with your code' },
  { id: 'capitol',  group: 'account', name: 'Thirty Days',      scene: 'capitol',  stat: 'ageDays',   goal: 30, how: 'Be a member for 30 days' },
  { id: 'gilded',   group: 'account', name: 'Gilded',           scene: 'gilded',   stat: 'pro',       goal: 1,  how: 'Become a Pro member' },

  { id: 'rugpull',  group: 'moment', name: 'Rugged',            scene: 'rugpull',  stat: 'losses',    goal: 3,    how: 'Take 3 losing trades. It happens to everyone' },
  { id: 'volcano',  group: 'moment', name: 'Eruption',          scene: 'volcano',  stat: 'bestWin',   goal: 1000, how: 'Close one trade for $1,000 profit' },
  { id: 'lion',     group: 'moment', name: 'Pride',             scene: 'lion',     stat: 'wins',      goal: 10,   how: 'Close 10 winning trades' },
  { id: 'tiger',    group: 'moment', name: 'Apex Predator',     scene: 'tiger',    stat: 'winRate20', goal: 60,   how: 'Hold a 60% win rate over 20+ trades' },
  { id: 'summit',   group: 'rank',   name: 'The Ascent',        scene: 'summit',   stat: 'peakElo',   goal: 500,  how: 'Your climb up the Elo ladder. Always yours' },

  { id: 'rekt',     group: 'rank', name: 'Rekt',                scene: 'rekt',     stat: 'losses',    goal: 1,         how: 'Take your first loss', tier: 'rekt' },
  { id: 'rookie',   group: 'rank', name: 'Rookie',              scene: 'rookie',   stat: 'peakElo',   goal: 500,       how: 'Reach 500 Elo', tier: 'rookie' },
  { id: 'trader',   group: 'rank', name: 'Trader',              scene: 'trader',   stat: 'peakElo',   goal: 1000,      how: 'Reach 1,000 Elo', tier: 'trader' },
  { id: 'shark',    group: 'rank', name: 'Shark',               scene: 'shark',    stat: 'peakElo',   goal: 10000,     how: 'Reach 10,000 Elo', tier: 'shark' },
  { id: 'whale',    group: 'rank', name: 'Whale',               scene: 'whale',    stat: 'peakElo',   goal: 100000,    how: 'Reach 100,000 Elo', tier: 'whale' },
  { id: 'kraken',   group: 'rank', name: 'Kraken',              scene: 'kraken',   stat: 'peakElo',   goal: 1000000,   how: 'Reach 1,000,000 Elo', tier: 'kraken' },
  { id: 'titan',    group: 'rank', name: 'Titan',               scene: 'titan',    stat: 'peakElo',   goal: 10000000,  how: 'Reach 10,000,000 Elo', tier: 'titan' },
  { id: 'legend',   group: 'rank', name: 'Legend',              scene: 'legend',   stat: 'peakElo',   goal: 100000000, how: 'Reach 100,000,000 Elo', tier: 'legend' },
]

export const cardByScene = (scene) => ACHIEVEMENTS.find((a) => a.scene === scene) ?? null

/** Achievement inputs for any user, from the public profile payload (/profiles/:id). */
export function statsFromProfile(profile) {
  const s = profile?.stats ?? {}
  const joined = profile?.joined_at ? Date.parse(profile.joined_at) : NaN
  return {
    always: 1,
    friends: s.friends ?? 0,
    clans: s.clans ?? 0,
    watchlist: s.watchlist ?? 0,
    referrals: s.referrals ?? 0,
    ageDays: Number.isFinite(joined) ? Math.floor((Date.now() - joined) / 86400000) : 0,
    pro: profile?.is_pro ? 1 : 0,
    wins: s.wins ?? 0,
    losses: s.losses ?? 0,
    bestWin: s.bestWin ?? 0,
    peakElo: s.peakElo ?? 500,
    winRate20: (s.trades ?? 0) >= 20 ? Math.round((s.winRate ?? 0) * 100) : 0,
  }
}

/** The signed-in user's own inputs. Everything comes from the same profile payload other people see. */
export function useAchievementStats() {
  const { user } = useAuth()
  const isPro = useSelector((s) => s.preferences.isPro)
  const { data: profile } = useGetProfileQuery(user?.id, { skip: !user })
  const base = statsFromProfile(profile ? { ...profile, joined_at: profile.joined_at ?? user?.created_at } : { joined_at: user?.created_at })
  return { ...base, pro: isPro ? 1 : 0 }
}

export function evaluate(a, stats) {
  const value = stats[a.stat] ?? 0
  return { value: Math.min(value, a.goal), goal: a.goal, unlocked: value >= a.goal }
}
