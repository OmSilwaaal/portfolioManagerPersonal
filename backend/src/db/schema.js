const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// On Railway, mount a Volume and the database lives on it, surviving deploys.
// Locally it sits in the backend directory.
//
// The volume path is absolute, so it must NOT be joined with the '../..' the
// local fallback needs: path.join('/data', '../../x') resolves to '/x', which
// is the container's ephemeral filesystem, and everything written there is lost
// on the next deploy.
const DB_PATH = process.env.DB_PATH || (
  process.env.RAILWAY_VOLUME_MOUNT_PATH
    ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'market_intelligence.sqlite')
    : path.join(__dirname, '../../market_intelligence.sqlite')
);

let db;

// Count real tables, or -1 if the file cannot be opened as a database.
function userTableCount(file) {
  try {
    const d = new Database(file, { readonly: true });
    const n = d.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get().n;
    d.close();
    return n;
  } catch { return -1; }
}

/**
 * One-time rescue of a database stranded by the old path bug.
 *
 * Until f243179 the volume path was joined with the '../..' the local fallback
 * needs, so on Railway the file landed at the container root instead of on the
 * volume — ephemeral, and wiped by each deploy. If that stranded file is still
 * present and the volume has nothing in it yet, fold it onto the volume before
 * anything opens the database.
 *
 * VACUUM INTO is used rather than a file copy because it is a consistent
 * snapshot and it includes whatever is still sitting in the -wal, which a plain
 * copy of the .sqlite silently drops.
 *
 * Deliberately conservative: it runs only when the destination has no tables of
 * its own, so it can never overwrite live data, and it never throws — a failed
 * rescue must not stop the server booting.
 */
function rescueStrandedDatabase() {
  const volume = process.env.RAILWAY_VOLUME_MOUNT_PATH;
  if (!volume || process.env.DB_PATH) return;

  const stranded = path.join(volume, '../../market_intelligence.sqlite'); // the old, buggy expression
  if (path.resolve(stranded) === path.resolve(DB_PATH) || !fs.existsSync(stranded)) return;

  const strandedTables = userTableCount(stranded);
  if (strandedTables <= 0) return;                       // nothing worth moving

  const destTables = fs.existsSync(DB_PATH) ? userTableCount(DB_PATH) : 0;
  if (destTables > 0) return;                            // the volume already holds data; leave it alone

  try {
    // VACUUM INTO refuses an existing destination, and the only thing it could
    // be here is the empty placeholder we just checked.
    for (const f of [DB_PATH, `${DB_PATH}-wal`, `${DB_PATH}-shm`]) fs.rmSync(f, { force: true });
    const src = new Database(stranded, { readonly: true });
    src.exec(`VACUUM INTO '${DB_PATH.replace(/'/g, "''")}'`);
    src.close();
    console.log(`[db] recovered ${strandedTables} tables from ${stranded} onto the volume at ${DB_PATH}`);
  } catch (err) {
    console.error('[db] could not recover the stranded database:', err.message);
  }
}

