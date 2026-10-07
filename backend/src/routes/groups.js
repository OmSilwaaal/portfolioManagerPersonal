const express = require('express')
const router = express.Router()
const { supabase } = require('../services/supabaseAdmin')
const { requireAuth } = require('../middleware/auth')
const crypto = require('crypto')

// Group ids appear in URLs — reject anything that isn't a plain id before it reaches the DB
router.param('id', (req, res, next, id) => {
  if (!/^[A-Za-z0-9-]{1,40}$/.test(id)) return res.status(400).json({ error: true, message: 'Invalid group id.' })
  next()
})
router.param('userId', (req, res, next, id) => {
  if (!/^[A-Za-z0-9-]{1,64}$/.test(id)) return res.status(400).json({ error: true, message: 'Invalid user id.' })
  next()
})
router.param('postId', (req, res, next, id) => {
  if (!/^[A-Za-z0-9-]{1,40}$/.test(id)) return res.status(400).json({ error: true, message: 'Invalid post id.' })
  next()
})

const COLOR_RE = /^#[0-9a-fA-F]{3,8}$/
const IMAGE_DATA_RE = /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/

// Public-facing name — never the raw email address
function memberName(user) {
  const meta = user?.user_metadata ?? {}
  return String(meta.full_name ?? meta.name ?? (user?.email ? user.email.split('@')[0] : 'Member')).slice(0, 80)
}

// Returns a cleaned image value, null (clear), or undefined (invalid)
function cleanImage(v) {
  if (v === null || v === '') return null
  if (typeof v !== 'string') return undefined
  const s = v.trim()
  if (IMAGE_DATA_RE.test(s)) return s.length <= 45000 ? s : undefined
  return /^https?:\/\/[^\s]{1,500}$/i.test(s) ? s : undefined
}

async function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code, exists
  do {
    // CSPRNG — join codes are the only secret protecting a private group
    code = Array.from({ length: 8 }, () => chars[crypto.randomInt(chars.length)]).join('')
    const { data } = await supabase.from('groups').select('id').eq('code', code).maybeSingle()
    exists = !!data
  } while (exists)
  return code
}

async function getMembership(groupId, userId) {
  const { data } = await supabase
    .from('group_members')
    .select('role, can_post')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .maybeSingle()
  return data
}

// GET / — user's groups
router.get('/', requireAuth, async (req, res) => {
  try {
    const { data: memberships, error: mErr } = await supabase
      .from('group_members')
      .select('role, group_id, groups(id, name, description, color, emoji, image_url, code, created_by, created_at)')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false, foreignTable: 'groups' })

    if (mErr) throw mErr

    const groupIds = memberships.map(m => m.group_id)

    let memberCounts = {}, postCounts = {}
    if (groupIds.length > 0) {
      const { data: mc } = await supabase.from('group_members').select('group_id').in('group_id', groupIds)
      const { data: pc } = await supabase.from('group_posts').select('group_id').in('group_id', groupIds)
      if (mc) mc.forEach(r => { memberCounts[r.group_id] = (memberCounts[r.group_id] || 0) + 1 })
      if (pc) pc.forEach(r => { postCounts[r.group_id] = (postCounts[r.group_id] || 0) + 1 })
    }

    const groups = memberships.map(m => ({
      ...m.groups,
      role: m.role,
      memberCount: memberCounts[m.group_id] || 0,
      postCount: postCounts[m.group_id] || 0,
    }))

    res.json(groups)
  } catch (err) {
    console.error('GET /groups', err)
    res.status(500).json({ error: true, message: 'Failed to load groups.' })
  }
})

