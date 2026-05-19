const express = require('express')
const router = express.Router()
const { supabase } = require('../services/supabaseAdmin')
const { requireAuth } = require('../middleware/auth')

const USERNAME_RE = /^[a-z0-9_]{3,20}$/

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
    const displayName =
      req.user.user_metadata?.full_name ??
      req.user.user_metadata?.name ??
      req.user.email ??
      null
    const profile = await upsertProfile(req.user.id, displayName)
    res.json(profile)
  } catch (err) {
    console.error('GET /profiles/me', err)
    res.status(500).json({ error: true, message: 'Failed to load profile.' })
  }
})

// PATCH /profiles/me
router.patch('/me', requireAuth, async (req, res) => {
  try {
    const { username, bio, avatar_url } = req.body
    const updates = { updated_at: new Date().toISOString() }

    if (username !== undefined) {
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
    if (bio !== undefined) updates.bio = bio.trim().slice(0, 200)
    if (avatar_url !== undefined) updates.avatar_url = avatar_url.trim().slice(0, 500)

    const { data, error } = await supabase
      .from('profiles')
      .upsert({ user_id: req.user.id, ...updates }, { onConflict: 'user_id' })
      .select()
      .single()
    if (error) throw error

    res.json(data)
  } catch (err) {
    console.error('PATCH /profiles/me', err)
    res.status(500).json({ error: true, message: 'Failed to update profile.' })
  }
})

// GET /profiles/:userId — public profile
router.get('/:userId', requireAuth, async (req, res) => {
  try {
    const userId = req.params.userId

    // Try to get real name from Supabase auth
    let displayName = null
    try {
      const { data: authData } = await supabase.auth.admin.getUserById(userId)
      const meta = authData?.user?.user_metadata ?? {}
      displayName = meta.full_name ?? meta.name ?? authData?.user?.email ?? null
    } catch (_) {}

    const profile = await upsertProfile(userId, displayName)
    if (!profile) return res.status(404).json({ error: true, message: 'Profile not found.' })

    const { user_id, username, bio, avatar_url, display_name, updated_at } = profile
    res.json({ user_id, username, bio, avatar_url, display_name, updated_at })
  } catch (err) {
    console.error('GET /profiles/:userId', err)
    res.status(500).json({ error: true, message: 'Failed to load profile.' })
  }
})

module.exports = router
