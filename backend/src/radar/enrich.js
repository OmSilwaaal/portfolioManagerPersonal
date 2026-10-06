const axios = require('axios');
const { getRadarDb } = require('./db');
const { mapLimit, now } = require('./util');

// Two cheap side-channels that run in parallel with the main collector:
//  1. DexScreener promotion feeds — someone PAYING to boost/list a token is a marketing push (or a trap). Each feed
//     only shows the latest ~30 items, so we poll every 30s and record when we first saw each item.
//  2. Token metadata (IPFS JSON from the launch) — does it even have a Twitter / Telegram / website?

const PROMO_FEEDS = [
  { kind: 'boost', url: 'https://api.dexscreener.com/token-boosts/latest/v1' },
  { kind: 'boost', url: 'https://api.dexscreener.com/token-boosts/top/v1' },
  { kind: 'profile', url: 'https://api.dexscreener.com/token-profiles/latest/v1' },
  { kind: 'cto', url: 'https://api.dexscreener.com/community-takeovers/latest/v1' },
];
const PROMO_EVERY_MS = 30 * 1000;

// Public gateways rate-limit hard; Pinata answered reliably in testing (slow, ~5s). Only fetch for tokens showing
// activity — 2,000 launches/hour can't all be looked up, and dead ones don't need it.
const GATEWAYS = ['https://gateway.pinata.cloud/ipfs/', 'https://ipfs.io/ipfs/'];
const META_EVERY_MS = 20 * 1000;
const META_PER_TICK = 12;
const META_MIN_VOL_H1 = 300;

async function pollPromos() {
  const results = await mapLimit(PROMO_FEEDS, PROMO_FEEDS.length, async (f) => {
    const { data } = await axios.get(f.url, { timeout: 10000 });
    return { kind: f.kind, items: Array.isArray(data) ? data : [] };
  });
  const db = getRadarDb();
  const ins = db.prepare(`INSERT OR IGNORE INTO token_promo (token_address, kind, amount_key, ts, links_json)
    VALUES (@tok, @kind, @amt, @ts, @links)`);
  const ts = now();
  let added = 0;
  db.transaction(() => {
    for (const r of results) {
      if (!r || r.error) continue;
      for (const it of r.items) {
        if (it.chainId !== 'solana' || !it.tokenAddress) continue;
        added += ins.run({
          tok: it.tokenAddress, kind: r.kind, ts,
          amt: r.kind === 'boost' ? Number(it.totalAmount || it.amount || 0) : 0,
          links: it.links ? JSON.stringify(it.links.map((l) => l.type || l.label || 'link')) : null,
        }).changes;
      }
    }
  })();
  return { promos: added };
}

function cidPath(uri) {
  const m = /\/ipfs\/(.+)$/.exec(uri || '') || /^ipfs:\/\/(.+)$/.exec(uri || '');
  return m ? m[1] : null;
}

async function fetchMeta(uri) {
  const cid = cidPath(uri);
  const urls = cid ? GATEWAYS.map((g) => g + cid) : [uri];
  for (const u of urls) {
    try {
      const { data } = await axios.get(u, { timeout: 12000 });
      if (data && typeof data === 'object') return data;
    } catch { /* try next gateway */ }
  }
  return null;
}

async function pollMetadata() {
  const db = getRadarDb();
  const todo = db.prepare(`
    SELECT l.token_address, l.uri FROM token_launch l JOIN token t USING (token_address)
    WHERE l.meta_ts IS NULL AND l.meta_attempts < 3 AND l.uri IS NOT NULL AND t.dead_ts IS NULL AND t.last_vol_h1 >= ?
    ORDER BY t.last_vol_h1 DESC LIMIT ?
  `).all(META_MIN_VOL_H1, META_PER_TICK);
  if (!todo.length) return { metadata: 0 };
  const done = db.prepare(`UPDATE token_launch SET meta_ts = @ts, has_twitter = @tw, has_telegram = @tg, has_website = @web,
    desc_len = @dl WHERE token_address = @tok`);
  const fail = db.prepare('UPDATE token_launch SET meta_attempts = meta_attempts + 1 WHERE token_address = ?');
  let ok = 0;
  await mapLimit(todo, 3, async (t) => {
    const m = await fetchMeta(t.uri);
    if (!m) { fail.run(t.token_address); return; }
    const has = (v) => (typeof v === 'string' && v.trim().length > 3 ? 1 : 0);
    done.run({ ts: now(), tw: has(m.twitter), tg: has(m.telegram), web: has(m.website),
      dl: typeof m.description === 'string' ? m.description.length : 0, tok: t.token_address });
    ok++;
  });
  return { metadata: ok };
}

let timers = [];
function start() {
  if (timers.length) return;
  const guard = (fn) => async () => { try { await fn(); } catch (e) { console.error('[radar] enrich error:', e.message); } };
  timers.push(setInterval(guard(pollPromos), PROMO_EVERY_MS));
  timers.push(setInterval(guard(pollMetadata), META_EVERY_MS));
  guard(pollPromos)();
}
function stop() { timers.forEach(clearInterval); timers = []; }

module.exports = { start, stop, pollPromos, pollMetadata };
