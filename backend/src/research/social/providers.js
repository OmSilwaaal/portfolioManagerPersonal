'use strict';
/**
 * Pluggable social data providers. Each factory returns {enabled:false, name, reason}
 * when its keys are missing, otherwise an object with the uniform interface:
 *
 * X-like provider (X official API v2, twitterapi.io, mock):
 *   lookupUser(handle)                  -> {id, handle} | null
 *   getFollowing(handle, {maxPages})    -> [{id, handle}]
 *   getUserPosts(handle, {sinceTs,max}) -> [{id, ts(ms, actual post time), text}]
 * Telegram-like provider (telegram, mock):
 *   getChannelMessages(channel, {sinceTs, limit}) -> [{id, ts(ms), text}]
 * Feed providers (4chan, reddit; see feeds.js): getNewPosts() -> [{id, ts(ms), text, platform, sourceId, threadId, authorId}]
 *
 * All timestamps are epoch ms. Network calls go through a serial rate-limit
 * queue with exponential backoff on 429/5xx.
 */

const sleepReal = (ms) => new Promise((r) => setTimeout(r, ms));

/** Serial queue: min spacing between calls, retry with backoff on 429/5xx/network errors. */
function createRateLimiter({ minIntervalMs = 1000, maxRetries = 4, baseDelayMs = 2000, sleep = sleepReal } = {}) {
  let chain = Promise.resolve();
  let last = 0;
  function schedule(fn) {
    const run = async () => {
      for (let attempt = 0; ; attempt++) {
        const wait = last + minIntervalMs - Date.now();
        if (wait > 0) await sleep(wait);
        last = Date.now();
        try { return await fn(); } catch (err) {
          const st = err && err.status;
          const retryable = st === 429 || (st >= 500 && st < 600) || (!st && err && err.retryable);
          if (!retryable || attempt >= maxRetries) throw err;
          const delay = err.retryAfterMs ?? baseDelayMs * 2 ** attempt;
          await sleep(delay);
          last = Date.now();
        }
      }
    };
    const p = chain.then(run, run);
    chain = p.catch(() => {});
    return p;
  }
  return { schedule };
}

async function httpJson(fetchImpl, url, headers) {
  let res;
  try { res = await fetchImpl(url, { headers }); } catch (e) { e.retryable = true; throw e; }
  if (!res.ok) {
    const e = new Error(`HTTP ${res.status} for ${url.split('?')[0]}`);
    e.status = res.status;
    const ra = res.headers && res.headers.get && res.headers.get('retry-after');
    if (ra && !Number.isNaN(Number(ra))) e.retryAfterMs = Number(ra) * 1000;
    throw e;
  }
  return res.json();
}

/**
 * ONE place to swap X vendors: base URL, auth header, endpoints and response mapping.
 * Official X v2 mapping follows public docs. The twitterapi.io mapping is written from
 * its public docs and is UNVERIFIED against live responses: check field names first.
 */
