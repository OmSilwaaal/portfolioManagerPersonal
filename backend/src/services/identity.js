// Public identity cards: who someone is everywhere their name shows up (leaderboard, friends, DMs, clans).
// Every card carries Elo, clan tag and cosmetics. Pro-only cosmetics (calling card, name effects) are stripped for free users
// here, in one place, so no route can leak them.
const { getDb } = require('../db/schema');
const elo = require('./elo');

const BANNERS = [
  'sunrise', 'skyline', 'ocean', 'orbit', 'forest', 'dunes', 'storm', 'aurora', 'gilded', 'capitol',
  'rugpull', 'volcano', 'lion', 'tiger', 'summit',
  'rekt', 'rookie', 'trader', 'shark', 'whale', 'kraken', 'titan', 'legend',
];
const EFFECTS = ['none', 'glow', 'fire', 'matrix', 'sparkle', 'aurora', 'waves'];
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

const PRO_TTL_MS = 5 * 60_000;
const proCache = new Map(); // userId -> { pro, exp }

const isProMeta = (app = {}) => {
  const until = Date.parse(app.referralProUntil ?? '');
  return Boolean(app.isPro) || (Number.isFinite(until) && until > Date.now());
};

/** Pro status for any set of users. Cached for five minutes; unknown users count as free. */
async function proFlags(ids, supabase) {
  const out = new Map();
  await Promise.all(ids.map(async (id) => {
    const hit = proCache.get(id);
    if (hit && hit.exp > Date.now()) { out.set(id, hit.pro); return; }
    let pro = false;
    try {
      const { data } = await supabase.auth.admin.getUserById(id);
      pro = isProMeta(data?.user?.app_metadata);
    } catch { /* lookup failed: treat as free, do not cache */ out.set(id, false); return; }
    proCache.set(id, { pro, exp: Date.now() + PRO_TTL_MS });
    out.set(id, pro);
  }));
  return out;
}
const forgetPro = (id) => proCache.delete(id);

const cleanName = (n) => (typeof n === 'string' && n.trim() && !n.includes('@') ? n.trim().slice(0, 80) : null);
const safeAvatar = (a) => (typeof a === 'string' && /^https?:\/\//i.test(a) ? a : null);

function clanOf(db, userId) {
  return db.prepare(
    `SELECT c.id, c.name, c.tag, c.color, m.role FROM clan_members m JOIN clans c ON c.id = m.clan_id WHERE m.user_id = ?`
  ).get(userId) ?? null;
}

/**
 * userId -> card. Profile rows come from Supabase; everything else from SQLite.
 * `profiles` may be passed in when the caller already fetched them.
 */
async function publicCards(ids, { supabase, db = getDb(), profiles = null } = {}) {
  const uniq = [...new Set(ids.filter(Boolean))];
  const map = new Map();
  if (!uniq.length) return map;

  let rows = profiles;
  if (!rows) {
    const { data } = await supabase.from('profiles').select('user_id, username, display_name, avatar_url').in('user_id', uniq);
    rows = data ?? [];
  }
  const byId = new Map(rows.map((p) => [p.user_id, p]));
  const pro = await proFlags(uniq, supabase);

  for (const id of uniq) {
    const p = byId.get(id);
    const cos = db.prepare('SELECT banner, effect, name_color FROM user_cosmetics WHERE user_id = ?').get(id) ?? {};
    const stats = elo.statsFor(id, db);
    const clan = clanOf(db, id);
    const isPro = pro.get(id) === true;
    map.set(id, {
      userId: id,
      username: p?.username ?? null,
      displayName: cleanName(p?.display_name),
      avatarUrl: safeAvatar(p?.avatar_url),
      isPro,
      elo: stats.elo, tier: stats.tier, tierName: stats.tierName, tierColor: stats.color,
      clanTag: clan?.tag ?? null, clanName: clan?.name ?? null, clanColor: clan?.color ?? null, clanId: clan?.id ?? null,
      nameColor: COLOR_RE.test(cos.name_color ?? '') ? cos.name_color : null,
      banner: isPro && BANNERS.includes(cos.banner) ? cos.banner : null,
      effect: isPro && EFFECTS.includes(cos.effect) ? cos.effect : 'none',
    });
  }
  return map;
}

/** Add Elo/clan/cosmetics to cards that already exist in another shape (friends, DMs). */
async function decorate(list, { supabase, db = getDb() } = {}) {
  const ids = list.map((c) => c?.userId).filter(Boolean);
  const cards = await publicCards(ids, { supabase, db });
  return list.map((c) => {
    const x = cards.get(c?.userId);
    return x ? { ...c, ...x, username: c.username ?? x.username, displayName: c.displayName ?? x.displayName, avatarUrl: c.avatarUrl ?? x.avatarUrl } : c;
  });
}

module.exports = { BANNERS, EFFECTS, COLOR_RE, isProMeta, proFlags, forgetPro, publicCards, decorate, clanOf };
