const express = require('express')
const router = express.Router()
const { supabase } = require('../services/supabaseAdmin')
const { requireAuth } = require('../middleware/auth')
const { isUuid } = require('../middleware/validate')
const { getDb } = require('../db/schema')
const { BANNERS, EFFECTS, winStats } = require('../services/wins')

const USERNAME_RE = /^[a-z0-9_]{3,20}$/

// Public-facing name: never fall back to the full email address — that would publish it to every user.
function publicDisplayName(user) {
  const meta = user?.user_metadata ?? {}
  const name = meta.full_name ?? meta.name
  if (name) return String(name).slice(0, 80)
  return user?.email ? user.email.split('@')[0] : null
}

// Cosmetics plus the numbers behind each calling card, computed here so one user's page can show another's progress.
function publicExtras(userId, authUser) {
  const db = getDb()
  const cos = db.prepare('SELECT banner, effect FROM user_cosmetics WHERE user_id = ?').get(userId) ?? {}
  const count = (sql) => db.prepare(sql).get(userId, userId).n
  const meta = authUser?.user_metadata ?? {}
  const app = authUser?.app_metadata ?? {}
  const proUntil = Date.parse(app.referralProUntil ?? '')
  const w = winStats(userId, db)
  return {
    banner: BANNERS.includes(cos.banner) ? cos.banner : null,
    effect: EFFECTS.includes(cos.effect) ? cos.effect : null,
    is_pro: Boolean(app.isPro) || (Number.isFinite(proUntil) && proUntil > Date.now()),
    stats: {
      friends: count("SELECT COUNT(*) AS n FROM friendships WHERE status = 'accepted' AND (requester_id = ? OR addressee_id = ?)"),
      groups: db.prepare('SELECT COUNT(*) AS n FROM group_members WHERE userId = ?').get(userId).n,
      watchlist: Array.isArray(meta.watchlist) ? meta.watchlist.length : 0,
      referrals: db.prepare('SELECT COUNT(*) AS n FROM referrals WHERE referrer_id = ?').get(userId).n,
      wins: w.wins,
      bestWinUsd: w.bestUsd,
      totalWinUsd: w.totalUsd,
    },
  }
}

async function upsertProfile(userId, displayName = null) {
  const { data } = await supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle()
  if (data) {
    // Backfill display_name if it was missing
    if (!data.display_name && displayName) {
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
    const { username, bio, avatar_url } = req.body ?? {}
    const updates = { updated_at: new Date().toISOString() }

    if (username !== undefined) {
      if (typeof username !== 'string') {
        return res.status(400).json({ error: true, message: 'Username must be a string.' })
      }
      const clean = username.trim().toLowerCase()
      if (clean && !USERNAME_RE.test(clean)) {
        return res.status(400).json({ error: true, message: 'Username must be 3–20 characters: letters, numbers, underscores only.' })
      }
      if (clean) {
        const { data: taken } = await supabase
          .from('profiles')
          .select('user_id')
          .eq('username', clean)
          .neq('user_id', req.user.id)
          .maybeSingle()
        if (taken) return res.status(400).json({ error: true, message: 'Username is already taken.' })
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

    res.json(data)
  } catch (err) {
    console.error('PATCH /profiles/me', err)
    res.status(500).json({ error: true, message: 'Failed to update profile.' })
  }
})

// PUT /profiles/me/cosmetics { banner?, effect? } — what other people see next to your name
router.put('/me/cosmetics', requireAuth, (req, res) => {
  const { banner, effect } = req.body ?? {}
  if (banner !== undefined && banner !== null && !BANNERS.includes(banner)) return res.status(400).json({ error: true, message: 'Unknown calling card.' })
  if (effect !== undefined && effect !== null && !EFFECTS.includes(effect)) return res.status(400).json({ error: true, message: 'Unknown effect.' })
  const db = getDb()
  const cur = db.prepare('SELECT banner, effect FROM user_cosmetics WHERE user_id = ?').get(req.user.id) ?? {}
  const next = { banner: banner === undefined ? cur.banner ?? null : banner, effect: effect === undefined ? cur.effect ?? null : effect }
  db.prepare(
    `INSERT INTO user_cosmetics (user_id, banner, effect, updated_at) VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET banner = excluded.banner, effect = excluded.effect, updated_at = excluded.updated_at`
  ).run(req.user.id, next.banner, next.effect)
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
      // Stored display_name may predate the email-leak fix, so prefer the freshly derived name
      display_name: displayName ?? profile?.display_name ?? null,
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