const X_VENDORS = {
  official: {
    envKey: 'X_BEARER_TOKEN',
    baseUrl: 'https://api.twitter.com/2',
    auth: (key) => ({ Authorization: `Bearer ${key}` }),
    minIntervalMs: 1500,
    user: (h) => `/users/by/username/${encodeURIComponent(h)}`,
    mapUser: (r) => (r && r.data ? { id: r.data.id, handle: r.data.username } : null),
    following: (userId, cursor) =>
      `/users/${userId}/following?max_results=1000${cursor ? `&pagination_token=${cursor}` : ''}`,
    mapFollowing: (r) => ({ items: (r.data || []).map((u) => ({ id: u.id, handle: u.username })), next: r.meta && r.meta.next_token }),
    posts: (userId, { sinceTs, max }) =>
      `/users/${userId}/tweets?max_results=${Math.min(Math.max(max || 20, 5), 100)}&tweet.fields=created_at&exclude=retweets,replies` +
      (sinceTs ? `&start_time=${new Date(sinceTs).toISOString()}` : ''),
    mapPosts: (r) => (r.data || []).map((t) => ({ id: t.id, ts: Date.parse(t.created_at), text: t.text })),
    needsUserId: true,
  },
  twitterapiio: {
    envKey: 'TWITTERAPI_IO_KEY',
    baseUrl: 'https://api.twitterapi.io',
    auth: (key) => ({ 'X-API-Key': key }),
    minIntervalMs: 5500, // free tier is ~1 request / 5s
    user: (h) => `/twitter/user/info?userName=${encodeURIComponent(h)}`,
    mapUser: (r) => (r && r.data ? { id: r.data.id, handle: r.data.userName } : null),
    following: (handle, cursor) => `/twitter/user/followings?userName=${encodeURIComponent(handle)}&pageSize=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
    mapFollowing: (r) => ({
      items: (r.followings || []).map((u) => ({ id: u.id, handle: u.userName })),
      next: r.has_next_page ? r.next_cursor : null,
    }),
    posts: (handle, { sinceTs }) => `/twitter/user/last_tweets?userName=${encodeURIComponent(handle)}`,
    mapPosts: (r) => ((r.data && r.data.tweets) || r.tweets || []).map((t) => ({ id: t.id, ts: Date.parse(t.createdAt), text: t.text })),
    needsUserId: false,
  },
};

function createXProvider(env = process.env, { fetchImpl = globalThis.fetch, vendor, sleep } = {}) {
  const name = vendor || (env.X_BEARER_TOKEN ? 'official' : env.TWITTERAPI_IO_KEY ? 'twitterapiio' : null);
  if (!name) return { enabled: false, name: 'x', reason: 'X_BEARER_TOKEN or TWITTERAPI_IO_KEY not set' };
  const cfg = X_VENDORS[name];
  const key = env[cfg.envKey];
  if (!key) return { enabled: false, name: `x:${name}`, reason: `${cfg.envKey} not set` };
  if (typeof fetchImpl !== 'function') return { enabled: false, name: `x:${name}`, reason: 'no fetch available' };
  const rl = createRateLimiter({ minIntervalMs: cfg.minIntervalMs, sleep });
  const get = (path) => rl.schedule(() => httpJson(fetchImpl, cfg.baseUrl + path, cfg.auth(key)));
  const idCache = new Map();
  const resolveId = async (handle) => {
    if (!cfg.needsUserId) return handle;
    const h = handle.replace(/^@/, '').toLowerCase();
    if (!idCache.has(h)) { const u = cfg.mapUser(await get(cfg.user(h))); idCache.set(h, u && u.id); }
    return idCache.get(h);
  };
  return {
    enabled: true,
    name: `x:${name}`,
    async lookupUser(handle) { return cfg.mapUser(await get(cfg.user(handle.replace(/^@/, '')))); },
    async getFollowing(handle, { maxPages = 5 } = {}) {
      const id = await resolveId(handle);
      if (!id) return [];
      const out = []; let cursor = null;
      for (let p = 0; p < maxPages; p++) {
        const { items, next } = cfg.mapFollowing(await get(cfg.following(id, cursor)));
        out.push(...items);
        if (!next) break;
        cursor = next;
      }
      return out;
    },
    async getUserPosts(handle, { sinceTs, max = 20 } = {}) {
      const id = await resolveId(handle);
      if (!id) return [];
      return cfg.mapPosts(await get(cfg.posts(id, { sinceTs, max })))
        .filter((t) => Number.isFinite(t.ts) && (!sinceTs || t.ts > sinceTs));
    },
  };
}

/**
 * Telegram via MTProto user session (gramjs, `npm i telegram`). HONEST NOTES: this requires a
 * real Telegram user account session (TELEGRAM_SESSION = a StringSession you generate once
 * interactively with your phone login), api_id/api_hash from my.telegram.org, and the optional
 * `telegram` npm package, which is NOT a dependency of this repo. Bot tokens cannot read
 * arbitrary public channels. Optional; untested without credentials. Automating a user account
 * carries ToS/ban risk: use a throwaway account and low volume.
 */
function createTelegramProvider(env = process.env, { clientFactory } = {}) {
  const { TELEGRAM_API_ID: id, TELEGRAM_API_HASH: hash, TELEGRAM_SESSION: session } = env;
  if (!id || !hash || !session) return { enabled: false, name: 'telegram', reason: 'TELEGRAM_API_ID/HASH/SESSION not set' };
  let clientP = null;
  const getClient = () => {
    if (!clientP) {
      clientP = (async () => {
        if (clientFactory) return clientFactory();
        const { TelegramClient } = require('telegram'); // optional dependency
        const { StringSession } = require('telegram/sessions');
        const c = new TelegramClient(new StringSession(session), Number(id), hash, { connectionRetries: 3 });
        await c.connect();
        return c;
      })();
    }
    return clientP;
  };
  const rl = createRateLimiter({ minIntervalMs: 2000 });
  return {
    enabled: true,
    name: 'telegram',
    async getChannelMessages(channel, { sinceTs, limit = 50 } = {}) {
      return rl.schedule(async () => {
        let client;
        try { client = await getClient(); } catch (e) { clientP = null; throw new Error(`telegram unavailable: ${e.message}`); }
        const msgs = await client.getMessages(channel, { limit });
        return msgs
          .map((m) => ({ id: String(m.id), ts: (m.date || 0) * 1000, text: m.message || '' }))
          .filter((m) => m.text && (!sinceTs || m.ts > sinceTs));
      });
    },
  };
}

/** In-memory provider for tests / dry runs. Implements both X and Telegram interfaces. */
function createMockProvider({ users = {}, following = {}, posts = {}, telegram = {} } = {}) {
  const key = (h) => String(h).replace(/^@/, '').toLowerCase();
  const calls = { getFollowing: 0, getUserPosts: 0, getChannelMessages: 0 };
  return {
    enabled: true, name: 'mock', calls,
    async lookupUser(h) { const u = users[key(h)]; return u ? { id: u.id, handle: key(h) } : { id: key(h), handle: key(h) }; },
    async getFollowing(h) { calls.getFollowing++; return (following[key(h)] || []).map((x) => (typeof x === 'string' ? { id: x, handle: x } : x)); },
    async getUserPosts(h, { sinceTs } = {}) { calls.getUserPosts++; return (posts[key(h)] || []).filter((p) => !sinceTs || p.ts > sinceTs); },
    async getChannelMessages(c, { sinceTs } = {}) { calls.getChannelMessages++; return (telegram[key(c)] || []).filter((p) => !sinceTs || p.ts > sinceTs); },
  };
}

function getProviders(env = process.env, opts = {}) {
  const feeds = require('./feeds');   // lazy: feeds.js imports createRateLimiter from this file
  return {
    x: createXProvider(env, opts), telegram: createTelegramProvider(env, opts),
    fourchan: feeds.createFourchanProvider(env, opts), reddit: feeds.createRedditProvider(env, opts),
  };
}

module.exports = { createRateLimiter, createXProvider, createTelegramProvider, createMockProvider, getProviders, X_VENDORS };