// POST / — create group
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, description = '', color = '#e2e8f0', image_url = null } = req.body ?? {}
    if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: true, message: 'Group name is required.' })
    if (name.trim().length > 60) return res.status(400).json({ error: true, message: 'Group name cannot exceed 60 characters.' })
    if (typeof description !== 'string' || description.length > 300) return res.status(400).json({ error: true, message: 'Description cannot exceed 300 characters.' })
    if (typeof color !== 'string' || !COLOR_RE.test(color)) return res.status(400).json({ error: true, message: 'Invalid color.' })
    const cleanImg = cleanImage(image_url)
    if (cleanImg === undefined) return res.status(400).json({ error: true, message: 'Invalid or too-large group image.' })

    const { count: ownedCount } = await supabase
      .from('groups')
      .select('*', { count: 'exact', head: true })
      .eq('created_by', req.user.id)
    if (ownedCount >= 3) return res.status(400).json({ error: true, message: 'You can only create up to 3 groups.' })

    const code = await generateCode()
    const displayName = memberName(req.user)

    const insertPayload = { name: name.trim(), description: description.trim(), color, emoji: '', code, created_by: req.user.id }
    if (cleanImg) insertPayload.image_url = cleanImg

    const { data: group, error: gErr } = await supabase
      .from('groups')
      .insert(insertPayload)
      .select()
      .single()
    if (gErr) throw gErr

    const { error: mErr } = await supabase.from('group_members').insert({
      group_id: group.id,
      user_id: req.user.id,
      display_name: displayName,
      role: 'admin',
      can_post: true,
    })
    if (mErr) throw mErr

    res.status(201).json({ ...group, role: 'admin', memberCount: 1, postCount: 0 })
  } catch (err) {
    console.error('POST /groups', err)
    res.status(500).json({ error: true, message: 'Failed to create group.' })
  }
})

// POST /join — join via code
router.post('/join', requireAuth, async (req, res) => {
  try {
    const { code } = req.body ?? {}
    if (typeof code !== 'string' || !/^[A-Za-z0-9]{4,12}$/.test(code.trim())) {
      return res.status(400).json({ error: true, message: 'Invalid group code.' })
    }

    const { data: group, error: gErr } = await supabase
      .from('groups')
      .select('*')
      .eq('code', code.trim().toUpperCase())
      .maybeSingle()
    if (gErr) throw gErr
    if (!group) return res.status(404).json({ error: true, message: 'Invalid group code.' })

    const existing = await getMembership(group.id, req.user.id)
    if (existing) return res.json({ ...group, role: existing.role, alreadyMember: true })

    const displayName = memberName(req.user)
    const { error: mErr } = await supabase.from('group_members').insert({
      group_id: group.id,
      user_id: req.user.id,
      display_name: displayName,
      role: 'member',
      can_post: false,
    })
    if (mErr) throw mErr

    res.json({ ...group, role: 'member' })
  } catch (err) {
    console.error('POST /groups/join', err)
    res.status(500).json({ error: true, message: 'Failed to join group.' })
  }
})

// GET /:id — group detail with posts + members
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const groupId = req.params.id

    const member = await getMembership(groupId, req.user.id)
    if (!member) return res.status(403).json({ error: true, message: 'Not a member of this group.' })

    const { data: group, error: gErr } = await supabase.from('groups').select('*').eq('id', groupId).single()
    if (gErr || !group) return res.status(404).json({ error: true, message: 'Group not found.' })

    const { data: members } = await supabase
      .from('group_members')
      .select('*')
      .eq('group_id', groupId)
      .order('role', { ascending: false })
      .order('joined_at', { ascending: true })

    const { data: posts } = await supabase
      .from('group_posts')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })
      .limit(50)

    // Member emails are private — strip them from the response
    const safeMembers = (members ?? []).map(({ email, ...rest }) => rest)
    res.json({ ...group, role: member.role, members: safeMembers, posts: posts ?? [] })
  } catch (err) {
    console.error('GET /groups/:id', err)
    res.status(500).json({ error: true, message: 'Failed to load group.' })
  }
})

// PATCH /:id — update group settings (admin only)
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const groupId = req.params.id
    const member = await getMembership(groupId, req.user.id)
    if (member?.role !== 'admin') return res.status(403).json({ error: true, message: 'Admin only.' })

    const { name, description, color, emoji, image_url } = req.body ?? {}
    const updates = {}
    const bad = (msg) => res.status(400).json({ error: true, message: msg })
    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim() || name.trim().length > 60) return bad('Group name must be 1–60 characters.')
      updates.name = name.trim()
    }
    if (description !== undefined) {
      if (typeof description !== 'string' || description.length > 300) return bad('Description cannot exceed 300 characters.')
      updates.description = description.trim()
    }
    if (color !== undefined) {
      if (typeof color !== 'string' || !COLOR_RE.test(color)) return bad('Invalid color.')
      updates.color = color
    }
    if (emoji !== undefined) {
      if (typeof emoji !== 'string' || emoji.length > 16) return bad('Invalid emoji.')
      updates.emoji = emoji
    }
    if (image_url !== undefined) {
      const img = cleanImage(image_url)
      if (img === undefined) return bad('Invalid or too-large group image.')
      updates.image_url = img
    }
    if (Object.keys(updates).length === 0) return bad('Nothing to update.')

    const { data: group, error } = await supabase
      .from('groups')
      .update(updates)
      .eq('id', groupId)
      .select()
      .single()
    if (error) throw error

    res.json(group)
  } catch (err) {
    console.error('PATCH /groups/:id', err)
    res.status(500).json({ error: true, message: 'Failed to update group.' })
  }
})

