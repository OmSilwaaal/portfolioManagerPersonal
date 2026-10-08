// Clans: one per trader. Members wear the clan's [TAG] before their name, and the clan's PnL is the sum of
// its members' realized PnL since each of them joined. Creating a clan is a Pro feature; anyone can join one.
const express = require('express');
const { supabase } = require('../services/supabaseAdmin');
const { getDb } = require('../db/schema');
const elo = require('../services/elo');
const { publicCards, isProMeta } = require('../services/identity');
const { isTicker } = require('../middleware/validate');

const router = express.Router();

const MAX_MEMBERS = 50;
const POST_MAX = 500;
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 ]{1,22}[A-Za-z0-9]$/;
const TAG_RE = /^[A-Za-z0-9]{2,5}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const RESERVED_TAGS = new Set(['ADMIN', 'MOD', 'TVX', 'STAFF', 'KRKN', 'WHLE', 'DGEN', 'PRO']);
const UNSAFE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g;
const clean = (s, max) => String(s ?? '').replace(UNSAFE, '').replace(/\r\n/g, '\n').trim().slice(0, max);

const SEED_CLANS = [
  { id: null, tag: 'KRKN', name: 'Kraken Syndicate', description: 'Deep-water degens. Invite only.', color: '#c084fc', members: 18, pnl: 2840000, avgElo: 412000, demo: true },
  { id: null, tag: 'WHLE', name: 'Whale Watchers', description: 'We move first. Invite only.', color: '#818cf8', members: 24, pnl: 612000, avgElo: 88000, demo: true },
  { id: null, tag: 'DGEN', name: 'Degen Society', description: 'High risk, higher conviction. Invite only.', color: '#fb923c', members: 41, pnl: 197000, avgElo: 21000, demo: true },
];

/** Aggregate numbers for one clan: PnL since each member joined, win rate, average Elo. */
function clanStats(db, clanId) {
  const r = db.prepare(
    `SELECT COUNT(DISTINCT m.user_id) AS members,
            COALESCE(SUM(t.pnl_usd), 0) AS pnl,
            COALESCE(SUM(t.pnl_usd > 0), 0) AS wins, COALESCE(SUM(t.pnl_usd < 0), 0) AS losses
       FROM clan_members m LEFT JOIN trade_results t ON t.user_id = m.user_id AND t.created_at >= m.joined_at
      WHERE m.clan_id = ?`
  ).get(clanId);
  const ids = db.prepare('SELECT user_id FROM clan_members WHERE clan_id = ?').all(clanId).map((x) => x.user_id);
  const elos = ids.map((id) => elo.statsFor(id, db).elo);
  const trades = Number(r.wins) + Number(r.losses);
  return {
    members: Number(r.members), pnl: Number(r.pnl), trades,
    winRate: trades ? Number(r.wins) / trades : 0,
    avgElo: elos.length ? Math.round(elos.reduce((a, b) => a + b, 0) / elos.length) : 0,
  };
}

const shapeClan = (c, stats, extra = {}) => ({ id: c.id, name: c.name, tag: c.tag.toUpperCase(), description: c.description, color: c.color, ownerId: c.owner_id, createdAt: c.created_at, ...stats, ...extra });
const myMembership = (db, userId) => db.prepare('SELECT clan_id, role, joined_at FROM clan_members WHERE user_id = ?').get(userId) ?? null;

