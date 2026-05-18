const express = require('express')
const router = express.Router()
const { getDb } = require('../db/schema')
const { requireAuth } = require('../middleware/auth')

function generateCode(db) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code
  do {
    code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  } while (db.prepare('SELECT 1 FROM groups WHERE code = ?').get(code))
  return code
}

function isMember(db, groupId, userId) {
  return !!db.prepare('SELECT 1 FROM group_members WHERE groupId = ? AND userId = ?').get(groupId, userId)
}

function isAdmin(db, groupId, userId) {
  const m = db.prepare('SELECT role FROM group_members WHERE groupId = ? AND userId = ?').get(groupId, userId)
  return m?.role === 'admin'
}

// GET / — user's groups
router.get('/', requireAuth, (req, res) => {
  const db = getDb()
  const groups = db.prepare(`
    SELECT g.*, gm.role,
      (SELECT COUNT(*) FROM group_members WHERE groupId = g.id) AS memberCount,
      (SELECT COUNT(*) FROM group_posts WHERE groupId = g.id) AS postCount
    FROM groups g
    JOIN group_members gm ON gm.groupId = g.id AND gm.userId = ?
    ORDER BY g.createdAt DESC
  `).all(req.user.id)
  res.json(groups)
})

// POST / — create group
router.post('/', requireAuth, (req, res) => {
  const db = getDb()
  const { name, description = '', color = '#e2e8f0', emoji = '' } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Group name is required.' })

  const code = generateCode(db)
  const displayName = req.user.user_metadata?.full_name ?? req.user.email ?? req.user.id

  const { lastInsertRowid: groupId } = db.prepare(
    'INSERT INTO groups (name, description, color, emoji, code, createdBy) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(name.trim(), description.trim(), color, emoji, code, req.user.id)

  db.prepare(
    'INSERT INTO group_members (groupId, userId, displayName, email, role) VALUES (?, ?, ?, ?, ?)'
  ).run(groupId, req.user.id, displayName, req.user.email ?? null, 'admin')

  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(groupId)
  res.status(201).json({ ...group, role: 'admin', memberCount: 1 })
})

// POST /join — join via code
router.post('/join', requireAuth, (req, res) => {
  const db = getDb()
  const { code } = req.body
  if (!code?.trim()) return res.status(400).json({ error: 'Code is required.' })

  const group = db.prepare('SELECT * FROM groups WHERE code = ?').get(code.trim().toUpperCase())
  if (!group) return res.status(404).json({ error: 'Invalid group code.' })

  if (isMember(db, group.id, req.user.id)) {
    return res.json({ ...group, role: db.prepare('SELECT role FROM group_members WHERE groupId = ? AND userId = ?').get(group.id, req.user.id).role, alreadyMember: true })
  }

  const displayName = req.user.user_metadata?.full_name ?? req.user.email ?? req.user.id
  db.prepare(
    'INSERT INTO group_members (groupId, userId, displayName, email, role) VALUES (?, ?, ?, ?, ?)'
  ).run(group.id, req.user.id, displayName, req.user.email ?? null, 'member')

  res.json({ ...group, role: 'member' })
})

// GET /:id — group detail with posts + members
router.get('/:id', requireAuth, (req, res) => {
  const db = getDb()
  const groupId = Number(req.params.id)

  if (!isMember(db, groupId, req.user.id)) return res.status(403).json({ error: 'Not a member of this group.' })

  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(groupId)
  if (!group) return res.status(404).json({ error: 'Group not found.' })

  const member = db.prepare('SELECT role FROM group_members WHERE groupId = ? AND userId = ?').get(groupId, req.user.id)
  const members = db.prepare('SELECT * FROM group_members WHERE groupId = ? ORDER BY role DESC, joinedAt ASC').all(groupId)
  const posts = db.prepare('SELECT * FROM group_posts WHERE groupId = ? ORDER BY createdAt DESC LIMIT 50').all(groupId)

  res.json({ ...group, role: member.role, members, posts })
})

// PATCH /:id — update group settings (admin only)
router.patch('/:id', requireAuth, (req, res) => {
  const db = getDb()
  const groupId = Number(req.params.id)

  if (!isAdmin(db, groupId, req.user.id)) return res.status(403).json({ error: 'Admin only.' })

  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(groupId)
  if (!group) return res.status(404).json({ error: 'Group not found.' })

  const { name, description, color, emoji } = req.body
  db.prepare(`
    UPDATE groups SET name=?, description=?, color=?, emoji=?, updatedAt=datetime('now') WHERE id=?
  `).run(
    name ?? group.name,
    description ?? group.description,
    color ?? group.color,
    emoji ?? group.emoji,
    groupId
  )

  res.json(db.prepare('SELECT * FROM groups WHERE id = ?').get(groupId))
})

// POST /:id/posts — create post
router.post('/:id/posts', requireAuth, (req, res) => {
  const db = getDb()
  const groupId = Number(req.params.id)

  if (!isMember(db, groupId, req.user.id)) return res.status(403).json({ error: 'Not a member.' })

  const { content, type = 'post' } = req.body
  if (!content?.trim()) return res.status(400).json({ error: 'Content is required.' })
  if (!['post', 'announcement', 'notification'].includes(type)) return res.status(400).json({ error: 'Invalid post type.' })

  if ((type === 'announcement' || type === 'notification') && !isAdmin(db, groupId, req.user.id)) {
    return res.status(403).json({ error: 'Only admins can post announcements.' })
  }

  const authorName = req.user.user_metadata?.full_name ?? req.user.email ?? req.user.id
  const { lastInsertRowid } = db.prepare(
    'INSERT INTO group_posts (groupId, authorId, authorName, content, type) VALUES (?, ?, ?, ?, ?)'
  ).run(groupId, req.user.id, authorName, content.trim(), type)

  res.status(201).json(db.prepare('SELECT * FROM group_posts WHERE id = ?').get(lastInsertRowid))
})

// DELETE /:id/posts/:postId — delete post (author or admin)
router.delete('/:id/posts/:postId', requireAuth, (req, res) => {
  const db = getDb()
  const groupId = Number(req.params.id)
  const postId = Number(req.params.postId)

  const post = db.prepare('SELECT * FROM group_posts WHERE id = ? AND groupId = ?').get(postId, groupId)
  if (!post) return res.status(404).json({ error: 'Post not found.' })

  if (post.authorId !== req.user.id && !isAdmin(db, groupId, req.user.id)) {
    return res.status(403).json({ error: 'Cannot delete this post.' })
  }

  db.prepare('DELETE FROM group_posts WHERE id = ?').run(postId)
  res.json({ success: true })
})

// PATCH /:id/members/:userId — update member role (admin only)
router.patch('/:id/members/:userId', requireAuth, (req, res) => {
  const db = getDb()
  const groupId = Number(req.params.id)
  const targetUserId = req.params.userId

  if (!isAdmin(db, groupId, req.user.id)) return res.status(403).json({ error: 'Admin only.' })
  if (targetUserId === req.user.id) return res.status(400).json({ error: 'Cannot change your own role.' })

  const { role } = req.body
  if (!['admin', 'member'].includes(role)) return res.status(400).json({ error: 'Invalid role.' })

  if (!isMember(db, groupId, targetUserId)) return res.status(404).json({ error: 'Member not found.' })

  db.prepare('UPDATE group_members SET role = ? WHERE groupId = ? AND userId = ?').run(role, groupId, targetUserId)
  res.json({ success: true })
})

// DELETE /:id/members/:userId — remove member (admin or self-leave)
router.delete('/:id/members/:userId', requireAuth, (req, res) => {
  const db = getDb()
  const groupId = Number(req.params.id)
  const targetUserId = req.params.userId
  const isSelf = targetUserId === req.user.id

  if (!isSelf && !isAdmin(db, groupId, req.user.id)) {
    return res.status(403).json({ error: 'Cannot remove this member.' })
  }

  if (isSelf && isAdmin(db, groupId, req.user.id)) {
    const adminCount = db.prepare(
      'SELECT COUNT(*) AS c FROM group_members WHERE groupId = ? AND role = ?'
    ).get(groupId, 'admin').c
    if (adminCount <= 1) return res.status(400).json({ error: 'You are the only admin. Transfer admin to someone else before leaving.' })
  }

  db.prepare('DELETE FROM group_members WHERE groupId = ? AND userId = ?').run(groupId, targetUserId)
  res.json({ success: true })
})

module.exports = router
