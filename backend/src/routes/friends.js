const express = require('express');
const router = express.Router();
const { getDb } = require('../db/schema');
const { supabase } = require('../services/supabaseAdmin');
const { isUuid } = require('../middleware/validate');
const { decorate } = require('../services/identity');

const MAX_FRIENDS = 500;
const MAX_PENDING_OUT = 100;

const cleanName = (n) => (typeof n === 'string' && n.trim() && !n.includes('@') ? n.trim().slice(0, 80) : null);

// Public profile cards for a set of users. Emails are never included.
async function cardsFor(ids) {
  if (!ids.length) return new Map();
  const { data } = await supabase.from('profiles').select('user_id, username, display_name, avatar_url').in('user_id', ids);
  const map = new Map();
  for (const id of ids) map.set(id, { userId: id, username: null, displayName: null, avatarUrl: null });
  for (const p of data ?? []) {
    map.set(p.user_id, {
      userId: p.user_id,
      username: p.username ?? null,
      displayName: cleanName(p.display_name),
      avatarUrl: typeof p.avatar_url === 'string' && /^https?:\/\//i.test(p.avatar_url) ? p.avatar_url : null,
    });
  }
  // Elo, clan tag and cosmetics ride along on every card
  for (const c of await decorate([...map.values()], { supabase })) map.set(c.userId, c);
  return map;
}

function relationship(db, me, other) {
  const row = db.prepare(
    'SELECT * FROM friendships WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)'
  ).get(me, other, other, me);
  if (!row) return 'none';
  if (row.status === 'accepted') return 'friends';
  return row.requester_id === me ? 'outgoing' : 'incoming';
}

// GET /api/friends — friends plus pending requests in both directions
router.get('/', async (req, res, next) => {
  try {
    const me = req.user.id;
    const rows = getDb().prepare('SELECT * FROM friendships WHERE requester_id = ? OR addressee_id = ? ORDER BY created_at DESC').all(me, me);
    const otherOf = (r) => (r.requester_id === me ? r.addressee_id : r.requester_id);
    const cards = await cardsFor([...new Set(rows.map(otherOf))]);
    const pick = (pred) => rows.filter(pred).map((r) => cards.get(otherOf(r)));
    res.json({
      friends: pick((r) => r.status === 'accepted'),
      incoming: pick((r) => r.status === 'pending' && r.addressee_id === me),
      outgoing: pick((r) => r.status === 'pending' && r.requester_id === me),
    });
  } catch (err) { next(err); }
});

// GET /api/friends/search?q=jane — look people up by @username across everyone
router.get('/search', async (req, res, next) => {
  try {
    const q = String(req.query.q ?? '').trim().replace(/^@/, '').toLowerCase();
    if (!/^[a-z0-9_]{2,20}$/.test(q)) return res.json({ users: [] });

    const { data, error } = await supabase
      .from('profiles')
      .select('user_id, username, display_name, avatar_url')
      .ilike('username', `${q.replace(/_/g, '\\_')}%`)
      .not('username', 'is', null)
      .neq('user_id', req.user.id)
      .order('username', { ascending: true })
      .limit(10);
    if (error) throw error;

    const db = getDb();
    const users = (data ?? []).map((p) => ({
      userId: p.user_id,
      username: p.username,
      displayName: cleanName(p.display_name),
      avatarUrl: typeof p.avatar_url === 'string' && /^https?:\/\//i.test(p.avatar_url) ? p.avatar_url : null,
      relationship: relationship(db, req.user.id, p.user_id),
    }));
    res.json({ users: await decorate(users, { supabase }) });
  } catch (err) { next(err); }
});

// POST /api/friends/request { userId } — also accepts if they'd already asked you
router.post('/request', (req, res) => {
  const me = req.user.id;
  const other = req.body?.userId;
  if (!isUuid(other) || other === me) return res.status(400).json({ error: true, message: 'Invalid user.' });

  const db = getDb();
  const rel = relationship(db, me, other);
  if (rel === 'friends' || rel === 'outgoing') return res.json({ relationship: rel });
  if (rel === 'incoming') {
    db.prepare("UPDATE friendships SET status = 'accepted' WHERE requester_id = ? AND addressee_id = ?").run(other, me);
    return res.json({ relationship: 'friends' });
  }

  if (db.prepare("SELECT COUNT(*) AS n FROM friendships WHERE requester_id = ? AND status = 'pending'").get(me).n >= MAX_PENDING_OUT) {
    return res.status(400).json({ error: true, message: 'You have too many pending requests.' });
  }
  if (db.prepare("SELECT COUNT(*) AS n FROM friendships WHERE (requester_id = ? OR addressee_id = ?) AND status = 'accepted'").get(me, me).n >= MAX_FRIENDS) {
    return res.status(400).json({ error: true, message: 'Friend limit reached.' });
  }
  db.prepare('INSERT OR IGNORE INTO friendships (requester_id, addressee_id) VALUES (?, ?)').run(me, other);
  res.json({ relationship: 'outgoing' });
});

// POST /api/friends/:userId/accept
router.post('/:userId/accept', (req, res) => {
  const other = req.params.userId;
  if (!isUuid(other)) return res.status(400).json({ error: true, message: 'Invalid user.' });
  const r = getDb().prepare("UPDATE friendships SET status = 'accepted' WHERE requester_id = ? AND addressee_id = ? AND status = 'pending'").run(other, req.user.id);
  if (!r.changes) return res.status(404).json({ error: true, message: 'No pending request from that user.' });
  res.json({ relationship: 'friends' });
});

// DELETE /api/friends/:userId — unfriend, cancel a request you sent, or decline one you received
router.delete('/:userId', (req, res) => {
  const other = req.params.userId;
  if (!isUuid(other)) return res.status(400).json({ error: true, message: 'Invalid user.' });
  getDb().prepare(
    'DELETE FROM friendships WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)'
  ).run(req.user.id, other, other, req.user.id);
  res.json({ relationship: 'none' });
});

module.exports = router;