// GET /api/clans?sort=pnl|members|elo&q=text
router.get('/', (req, res) => {
  const db = getDb();
  const sort = ['pnl', 'members', 'elo'].includes(req.query.sort) ? req.query.sort : 'pnl';
  const q = clean(req.query.q, 30).toLowerCase();
  const mine = myMembership(db, req.user.id)?.clan_id ?? null;
  let list = db.prepare('SELECT * FROM clans').all().map((c) => shapeClan(c, clanStats(db, c.id), { mine: c.id === mine }));
  if (process.env.WINNERS_DEMO !== 'off') list = list.concat(SEED_CLANS.map((c) => ({ ...c, ownerId: null, createdAt: null, trades: 0, winRate: 0.58, mine: false })));
  if (q) list = list.filter((c) => c.name.toLowerCase().includes(q) || c.tag.toLowerCase().includes(q));
  const by = { pnl: (a, b) => b.pnl - a.pnl, members: (a, b) => b.members - a.members, elo: (a, b) => b.avgElo - a.avgElo }[sort];
  res.json({ clans: list.sort(by).slice(0, 100).map((c, i) => ({ ...c, rank: i + 1 })), myClanId: mine, canCreate: isProMeta(req.user.app_metadata) });
});

// GET /api/clans/me
router.get('/me', (req, res) => {
  const db = getDb();
  const m = myMembership(db, req.user.id);
  if (!m) return res.json({ clan: null, canCreate: isProMeta(req.user.app_metadata) });
  const c = db.prepare('SELECT * FROM clans WHERE id = ?').get(m.clan_id);
  res.json({ clan: shapeClan(c, clanStats(db, c.id), { role: m.role }), canCreate: false });
});

// POST /api/clans { name, tag, description?, color? } — Pro only; you can only be in one clan
router.post('/', (req, res) => {
  if (!isProMeta(req.user.app_metadata)) return res.status(403).json({ error: true, code: 'pro_required', message: 'Creating a clan is a Pro feature. Anyone can join one.' });
  const db = getDb();
  if (myMembership(db, req.user.id)) return res.status(409).json({ error: true, message: 'You are already in a clan. Leave it before creating another.' });
  const name = clean(req.body?.name, 24);
  const tag = clean(req.body?.tag, 5).toUpperCase();
  const description = clean(req.body?.description, 200);
  const color = COLOR_RE.test(req.body?.color ?? '') ? req.body.color : '#e2e8f0';
  if (!NAME_RE.test(name)) return res.status(400).json({ error: true, message: 'Clan name must be 3-24 letters, numbers or spaces.' });
  if (!TAG_RE.test(tag)) return res.status(400).json({ error: true, message: 'Clan tag must be 2-5 letters or numbers.' });
  if (RESERVED_TAGS.has(tag)) return res.status(400).json({ error: true, message: 'That tag is reserved.' });
  try {
    db.exec('BEGIN');
    const info = db.prepare('INSERT INTO clans (name, tag, description, color, owner_id) VALUES (?, ?, ?, ?, ?)').run(name, tag, description, color, req.user.id);
    db.prepare("INSERT INTO clan_members (user_id, clan_id, role) VALUES (?, ?, 'owner')").run(req.user.id, info.lastInsertRowid);
    db.exec('COMMIT');
    const c = db.prepare('SELECT * FROM clans WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(shapeClan(c, clanStats(db, c.id), { role: 'owner' }));
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch { /* not in a transaction */ }
    if (/UNIQUE/i.test(err.message)) return res.status(409).json({ error: true, message: 'That clan name or tag is already taken.' });
    throw err;
  }
});

// POST /api/clans/leave — owners hand the clan to its longest-standing member; the last member out closes it
router.post('/leave', (req, res) => {
  const db = getDb();
  const m = myMembership(db, req.user.id);
  if (!m) return res.status(400).json({ error: true, message: 'You are not in a clan.' });
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM clan_members WHERE user_id = ?').run(req.user.id);
    if (m.role === 'owner') {
      const heir = db.prepare('SELECT user_id FROM clan_members WHERE clan_id = ? ORDER BY joined_at ASC, rowid ASC LIMIT 1').get(m.clan_id);
      if (heir) {
        db.prepare("UPDATE clan_members SET role = 'owner' WHERE user_id = ?").run(heir.user_id);
        db.prepare('UPDATE clans SET owner_id = ? WHERE id = ?').run(heir.user_id, m.clan_id);
      } else {
        db.prepare('DELETE FROM clans WHERE id = ?').run(m.clan_id);
        db.prepare('DELETE FROM clan_posts WHERE clan_id = ?').run(m.clan_id);
      }
    }
    db.exec('COMMIT');
  } catch (err) { db.exec('ROLLBACK'); throw err; }
  res.json({ left: true });
});