// POST /:id/posts — create post
router.post('/:id/posts', requireAuth, async (req, res) => {
  try {
    const groupId = req.params.id
    const member = await getMembership(groupId, req.user.id)
    if (!member) return res.status(403).json({ error: true, message: 'Not a member.' })
    if (member.role !== 'admin' && !member.can_post) {
      return res.status(403).json({ error: true, message: 'You do not have permission to post in this group.' })
    }

    const { content, type = 'post' } = req.body ?? {}
    if (typeof content !== 'string' || !content.trim()) return res.status(400).json({ error: true, message: 'Content is required.' })
    if (content.length > 2000) return res.status(400).json({ error: true, message: 'Post content cannot exceed 2000 characters.' })
    if (!['post', 'announcement', 'notification'].includes(type)) {
      return res.status(400).json({ error: true, message: 'Invalid post type.' })
    }
    if ((type === 'announcement' || type === 'notification') && member.role !== 'admin') {
      return res.status(403).json({ error: true, message: 'Only admins can post announcements.' })
    }

    const authorName = memberName(req.user)
    const { data: post, error } = await supabase
      .from('group_posts')
      .insert({ group_id: groupId, author_id: req.user.id, author_name: authorName, content: content.trim(), type })
      .select()
      .single()
    if (error) throw error

    res.status(201).json(post)
  } catch (err) {
    console.error('POST /groups/:id/posts', err)
    res.status(500).json({ error: true, message: 'Failed to create post.' })
  }
})

// POST /:id/posts/:postId/vote — vote on a poll (any member)
router.post('/:id/posts/:postId/vote', requireAuth, async (req, res) => {
  try {
    const { id: groupId, postId } = req.params
    const { optionIndex } = req.body

    const member = await getMembership(groupId, req.user.id)
    if (!member) return res.status(403).json({ error: true, message: 'Not a member.' })

    const { data: post } = await supabase
      .from('group_posts')
      .select('*')
      .eq('id', postId)
      .eq('group_id', groupId)
      .maybeSingle()
    if (!post) return res.status(404).json({ error: true, message: 'Post not found.' })
    if (!post.content.startsWith('__POLL__')) return res.status(400).json({ error: true, message: 'Not a poll.' })

    // Parse poll, update votes
    const firstNewline = post.content.indexOf('\n')
    const jsonStr = firstNewline > -1 ? post.content.slice(8, firstNewline) : post.content.slice(8)
    const rest = firstNewline > -1 ? post.content.slice(firstNewline) : ''
    let pollData
    try { pollData = JSON.parse(jsonStr) } catch { return res.status(400).json({ error: true, message: 'Corrupt poll data.' }) }

    const idx = parseInt(optionIndex, 10)
    if (isNaN(idx) || idx < 0 || idx >= pollData.options.length) {
      return res.status(400).json({ error: true, message: 'Invalid option.' })
    }

    pollData.votes = pollData.votes || {}
    // Toggle: remove vote if same option selected again
    if (pollData.votes[req.user.id] === idx) {
      delete pollData.votes[req.user.id]
    } else {
      pollData.votes[req.user.id] = idx
    }

    const newContent = `__POLL__${JSON.stringify(pollData)}${rest}`
    const { data: updated, error } = await supabase
      .from('group_posts')
      .update({ content: newContent })
      .eq('id', postId)
      .select()
      .single()
    if (error) throw error

    res.json(updated)
  } catch (err) {
    console.error('POST /groups/:id/posts/:postId/vote', err)
    res.status(500).json({ error: true, message: 'Failed to record vote.' })
  }
})

