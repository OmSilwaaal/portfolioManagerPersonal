'use strict';
/**
 * Follow-graph snapshots and point-in-time "followed by N seed accounts" counts.
 * Only counts are stored. Weights must be LEARNED later (weight column stays NULL here).
 */
const fs = require('fs');
const path = require('path');
const { ensureAccount, accountId } = require('./schema');

const WEEK_MS = 7 * 24 * 3600 * 1000;
const DEFAULT_SEEDS_PATH = path.join(__dirname, 'seeds.json');

function loadSeedsFile(p = DEFAULT_SEEDS_PATH) {
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    return {
      xHandles: (j.x_handles || []).map((h) => String(h).replace(/^@/, '').toLowerCase()).filter(Boolean),
      telegramChannels: (j.telegram_channels || []).map((c) => String(c).replace(/^@/, '')).filter(Boolean),
    };
  } catch { return { xHandles: [], telegramChannels: [] }; }
}

/**
 * Seed accounts = X accounts with a (public, self-declared) link to one of `skilledWalletIds`
 * (link ts <= asOf) + manual handles from seeds.json. Returns [{account_id, handle}].
 */
function getSeedAccounts(db, { skilledWalletIds = [], extraHandles = [], asOf = Date.now() } = {}) {
  const seeds = new Map();
  if (skilledWalletIds.length) {
    const ph = skilledWalletIds.map(() => '?').join(',');
    const rows = db.prepare(
      `SELECT DISTINCT a.account_id, a.handle FROM account_wallet_link l JOIN account a ON a.account_id = l.account_id
       WHERE a.platform = 'x' AND l.ts <= ? AND l.wallet_id IN (${ph})`).all(asOf, ...skilledWalletIds);
    for (const r of rows) seeds.set(r.account_id, { account_id: r.account_id, handle: r.handle });
  }
  for (const h of extraHandles) {
    const id = accountId('x', h);
    if (!seeds.has(id)) seeds.set(id, { account_id: id, handle: id.slice(2) });
  }
  return [...seeds.values()];
}

/**
 * Snapshot who each seed follows. Skips seeds snapshotted within minIntervalMs (weekly).
 * Per-seed failures are isolated. Returns {snapshotted, skipped, failed}.
 */
async function snapshotFollows(db, provider, seeds, { now = Date.now(), minIntervalMs = WEEK_MS, maxPages = 5, logger = console } = {}) {
  const res = { snapshotted: 0, skipped: 0, failed: 0 };
  if (!provider || !provider.enabled) return res;
  const lastQ = db.prepare('SELECT MAX(snapshot_ts) AS t FROM follow_edge_snapshot WHERE follower_account_id = ?');
  const ins = db.prepare('INSERT OR IGNORE INTO follow_edge_snapshot(follower_account_id, followed_account_id, snapshot_ts) VALUES (?,?,?)');
  for (const s of seeds) {
    const last = lastQ.get(s.account_id);
    if (last && last.t != null && now - last.t < minIntervalMs) { res.skipped++; continue; }
    try {
      ensureAccount(db, 'x', s.handle, now);
      const following = await provider.getFollowing(s.handle, { maxPages });
      if (!following.length) { res.skipped++; continue; } // empty result is more likely an error than a real unfollow-all
      db.exec('BEGIN');
      try {
        for (const f of following) {
          if (!f.handle) continue;
          ins.run(s.account_id, ensureAccount(db, 'x', f.handle, now), now);
        }
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
      res.snapshotted++;
    } catch (e) {
      res.failed++;
      logger.warn && logger.warn(`[social] follow snapshot failed for ${s.handle}: ${e.message}`);
    }
  }
  return res;
}

/**
 * Point-in-time counts: for each seed follower use ONLY its latest snapshot with
 * snapshot_ts < ts (strictly before). Returns [{account_id, n_followers_in_seed_set}] desc.
 * seedIds optionally restricts followers to a seed set.
 */
function getFollowGraphAsOf(db, ts, { seedIds } = {}) {
  const followers = db.prepare(
    'SELECT follower_account_id AS f, MAX(snapshot_ts) AS t FROM follow_edge_snapshot WHERE snapshot_ts < ? GROUP BY follower_account_id').all(ts);
  const edges = db.prepare('SELECT followed_account_id AS a FROM follow_edge_snapshot WHERE follower_account_id = ? AND snapshot_ts = ?');
  const counts = new Map();
  const allowed = seedIds ? new Set(seedIds) : null;
  for (const { f, t } of followers) {
    if (allowed && !allowed.has(f)) continue;
    for (const { a } of edges.all(f, t)) counts.set(a, (counts.get(a) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([account_id, n]) => ({ account_id, n_followers_in_seed_set: n }))
    .sort((x, y) => y.n_followers_in_seed_set - x.n_followers_in_seed_set || x.account_id.localeCompare(y.account_id));
}

/** Candidate news/signal accounts = followed by >= K seed accounts as of ts. */
function getCandidateAccounts(db, ts, K = 3, opts) {
  return getFollowGraphAsOf(db, ts, opts).filter((r) => r.n_followers_in_seed_set >= K);
}

/** Persist counts only (weight NULL: to be learned later, never hand-assigned). */
function storeCountSnapshot(db, asOfTs, K = 1, opts) {
  const rows = getCandidateAccounts(db, asOfTs, K, opts);
  const ins = db.prepare('INSERT OR IGNORE INTO account_weight_snapshot(account_id, as_of_ts, weight, n_followers_in_seed_set) VALUES (?,?,NULL,?)');
  for (const r of rows) ins.run(r.account_id, asOfTs, r.n_followers_in_seed_set);
  return rows.length;
}

module.exports = { WEEK_MS, loadSeedsFile, getSeedAccounts, snapshotFollows, getFollowGraphAsOf, getCandidateAccounts, storeCountSnapshot };