function getDb() {
  if (!db) {
    rescueStrandedDatabase();
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    // A WAL grows until a checkpoint and is never truncated on its own. Two unbounded WALs on
    // a small Railway volume are enough to fill it, and a full volume means every write fails
    // with "database or disk is full" — the whole service, not just the write that filled it.
    db.pragma('journal_size_limit = 67108864'); // 64MB
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL UNIQUE,
      addedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL,
      targetPrice REAL NOT NULL,
      direction TEXT NOT NULL CHECK(direction IN ('above', 'below')),
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      triggered INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS user_preferences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sessionId TEXT NOT NULL UNIQUE,
      investorType TEXT,
      riskTolerance TEXT,
      updateFrequency TEXT,
      watchedCategories TEXT DEFAULT '[]',
      priorityAlerts TEXT DEFAULT '[]',
      watchlistJson TEXT DEFAULT '[]',
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS paper_portfolios (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      userId      TEXT    NOT NULL UNIQUE,
      cashBalance REAL    NOT NULL DEFAULT 0,
      createdAt   TEXT    NOT NULL DEFAULT (datetime('now')),
      updatedAt   TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS paper_positions (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      userId    TEXT    NOT NULL,
      ticker    TEXT    NOT NULL,
      shares    REAL    NOT NULL DEFAULT 0,
      avgCost   REAL    NOT NULL DEFAULT 0,
      updatedAt TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(userId, ticker)
    );

    CREATE TABLE IF NOT EXISTS paper_transactions (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      userId    TEXT    NOT NULL,
      type      TEXT    NOT NULL CHECK(type IN ('buy','sell','deposit')),
      ticker    TEXT,
      shares    REAL,
      price     REAL,
      total     REAL    NOT NULL,
      createdAt TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS paper_cash_purchases (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      userId             TEXT    NOT NULL,
      usdPaid            REAL    NOT NULL,
      paperCashCredited  REAL    NOT NULL,
      stripeSessionId    TEXT    UNIQUE,
      status             TEXT    NOT NULL DEFAULT 'pending'
                                 CHECK(status IN ('pending','completed')),
      createdAt          TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS gov_trades_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tradeHash TEXT NOT NULL UNIQUE,
      officialName TEXT NOT NULL,
      ticker TEXT NOT NULL,
      transactionType TEXT,
      tradeDate TEXT,
      disclosureDate TEXT,
      disclosureLagDays INTEGER,
      amountRange TEXT,
      chamber TEXT,
      party TEXT,
      urgency TEXT DEFAULT 'Low',
      rawJson TEXT,
      fetchedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS groups (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL,
      description TEXT    NOT NULL DEFAULT '',
      color       TEXT    NOT NULL DEFAULT '#e2e8f0',
      emoji       TEXT    NOT NULL DEFAULT '',
      code        TEXT    NOT NULL UNIQUE,
      createdBy   TEXT    NOT NULL,
      createdAt   TEXT    NOT NULL DEFAULT (datetime('now')),
      updatedAt   TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS group_members (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      groupId     INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      userId      TEXT    NOT NULL,
      displayName TEXT,
      email       TEXT,
      role        TEXT    NOT NULL DEFAULT 'member' CHECK(role IN ('admin','member')),
      joinedAt    TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(groupId, userId)
    );

    CREATE TABLE IF NOT EXISTS group_posts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      groupId     INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      authorId    TEXT    NOT NULL,
      authorName  TEXT,
      content     TEXT    NOT NULL,
      type        TEXT    NOT NULL DEFAULT 'post' CHECK(type IN ('post','announcement','notification')),
      createdAt   TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS csv_positions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     TEXT    NOT NULL,
      account     TEXT    NOT NULL DEFAULT 'Imported',
      ticker      TEXT    NOT NULL,
      quantity    REAL,
      avg_cost    REAL,
      price       REAL,
      market_value REAL,
      imported_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS snaptrade_connections (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id         TEXT    NOT NULL UNIQUE,
      snaptrade_user_id   TEXT NOT NULL,
      snaptrade_user_secret TEXT NOT NULL,
      connected_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Research data collection — append-only (never UPDATE/DELETE market_snapshot rows)
  db.exec(`
    CREATE TABLE IF NOT EXISTS token (
      token_id         INTEGER PRIMARY KEY AUTOINCREMENT,
      chain            TEXT    NOT NULL DEFAULT 'solana',
      contract_address TEXT    NOT NULL,
      first_seen_ts    INTEGER NOT NULL,
      symbol           TEXT,
      UNIQUE(chain, contract_address)
    );

    CREATE TABLE IF NOT EXISTS market_snapshot (
      snapshot_id   INTEGER PRIMARY KEY AUTOINCREMENT,
      token_id      INTEGER NOT NULL REFERENCES token(token_id),
      ts            INTEGER NOT NULL,
      price         REAL,
      mcap          REAL,
      liquidity_usd REAL,
      volume_5m     REAL,
      volume_1h     REAL,
      buy_count     INTEGER,
      sell_count    INTEGER,
      holder_count  INTEGER,
      ingested_ts   INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_market_snapshot_token_ts ON market_snapshot(token_id, ts);
  `);

  // Unusual-activity signal log — append-only (INSERT only; never UPDATE/DELETE)
  db.exec(`
    CREATE TABLE IF NOT EXISTS signal_snapshot (
      signal_id           INTEGER PRIMARY KEY AUTOINCREMENT,
      token_id            INTEGER NOT NULL REFERENCES token(token_id),
      as_of_ts            INTEGER NOT NULL,
      model_version       TEXT    NOT NULL,
      component_scores    TEXT    NOT NULL,
      composite_score     REAL    NOT NULL,
      feature_vector_hash TEXT    NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_signal_snapshot_token_ts ON signal_snapshot(token_id, as_of_ts);
  `);

  // Discovery index: every token the server has ever seen, so search can answer "which coins
  // exist and what are they called" without an upstream that only returns 30 rows.
  //
  // Deliberately not the `token` table above: that one is append-only research data and
  // market_snapshot/signal_snapshot hold foreign keys into it, so its rows can never be evicted.
  // This one is capped and pruned by last_seen_ts (see services/tokenIndex).
  //
  // The *_lc columns are the lowercased forms the matcher compares against; mcap/liquidity_usd are
  // last-known values kept for ranking only — nothing serves them as a live price.
  db.exec(`
    CREATE TABLE IF NOT EXISTS token_index (
      address       TEXT    PRIMARY KEY,
      symbol        TEXT    NOT NULL DEFAULT '',
      name          TEXT    NOT NULL DEFAULT '',
      symbol_lc     TEXT    NOT NULL DEFAULT '',
      name_lc       TEXT    NOT NULL DEFAULT '',
      mcap          REAL,
      liquidity_usd REAL,
      source        TEXT,
      first_seen_ts INTEGER NOT NULL,
      last_seen_ts  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_token_index_symbol ON token_index(symbol_lc);
    CREATE INDEX IF NOT EXISTS idx_token_index_name ON token_index(name_lc);
    CREATE INDEX IF NOT EXISTS idx_token_index_seen ON token_index(last_seen_ts);
  `);

  // The market-wide pump.fun bonding-curve state, written by services/pumpCurveIndex off a
  // single programSubscribe and read by lists and lookups so they need no aggregator call.
  //
  // Separate from token_index above rather than extra columns on it, for one reason: token_index
  // is the IDENTITY index (what coins exist and what they are called) and is ranked and evicted
  // on that basis. This is live market state for one venue, it churns many times a minute per
  // row, and most of its rows have no name yet. Joining the two beats letting curve churn evict
  // names we worked to learn. services/tokenIndex owns both and does the join.
  //
  // `curve` is the bonding-curve PDA. It is stored, and uniquely indexed, because a curve
  // notification names only that account: keeping the mapping is what lets a restart resolve
  // thousands of curves back to mints with no network calls at all.
  db.exec(`
    CREATE TABLE IF NOT EXISTS token_curve (
      address       TEXT    PRIMARY KEY,
      curve         TEXT    NOT NULL,
      decimals      INTEGER,
      price_sol     REAL,
      price_usd     REAL,
      mcap          REAL,
      v_sol         REAL,
      v_token       REAL,
      progress      REAL,
      complete      INTEGER NOT NULL DEFAULT 0,
      slot          INTEGER,
      hits          INTEGER NOT NULL DEFAULT 0,
      first_seen_ts INTEGER NOT NULL,
      updated_ts    INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_token_curve_curve ON token_curve(curve);
    CREATE INDEX IF NOT EXISTS idx_token_curve_updated ON token_curve(updated_ts);
    CREATE INDEX IF NOT EXISTS idx_token_curve_live ON token_curve(complete, updated_ts DESC);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS sms_settings (
      user_id      TEXT    PRIMARY KEY,
      phone_enc    TEXT    NOT NULL,
      phone_last4  TEXT    NOT NULL,
      verified     INTEGER NOT NULL DEFAULT 0,
      price_alerts INTEGER NOT NULL DEFAULT 1,
      verified_at  TEXT,
      sent_day     TEXT,
      sent_count   INTEGER NOT NULL DEFAULT 0
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS recovery_codes (
      user_id     TEXT PRIMARY KEY,
      phrase_hash TEXT NOT NULL UNIQUE,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS referral_codes (
      user_id TEXT PRIMARY KEY,
      code    TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS referrals (
      referee_id  TEXT PRIMARY KEY,
      referrer_id TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id);

    CREATE TABLE IF NOT EXISTS friendships (
      requester_id TEXT NOT NULL,
      addressee_id TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted')),
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (requester_id, addressee_id)
    );
    CREATE INDEX IF NOT EXISTS idx_friend_addressee ON friendships(addressee_id);
  `);

  // Direct messages between friends, ticker shares, public cosmetics and the winners feed
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id    TEXT NOT NULL,
      recipient_id TEXT NOT NULL,
      body         TEXT NOT NULL DEFAULT '',
      attachment   TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      read_at      TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_msg_pair ON messages(sender_id, recipient_id, id);
    CREATE INDEX IF NOT EXISTS idx_msg_recipient ON messages(recipient_id, read_at);

    CREATE TABLE IF NOT EXISTS user_cosmetics (
      user_id    TEXT PRIMARY KEY,
      banner     TEXT,
      effect     TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS trade_wins (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    TEXT NOT NULL,
      kind       TEXT NOT NULL DEFAULT 'stock',
      symbol     TEXT NOT NULL,
      address    TEXT,
      entry      REAL,
      exit       REAL,
      qty        REAL,
      pnl_usd    REAL NOT NULL,
      pnl_pct    REAL,
      sol_price  REAL,
      anim       TEXT NOT NULL DEFAULT 'reaper',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_wins_time ON trade_wins(created_at);
    CREATE INDEX IF NOT EXISTS idx_wins_user ON trade_wins(user_id);
  `);

  // Elo: every realized sell (win or loss) is logged; clans are one-per-user (user_id is the primary key of clan_members)
  db.exec(`
    CREATE TABLE IF NOT EXISTS trade_results (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    TEXT NOT NULL,
      kind       TEXT NOT NULL DEFAULT 'stock',
      symbol     TEXT,
      pnl_usd    REAL NOT NULL,
      pnl_pct    REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_results_user ON trade_results(user_id, id);
    CREATE INDEX IF NOT EXISTS idx_results_time ON trade_results(created_at);

    CREATE TABLE IF NOT EXISTS elo_peaks (
      user_id    TEXT PRIMARY KEY,
      peak       INTEGER NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS clans (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
      tag         TEXT NOT NULL UNIQUE COLLATE NOCASE,
      description TEXT NOT NULL DEFAULT '',
      color       TEXT NOT NULL DEFAULT '#e2e8f0',
      owner_id    TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS clan_members (
      user_id   TEXT PRIMARY KEY,
      clan_id   INTEGER NOT NULL,
      role      TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('owner','member')),
      joined_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_clan_members_clan ON clan_members(clan_id);
    CREATE TABLE IF NOT EXISTS clan_posts (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      clan_id    INTEGER NOT NULL,
      user_id    TEXT NOT NULL,
      body       TEXT NOT NULL DEFAULT '',
      attachment TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_clan_posts_clan ON clan_posts(clan_id, id);
  `);
  // Existing winning trades count towards Elo from day one (only runs while the results log is empty)
  try {
    db.exec(`INSERT INTO trade_results (user_id, kind, symbol, pnl_usd, pnl_pct, created_at)
             SELECT user_id, kind, symbol, pnl_usd, pnl_pct, created_at FROM trade_wins
             WHERE NOT EXISTS (SELECT 1 FROM trade_results)`);
  } catch (_) {}

  // Vacated @handles. A rename releases the old name here rather than back into the pool: for HOLD_DAYS
  // (see routes/profiles.js) only its previous owner may take it again, so nobody can adopt a handle the moment
  // its owner renames away from it and trade on the reputation still attached to it. Doubles as the rename
  // audit log the per-day cooldown is counted from, which is why it must survive a restart.
  db.exec(`
    CREATE TABLE IF NOT EXISTS username_history (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     TEXT NOT NULL,
      username    TEXT NOT NULL COLLATE NOCASE,
      released_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_username_history_name ON username_history(username, released_at);
    CREATE INDEX IF NOT EXISTS idx_username_history_user ON username_history(user_id, released_at);
  `);

  // Callouts: a short public shout about a token the author actually traded. The position itself is proved in
  // routes/friends.js against Supabase (paper_positions / paper_transactions) before a row is ever written, so
  // `address`/`stance`/`entry` here are server-verified, while `symbol` is only a display snapshot — it keeps the
  // preview readable after the token stops resolving upstream.
  db.exec(`
    CREATE TABLE IF NOT EXISTS trade_callouts (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    TEXT NOT NULL,
      address    TEXT NOT NULL,
      symbol     TEXT NOT NULL DEFAULT '',
      stance     TEXT NOT NULL DEFAULT 'open' CHECK(stance IN ('open','closed')),
      body       TEXT NOT NULL DEFAULT '',
      entry      REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    -- the feed reads "newest callouts by this set of users"; the pruner reads by age
    CREATE INDEX IF NOT EXISTS idx_callouts_user ON trade_callouts(user_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_callouts_time ON trade_callouts(created_at);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS memecoin_alert_prefs (
      user_id        TEXT PRIMARY KEY,
      enabled        INTEGER NOT NULL DEFAULT 0,
      sms            INTEGER NOT NULL DEFAULT 0,
      move_pct_5m    REAL    NOT NULL DEFAULT 25,
      move_pct_1h    REAL    NOT NULL DEFAULT 100,
      min_score      REAL    NOT NULL DEFAULT 75,
      min_confidence REAL    NOT NULL DEFAULT 0.5,
      min_liquidity  REAL    NOT NULL DEFAULT 20000,
      cooldown_min   INTEGER NOT NULL DEFAULT 60,
      updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS memecoin_alert_events (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    TEXT    NOT NULL,
      address    TEXT    NOT NULL,
      symbol     TEXT,
      kind       TEXT    NOT NULL,
      direction  TEXT,
      window     TEXT,
      change_pct REAL,
      score      REAL,
      confidence REAL,
      message    TEXT    NOT NULL,
      created_ts INTEGER NOT NULL,
      read_ts    INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_meme_alert_user_ts ON memecoin_alert_events(user_id, created_ts DESC);
    -- the cooldown lookup: most recent event for a (user, token, kind)
    CREATE INDEX IF NOT EXISTS idx_meme_alert_cooldown ON memecoin_alert_events(user_id, address, kind, created_ts DESC);
  `);

  // ── Billing: money that actually exists ───────────────────────────────────
  // Everything here is an INTEGER number of minor units (USD cents, SOL lamports). No REAL
  // column may ever hold a balance: SQLite REAL is a double, and a double cannot hold 0.07
  // exactly. See services/money.js for the arithmetic and the fee split.
  db.exec(`
    -- One row per money movement. Append-only in practice: a correction is a new row, never
    -- an UPDATE, so the books can always be re-derived from scratch.
    --
    -- The three amounts are recorded together on every single row (gross, fee, net) and the
    -- CHECK makes the identity structural rather than a thing the application remembers to
    -- do. A reconciliation can therefore sum fee_minor to get revenue and net_minor to get
    -- liability without ever re-deriving a percentage.
    CREATE TABLE IF NOT EXISTS billing_ledger (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     TEXT    NOT NULL,
      currency    TEXT    NOT NULL CHECK(currency IN ('usd','sol')),
      rail        TEXT    NOT NULL CHECK(rail IN ('stripe','solana','manual')),
      kind        TEXT    NOT NULL CHECK(kind IN ('deposit','pro','refund','adjustment')),
      gross_minor INTEGER NOT NULL CHECK(gross_minor >= 0),
      fee_minor   INTEGER NOT NULL CHECK(fee_minor   >= 0),
      net_minor   INTEGER NOT NULL,
      fee_bps     INTEGER NOT NULL CHECK(fee_bps BETWEEN 0 AND 10000),
      -- Stripe event id, or the Solana transaction signature. Never client-supplied text.
      external_id TEXT    NOT NULL,
      -- rail-specific evidence as JSON (payer address, slot, payment_intent). Audit only;
      -- nothing reads a number back out of here.
      ref         TEXT,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      CHECK (gross_minor = fee_minor + net_minor)
    );
    -- THE idempotency guarantee. A replayed Stripe event, a double-clicked button and a
    -- re-observed on-chain transfer all collide here and the second INSERT fails. The
    -- database enforces "credit exactly once"; the application only has to not catch the
    -- wrong error. Application logic alone cannot win this race.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_ledger_once ON billing_ledger(rail, external_id);
    CREATE INDEX IF NOT EXISTS idx_billing_ledger_user ON billing_ledger(user_id, currency, id);

    -- Every webhook delivery we have already acted on, including the ones that move no money
    -- (subscription.deleted). Inserted the instant after the signature verifies and before
    -- any side effect, so a retry is recognised even if the first attempt half-finished.
    CREATE TABLE IF NOT EXISTS billing_webhook_events (
      rail        TEXT NOT NULL,
      event_id    TEXT NOT NULL,
      event_type  TEXT NOT NULL,
      received_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (rail, event_id)
    );

    -- Public wallet addresses only. A private key or seed phrase must never reach this
    -- server, so there is deliberately no column one could be put in. Privy MPC-shards the
    -- key material and we store the address the way we would store an email.
    CREATE TABLE IF NOT EXISTS user_wallets (
      user_id    TEXT NOT NULL,
      chain      TEXT NOT NULL DEFAULT 'solana' CHECK(chain IN ('solana')),
      address    TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, chain, address)
    );
    -- A SOL deposit is attributed by matching the transaction's payer to a registered
    -- address, so this lookup runs on the hot path of every claim.
    CREATE INDEX IF NOT EXISTS idx_user_wallets_addr ON user_wallets(chain, address);
    -- One address belongs to ONE account, ever. Without this the primary key allowed two
    -- accounts to register the same address, and whoever claimed a transfer first was
    -- credited for it — an attacker could watch the public treasury, register each incoming
    -- payer as their own and sweep every deposit. Earliest registrant wins any existing clash.
    DELETE FROM user_wallets WHERE rowid NOT IN (SELECT MIN(rowid) FROM user_wallets GROUP BY chain, address);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_user_wallets_one_owner ON user_wallets(chain, address);

    -- Proof-of-control challenges. A wallet may only be registered by someone who can sign
    -- with it, so the server hands out a short-lived nonce bound to one account and one
    -- address, and verifies the signature before writing anything.
    CREATE TABLE IF NOT EXISTS wallet_challenges (
      nonce      TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      address    TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      used_at    TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_wallet_challenges_exp ON wallet_challenges(expires_at);

    -- Pro entitlement, as a grant log rather than a boolean. "Is this user Pro" is a question
    -- about rows, so revoking is auditable and a referral month cannot clobber a paid
    -- subscription (or the reverse) the way a single shared flag could.
    CREATE TABLE IF NOT EXISTS pro_grants (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     TEXT NOT NULL,
      source      TEXT NOT NULL CHECK(source IN ('admin','referral','stripe','solana')),
      starts_at   TEXT NOT NULL,
      ends_at     TEXT,            -- NULL = open-ended, i.e. a live Stripe subscription
      revoked_at  TEXT,
      granted_by  TEXT,            -- the acting admin's user id when source='admin'
      reason      TEXT,
      external_id TEXT,            -- stripe subscription id / solana signature
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_pro_grants_user ON pro_grants(user_id, id DESC);
    -- Partial unique index: one grant per external object, but many admin grants (which have
    -- no external id) are allowed. NULLs are not distinct enough in SQLite to rely on here.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_pro_grants_once
      ON pro_grants(source, external_id) WHERE external_id IS NOT NULL;

    -- Who is allowed to hand out Pro. A row per user, not a shared password: see
    -- services/entitlements.js for why that distinction is the whole point.
    CREATE TABLE IF NOT EXISTS user_roles (
      user_id    TEXT NOT NULL,
      role       TEXT NOT NULL CHECK(role IN ('admin')),
      granted_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, role)
    );

    -- Append-only record of every privileged action. An admin who grants themselves Pro
    -- leaves a row here with their own user id on it.
    CREATE TABLE IF NOT EXISTS admin_audit (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_id   TEXT NOT NULL,
      action     TEXT NOT NULL,
      target_id  TEXT,
      detail     TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_admin_audit_time ON admin_audit(created_at);
  `);

  // Migrations — add columns if they don't exist (SQLite lacks ADD COLUMN IF NOT EXISTS)
  // Alerts were previously global; scope them to the owning user (legacy rows keep user_id NULL and become unreachable)
  try { db.exec('ALTER TABLE alerts ADD COLUMN user_id TEXT') } catch (_) {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_alerts_user ON alerts(user_id)') } catch (_) {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_csv_positions_user ON csv_positions(user_id)') } catch (_) {}
  try { db.exec('ALTER TABLE user_cosmetics ADD COLUMN name_color TEXT') } catch (_) {}
  try { db.exec('ALTER TABLE paper_positions ADD COLUMN targetPrice REAL DEFAULT NULL') } catch (_) {}
  try { db.exec('ALTER TABLE paper_positions ADD COLUMN stopLoss REAL DEFAULT NULL') } catch (_) {}
  // Give existing $0 portfolios the $500 starting balance
  try { db.exec('UPDATE paper_portfolios SET cashBalance = 500 WHERE cashBalance = 0') } catch (_) {}
}

module.exports = { getDb, DB_PATH };
