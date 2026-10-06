'use strict';
/**
 * Free social-chatter providers: 4chan /biz (official read-only JSON API) and Reddit (official OAuth API).
 * Uniform interface (a "feed provider"):
 *   { enabled, name, reason? , getNewPosts() -> Promise<[{ id, ts(ms, ACTUAL post time), text, platform,
 *       sourceId, threadId|null, authorId|null }]> }
 * Disabled providers are {enabled:false, name, reason}. Nothing here throws out of getNewPosts() for a
 * routine failure (the collector also guards it). NO scraping of X and NO undocumented endpoints: only
 *   - https://a.4cdn.org/<board>/catalog.json and /thread/<no>.json  (documented: github.com/4chan/4chan-API)
 *   - https://www.reddit.com/api/v1/access_token and https://oauth.reddit.com/r/<sub>/new|comments
 */
const { createRateLimiter } = require('./providers');

const DEFAULT_SUBREDDITS = ['solana', 'CryptoMoonShots', 'memecoins', 'SolanaMemeCoins'];

/** 4chan comment HTML -> plain text. <wbr> is removed WITHOUT a space: it splits long strings (contract addresses). */
function htmlToText(html) {
  return String(html || '')
    .replace(/<wbr\s*\/?>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&');
}

/** catalog.json = [{page, threads:[{no, time, last_modified, replies, com, sub, ...}]}] */
function parseCatalog(json, board = 'biz') {
  const threads = [];
  for (const page of Array.isArray(json) ? json : []) {
    for (const t of (page && page.threads) || []) {
      if (!t || !Number.isFinite(t.no)) continue;
      threads.push({
        no: t.no, board, lastModified: Number(t.last_modified) || Number(t.time) || 0, replies: Number(t.replies) || 0,
        op: { id: t.no, ts: (Number(t.time) || 0) * 1000, text: htmlToText(`${t.sub || ''}\n${t.com || ''}`).trim(), posterId: t.id || null },
      });
    }
  }
  return threads;
}

/** threads/<no>.json = {posts:[{no, time, com, sub, id?, resto}]} */
function parseThread(json, board = 'biz') {
  const out = [];
  for (const p of (json && json.posts) || []) {
    if (!p || !Number.isFinite(p.no) || !Number.isFinite(p.time)) continue;
    out.push({ id: p.no, ts: p.time * 1000, text: htmlToText(`${p.sub || ''}\n${p.com || ''}`).trim(), posterId: p.id || null, board });
  }
  return out;
}

const toFeedPost4 = (board, threadNo, p) => ({
  id: `4chan:${board}:${p.id}`, ts: p.ts, text: p.text, platform: '4chan', sourceId: board,
  threadId: `${board}:${threadNo}`,
  // 4chan has no accounts: only a per-thread poster id exists on some boards. Never reused across threads.
  authorId: p.posterId ? `4chan:${board}:t${threadNo}:${p.posterId}` : null,
});

/**
 * 4chan board provider. STRICT limits (4chan API rules): <= 1 request/second (limiter spaces calls >= 1.1s),
 * a given thread is never re-fetched within 10s, If-Modified-Since on every request (304 = nothing new), catalog
 * polled at most once per ~60s and only threads whose catalog last_modified changed are re-fetched.
 * Opt-in: env SOCIAL_FOURCHAN=1.
 */
function createFourchanProvider(env = process.env, o = {}) {
  const board = (env.FOURCHAN_BOARD || 'biz').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'biz';
  if (env.SOCIAL_FOURCHAN !== '1' && !o.force) return { enabled: false, name: '4chan', reason: 'SOCIAL_FOURCHAN not set to 1' };
  const fetchImpl = o.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') return { enabled: false, name: '4chan', reason: 'no fetch available' };
  const now = o.now || Date.now;
  const base = o.baseUrl || 'https://a.4cdn.org';
  const catalogMinMs = o.catalogMinIntervalMs ?? 60000;
  const threadMinMs = Math.max(o.threadMinIntervalMs ?? 10000, 10000);   // never below the documented 10s
  const maxThreadsPerCycle = o.maxThreadsPerCycle ?? Number(env.FOURCHAN_MAX_THREADS || 30);
  const initialLookbackMs = o.initialLookbackMs ?? 2 * 3600 * 1000;
  const rl = createRateLimiter({ minIntervalMs: Math.max(o.minIntervalMs ?? 1100, 1100), sleep: o.sleep });
  const userAgent = env.FOURCHAN_USER_AGENT || 'portfolio-research-collector/0.1 (read-only, <=1 req/s)';
  const lastModHeader = new Map();     // url -> Last-Modified header value
  const threadState = new Map();       // thread no -> { lastModified, lastFetchAt, maxPostNo, dead }
  let lastCatalogAt = 0;
  let started = null;
  const stats = { requests: 0, notModified: 0, threadFetches: 0 };

  async function get(url) {
    return rl.schedule(async () => {
      const headers = { 'User-Agent': userAgent, Accept: 'application/json' };
      if (lastModHeader.has(url)) headers['If-Modified-Since'] = lastModHeader.get(url);
      stats.requests++;
      let res;
      try { res = await fetchImpl(url, { headers }); } catch (e) { e.retryable = true; throw e; }
      if (res.status === 304) { stats.notModified++; return { notModified: true }; }
      if (!res.ok) {
        const e = new Error(`HTTP ${res.status} for ${url}`); e.status = res.status;
        const ra = res.headers && res.headers.get && res.headers.get('retry-after');
        if (ra && !Number.isNaN(Number(ra))) e.retryAfterMs = Number(ra) * 1000;
        throw e;
      }
      const lm = res.headers && res.headers.get && res.headers.get('last-modified');
      if (lm) lastModHeader.set(url, lm);
      return { json: await res.json() };
    });
  }

  return {
    enabled: true, name: '4chan', board, stats,
    async getNewPosts() {
      const t0 = now();
      if (started === null) started = t0;
      if (lastCatalogAt && t0 - lastCatalogAt < catalogMinMs) return [];
      lastCatalogAt = t0;
      const cat = await get(`${base}/${board}/catalog.json`);
      if (cat.notModified) return [];
      const threads = parseCatalog(cat.json, board);
      const out = [];
      const due = [];
      for (const t of threads) {
        const st = threadState.get(t.no);
        if (!st) {
          // first sighting: take the OP from the catalog for free, fetch replies only if the thread is recently active
          out.push(toFeedPost4(board, t.no, t.op));
          const recent = t.lastModified * 1000 >= t0 - initialLookbackMs;
          threadState.set(t.no, { lastModified: recent ? 0 : t.lastModified, lastFetchAt: 0, maxPostNo: t.no, dead: false });
          if (recent && t.replies > 0) due.push(t);
        } else if (!st.dead && t.lastModified > st.lastModified) due.push(t);
      }
      due.sort((a, b) => b.lastModified - a.lastModified);
      for (const t of due.slice(0, maxThreadsPerCycle)) {
        const st = threadState.get(t.no);
        if (st.lastFetchAt && now() - st.lastFetchAt < threadMinMs) continue;
        st.lastFetchAt = now();
        try {
          stats.threadFetches++;
          const r = await get(`${base}/${board}/thread/${t.no}.json`);
          if (r.notModified) { st.lastModified = t.lastModified; continue; }
          const posts = parseThread(r.json, board);
          for (const p of posts) {
            if (p.id <= st.maxPostNo) continue;       // already delivered (the OP came from the catalog)
            out.push(toFeedPost4(board, t.no, p));
          }
          for (const p of posts) if (p.id > st.maxPostNo) st.maxPostNo = p.id;
          st.lastModified = t.lastModified;
        } catch (e) {
          if (e && e.status === 404) st.dead = true;      // pruned/archived thread
        }
      }
      // drop state for threads that fell off the catalog
      const live = new Set(threads.map((t) => t.no));
      for (const k of [...threadState.keys()]) if (!live.has(k)) threadState.delete(k);
      return out;
    },
  };
}

/**
 * Reddit provider via the official OAuth API (app-only client_credentials). OFF BY DEFAULT: enabled only when
 * REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET are set AND REDDIT_NON_COMMERCIAL_ACK=1 (acknowledging the terms below).
 *
 * LICENSING: Reddit's free API tier is NON-COMMERCIAL. Any commercial use (including feeding a paid product) REQUIRES
 * Reddit's prior written approval. Do not enable this in a commercial deployment without it. Rate limit: 100 queries
 * per minute per OAuth client; we stay under it (>= 650ms between requests) and send a descriptive User-Agent.
 */
function createRedditProvider(env = process.env, o = {}) {
  const { REDDIT_CLIENT_ID: id, REDDIT_CLIENT_SECRET: secret } = env;
  if (!id || !secret) return { enabled: false, name: 'reddit', reason: 'REDDIT_CLIENT_ID/REDDIT_CLIENT_SECRET not set' };
  if (env.REDDIT_NON_COMMERCIAL_ACK !== '1') {
    return { enabled: false, name: 'reddit', reason: 'REDDIT_NON_COMMERCIAL_ACK=1 not set (free Reddit API is non-commercial only; commercial use needs Reddit written approval)' };
  }
  const fetchImpl = o.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') return { enabled: false, name: 'reddit', reason: 'no fetch available' };
  const now = o.now || Date.now;
  const subs = (env.REDDIT_SUBREDDITS ? env.REDDIT_SUBREDDITS.split(',') : DEFAULT_SUBREDDITS)
    .map((s) => s.trim().replace(/^\/?r\//i, '')).filter(Boolean);
  const userAgent = env.REDDIT_USER_AGENT || `server:portfolio-research-collector:v0.1 (by /u/${env.REDDIT_USERNAME || 'unknown'}; non-commercial research)`;
  const rl = createRateLimiter({ minIntervalMs: Math.max(o.minIntervalMs ?? 650, 600), sleep: o.sleep });   // < 100 QPM
  const initialLookbackMs = o.initialLookbackMs ?? 2 * 3600 * 1000;
  const cursors = new Map();     // `${sub}:${kind}` -> newest ts delivered (ms)
  let token = null, tokenExp = 0;

  async function auth() {
    if (token && now() < tokenExp - 60000) return token;
    const res = await rl.schedule(async () => {
      let r;
      try {
        r = await fetchImpl('https://www.reddit.com/api/v1/access_token', {
          method: 'POST',
          headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`, 'User-Agent': userAgent, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'grant_type=client_credentials',
        });
      } catch (e) { e.retryable = true; throw e; }
      if (!r.ok) { const e = new Error(`HTTP ${r.status} for reddit access_token`); e.status = r.status; throw e; }
      return r.json();
    });
    if (!res || !res.access_token) throw new Error('reddit auth: no access_token');
    token = res.access_token; tokenExp = now() + (Number(res.expires_in) || 3600) * 1000;
    return token;
  }

  async function listing(sub, kind) {
    const tk = await auth();
    return rl.schedule(async () => {
      let r;
      try {
        r = await fetchImpl(`https://oauth.reddit.com/r/${encodeURIComponent(sub)}/${kind}?limit=100&raw_json=1`, {
          headers: { Authorization: `bearer ${tk}`, 'User-Agent': userAgent },
        });
      } catch (e) { e.retryable = true; throw e; }
      if (!r.ok) {
        const e = new Error(`HTTP ${r.status} for r/${sub}/${kind}`); e.status = r.status;
        if (r.status === 401) token = null;
        const ra = r.headers && r.headers.get && r.headers.get('retry-after');
        if (ra && !Number.isNaN(Number(ra))) e.retryAfterMs = Number(ra) * 1000;
        throw e;
      }
      return r.json();
    });
  }

  return {
    enabled: true, name: 'reddit', subreddits: subs,
    async getNewPosts() {
      const out = [];
      for (const sub of subs) {
        for (const kind of ['new', 'comments']) {
          const key = `${sub}:${kind}`;
          const since = cursors.has(key) ? cursors.get(key) : now() - initialLookbackMs;
          let newest = since;
          try {
            const j = await listing(sub, kind);
            for (const c of (j && j.data && j.data.children) || []) {
              const d = c && c.data; if (!d || !d.name || !Number.isFinite(d.created_utc)) continue;
              const ts = Math.round(d.created_utc * 1000);
              if (ts <= since) continue;
              const text = c.kind === 't3' ? `${d.title || ''}\n${d.selftext || ''}`.trim() : String(d.body || '');
              const author = d.author && d.author !== '[deleted]' ? d.author : null;
              out.push({
                id: `reddit:${d.name}`, ts, text, platform: 'reddit', sourceId: String(d.subreddit || sub).toLowerCase(),
                threadId: `reddit:${String(d.link_id || d.name).replace(/^t3_/, '')}`,
                authorId: author ? `reddit:${author.toLowerCase()}` : null,
              });
              if (ts > newest) newest = ts;
            }
            cursors.set(key, newest);
          } catch (e) { /* one subreddit failing must not stop the others; collector counts via empty result */ }
        }
      }
      return out;
    },
  };
}

/** In-memory feed provider for tests. `batches`: array of arrays; each getNewPosts() call returns the next batch. */
function createMockFeedProvider({ name = '4chan', batches = [] } = {}) {
  let i = 0;
  return { enabled: true, name, calls: 0, async getNewPosts() { this.calls++; return batches[i++] || []; } };
}

module.exports = {
  htmlToText, parseCatalog, parseThread, createFourchanProvider, createRedditProvider, createMockFeedProvider, DEFAULT_SUBREDDITS,
};
