const express = require('express');
const router = express.Router();
const { getDb } = require('../db/schema');
const { supabase } = require('../services/supabaseAdmin');
const { isUuid } = require('../middleware/validate');
const { decorate, publicCards } = require('../services/identity');
const memePositions = require('../services/memecoinPositions');
const memeData = require('../services/memecoinData');

const MAX_FRIENDS = 500;
const MAX_PENDING_OUT = 100;
const TOP_TRADES = 5;

// Callouts: short, bounded, and pruned. A user keeps their newest CALLOUT_KEEP and nothing survives CALLOUT_TTL_DAYS,
// so the table cannot grow without limit however long the app runs.
const CALLOUT_MAX_BODY = 240;
const CALLOUT_KEEP = 50;
const CALLOUT_TTL_DAYS = 30;
const CALLOUT_FEED = 40;
const CALLOUT_WINDOW_MS = 10 * 60_000;
const CALLOUT_MAX_PER_WINDOW = 5;
const calloutLog = new Map(); // userId -> timestamps (in-process, per instance — same shape as routes/messages.js)

/* A callout should land in a friend's feed in about a second, and a faster poller cannot buy that: /api is capped at
 * 60 req/min per IP and the terminal already spends most of it. So the feed read can be asked to wait — one request
 * per delivery instead of one per tick. Waking is in-process, the same scope as the rate limiter above: with several
 * server instances a waiter only hears its own instance, which is why the client also keeps a slow backstop poll. */
const CALLOUT_WAIT_MS = 25_000;
const CALLOUT_MAX_WAITERS = 200; // a held request is a held socket; past this the read answers at once and the client polls
const calloutWaiters = new Set();

function wakeCalloutWaiters() {
  for (const wake of [...calloutWaiters]) wake();
}

// Resolves when someone posts a callout, when the wait is up, or as soon as the caller hangs up.
function waitForCallout(req) {
  if (calloutWaiters.size >= CALLOUT_MAX_WAITERS) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      calloutWaiters.delete(finish);
      req.removeListener('close', finish);
      resolve();
    };
    const timer = setTimeout(finish, CALLOUT_WAIT_MS);
    if (typeof timer.unref === 'function') timer.unref(); // never hold the process open on an idle feed
    calloutWaiters.add(finish);
    req.once('close', finish);
  });
}

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


/* ── visiting a friend ────────────────────────────────────────────────────────
 * Identity (handle, calling card, Elo, aggregate stats) stays on /api/profiles, readable by anyone signed in.
 * What a person is *holding* does not: positions and the trades behind them are live strategy, so they are released
 * only to the account itself and to accepted friends — the same mutual, revocable consent that already gates DMs.
 * A caller who is not a friend gets the identical 403 whether or not the id exists, so this is not an id oracle.
 * Nothing below reads email, phone, auth metadata or cash balance.
 */

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

function maySeeTrades(db, me, other) {
  return other === me || relationship(db, me, other) === 'friends';
}

// trade_wins.symbol came from token metadata the token's deployer chose, so it is re-sanitised on the way out.
const shapeWin = (r) => ({
  id: r.id,
  kind: r.kind === 'meme' ? 'meme' : 'stock',
  symbol: memeData.sanitizeText(r.symbol, 24, '?'),
  address: r.kind === 'meme' && memeData.isValidAddress(r.address) ? r.address : null,
  entry: num(r.entry), exit: num(r.exit), qty: num(r.qty),
  pnlUsd: num(r.pnl_usd), pnlPct: num(r.pnl_pct),
  at: new Date(`${r.created_at.replace(' ', 'T')}Z`).toISOString(),
});

// GET /api/friends/:userId/profile — the trading half of a profile: biggest wins, plus open positions priced live.
router.get('/:userId/profile', async (req, res, next) => {
  try {
    const me = req.user.id;
    const other = req.params.userId;
    if (!isUuid(other)) return res.status(400).json({ error: true, message: 'Invalid user.' });
    const db = getDb();
    if (!maySeeTrades(db, me, other)) {
      return res.status(403).json({ error: true, code: 'not_friends', message: 'Only friends can see each other positions.' });
    }

    const topTrades = db.prepare(
      'SELECT id, kind, symbol, address, entry, exit, qty, pnl_usd, pnl_pct, created_at FROM trade_wins WHERE user_id = ? ORDER BY pnl_usd DESC LIMIT ?'
    ).all(other, TOP_TRADES).map(shapeWin);

    // Same read path the owner's own terminal uses, so one set of prices and one set of rounding rules.
    let positions = []; let totals = null; let priced = true;
    try {
      const out = await memePositions.listPositions(supabase, other);
      positions = out.positions;
      totals = out.totals;
    } catch (_) { priced = false; } // an upstream price outage must still render the profile

    res.json({ userId: other, isSelf: other === me, topTrades, positions, totals, priced });
  } catch (err) { next(err); }
});

/* ── callouts ─────────────────────────────────────────────────────────────── */

function friendIds(db, me) {
  return db.prepare(
    `SELECT CASE WHEN requester_id = ? THEN addressee_id ELSE requester_id END AS other
       FROM friendships WHERE status = 'accepted' AND (requester_id = ? OR addressee_id = ?)`
  ).all(me, me, me).map((r) => r.other);
}

function calloutRateOk(userId) {
  const now = Date.now();
  const arr = (calloutLog.get(userId) || []).filter((t) => now - t < CALLOUT_WINDOW_MS);
  if (arr.length >= CALLOUT_MAX_PER_WINDOW) { calloutLog.set(userId, arr); return false; }
  arr.push(now);
  calloutLog.set(userId, arr);
  return true;
}

