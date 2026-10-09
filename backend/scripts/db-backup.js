#!/usr/bin/env node
/**
 * Consistent copy of a live SQLite database.
 *
 *   node scripts/db-backup.js <destination.sqlite> [--from <source.sqlite>]
 *
 * Uses SQLite's online backup API, which folds in whatever is still sitting in
 * the -wal file and is safe while the server is running. Copying the files by
 * hand is not: in WAL mode most recent writes live in the sibling -wal, so a
 * plain `cp` of the .sqlite alone loses them, and copying all three from a
 * database being written to can capture a torn state.
 */
const fs = require('fs');
const path = require('path');

const dest = process.argv[2];
if (!dest || dest.startsWith('--')) {
  console.error('usage: node scripts/db-backup.js <destination.sqlite> [--from <source.sqlite>]');
  process.exit(1);
}
const fromIdx = process.argv.indexOf('--from');
const src = fromIdx > -1 ? process.argv[fromIdx + 1] : require('../src/db/schema').DB_PATH;

if (!fs.existsSync(src)) { console.error(`no database at ${src}`); process.exit(1); }
if (path.resolve(src) === path.resolve(dest)) { console.error('source and destination are the same file'); process.exit(1); }
fs.mkdirSync(path.dirname(path.resolve(dest)), { recursive: true });

const Database = require('better-sqlite3');
const db = new Database(src, { readonly: true });

const sizeOf = (p) => { try { return fs.statSync(p).size } catch { return 0 } };
console.log(`source: ${src}`);
console.log(`  main ${(sizeOf(src) / 1024).toFixed(0)} KB · wal ${(sizeOf(src + '-wal') / 1024).toFixed(0)} KB`);

db.backup(dest)
  .then(() => {
    const check = new Database(dest, { readonly: true });
    const tables = check.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get().c;
    const integrity = Object.values(check.prepare('PRAGMA integrity_check').get())[0];
    check.close();
    console.log(`\nwrote ${dest}`);
    console.log(`  ${(sizeOf(dest) / 1024).toFixed(0)} KB · ${tables} tables · integrity: ${integrity}`);
    if (integrity !== 'ok') process.exitCode = 1;
    db.close();
  })
  .catch((e) => { console.error('backup failed:', e.message); process.exit(1); });
