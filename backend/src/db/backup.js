/**
 * Rotating backups of the live database, onto the Railway volume.
 *
 * The database itself now lives on the volume and survives deploys, but that
 * only protects against the container going away — not against a bad migration,
 * a bad delete, or the path moving again. A copy beside it costs a few hundred
 * KB and is the difference between a bad morning and losing the friends, clans
 * and winners tables.
 *
 * SQLite's online backup API is used rather than a file copy: in WAL mode the
 * recent writes live in the sibling -wal, so copying the .sqlite alone silently
 * drops them, and copying all three while the server writes can capture a torn
 * state.
 *
 * The one rule that matters: a database with no rows is never backed up. A
 * fresh, empty database is exactly what a loss looks like, and backing it up
 * seven times would push every good copy out of the rotation. Refusing to back
 * up an empty database means the newest backup is always the last state that
 * actually held data.
 */
const fs = require('fs');
const path = require('path');
const { DB_PATH } = require('./schema');
const { tableRowCounts, summarise } = require('./stats');

const PREFIX = 'market_intelligence-';
const SUFFIX = '.sqlite';
const DEFAULT_KEEP = 7;
const DEFAULT_EVERY_MS = 12 * 60 * 60 * 1000;

/** Where backups go, or null when backups are off (the local default). */
function backupDir() {
  if (process.env.DB_BACKUP_DIR) return process.env.DB_BACKUP_DIR;
  if (process.env.RAILWAY_VOLUME_MOUNT_PATH) return path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'backups');
  return null;
}

const stamp = (d = new Date()) => d.toISOString().replace(/[:.]/g, '-').replace('Z', '');

/** Existing backups, newest first. */
function listBackups(dir = backupDir()) {
  if (!dir || !fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.startsWith(PREFIX) && f.endsWith(SUFFIX))
    .map((f) => {
      const full = path.join(dir, f);
      const st = fs.statSync(full);
      return { file: full, name: f, size: st.size, at: st.mtime };
    })
    .sort((a, b) => b.at - a.at);
}

/** Drop the oldest backups beyond `keep`. Only ever called after a successful write. */
function prune(dir, keep) {
  const extra = listBackups(dir).slice(Math.max(keep, 1));
  for (const b of extra) { try { fs.rmSync(b.file, { force: true }) } catch { /* a backup we cannot delete is harmless */ } }
  return extra.length;
}

/**
 * Write one backup. Resolves with a report rather than throwing: a failed
 * backup must never take the server down with it.
 */
async function backupOnce({ db, dir = backupDir(), keep = Number(process.env.DB_BACKUP_KEEP) || DEFAULT_KEEP } = {}) {
  if (!dir) return { skipped: 'no backup directory configured' };
  if (!db) return { skipped: 'no database' };

  let counts;
  try { counts = tableRowCounts(db) } catch (err) { return { skipped: `could not read the database: ${err.message}` } }
  if (counts.total === 0) return { skipped: 'the database is empty — refusing to rotate a good backup out', counts };

  const dest = path.join(dir, `${PREFIX}${stamp()}${SUFFIX}`);
  try {
    fs.mkdirSync(dir, { recursive: true });
    await db.backup(dest);
  } catch (err) {
    try { fs.rmSync(dest, { force: true }) } catch { /* nothing to clean up */ }
    return { failed: err.message };
  }

  const pruned = prune(dir, keep);
  const size = (() => { try { return fs.statSync(dest).size } catch { return 0 } })();
  return { file: dest, size, pruned, counts, summary: summarise(counts) };
}

/**
 * Back up at startup and on an interval. DB_BACKUP=off disables; the interval
 * can be tuned with DB_BACKUP_EVERY_MS and the depth with DB_BACKUP_KEEP.
 */
function startBackups(db, { dir = backupDir(), everyMs = Number(process.env.DB_BACKUP_EVERY_MS) || DEFAULT_EVERY_MS } = {}) {
  if (process.env.DB_BACKUP === 'off') { console.log('[db] backups disabled (DB_BACKUP=off)'); return null; }
  if (!dir) { console.log('[db] backups off — set DB_BACKUP_DIR to enable them locally'); return null; }

  const run = async (why) => {
    const r = await backupOnce({ db, dir });
    if (r.file) console.log(`[db] backup (${why}): ${path.basename(r.file)} · ${(r.size / 1024).toFixed(0)} KB · ${r.counts.total} rows${r.pruned ? ` · pruned ${r.pruned}` : ''}`);
    else if (r.skipped) console.log(`[db] backup (${why}) skipped: ${r.skipped}`);
    else console.error(`[db] backup (${why}) failed: ${r.failed}`);
  };

  run('startup').catch((e) => console.error('[db] backup failed:', e.message));
  const timer = setInterval(() => { run('scheduled').catch((e) => console.error('[db] backup failed:', e.message)) }, everyMs);
  timer.unref?.(); // a pending backup timer must not hold the process open
  console.log(`[db] backups on: ${dir} every ${(everyMs / 3600000).toFixed(1)}h`);
  return timer;
}

module.exports = { startBackups, backupOnce, listBackups, backupDir, PREFIX, SUFFIX };
