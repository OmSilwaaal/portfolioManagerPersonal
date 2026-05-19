const express = require('express')
const router = express.Router()
const { supabase } = require('../services/supabaseAdmin')
const { requireAuth } = require('../middleware/auth')

const USERNAME_RE = /^[a-z0-9_]{3,20}$/

async function upsertProfile(userId) {
  const { data } = await supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle()
  if (data) return data
  const { data: created } = await supabase
    .from('profiles')
    .insert({ user_id: userId, username: null, bio: '', avatar_url: '' })
    .select()
    .single()
  return created
}

// GET /profiles/me
router.get('/me', requireAuth, async (req, res) => {
  try {
    const profile = await upsertProfile(req.user.id)
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
    const { data } = await supabase
      .from('profiles')
      .select('user_id, username, bio, avatar_url, updated_at')
      .eq('user_id', req.params.userId)
      .maybeSingle()
    if (!data) return res.status(404).json({ error: true, message: 'Profile not found.' })
    res.json(data)
  } catch (err) {
    console.error('GET /profiles/:userId', err)
    res.status(500).json({ error: true, message: 'Failed to load profile.' })
  }
})

module.exports = router