/**
 * Proof that the author traded this mint, read from the ledger rather than taken on trust: an open row says they hold
 * it, a buy transaction says they held it. Returns null when neither exists, and that is a refusal.
 */
async function tradedPosition(userId, address) {
  const { data: open } = await supabase.from('paper_positions')
    .select('ticker, shares, avg_cost').eq('user_id', userId).eq('ticker', address).gt('shares', 0).maybeSingle();
  if (open) return { stance: 'open', entry: num(open.avg_cost) };
  const { data: bought } = await supabase.from('paper_transactions')
    .select('ticker, price, type').eq('user_id', userId).eq('ticker', address).eq('type', 'buy')
    .order('id', { ascending: false }).range(0, 0);
  const row = bought?.[0];
  return row ? { stance: 'closed', entry: num(row.price) } : null;
}

const shapeCallout = (r, cards) => ({
  id: r.id,
  user: cards.get(r.user_id) ?? { userId: r.user_id, username: null, displayName: null, avatarUrl: null },
  address: r.address,
  symbol: r.symbol || memeData.shortMint(r.address),
  stance: r.stance,
  body: r.body,
  entry: num(r.entry),
  at: new Date(`${r.created_at.replace(' ', 'T')}Z`).toISOString(),
});

// GET /api/friends/callouts — your circle's callouts, newest first (yours included, so you can see what you posted).
// With ?after=<id>&wait=1 the request is held until there is something newer than <id>, so delivery costs one
// request rather than one per poll tick. Without them it answers immediately, which is what a first load wants.
router.get('/callouts', async (req, res, next) => {
  try {
    const me = req.user.id;
    const db = getDb();
    const after = Math.max(0, parseInt(req.query.after, 10) || 0);
    const circle = [me, ...friendIds(db, me)];
    const sql = `SELECT * FROM trade_callouts WHERE user_id IN (${circle.map(() => '?').join(',')}) ORDER BY id DESC LIMIT ?`;
    const read = () => db.prepare(sql).all(...circle, CALLOUT_FEED);

    let rows = read();
    if (after > 0 && req.query.wait === '1' && !(rows[0] && rows[0].id > after)) {
      await waitForCallout(req);
      if (res.writableEnded || req.destroyed) return; // the caller went away mid-wait
      rows = read();
    }

    const cards = await publicCards(rows.map((r) => r.user_id), { supabase, db });
    res.json({ callouts: rows.map((r) => shapeCallout(r, cards)) });
  } catch (err) { next(err); }
});

// POST /api/friends/callouts { address, body, symbol? } — call out a token you hold or have held
router.post('/callouts', async (req, res, next) => {
  try {
    const me = req.user.id;
    const address = typeof req.body?.address === 'string' ? req.body.address.trim() : '';
    if (!memeData.isValidAddress(address)) return res.status(400).json({ error: true, message: 'Pick one of your positions.' });

    // Treated as hostile: control/bidi/zero-width characters stripped, homoglyphs folded, length capped by code point.
    // What survives is rendered as a text node, never as markup. sanitizeText also accepts numbers (it serves token
    // metadata); a callout is prose, so anything but a string is refused outright.
    if (typeof req.body?.body !== 'string') return res.status(400).json({ error: true, message: 'Write something to go with it.' });
    const body = memeData.sanitizeText(req.body.body, CALLOUT_MAX_BODY);
    if (!body) return res.status(400).json({ error: true, message: 'Write something to go with it.' });

    const held = await tradedPosition(me, address);
    if (!held) return res.status(403).json({ error: true, code: 'not_your_position', message: 'You can only call out a position you hold or have held.' });

    if (!calloutRateOk(me)) return res.status(429).json({ error: true, message: 'Slow down: too many callouts.' });

    // Display-only snapshot, so the preview still names the coin once it stops resolving upstream.
    const symbol = memeData.sanitizeText(req.body?.symbol, 24, memeData.shortMint(address));

    const db = getDb();
    const info = db.prepare('INSERT INTO trade_callouts (user_id, address, symbol, stance, body, entry) VALUES (?, ?, ?, ?, ?, ?)')
      .run(me, address, symbol, held.stance, body, held.entry);
    db.prepare('DELETE FROM trade_callouts WHERE user_id = ? AND id NOT IN (SELECT id FROM trade_callouts WHERE user_id = ? ORDER BY id DESC LIMIT ?)')
      .run(me, me, CALLOUT_KEEP);
    db.prepare("DELETE FROM trade_callouts WHERE created_at < datetime('now', ?)").run(`-${CALLOUT_TTL_DAYS} days`);

    const row = db.prepare('SELECT * FROM trade_callouts WHERE id = ?').get(info.lastInsertRowid);
    const cards = await publicCards([me], { supabase, db });
    res.json({ callout: shapeCallout(row, cards) });
    wakeCalloutWaiters(); // after the response: the poster never waits on anyone else's delivery
  } catch (err) { next(err); }
});

// DELETE /api/friends/callouts/:id — your own only
router.delete('/callouts/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: true, message: 'Invalid callout.' });
  const r = getDb().prepare('DELETE FROM trade_callouts WHERE id = ? AND user_id = ?').run(id, req.user.id);
  if (!r.changes) return res.status(404).json({ error: true, message: 'Callout not found.' });
  res.json({ deleted: id });
});

module.exports = router;
module.exports._test = { tradedPosition, calloutRateOk, maySeeTrades, wakeCalloutWaiters, calloutWaiters, CALLOUT_MAX_BODY, CALLOUT_MAX_PER_WINDOW, CALLOUT_WAIT_MS };
