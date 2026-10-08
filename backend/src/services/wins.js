// Winners feed: every profitable paper sell is logged, then listed publicly with the trader's @handle,
// their equipped calling card and a killcam animation. A few clearly-labelled demo entries seed an empty board.
const { getDb } = require('../db/schema');

const ANIMS = ['reaper', 'gunship', 'nuke', 'sniper'];
const MIN_WIN_USD = 1;
const FALLBACK_SOL_USD = 150;
const RANGE_SECONDS = { day: 86400, week: 7 * 86400, month: 30 * 86400 };

// Calling cards a user may display (kept in sync with web/src/ascii/achievements.js)
const BANNERS = ['sunrise', 'skyline', 'ocean', 'orbit', 'forest', 'dunes', 'storm', 'aurora', 'gilded', 'capitol'];
const EFFECTS = ['none', 'glow', 'fire', 'matrix', 'sparkle', 'aurora', 'waves'];

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const pickAnim = () => ANIMS[Math.floor(Math.random() * ANIMS.length)];
const animFor = (id) => ANIMS[Math.abs(Number(id) || 0) % ANIMS.length];

/** Log a profitable sell. Never throws: a failed log must not fail the trade it describes. */
function recordWin(w, dbArg) {
  try {
    const db = dbArg || getDb(); // resolved inside the guard: a database problem must never fail the trade being logged
    const pnlUsd = num(w.pnlUsd);
    if (!w.userId || !w.symbol || pnlUsd == null || pnlUsd < MIN_WIN_USD) return null;
    const info = db.prepare(
      `INSERT INTO trade_wins (user_id, kind, symbol, address, entry, exit, qty, pnl_usd, pnl_pct, sol_price, anim)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      String(w.userId), w.kind === 'meme' ? 'meme' : 'stock', String(w.symbol).slice(0, 24).toUpperCase(),
      w.address ? String(w.address).slice(0, 64) : null,
      num(w.entry), num(w.exit), num(w.qty), pnlUsd, num(w.pnlPct), num(w.solPrice), pickAnim()
    );
    return Number(info.lastInsertRowid);
  } catch (err) {
    console.error('[wins] record failed', err.message);
    return null;
  }
}

/* ── demo seeds (shown with a DEMO tag; flip off with WINNERS_DEMO=off) ───────────────────────── */
const hoursAgo = (h) => new Date(Date.now() - h * 3600_000).toISOString();
function demoWins() {
  return [
    { id: 'demo-larp', username: 'larp', displayName: 'larp', symbol: 'SOL', kind: 'meme', pnlUsd: 5000, pnlPct: 62.4, entry: 118.4, exit: 192.3, banner: 'gilded', effect: 'fire', anim: 'reaper', at: hoursAgo(3) },
    { id: 'demo-ada', username: 'ada_whale', displayName: 'ada whale', symbol: 'ADA', kind: 'stock', pnlUsd: 4000, pnlPct: 48.1, entry: 0.41, exit: 0.61, banner: 'skyline', effect: 'matrix', anim: 'gunship', at: hoursAgo(9) },
    { id: 'demo-bonk', username: 'degen_dan', displayName: 'degen dan', symbol: 'BONK', kind: 'meme', pnlUsd: 2850, pnlPct: 131.7, entry: 0.0000118, exit: 0.0000273, banner: 'orbit', effect: 'sparkle', anim: 'nuke', at: hoursAgo(20) },
    { id: 'demo-nvda', username: 'wallstreet_wanda', displayName: 'wanda', symbol: 'NVDA', kind: 'stock', pnlUsd: 1920, pnlPct: 17.9, entry: 884.2, exit: 1042.6, banner: 'capitol', effect: 'glow', anim: 'sniper', at: hoursAgo(31) },
  ];
}

function cleanName(n) {
  return typeof n === 'string' && n.trim() && !n.includes('@') ? n.trim().slice(0, 80) : null;
}
const safeAvatar = (a) => (typeof a === 'string' && /^https?:\/\//i.test(a) ? a : null);

async function profilesByIds(supabase, ids) {
  const map = new Map();
  if (!ids.length) return map;
  const { data } = await supabase.from('profiles').select('user_id, username, display_name, avatar_url').in('user_id', ids);
  for (const p of data ?? []) map.set(p.user_id, p);
  return map;
}
async function profilesByUsernames(supabase, names) {
  const map = new Map();
  if (!names.length) return map;
  const { data } = await supabase.from('profiles').select('user_id, username, display_name, avatar_url').in('username', names);
  for (const p of data ?? []) map.set(p.username, p);
  return map;
}

function cosmeticsFor(db, ids) {
  const map = new Map();
  for (const id of ids) {
    const row = db.prepare('SELECT banner, effect FROM user_cosmetics WHERE user_id = ?').get(id);
    if (row) map.set(id, row);
  }
  return map;
}

/**
 * Winners, biggest first. Real wins come from trade_wins; demo entries fill the board unless disabled.
 * Every entry carries USD and SOL profit so the UI never converts on its own.
 */
async function listWins({ range = 'all', limit = 30, solPrice, supabase, db = getDb(), demo = process.env.WINNERS_DEMO !== 'off' } = {}) {
  const sol = num(solPrice) > 0 ? num(solPrice) : FALLBACK_SOL_USD;
  const cap = Math.min(Math.max(parseInt(limit, 10) || 30, 1), 100);
  const secs = RANGE_SECONDS[range];
  const since = secs ? new Date(Date.now() - secs * 1000).toISOString().replace('T', ' ').slice(0, 19) : null;

  const rows = db.prepare(
    `SELECT * FROM trade_wins ${since ? 'WHERE created_at >= ?' : ''} ORDER BY pnl_usd DESC LIMIT ?`
  ).all(...(since ? [since, cap] : [cap]));

  const profiles = await profilesByIds(supabase, [...new Set(rows.map((r) => r.user_id))]);
  const cosmetics = cosmeticsFor(db, [...profiles.keys()]);
  const real = rows.map((r) => {
    const p = profiles.get(r.user_id);
    const c = cosmetics.get(r.user_id);
    const solAt = num(r.sol_price) > 0 ? r.sol_price : sol;
    return {
      id: `w${r.id}`,
      userId: r.user_id,
      username: p?.username ?? null,
      displayName: cleanName(p?.display_name),
      avatarUrl: safeAvatar(p?.avatar_url),
      banner: BANNERS.includes(c?.banner) ? c.banner : 'sunrise',
      effect: EFFECTS.includes(c?.effect) ? c.effect : 'none',
      symbol: r.symbol, kind: r.kind, entry: r.entry, exit: r.exit,
      pnlUsd: r.pnl_usd, pnlSol: r.pnl_usd / solAt, pnlPct: r.pnl_pct,
      anim: ANIMS.includes(r.anim) ? r.anim : animFor(r.id),
      at: new Date(`${r.created_at.replace(' ', 'T')}Z`).toISOString(),
      demo: false,
    };
  });

  let out = real;
  if (demo) {
    const seeds = demoWins().filter((d) => !secs || Date.now() - Date.parse(d.at) <= secs * 1000);
    // If the demo account's @handle belongs to a real user, link the real profile and avatar
    const real_ = await profilesByUsernames(supabase, seeds.map((d) => d.username));
    const realCos = cosmeticsFor(db, [...real_.values()].map((p) => p.user_id));
    out = [...real, ...seeds.map((d) => {
      const p = real_.get(d.username);
      const c = p && realCos.get(p.user_id);
      return {
        id: d.id, userId: p?.user_id ?? null, username: d.username,
        displayName: cleanName(p?.display_name) ?? d.displayName, avatarUrl: safeAvatar(p?.avatar_url),
        banner: BANNERS.includes(c?.banner) ? c.banner : d.banner,
        effect: EFFECTS.includes(c?.effect) ? c.effect : d.effect,
        symbol: d.symbol, kind: d.kind, entry: d.entry, exit: d.exit,
        pnlUsd: d.pnlUsd, pnlSol: d.pnlUsd / sol, pnlPct: d.pnlPct, anim: d.anim, at: d.at, demo: true,
      };
    })];
  }
  out.sort((a, b) => b.pnlUsd - a.pnlUsd);
  return { wins: out.slice(0, cap).map((w, i) => ({ ...w, rank: i + 1 })), solPrice: sol };
}

function winStats(userId, db = getDb()) {
  const r = db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(pnl_usd),0) AS total, COALESCE(MAX(pnl_usd),0) AS best FROM trade_wins WHERE user_id = ?').get(userId);
  return { wins: r.n, totalUsd: r.total, bestUsd: r.best };
}

module.exports = { recordWin, listWins, winStats, demoWins, ANIMS, BANNERS, EFFECTS, FALLBACK_SOL_USD, MIN_WIN_USD };
