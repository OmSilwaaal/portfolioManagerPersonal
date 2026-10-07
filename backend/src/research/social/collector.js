'use strict';
/**
 * Periodic social collector. Opt-in: SOCIAL_COLLECTOR=1. Per-provider flags:
 * SOCIAL_X=0 / SOCIAL_TELEGRAM=0 disable a provider even if its keys exist.
 * Free chatter feeds are opt-in: SOCIAL_FOURCHAN=1 + SOCIAL_FOURCHAN_ACK=1 (EXPERIMENTAL untrusted anonymous 4chan
 * /biz control; no raw text is ever stored for it), SOCIAL_REDDIT=1 (+ Reddit keys and REDDIT_NON_COMMERCIAL_ACK=1). They poll on their own faster timers (4chan ~60s) inside start().
 * Never throws out of start()/runOnce(); all errors are logged and swallowed.
 * Posts are stored at their ACTUAL post time (ts); ingested_ts is our clock.
 */
const { initSocialSchema, ensureAccount, pruneSocialText } = require('./schema');
const { extractEntities, textHash } = require('./entityLinking');
const fg = require('./followGraph');
const { getProviders } = require('./providers');
const { fourchanOptIn } = require('./feeds');

// Caps for UNTRUSTED (4chan) posts: only this much text is examined and only this many candidates are kept per post.
const UNTRUSTED_MAX_TEXT = 2000;
const UNTRUSTED_MAX_CANDIDATES = 8;

let timer = null;
let running = false;
const feedTimers = [];

function storePost(db, { platform, accountId, postId, ts, text, tokens, now, hash }) {
  const ins = db.prepare('INSERT OR IGNORE INTO account_post(post_id, account_id, token_address, ts, platform, text_hash, text, ingested_ts) VALUES (?,?,?,?,?,?,?,?)');
  const h = hash || textHash(text);
  for (const tok of tokens.length ? tokens : [null]) ins.run(postId, accountId, tok, ts, platform, h, text, now);
}

function storeTelegram(db, { channel, messageId, ts, text, tokens, now }) {
  const ins = db.prepare('INSERT OR IGNORE INTO telegram_message(message_id, channel_id, ts, token_address, text_hash, ingested_ts) VALUES (?,?,?,?,?,?)');
  const h = textHash(text);
  for (const tok of tokens.length ? tokens : [null]) ins.run(`${channel}:${messageId}`, channel, ts, tok, h, now);
}

/**
 * Store one free-chatter post (4chan / reddit). Posts mentioning a token (valid address or unambiguous $TICKER) go to
 * account_post (one row per token, text NULL: text lives only in the retention-limited social_post_text). Any post with
 * a token CANDIDATE (address or raw cashtag) also goes to social_post_raw so it can be matched to tokens discovered later.
 * Everything is INSERT OR IGNORE keyed by post_id, so re-fetching the same post is harmless. Returns true if stored.
 */