// DELETE /:id/posts/:postId — delete post (author or admin)
router.delete('/:id/posts/:postId', requireAuth, async (req, res) => {
  try {
    const { id: groupId, postId } = req.params

    const { data: post } = await supabase
      .from('group_posts')
      .select('*')
      .eq('id', postId)
      .eq('group_id', groupId)
      .maybeSingle()
    if (!post) return res.status(404).json({ error: true, message: 'Post not found.' })

    const member = await getMembership(groupId, req.user.id)
    if (post.author_id !== req.user.id && member?.role !== 'admin') {
      return res.status(403).json({ error: true, message: 'Cannot delete this post.' })
    }

    await supabase.from('group_posts').delete().eq('id', postId)
    res.json({ success: true })
  } catch (err) {
    console.error('DELETE /groups/:id/posts/:postId', err)
    res.status(500).json({ error: true, message: 'Failed to delete post.' })
  }
})

// PATCH /:id/members/:userId — update member role (admin only)
router.patch('/:id/members/:userId', requireAuth, async (req, res) => {
  try {
    const { id: groupId, userId: targetUserId } = req.params
    const member = await getMembership(groupId, req.user.id)
    if (member?.role !== 'admin') return res.status(403).json({ error: true, message: 'Admin only.' })
    if (targetUserId === req.user.id) return res.status(400).json({ error: true, message: 'Cannot change your own role.' })

    const { role, rank, can_post } = req.body ?? {}
    if (rank !== undefined && rank !== null && typeof rank !== 'string') {
      return res.status(400).json({ error: true, message: 'Invalid rank.' })
    }
    if (role !== undefined && !['admin', 'member'].includes(role)) {
      return res.status(400).json({ error: true, message: 'Invalid role.' })
    }

    const target = await getMembership(groupId, targetUserId)
    if (!target) return res.status(404).json({ error: true, message: 'Member not found.' })

    const updates = {}
    if (role !== undefined) {
      updates.role = role
      if (role === 'admin') updates.can_post = true
    }
    if (rank !== undefined) updates.rank = (rank ?? '').trim().slice(0, 30) || null
    if (can_post !== undefined) updates.can_post = Boolean(can_post)

    const { error: upErr } = await supabase.from('group_members').update(updates).eq('group_id', groupId).eq('user_id', targetUserId)
    if (upErr) throw upErr
    res.json({ success: true })
  } catch (err) {
    console.error('PATCH /groups/:id/members/:userId', err)
    res.status(500).json({ error: true, message: 'Failed to update member.' })
  }
})

// DELETE /:id — delete group (admin only)
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const groupId = req.params.id
    const member = await getMembership(groupId, req.user.id)
    if (member?.role !== 'admin') return res.status(403).json({ error: true, message: 'Admin only.' })
    await supabase.from('groups').delete().eq('id', groupId)
    res.json({ success: true })
  } catch (err) {
    console.error('DELETE /groups/:id', err)
    res.status(500).json({ error: true, message: 'Failed to delete group.' })
  }
})

// DELETE /:id/members/:userId — remove member (admin or self-leave)
router.delete('/:id/members/:userId', requireAuth, async (req, res) => {
  try {
    const { id: groupId, userId: targetUserId } = req.params
    const isSelf = targetUserId === req.user.id
    const member = await getMembership(groupId, req.user.id)

    if (!isSelf && member?.role !== 'admin') {
      return res.status(403).json({ error: true, message: 'Cannot remove this member.' })
    }
    if (isSelf && member?.role === 'admin') {
      const { data: admins } = await supabase
        .from('group_members')
        .select('user_id')
        .eq('group_id', groupId)
        .eq('role', 'admin')
      if ((admins?.length ?? 0) <= 1) {
        return res.status(400).json({ error: true, message: 'You are the only admin. Transfer admin to someone else before leaving.' })
      }
    }

    await supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', targetUserId)
    res.json({ success: true })
  } catch (err) {
    console.error('DELETE /groups/:id/members/:userId', err)
    res.status(500).json({ error: true, message: 'Failed to remove member.' })
  }
})

module.exports = router