const withClan = (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  const clan = Number.isInteger(id) ? getDb().prepare('SELECT * FROM clans WHERE id = ?').get(id) : null;
  if (!clan) return res.status(404).json({ error: true, message: 'Clan not found.' });
  req.clan = clan;
  next();
};

// GET /api/clans/:id — public info + leaderboard of members
router.get('/:id', withClan, async (req, res, next) => {
  try {
    const db = getDb();
    const c = req.clan;
    const mem = myMembership(db, req.user.id);
    const rows = db.prepare(
      `SELECT m.user_id, m.role, m.joined_at,
              COALESCE((SELECT SUM(pnl_usd) FROM trade_results t WHERE t.user_id = m.user_id AND t.created_at >= m.joined_at), 0) AS pnl,
              (SELECT COUNT(*) FROM trade_results t WHERE t.user_id = m.user_id AND t.created_at >= m.joined_at) AS trades
         FROM clan_members m WHERE m.clan_id = ?`
    ).all(c.id);
    const cards = await publicCards(rows.map((r) => r.user_id), { supabase, db });
    const members = rows.map((r) => ({ ...cards.get(r.user_id), role: r.role, joinedAt: r.joined_at, pnl: r.pnl, trades: r.trades, mine: r.user_id === req.user.id }))
      .sort((a, b) => b.pnl - a.pnl).map((m, i) => ({ ...m, rank: i + 1 }));
    res.json({
      clan: shapeClan(c, clanStats(db, c.id), { role: mem?.clan_id === c.id ? mem.role : null }),
      members,
      isMember: mem?.clan_id === c.id,
      canJoin: !mem && members.length < MAX_MEMBERS,
      full: members.length >= MAX_MEMBERS,
      inOtherClan: !!mem && mem.clan_id !== c.id,
    });
  } catch (err) { next(err); }
});

// POST /api/clans/:id/join
router.post('/:id/join', withClan, (req, res) => {
  const db = getDb();
  if (myMembership(db, req.user.id)) return res.status(409).json({ error: true, message: 'You can only be in one clan. Leave your current clan first.' });
  if (db.prepare('SELECT COUNT(*) AS n FROM clan_members WHERE clan_id = ?').get(req.clan.id).n >= MAX_MEMBERS) {
    return res.status(409).json({ error: true, message: 'This clan is full.' });
  }
  db.prepare("INSERT INTO clan_members (user_id, clan_id, role) VALUES (?, ?, 'member')").run(req.user.id, req.clan.id);
  res.json({ joined: true, tag: req.clan.tag.toUpperCase() });
});

// PATCH /api/clans/:id { description?, color? } — owner only
router.patch('/:id', withClan, (req, res) => {
  if (req.clan.owner_id !== req.user.id) return res.status(403).json({ error: true, message: 'Only the clan owner can edit it.' });
  const description = req.body?.description === undefined ? req.clan.description : clean(req.body.description, 200);
  const color = req.body?.color === undefined ? req.clan.color : (COLOR_RE.test(req.body.color) ? req.body.color : null);
  if (!color) return res.status(400).json({ error: true, message: 'Invalid color.' });
  getDb().prepare('UPDATE clans SET description = ?, color = ? WHERE id = ?').run(description, color, req.clan.id);
  res.json({ ok: true });
});

