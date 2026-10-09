const express = require('express')
const router = express.Router()
const { supabase } = require('../services/supabaseAdmin')
const { requireAuth } = require('../middleware/auth')
const { isUuid } = require('../middleware/validate')
const { getDb } = require('../db/schema')
const { winStats } = require('../services/wins')
const { BANNERS, EFFECTS, COLOR_RE, isProMeta, forgetPro, clanOf } = require('../services/identity')
const elo = require('../services/elo')

const USERNAME_RE = /^[a-z0-9_]{3,20}$/

/* ── renaming, as a privacy control ──────────────────────────────────────────
 * Nothing in this codebase stores a username in a second table — every name shown anywhere (friends list, search,
 * DMs, callouts, clan rosters, the winners board, the Elo ladder) is read back through `profiles` by user id at
 * request time. So a rename propagates everywhere by itself, and the work here is making sure the rename cannot be
 * abused rather than making it spread.
 *
 * The vacated handle is HELD, not released: for HOLD_DAYS only its previous owner may take it back. Immediate release
 * would let anyone adopt a handle seconds after its owner renamed away from it and inherit the reputation still
 * attached to it — which matters more now that an account can hold real money.
 */
const HOLD_DAYS = 30
const RENAMES_PER_DAY = 3
const NAME_MAX = 40

// Handles nobody may claim: the seeded demo traders (the Elo ladder and the winners board attribute a seed row to
// whoever holds its handle, so claiming one hands you a fabricated win and rating), plus the usual impersonation bait.
const RESERVED = new Set([
  ...elo.SEED_TRADERS.map((t) => t.username),
  'admin', 'administrator', 'support', 'help', 'staff', 'team', 'mod', 'moderator', 'official',
  'travauxus', 'system', 'root', 'security', 'billing', 'everyone', 'here', 'me', 'null', 'undefined',
])

// Control, bidi-override and zero-width characters are stripped so a name cannot spoof another; '@' is removed so a
// display name can never read as an email or a handle (the public card builder already drops names containing one).
const UNSAFE_NAME = /[\u0000-\u001F\u007F­​-‏‪-‮⁠-⁤⁦-⁩﻿]/g
const cleanDisplayName = (v) =>
  String(v ?? '').replace(UNSAFE_NAME, '').normalize('NFKC').replace(/@/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX)

// The name a member signed up with. Used only until they set one of their own; never the full email address.
function publicDisplayName(user) {
  const meta = user?.user_metadata ?? {}
  const name = meta.full_name ?? meta.name
  if (name) return cleanDisplayName(name) || null
  return user?.email ? cleanDisplayName(user.email.split('@')[0]) || null : null
}

/**
 * The name other people see. A name the member set themselves always wins. An empty string means they deliberately
 * cleared it, and that is honoured — the sign-up name does not come back, so the profile shows the @handle instead.
 * Only a column that was never set at all falls back to the sign-up name.
 */
function shownName(profileRow, signupName) {
  const stored = typeof profileRow?.display_name === 'string' ? cleanDisplayName(profileRow.display_name) : null
  if (stored) return stored
  return profileRow?.display_name == null ? signupName ?? null : null
}

// Cosmetics plus the numbers behind each calling card, computed here so one user's page can show another's progress.
// Calling cards and effects are Pro cosmetics: they are only reported (and only ever shown) for Pro members.
function publicExtras(userId, authUser) {
  const db = getDb()
  const cos = db.prepare('SELECT banner, effect, name_color FROM user_cosmetics WHERE user_id = ?').get(userId) ?? {}
  const count = (sql) => db.prepare(sql).get(userId, userId).n
  const meta = authUser?.user_metadata ?? {}
  const isPro = isProMeta(authUser?.app_metadata)
  const w = winStats(userId, db)
  const e = elo.statsFor(userId, db)
  const clan = clanOf(db, userId)
  return {
    banner: isPro && BANNERS.includes(cos.banner) ? cos.banner : null,
    effect: isPro && EFFECTS.includes(cos.effect) ? cos.effect : null,
    name_color: COLOR_RE.test(cos.name_color ?? '') ? cos.name_color : null,
    is_pro: isPro,
    elo: { elo: e.elo, peak: e.peak, tier: e.tier, tierName: e.tierName, color: e.color, next: e.next, pct: e.pct, trades: e.trades, wins: e.wins, losses: e.losses, winRate: e.winRate, totalPnl: e.totalPnl, bestWin: e.bestWin, streak: elo.streakOf(userId, db) },
    clan: clan ? { id: clan.id, name: clan.name, tag: clan.tag.toUpperCase(), color: clan.color } : null,
    stats: {
      friends: count("SELECT COUNT(*) AS n FROM friendships WHERE status = 'accepted' AND (requester_id = ? OR addressee_id = ?)"),
      clans: clan ? 1 : 0,
      watchlist: Array.isArray(meta.watchlist) ? meta.watchlist.length : 0,
      referrals: db.prepare('SELECT COUNT(*) AS n FROM referrals WHERE referrer_id = ?').get(userId).n,
      wins: w.wins,
      bestWinUsd: w.bestUsd,
      totalWinUsd: w.totalUsd,
      trades: e.trades, losses: e.losses, winRate: e.winRate, bestWin: e.bestWin, peakElo: e.peak,
    },
  }
}

