// Direct messages between friends, with optional ticker shares.
// Storage is the same SQLite file as friendships, so "friends only" is a single join away.
const express = require('express');
const { getDb } = require('../db/schema');
const { supabase } = require('../services/supabaseAdmin');
const { isUuid, isTicker } = require('../middleware/validate');

const router = express.Router();

const MAX_BODY = 1000;
const PAGE = 60;
const SEND_WINDOW_MS = 60_000;
const SEND_MAX = 30;
const sentLog = new Map(); // userId -> timestamps (in-process limiter, per instance)

const UNSAFE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g;
const cleanBody = (s) => String(s ?? '').replace(UNSAFE, '').replace(/\r\n/g, '\n').trim().slice(0, MAX_BODY);
const MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function areFriends(db, a, b) {
  return !!db.prepare(
    `SELECT 1 FROM friendships WHERE status = 'accepted'
       AND ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?))`
  ).get(a, b, b, a);
}

function rateOk(userId) {
  const now = Date.now();
  const arr = (sentLog.get(userId) || []).filter((t) => now - t < SEND_WINDOW_MS);
  if (arr.length >= SEND_MAX) { sentLog.set(userId, arr); return false; }
  arr.push(now);
  sentLog.set(userId, arr);
  return true;
}

// Ticker attachment: a stock/crypto symbol or a Solana mint. Anything else is dropped.
function parseAttachment(a) {
  if (!a || typeof a !== 'object') return null;
  const ticker = typeof a.ticker === 'string' ? a.ticker.trim() : '';
  if (!ticker) return null;
  const kind = a.kind === 'meme' ? 'meme' : 'stock';
  if (kind === 'meme' ? !MINT_RE.test(ticker) : !isTicker(ticker)) return null;
  const symbol = typeof a.symbol === 'string' ? a.symbol.replace(UNSAFE, '').trim().slice(0, 24) : null;
  return { kind, ticker: kind === 'meme' ? ticker : ticker.toUpperCase(), symbol: symbol || null };
}

const shape = (r) => ({
  id: r.id,
  from: r.sender_id,
  to: r.recipient_id,
  body: r.body,
  attachment: r.attachment ? (() => { try { return JSON.parse(r.attachment); } catch { return null; } })() : null,
  at: new Date(`${r.created_at.replace(' ', 'T')}Z`).toISOString(),
  read: !!r.read_at,
});

async function cards(ids) {
  const map = new Map();
  if (!ids.length) return map;
  const { data } = await supabase.from('profiles').select('user_id, username, display_name, avatar_url').in('user_id', ids);
  for (const p of data ?? []) {
    map.set(p.user_id, {
      userId: p.user_id,
      username: p.username ?? null,
      displayName: typeof p.display_name === 'string' && p.display_name && !p.display_name.includes('@') ? p.display_name.slice(0, 80) : null,
      avatarUrl: typeof p.avatar_url === 'string' && /^https?:\/\//i.test(p.avatar_url) ? p.avatar_url : null,
    });
  }
  return map;
}

// GET /api/messages/conversations — every friend, newest conversation first, with unread counts
router.get('/conversations', async (req, res, next) => {
  try {
    const me = req.user.id;
    const db = getDb();
    const friends = db.prepare(
      `SELECT CASE WHEN requester_id = ? THEN addressee_id ELSE requester_id END AS other
         FROM friendships WHERE status = 'accepted' AND (requester_id = ? OR addressee_id = ?)`
    ).all(me, me, me).map((r) => r.other);

    const profileCards = await cards(friends);
    const list = friends.map((other) => {
      const last = db.prepare(
        `SELECT * FROM messages WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?) ORDER BY id DESC LIMIT 1`
      ).get(me, other, other, me);
      const unread = db.prepare('SELECT COUNT(*) AS n FROM messages WHERE sender_id = ? AND recipient_id = ? AND read_at IS NULL').get(other, me).n;
      return {
        user: profileCards.get(other) ?? { userId: other, username: null, displayName: null, avatarUrl: null },
        last: last ? shape(last) : null,
        unread,
      };
    });
    list.sort((a, b) => (b.last ? Date.parse(b.last.at) : 0) - (a.last ? Date.parse(a.last.at) : 0));
    res.json({ conversations: list, unreadTotal: list.reduce((n, c) => n + c.unread, 0) });
  } catch (err) { next(err); }
});

// GET /api/messages/unread — cheap badge count
router.get('/unread', (req, res) => {
  const n = getDb().prepare('SELECT COUNT(*) AS n FROM messages WHERE recipient_id = ? AND read_at IS NULL').get(req.user.id).n;
  res.json({ unread: n });
});

// GET /api/messages/with/:userId?after=<id>
router.get('/with/:userId', (req, res) => {
  const me = req.user.id;
  const other = req.params.userId;
  if (!isUuid(other)) return res.status(400).json({ error: true, message: 'Invalid user.' });
  const db = getDb();
  if (!areFriends(db, me, other)) return res.status(403).json({ error: true, message: 'You can only message friends.' });
  const after = Math.max(0, parseInt(req.query.after, 10) || 0);
  const rows = after
    ? db.prepare(
        `SELECT * FROM messages WHERE id > ? AND ((sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)) ORDER BY id ASC LIMIT ?`
      ).all(after, me, other, other, me, PAGE)
    : db.prepare(
        `SELECT * FROM (SELECT * FROM messages WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?) ORDER BY id DESC LIMIT ?) ORDER BY id ASC`
      ).all(me, other, other, me, PAGE);
  res.json({ messages: rows.map(shape) });
});

// POST /api/messages/to/:userId { body?, ticker?: { ticker, kind, symbol } }
router.post('/to/:userId', (req, res) => {
  const me = req.user.id;
  const other = req.params.userId;
  if (!isUuid(other) || other === me) return res.status(400).json({ error: true, message: 'Invalid user.' });
  const db = getDb();
  if (!areFriends(db, me, other)) return res.status(403).json({ error: true, message: 'You can only message friends.' });

  const body = cleanBody(req.body?.body);
  const attachment = parseAttachment(req.body?.ticker);
  if (!body && !attachment) return res.status(400).json({ error: true, message: 'Write a message or share a ticker.' });
  if (!rateOk(me)) return res.status(429).json({ error: true, message: 'Slow down: too many messages.' });

  const info = db.prepare('INSERT INTO messages (sender_id, recipient_id, body, attachment) VALUES (?, ?, ?, ?)')
    .run(me, other, body, attachment ? JSON.stringify(attachment) : null);
  res.json({ message: shape(db.prepare('SELECT * FROM messages WHERE id = ?').get(info.lastInsertRowid)) });
});

// POST /api/messages/read/:userId — mark their messages to you as read
router.post('/read/:userId', (req, res) => {
  const other = req.params.userId;
  if (!isUuid(other)) return res.status(400).json({ error: true, message: 'Invalid user.' });
  const r = getDb().prepare("UPDATE messages SET read_at = datetime('now') WHERE sender_id = ? AND recipient_id = ? AND read_at IS NULL").run(other, req.user.id);
  res.json({ marked: r.changes });
});

module.exports = router;
module.exports._test = { parseAttachment, cleanBody, areFriends };
