#!/usr/bin/env node
/**
 * Restore the database from a rotating backup.
 *
 *   node scripts/db-restore.js                 # newest backup -> the live database
 *   node scripts/db-restore.js --list          # what is available
 *   node scripts/db-restore.js --from <file>   # a specific backup
 *   node scripts/db-restore.js --force         # overwrite a database that already has rows
 *
 * Stop the server first. SQLite keeps recent writes in the sibling -wal, so
 * replacing the file under a running server leaves it reading a file that no
 * longer matches the -wal it has open.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

function main() {
  const { DB_PATH } = require('../src/db/schema');
  const { listBackups, backupDir } = require('../src/db/backup');
  const { tableRowCounts, summarise } = require('../src/db/stats');
  const Database = require('better-sqlite3');

  const argv = process.argv.slice(2);
  const flag = (name) => { const i = argv.indexOf(name); return i > -1 ? argv[i + 1] : null };
  const dir = backupDir();
  const backups = listBackups(dir);

  if (argv.includes('--list')) {
    console.log(`backup directory: ${dir || '(none configured)'}`);
    if (!backups.length) { console.log('  no backups yet'); return }
    for (const b of backups) console.log(`  ${b.name}  ${(b.size / 1024).toFixed(0)} KB  ${b.at.toISOString()}`);
    return;
  }

  const src = flag('--from') || backups[0]?.file;
  if (!src) {
    console.error(`no backup to restore from${dir ? ` in ${dir}` : ' — DB_BACKUP_DIR / RAILWAY_VOLUME_MOUNT_PATH is not set'}`);
    process.exitCode = 1;
    return;
  }
  if (!fs.existsSync(src)) { console.error(`no such backup: ${src}`); process.exitCode = 1; return }
  if (path.resolve(src) === path.resolve(DB_PATH)) { console.error('that is the live database, not a backup'); process.exitCode = 1; return }

  const from = new Database(src, { readonly: true });
  const fromCounts = summarise(tableRowCounts(from));
  console.log(`restoring: ${src}`);
  console.log(`  ${fromCounts.total} rows · ${fromCounts.tables} tables`);
  if (fromCounts.social.length) console.log(`  social   : ${fromCounts.social.join(' ')}`);
  if (fromCounts.total === 0) {
    console.error('\nthat backup is empty — restoring it would achieve nothing. Refusing.');
    from.close();
    process.exitCode = 1;
    return;
  }

  // Never silently overwrite a database that still holds data.
  if (fs.existsSync(DB_PATH)) {
    let live = { total: 0 };
    try { const d = new Database(DB_PATH, { readonly: true }); live = tableRowCounts(d); d.close() } catch { /* unreadable: treat as empty */ }
    if (live.total > 0 && !argv.includes('--force')) {
      console.error(`\n${DB_PATH} already holds ${live.total} rows. Restoring would replace them.`);
      console.error('Back it up first (npm run db:backup -- /tmp/before-restore.sqlite), then re-run with --force.');
      from.close();
      process.exitCode = 1;
      return;
    }
  }

  // The -wal and -shm belong to the file being replaced; leaving them behind
  // would have SQLite try to apply the old write-ahead log to the new file.
  for (const f of [DB_PATH, `${DB_PATH}-wal`, `${DB_PATH}-shm`]) fs.rmSync(f, { force: true });
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  from.backup(DB_PATH)
    .then(() => {
      from.close();
      const check = new Database(DB_PATH, { readonly: true });
      const counts = summarise(tableRowCounts(check));
      const integrity = Object.values(check.prepare('PRAGMA integrity_check').get())[0];
      check.close();
      console.log(`\nrestored to ${DB_PATH}`);
      console.log(`  ${counts.total} rows · ${counts.tables} tables · integrity: ${integrity}`);
      console.log('\nStart the server again to pick it up.');
      if (integrity !== 'ok') process.exitCode = 1;
    })
    .catch((e) => { console.error('restore failed:', e.message); process.exitCode = 1 });
}

try { main() } catch (e) {
  if (/bindings file|NODE_MODULE_VERSION/.test(e.message)) {
    console.error(`better-sqlite3 has no build for this Node (${process.version}).`);
    console.error('This project needs Node 22 — see "engines" in package.json.');
  } else {
    console.error('db-restore failed:', e.message);
  }
  process.exitCode = 1;
}