async function upsertProfile(userId, displayName = null) {
  const { data } = await supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle()
  if (data) {
    // Backfill display_name only when it was never set. An empty string is a member who cleared it on purpose, and
    // writing the sign-up name back over that would undo the privacy choice on their next page load.
    if (data.display_name == null && displayName) {
      const { data: updated } = await supabase
        .from('profiles')
        .update({ display_name: displayName })
        .eq('user_id', userId)
        .select()
        .single()
      return updated ?? data
    }
    return data
  }
  const { data: created } = await supabase
    .from('profiles')
    .insert({ user_id: userId, username: null, bio: '', avatar_url: '', display_name: displayName })
    .select()
    .single()
  return created
}

// GET /profiles/me
router.get('/me', requireAuth, async (req, res) => {
  try {
    const profile = await upsertProfile(req.user.id, publicDisplayName(req.user))
    res.json(profile)
  } catch (err) {
    console.error('GET /profiles/me', err)
    res.status(500).json({ error: true, message: 'Failed to load profile.' })
  }
})

// PATCH /profiles/me
router.patch('/me', requireAuth, async (req, res) => {
  try {
    const { username, bio, avatar_url, display_name } = req.body ?? {}
    const updates = { updated_at: new Date().toISOString() }
    const db = getDb()
    let renamedFrom = null

    if (display_name !== undefined) {
      if (typeof display_name !== 'string') {
        return res.status(400).json({ error: true, message: 'Name must be a string.' })
      }
      // '' is allowed and meaningful: it clears the name, leaving only the @handle on show.
      updates.display_name = cleanDisplayName(display_name)
    }

    if (username !== undefined) {
      if (typeof username !== 'string') {
        return res.status(400).json({ error: true, message: 'Username must be a string.' })
      }
      const clean = username.trim().toLowerCase()
      if (clean && !USERNAME_RE.test(clean)) {
        return res.status(400).json({ error: true, message: 'Username must be 3–20 characters: letters, numbers, underscores only.' })
      }
      const { data: mine } = await supabase.from('profiles').select('username').eq('user_id', req.user.id).maybeSingle()
      const current = mine?.username ?? null

      // Saving the form without touching the handle must stay free: only a real change pays the rename rules.
      if (clean !== (current ?? '')) {
        if (current) renamedFrom = current

        if (clean) {
          if (RESERVED.has(clean)) {
            return res.status(400).json({ error: true, message: 'That username is reserved. Please pick another.' })
          }
          // Usernames are always stored lower-cased, so an exact match here is a case-insensitive collision check.
          const { data: taken } = await supabase
            .from('profiles')
            .select('user_id')
            .eq('username', clean)
            .neq('user_id', req.user.id)
            .maybeSingle()
          if (taken) return res.status(400).json({ error: true, message: 'Username is already taken.' })

          const held = db.prepare(
            "SELECT user_id FROM username_history WHERE username = ? AND released_at > datetime('now', ?) ORDER BY id DESC LIMIT 1"
          ).get(clean, `-${HOLD_DAYS} days`)
          if (held && held.user_id !== req.user.id) {
            return res.status(409).json({ error: true, message: `That username was recently in use. It is held for ${HOLD_DAYS} days.` })
          }
        }

        // Counted from the audit log rather than memory, so restarting the server does not hand out free renames.
        const recent = db.prepare(
          "SELECT COUNT(*) AS n FROM username_history WHERE user_id = ? AND released_at > datetime('now', '-1 day')"
        ).get(req.user.id).n
        if (recent >= RENAMES_PER_DAY) {
          return res.status(429).json({ error: true, message: `You can change your username ${RENAMES_PER_DAY} times a day. Try again tomorrow.` })
        }
      }
      updates.username = clean || null
    }

    if (bio !== undefined) {
      if (typeof bio !== 'string') return res.status(400).json({ error: true, message: 'Bio must be a string.' })
      updates.bio = bio.trim().slice(0, 200)
    }

    if (avatar_url !== undefined) {
      if (typeof avatar_url !== 'string') {
        return res.status(400).json({ error: true, message: 'Avatar must be a string.' })
      }
      const url = avatar_url.trim()
      // Uploaded photos arrive as resized base64 data URLs (~10–30KB); truncating them corrupts the image
      const isDataUrl = /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(url)
      const maxLen = isDataUrl ? 45000 : 500
      if (url.length > maxLen) {
        return res.status(400).json({ error: true, message: 'Image is too large. Try a smaller photo.' })
      }
      if (url && !isDataUrl && !/^https?:\/\/[^\s]+$/i.test(url)) {
        return res.status(400).json({ error: true, message: 'Avatar must be an uploaded image or an http(s) URL.' })
      }
      updates.avatar_url = url
    }

    const { data, error } = await supabase
      .from('profiles')
      .upsert({ user_id: req.user.id, ...updates }, { onConflict: 'user_id' })
      .select()
      .single()
    if (error) {
      // Unique violation = lost a race for the username
      if (error.code === '23505') {
        return res.status(400).json({ error: true, message: 'Username is already taken.' })
      }
      throw error
    }

    // Only after the handle has actually moved: the old one goes into the hold, which is also the rename log.
    if (renamedFrom) {
      db.prepare('INSERT INTO username_history (user_id, username) VALUES (?, ?)').run(req.user.id, renamedFrom)
    }

    res.json(data)
  } catch (err) {
    console.error('PATCH /profiles/me', err)
    res.status(500).json({ error: true, message: 'Failed to update profile.' })
  }
})