// POST /api/clans/:id/kick/:userId — owner only
router.post('/:id/kick/:userId', withClan, (req, res) => {
  if (req.clan.owner_id !== req.user.id) return res.status(403).json({ error: true, message: 'Only the clan owner can remove members.' });
  if (req.params.userId === req.user.id) return res.status(400).json({ error: true, message: 'Use Leave to leave your own clan.' });
  const r = getDb().prepare('DELETE FROM clan_members WHERE user_id = ? AND clan_id = ?').run(req.params.userId, req.clan.id);
  if (!r.changes) return res.status(404).json({ error: true, message: 'That player is not in your clan.' });
  res.json({ removed: true });
});

// DELETE /api/clans/:id — owner disbands
router.delete('/:id', withClan, (req, res) => {
  if (req.clan.owner_id !== req.user.id) return res.status(403).json({ error: true, message: 'Only the clan owner can disband it.' });
  const db = getDb();
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM clan_members WHERE clan_id = ?').run(req.clan.id);
    db.prepare('DELETE FROM clan_posts WHERE clan_id = ?').run(req.clan.id);
    db.prepare('DELETE FROM clans WHERE id = ?').run(req.clan.id);
    db.exec('COMMIT');
  } catch (err) { db.exec('ROLLBACK'); throw err; }
  res.json({ disbanded: true });
});

// Clan board: members only
const inClan = (req, res, next) => {
  if (myMembership(getDb(), req.user.id)?.clan_id !== req.clan.id) return res.status(403).json({ error: true, message: 'Join this clan to see its board.' });
  next();
};

router.get('/:id/posts', withClan, inClan, async (req, res, next) => {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM (SELECT * FROM clan_posts WHERE clan_id = ? ORDER BY id DESC LIMIT 60) ORDER BY id ASC').all(req.clan.id);
    const cards = await publicCards(rows.map((r) => r.user_id), { supabase, db });
    res.json({
      posts: rows.map((r) => ({
        id: r.id, body: r.body, userId: r.user_id, user: cards.get(r.user_id) ?? null,
        attachment: r.attachment ? (() => { try { return JSON.parse(r.attachment); } catch { return null; } })() : null,
        at: new Date(`${r.created_at.replace(' ', 'T')}Z`).toISOString(),
      })),
    });
  } catch (err) { next(err); }
});

router.post('/:id/posts', withClan, inClan, (req, res) => {
  const body = clean(req.body?.body, POST_MAX);
  const t = req.body?.ticker;
  const ticker = t && typeof t.ticker === 'string' && isTicker(t.ticker.trim()) ? { kind: 'stock', ticker: t.ticker.trim().toUpperCase() } : null;
  if (!body && !ticker) return res.status(400).json({ error: true, message: 'Write something or share a ticker.' });
  const db = getDb();
  const recent = db.prepare("SELECT COUNT(*) AS n FROM clan_posts WHERE user_id = ? AND created_at >= datetime('now', '-1 minute')").get(req.user.id).n;
  if (recent >= 10) return res.status(429).json({ error: true, message: 'Slow down: too many posts.' });
  const info = db.prepare('INSERT INTO clan_posts (clan_id, user_id, body, attachment) VALUES (?, ?, ?, ?)').run(req.clan.id, req.user.id, body, ticker ? JSON.stringify(ticker) : null);
  res.status(201).json({ id: Number(info.lastInsertRowid) });
});

router.delete('/:id/posts/:postId', withClan, inClan, (req, res) => {
  const db = getDb();
  const post = db.prepare('SELECT * FROM clan_posts WHERE id = ? AND clan_id = ?').get(parseInt(req.params.postId, 10) || 0, req.clan.id);
  if (!post) return res.status(404).json({ error: true, message: 'Post not found.' });
  if (post.user_id !== req.user.id && req.clan.owner_id !== req.user.id) return res.status(403).json({ error: true, message: 'You can only delete your own posts.' });
  db.prepare('DELETE FROM clan_posts WHERE id = ?').run(post.id);
  res.json({ deleted: true });
});

module.exports = router;
module.exports._test = { clanStats, MAX_MEMBERS };
