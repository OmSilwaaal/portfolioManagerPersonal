// Winners feed: every profitable paper sell is logged, then listed publicly with the trader's @handle,
// their equipped calling card and a killcam animation. Seeded wins (one per calling card) fill the board alongside real ones.
const { getDb } = require('../db/schema');
const { BANNERS, EFFECTS, publicCards } = require('./identity');
const { SEED_TRADERS, tierFor } = require('./elo');

const ANIMS = ['reaper', 'gunship', 'nuke', 'sniper', 'ritual', 'demon', 'lion', 'tiger'];
const MIN_WIN_USD = 1;
const FALLBACK_SOL_USD = 150;
const RANGE_SECONDS = { day: 86400, week: 7 * 86400, month: 30 * 86400 };

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
// Random per win, never the same scene twice in a row
let lastAnim = null;
function pickAnim() {
  const pool = ANIMS.filter((a) => a !== lastAnim);
  lastAnim = pool[Math.floor(Math.random() * pool.length)];
  return lastAnim;
}
const animFor = (id) => ANIMS[Math.abs(Number(id) || 0) % ANIMS.length];

/**
 * Log a profitable sell. Never throws: a failed log must not fail the trade it
 * describes. `w.anim` pins the killcam scene; omit it and one is picked.
 */
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
      num(w.entry), num(w.exit), num(w.qty), pnlUsd, num(w.pnlPct), num(w.solPrice),
      ANIMS.includes(w.anim) ? w.anim : pickAnim()
    );
    return Number(info.lastInsertRowid);
  } catch (err) {
    console.error('[wins] record failed', err.message);
    return null;
  }
}

const hoursAgo = (h) => new Date(Date.now() - h * 3600_000).toISOString();
// Seeded wins, one per calling card, so the board is never empty. They render like any other win; WINNERS_DEMO=off removes them.
function seedWins() {
  const S = (id, username, symbol, kind, pnlUsd, pnlPct, entry, exit, banner, effect, anim, h) => ({ id: `seed-${id}`, username, displayName: username.replace(/_/g, ' '), symbol, kind, pnlUsd, pnlPct, entry, exit, banner, effect, anim, at: hoursAgo(h) });
  return [
    S('larp', 'larp', 'SOL', 'meme', 5000, 62.4, 118.4, 192.3, 'gilded', 'fire', 'reaper', 3),
    S('ada', 'ada_whale', 'ADA', 'stock', 4000, 48.1, 0.41, 0.61, 'skyline', 'matrix', 'demon', 9),
    S('bonk', 'degen_dan', 'BONK', 'meme', 2850, 131.7, 0.0000118, 0.0000273, 'orbit', 'sparkle', 'nuke', 20),
    S('nvda', 'wallstreet_wanda', 'NVDA', 'stock', 1920, 17.9, 884.2, 1042.6, 'capitol', 'glow', 'sniper', 31),
    S('wif', 'dogwifdave', 'WIF', 'meme', 3400, 86.2, 1.12, 2.09, 'sunrise', 'sparkle', 'ritual', 14),
    S('jup', 'jupiter_jess', 'JUP', 'meme', 2300, 54.5, 0.62, 0.96, 'ocean', 'waves', 'gunship', 26),
    S('tsla', 'forest_fiona', 'TSLA', 'stock', 1650, 12.4, 171.3, 192.5, 'forest', 'aurora', 'reaper', 40),
    S('pepe', 'dune_dealer', 'PEPE', 'meme', 2100, 210.8, 0.0000061, 0.0000190, 'dunes', 'fire', 'demon', 52),
    S('amd', 'storm_chaser', 'AMD', 'stock', 1480, 9.7, 152.0, 166.7, 'storm', 'glow', 'nuke', 64),
    S('eth', 'aurora_ace', 'ETH', 'meme', 2750, 22.3, 3120, 3815, 'aurora', 'aurora', 'ritual', 70),
    S('cate', 'foidkiller', 'CATE', 'meme', 2930.12, 218.4, 0.0000412, 0.000131, 'lion', 'fire', 'lion', 1),
  ];
}

const SEED_BY_NAME = new Map(SEED_TRADERS.map((t) => [t.username, t]));
// Cosmetics and rating shown beside a name. Calling cards and effects are Pro-only; identity.js already strips them for free users.
const badge = (c) => ({
  banner: c?.banner ?? null, effect: c?.effect ?? 'none', nameColor: c?.nameColor ?? null,
  elo: c?.elo ?? null, tier: c?.tier ?? null, tierName: c?.tierName ?? null, tierColor: c?.tierColor ?? null,
  clanTag: c?.clanTag ?? null, isPro: c?.isPro ?? false,
});

/**
 * Winners, biggest first, from trade_wins.
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

  const cards = await publicCards(rows.map((r) => r.user_id), { supabase, db });
  const real = rows.map((r) => {
    const c = cards.get(r.user_id);
    const solAt = num(r.sol_price) > 0 ? r.sol_price : sol;
    return {
      id: `w${r.id}`,
      userId: r.user_id,
      username: c?.username ?? null,
      displayName: c?.displayName ?? null,
      avatarUrl: c?.avatarUrl ?? null,
      ...badge(c),
      symbol: r.symbol, kind: r.kind, entry: r.entry, exit: r.exit,
      pnlUsd: r.pnl_usd, pnlSol: r.pnl_usd / solAt, pnlPct: r.pnl_pct,
      anim: ANIMS.includes(r.anim) ? r.anim : animFor(r.id),
      at: new Date(`${r.created_at.replace(' ', 'T')}Z`).toISOString(),
    };
  });

  let out = real;
  if (demo) {
    const seeds = seedWins().filter((d) => !secs || Date.now() - Date.parse(d.at) <= secs * 1000);
    // a seed whose @handle belongs to a real user is replaced by that person's own identity
    const names = seeds.map((d) => d.username);
    const { data } = names.length ? await supabase.from('profiles').select('user_id, username, display_name, avatar_url').in('username', names) : { data: [] };
    const byName = new Map((data ?? []).map((p) => [p.username, p]));
    const real2 = await publicCards([...byName.values()].map((p) => p.user_id), { supabase, db, profiles: data ?? [] });
    out = [...real, ...seeds.map((d) => {
      const p = byName.get(d.username), c = p && real2.get(p.user_id);
      const seed = SEED_BY_NAME.get(d.username);
      return {
        id: d.id, userId: p?.user_id ?? null, username: d.username,
        displayName: c?.displayName ?? d.displayName, avatarUrl: c?.avatarUrl ?? null,
        ...(c ? badge(c) : { banner: d.banner, effect: d.effect, nameColor: null, elo: seed?.elo ?? null, tier: seed ? tierFor(seed.elo).id : null, tierName: seed ? tierFor(seed.elo).name : null, tierColor: seed ? tierFor(seed.elo).color : null, clanTag: seed?.clan ?? null, isPro: true }),
        symbol: d.symbol, kind: d.kind, entry: d.entry, exit: d.exit,
        pnlUsd: d.pnlUsd, pnlSol: d.pnlUsd / sol, pnlPct: d.pnlPct, anim: d.anim, at: d.at,
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

module.exports = { recordWin, listWins, winStats, ANIMS, BANNERS, EFFECTS, FALLBACK_SOL_USD, MIN_WIN_USD };