// PUT /profiles/me/cosmetics { banner?, effect?, nameColor? } — what other people see next to your name.
// Free accounts get a solid name colour only. Calling cards and animated effects need Pro.
router.put('/me/cosmetics', requireAuth, (req, res) => {
  const { banner, effect, nameColor } = req.body ?? {}
  const pro = isProMeta(req.user.app_metadata)
  const wantsPro = (banner !== undefined && banner !== null) || (effect !== undefined && effect !== null && effect !== 'none')
  if (wantsPro && !pro) return res.status(403).json({ error: true, code: 'pro_required', message: 'Calling cards and name effects are Pro features. Free accounts can pick a solid name colour.' })
  if (banner !== undefined && banner !== null && !BANNERS.includes(banner)) return res.status(400).json({ error: true, message: 'Unknown calling card.' })
  if (effect !== undefined && effect !== null && !EFFECTS.includes(effect)) return res.status(400).json({ error: true, message: 'Unknown effect.' })
  if (nameColor !== undefined && nameColor !== null && !COLOR_RE.test(nameColor)) return res.status(400).json({ error: true, message: 'Name colour must be a hex colour like #38bdf8.' })
  if (banner && elo.TRADING_CARDS[banner] && !elo.TRADING_CARDS[banner](elo.statsFor(req.user.id))) {
    return res.status(403).json({ error: true, message: 'You have not unlocked that calling card yet.' })
  }
  const db = getDb()
  forgetPro(req.user.id)
  const cur = db.prepare('SELECT banner, effect, name_color FROM user_cosmetics WHERE user_id = ?').get(req.user.id) ?? {}
  const next = {
    banner: banner === undefined ? cur.banner ?? null : banner,
    effect: effect === undefined ? cur.effect ?? null : effect,
    nameColor: nameColor === undefined ? cur.name_color ?? null : nameColor,
  }
  db.prepare(
    `INSERT INTO user_cosmetics (user_id, banner, effect, name_color, updated_at) VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET banner = excluded.banner, effect = excluded.effect, name_color = excluded.name_color, updated_at = excluded.updated_at`
  ).run(req.user.id, next.banner, next.effect, next.nameColor)
  res.json(next)
})

// GET /profiles/by-username/:username — resolves an @handle to a user id (profile pages live at /u/:username)
router.get('/by-username/:username', requireAuth, async (req, res) => {
  const name = String(req.params.username ?? '').replace(/^@/, '').toLowerCase()
  if (!USERNAME_RE.test(name)) return res.status(404).json({ error: true, message: 'Profile not found.' })
  const { data } = await supabase.from('profiles').select('user_id, username').eq('username', name).maybeSingle()
  if (!data) return res.status(404).json({ error: true, message: 'Profile not found.' })
  res.json({ user_id: data.user_id, username: data.username })
})

// GET /profiles/:userId — public profile (read-only: never creates rows for other users)
router.get('/:userId', requireAuth, async (req, res) => {
  try {
    const userId = req.params.userId
    if (!isUuid(userId)) return res.status(400).json({ error: true, message: 'Invalid user id.' })

    let displayName = null
    let joined_at = null
    let authUser = null
    try {
      const { data: authData } = await supabase.auth.admin.getUserById(userId)
      if (!authData?.user) return res.status(404).json({ error: true, message: 'Profile not found.' })
      authUser = authData.user
      displayName = publicDisplayName(authData.user)
      joined_at = authData.user.created_at ?? null
    } catch (_) {
      return res.status(404).json({ error: true, message: 'Profile not found.' })
    }

    const { data: profile } = await supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle()

    res.json({
      user_id: userId,
      username: profile?.username ?? null,
      bio: profile?.bio ?? '',
      avatar_url: profile?.avatar_url ?? '',
      display_name: shownName(profile, displayName),
      updated_at: profile?.updated_at ?? null,
      joined_at,
      ...publicExtras(userId, authUser),
    })
  } catch (err) {
    console.error('GET /profiles/:userId', err)
    res.status(500).json({ error: true, message: 'Failed to load profile.' })
  }
})

module.exports = router
