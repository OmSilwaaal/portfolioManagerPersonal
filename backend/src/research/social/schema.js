'use strict';
/**
 * Social research schema. APPEND-ONLY and point-in-time.
 *
 * - All timestamps are epoch milliseconds.
 * - `ts` columns are EVENT time (when the post/message was actually made, or the
 *   snapshot was taken). `ingested_ts` is when WE stored it. Never conflate them;
 *   backtests must filter on event time AND on ingested_ts <= as-of.
 * - UPDATE and DELETE are blocked by triggers. Corrections are new rows.
 *
 * PRIVACY RULE (enforced in code + trigger): account_wallet_link may ONLY hold
 * PUBLIC, SELF-DECLARED links (the account owner themselves publicly posted the
 * wallet in their bio/post). Never infer, correlate, or deanonymize. Every row
 * needs an evidence_url pointing at the public self-declaration.
 *
 * Works with better-sqlite3 and node:sqlite (DatabaseSync): only exec/prepare/run/all/get.
 */

const ALLOWED_LINK_SOURCES = ['self_declared_bio', 'self_declared_post'];
const APPEND_ONLY_TABLES = [
  'account', 'account_wallet_link', 'follow_edge_snapshot',
  'account_post', 'telegram_message', 'account_weight_snapshot',
];

function accountId(platform, handle) {
  const h = String(handle || '').trim().replace(/^@/, '').toLowerCase();
  if (!platform || !h) throw new Error('accountId: platform and handle required');
  return `${platform}:${h}`;
}

function initSocialSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS account (
      account_id TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      handle TEXT NOT NULL,
      first_seen_ts INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS account_wallet_link (
      account_id TEXT NOT NULL,
      wallet_id TEXT NOT NULL,
      source TEXT NOT NULL,
      evidence_url TEXT NOT NULL,
      ts INTEGER NOT NULL,
      PRIMARY KEY (account_id, wallet_id, evidence_url)
    );
    CREATE TABLE IF NOT EXISTS follow_edge_snapshot (
      follower_account_id TEXT NOT NULL,
      followed_account_id TEXT NOT NULL,
      snapshot_ts INTEGER NOT NULL,
      PRIMARY KEY (follower_account_id, followed_account_id, snapshot_ts)
    );
    CREATE INDEX IF NOT EXISTS idx_follow_snap ON follow_edge_snapshot(follower_account_id, snapshot_ts);
    CREATE TABLE IF NOT EXISTS account_post (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      token_address TEXT,
      ts INTEGER NOT NULL,
      platform TEXT NOT NULL,
      text_hash TEXT NOT NULL,
      text TEXT,
      ingested_ts INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_account_post ON account_post(post_id, COALESCE(token_address, ''));
    CREATE INDEX IF NOT EXISTS idx_post_token_ts ON account_post(token_address, ts);
    CREATE INDEX IF NOT EXISTS idx_post_acct_ts ON account_post(account_id, ts);
    CREATE TABLE IF NOT EXISTS telegram_message (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      ts INTEGER NOT NULL,
      token_address TEXT,
      text_hash TEXT NOT NULL,
      ingested_ts INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_tg_msg ON telegram_message(message_id, COALESCE(token_address, ''));
    CREATE INDEX IF NOT EXISTS idx_tg_token_ts ON telegram_message(token_address, ts);
    CREATE TABLE IF NOT EXISTS account_weight_snapshot (
      account_id TEXT NOT NULL,
      as_of_ts INTEGER NOT NULL,
      weight REAL,
      n_followers_in_seed_set INTEGER NOT NULL,
      PRIMARY KEY (account_id, as_of_ts)
    );
  `);
  for (const t of APPEND_ONLY_TABLES) {
    for (const op of ['UPDATE', 'DELETE']) {
      db.exec(`CREATE TRIGGER IF NOT EXISTS ${t}_no_${op.toLowerCase()} BEFORE ${op} ON ${t}
        BEGIN SELECT RAISE(ABORT, '${t} is append-only'); END;`);
    }
  }
  // Defence in depth for the privacy rule: only self-declared sources, evidence required.
  const allowed = ALLOWED_LINK_SOURCES.map((s) => `'${s}'`).join(',');
  db.exec(`CREATE TRIGGER IF NOT EXISTS account_wallet_link_self_declared BEFORE INSERT ON account_wallet_link
    WHEN NEW.source NOT IN (${allowed})
      OR NEW.evidence_url IS NULL OR length(trim(NEW.evidence_url)) = 0
    BEGIN SELECT RAISE(ABORT, 'account_wallet_link accepts only public self-declared links with evidence_url'); END;`);
  return db;
}

function ensureAccount(db, platform, handle, ts) {
  const id = accountId(platform, handle);
  db.prepare('INSERT OR IGNORE INTO account(account_id, platform, handle, first_seen_ts) VALUES (?,?,?,?)')
    .run(id, platform, String(handle).replace(/^@/, '').toLowerCase(), ts);
  return id;
}

/**
 * Record a PUBLIC SELF-DECLARED link. Only call this when the account owner
 * themselves publicly posted this wallet (bio or post); evidenceUrl must
 * point at that public statement. NEVER call with inferred/heuristic matches.
 */
function addSelfDeclaredWalletLink(db, { platform = 'x', handle, walletId, source, evidenceUrl, ts }) {
  if (!ALLOWED_LINK_SOURCES.includes(source)) {
    throw new Error(`wallet link source must be one of ${ALLOWED_LINK_SOURCES.join(', ')} (self-declared only)`);
  }
  if (!evidenceUrl || !/^https?:\/\//.test(evidenceUrl)) throw new Error('evidenceUrl (public URL of the self-declaration) required');
  if (!walletId) throw new Error('walletId required');
  const t = ts ?? Date.now();
  const id = ensureAccount(db, platform, handle, t);
  db.prepare('INSERT OR IGNORE INTO account_wallet_link(account_id, wallet_id, source, evidence_url, ts) VALUES (?,?,?,?,?)')
    .run(id, walletId, source, evidenceUrl, t);
  return id;
}

module.exports = { initSocialSchema, ensureAccount, accountId, addSelfDeclaredWalletLink, ALLOWED_LINK_SOURCES, APPEND_ONLY_TABLES };
