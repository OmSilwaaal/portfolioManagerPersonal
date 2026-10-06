'use strict';
/**
 * Periodic social collector. Opt-in: SOCIAL_COLLECTOR=1. Per-provider flags:
 * SOCIAL_X=0 / SOCIAL_TELEGRAM=0 disable a provider even if its keys exist.
 * Never throws out of start()/runOnce(); all errors are logged and swallowed.
 * Posts are stored at their ACTUAL post time (ts); ingested_ts is our clock.
 */
const { initSocialSchema, ensureAccount } = require('./schema');
const { extractEntities, textHash } = require('./entityLinking');
const fg = require('./followGraph');
const { getProviders } = require('./providers');

let timer = null;
let running = false;

function storePost(db, { platform, accountId, postId, ts, text, tokens, now }) {
  const ins = db.prepare('INSERT OR IGNORE INTO account_post(post_id, account_id, token_address, ts, platform, text_hash, text, ingested_ts) VALUES (?,?,?,?,?,?,?,?)');
  const h = textHash(text);
  for (const tok of tokens.length ? tokens : [null]) ins.run(postId, accountId, tok, ts, platform, h, text, now);
}

function storeTelegram(db, { channel, messageId, ts, text, tokens, now }) {
  const ins = db.prepare('INSERT OR IGNORE INTO telegram_message(message_id, channel_id, ts, token_address, text_hash, ingested_ts) VALUES (?,?,?,?,?,?)');
  const h = textHash(text);
  for (const tok of tokens.length ? tokens : [null]) ins.run(`${channel}:${messageId}`, channel, ts, tok, h, now);
}

/** One collection cycle. opts: providers, env, now, K, maxAccounts, seedsPath, skilledWalletIds(), knownTokens(), logger */
async function runOnce(db, opts = {}) {
  const env = opts.env || process.env;
  const logger = opts.logger || console;
  const summary = { follow: null, posts: 0, telegram: 0, errors: 0 };
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
    try { await runOnce(db, opts); } catch (e) { /* runOnce never throws; belt and braces */ } finally { running = false; }
  };
  timer = setInterval(tick, interval);
  if (timer.unref) timer.unref();
  const first = setTimeout(tick, 5000); if (first.unref) first.unref();
  return true;
}

function stop() { if (timer) clearInterval(timer); timer = null; }

module.exports = { start, stop, runOnce };