function storeFeedPost(db, p, known, now) {
  // 4chan is untrusted anonymous content: examine a capped prefix, keep only hash + extracted addresses/cashtags,
  // and NEVER write raw text anywhere (no social_post_text row, no account_post.text).
  const untrusted = p.platform === '4chan' || p.untrusted === true;
  const text = untrusted ? String(p.text || '').slice(0, UNTRUSTED_MAX_TEXT) : String(p.text || '');
  const ent = extractEntities(text, known);
  if (untrusted) {
    ent.addresses = ent.addresses.slice(0, UNTRUSTED_MAX_CANDIDATES);
    ent.cashtags = ent.cashtags.slice(0, UNTRUSTED_MAX_CANDIDATES);
    ent.tokens = ent.tokens.slice(0, UNTRUSTED_MAX_CANDIDATES);
  }
  if (!ent.addresses.length && !ent.cashtags.length) return false;
  const h = textHash(text);
  const account = p.authorId || `${p.platform}:${p.sourceId}:${String(p.threadId || 'na').replace(/^[^:]*:/, '')}:anon`;
  if (ent.tokens.length) storePost(db, { platform: p.platform, accountId: account, postId: p.id, ts: p.ts, text: null, tokens: ent.tokens, now, hash: h });
  db.prepare('INSERT OR IGNORE INTO social_post_raw(post_id, platform, source_id, thread_id, author_id, ts, text_hash, addresses_json, cashtags_json, ingested_ts) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(p.id, p.platform, p.sourceId, p.threadId || null, p.authorId || null, p.ts, h, JSON.stringify(ent.addresses), JSON.stringify(ent.cashtags), now);
  if (!untrusted) db.prepare('INSERT OR IGNORE INTO social_post_text(post_id, ts, text, ingested_ts) VALUES (?,?,?,?)').run(p.id, p.ts, text, now);
  return true;
}

/** One poll of a feed provider (fourchan | reddit). Never throws. */
async function runFeedOnce(db, provider, opts = {}) {
  const logger = opts.logger || console;
  const out = { seen: 0, stored: 0, errors: 0 };
  try {
    initSocialSchema(db);
    if (!provider || !provider.enabled) return out;
    const now = (opts.now || Date.now)();
    const known = typeof opts.knownTokens === 'function' ? await opts.knownTokens() : (opts.knownTokens || []);
    for (const p of await provider.getNewPosts()) {
      out.seen++;
      if (!p || !Number.isFinite(p.ts) || p.ts > now + 60000 || !p.id) continue;   // reject bad/future timestamps
      try { if (storeFeedPost(db, p, known, now)) out.stored++; } catch (e) { out.errors++; }
    }
    const env = opts.env || process.env;
    try { pruneSocialText(db, now, env.SOCIAL_TEXT_RETENTION_DAYS); } catch (e) { /* retention is best effort */ }
  } catch (e) {
    out.errors++;
    logger.warn && logger.warn(`[social] ${provider && provider.name} poll failed: ${e.message}`);
  }
  return out;
}

/** One collection cycle. opts: providers, env, now, K, maxAccounts, seedsPath, skilledWalletIds(), knownTokens(), logger */
async function runOnce(db, opts = {}) {
  const env = opts.env || process.env;
  const logger = opts.logger || console;
  const summary = { follow: null, posts: 0, telegram: 0, fourchan: 0, reddit: 0, errors: 0 };
  try {
    initSocialSchema(db);
    const now = (opts.now || Date.now)();
    const providers = opts.providers || getProviders(env);
    const xOn = providers.x && providers.x.enabled && env.SOCIAL_X !== '0';
    const tgOn = providers.telegram && providers.telegram.enabled && env.SOCIAL_TELEGRAM !== '0';
    const seedsFile = fg.loadSeedsFile(opts.seedsPath);
    const known = typeof opts.knownTokens === 'function' ? await opts.knownTokens() : (opts.knownTokens || []);

    if (xOn) {
      try {
        const skilled = typeof opts.skilledWalletIds === 'function' ? await opts.skilledWalletIds() : (opts.skilledWalletIds || []);
        const seeds = fg.getSeedAccounts(db, { skilledWalletIds: skilled, extraHandles: seedsFile.xHandles, asOf: now });
        summary.follow = await fg.snapshotFollows(db, providers.x, seeds, { now, logger });
        fg.storeCountSnapshot(db, now + 1, 1, { seedIds: seeds.map((s) => s.account_id) });
        const cands = fg.getCandidateAccounts(db, now + 1, opts.K ?? 3, { seedIds: seeds.map((s) => s.account_id) })
          .slice(0, opts.maxAccounts ?? 50);
        const lastQ = db.prepare('SELECT MAX(ts) AS t FROM account_post WHERE account_id = ?');
        for (const c of cands) {
          try {
            const handle = c.account_id.replace(/^x:/, '');
            const sinceTs = (lastQ.get(c.account_id) || {}).t || now - 24 * 3600 * 1000;
            const posts = await providers.x.getUserPosts(handle, { sinceTs, max: 20 });
            for (const p of posts) {
              if (!Number.isFinite(p.ts) || p.ts > now + 60000) continue; // reject bad/future timestamps
              storePost(db, { platform: 'x', accountId: c.account_id, postId: `x:${p.id}`, ts: p.ts, text: p.text,
                tokens: extractEntities(p.text, known).tokens, now });
              summary.posts++;
            }
          } catch (e) { summary.errors++; logger.warn && logger.warn(`[social] posts failed ${c.account_id}: ${e.message}`); }
        }
      } catch (e) { summary.errors++; logger.warn && logger.warn(`[social] x cycle failed: ${e.message}`); }
    }

    if (tgOn) {
      const channels = [...new Set([...(opts.telegramChannels || []), ...seedsFile.telegramChannels])];
      const lastT = db.prepare('SELECT MAX(ts) AS t FROM telegram_message WHERE channel_id = ?');
      for (const ch of channels) {
        try {
          const sinceTs = (lastT.get(ch) || {}).t || now - 24 * 3600 * 1000;
          for (const m of await providers.telegram.getChannelMessages(ch, { sinceTs, limit: 50 })) {
            if (!Number.isFinite(m.ts) || m.ts > now + 60000) continue;
            storeTelegram(db, { channel: ch, messageId: m.id, ts: m.ts, text: m.text, tokens: extractEntities(m.text, known).tokens, now });
            summary.telegram++;
          }
        } catch (e) { summary.errors++; logger.warn && logger.warn(`[social] telegram failed ${ch}: ${e.message}`); }
      }
    }
    // Free feeds normally run on their own timers (see start()); runOnce also polls them once so one call covers all.
    if (!opts.skipFeeds) {
      for (const [key, flag] of [['fourchan', 'SOCIAL_FOURCHAN'], ['reddit', 'SOCIAL_REDDIT']]) {
        const prov = providers[key];
        if (prov && prov.enabled && env[flag] === '1' && (key !== 'fourchan' || fourchanOptIn(env).ok)) {
          const r = await runFeedOnce(db, prov, { ...opts, env, logger, knownTokens: known, now: () => now });
          summary[key] += r.stored; summary.errors += r.errors;
        }
      }
    }
  } catch (e) {
    summary.errors++;
    logger.error && logger.error(`[social] cycle failed: ${e.message}`);
  }
  return summary;
}

function start(db, opts = {}) {
  const env = opts.env || process.env;
  if (!opts.force && env.SOCIAL_COLLECTOR !== '1') return false;
  if (timer) return true;
  const interval = opts.intervalMs || 15 * 60 * 1000;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await runOnce(db, { ...opts, skipFeeds: true }); } catch (e) { /* runOnce never throws; belt and braces */ } finally { running = false; }
  };
  timer = setInterval(tick, interval);
  if (timer.unref) timer.unref();
  const first = setTimeout(tick, 5000); if (first.unref) first.unref();

  // Free chatter feeds: own timers (4chan must poll ~every 60s, far faster than the 15 min main cycle).
  try {
    const providers = opts.providers || getProviders(env);
    for (const [key, flag, envMs, def] of [['fourchan', 'SOCIAL_FOURCHAN', 'SOCIAL_FOURCHAN_INTERVAL_MS', 60000], ['reddit', 'SOCIAL_REDDIT', 'SOCIAL_REDDIT_INTERVAL_MS', 120000]]) {
      const prov = providers[key];
      if (env[flag] !== '1' || !prov) continue;
      if (key === 'fourchan' && !fourchanOptIn(env).ok) { (opts.logger || console).log && (opts.logger || console).log(`[social] fourchan off: ${fourchanOptIn(env).reason}`); continue; }
      if (!prov.enabled) { (opts.logger || console).log && (opts.logger || console).log(`[social] ${key} off: ${prov.reason}`); continue; }
      const every = Math.max(Number(opts.feedIntervalMs || env[envMs]) || def, key === 'fourchan' ? 60000 : 30000);
      let busy = false;
      const poll = async () => {
        if (busy) return;
        busy = true;
        try {
          const known = typeof opts.knownTokens === 'function' ? await opts.knownTokens() : (opts.knownTokens || []);
          await runFeedOnce(db, prov, { ...opts, env, knownTokens: known });
        } catch (e) { /* runFeedOnce never throws */ } finally { busy = false; }
      };
      const t = setInterval(poll, every);
      if (t.unref) t.unref();
      feedTimers.push(t);
      const f = setTimeout(poll, 8000); if (f.unref) f.unref();
    }
  } catch (e) { /* never throw out of start() */ }
  return true;
}

function stop() { if (timer) clearInterval(timer); timer = null; feedTimers.forEach((t) => clearInterval(t)); feedTimers.length = 0; }

module.exports = { start, stop, runOnce, runFeedOnce, storeFeedPost };
