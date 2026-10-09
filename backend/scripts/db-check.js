#!/usr/bin/env node
/**
 * Database health check. Read-only unless --migrate is passed.
 *
 *   node scripts/db-check.js            # report
 *   node scripts/db-check.js --migrate  # also create any missing tables
 *
 * Schema drift is the quiet failure mode here: tables are created with
 * CREATE TABLE IF NOT EXISTS when the app opens the database, so a database
 * last opened by an older build silently lacks the newer tables, and the
 * features that need them return nothing rather than erroring.
 */
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { tableRowCounts, summarise } = require('../src/db/stats');
const { listBackups, backupDir } = require('../src/db/backup');

// Resolved by the schema module, never recomputed here: on Railway the database
// lives on the mounted volume, and a check that looked somewhere else would
// cheerfully report on a file the server never opens.
const { DB_PATH } = require('../src/db/schema');
const MIGRATE = process.argv.includes('--migrate');

function openRaw() {
  const Database = require('better-sqlite3');
  return new Database(DB_PATH, { readonly: !MIGRATE, fileMustExist: false });
}

function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.log(`no database at ${DB_PATH} — it is created the first time the server starts.`);
    return;
  }
  console.log(`database: ${DB_PATH}  (${(fs.statSync(DB_PATH).size / 1024).toFixed(0)} KB)`);

  const before = openRaw();
  const have = new Set(
    before.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((r) => r.name),
  );
  console.log('  integrity :', Object.values(before.prepare('PRAGMA integrity_check').get())[0]);
  console.log('  tables    :', have.size);
  // Rows, not tables, are what says whether this database holds anything: a
  // freshly created one has the full set of tables and nothing in them, which
  // is indistinguishable from a database that has been lost.
  const counts = summarise(tableRowCounts(before));
  console.log('  rows      :', counts.total || '0  <-- this database is empty');
  if (counts.social.length) console.log('  social    :', counts.social.join(' '));
  else if (counts.total) console.log('  social    : no friends, clans or wins stored');
  if (counts.populated.length) console.log('  populated :', counts.populated.slice(0, 12).join(' ') + (counts.populated.length > 12 ? ` (+${counts.populated.length - 12} more)` : ''));
  before.close();

  const backups = listBackups();
  const dir = backupDir();
  if (!dir) console.log('  backups   : off (no volume and no DB_BACKUP_DIR)');
  else if (!backups.length) console.log(`  backups   : none yet in ${dir}`);
  else console.log(`  backups   : ${backups.length} in ${dir}, newest ${backups[0].at.toISOString()} (${(backups[0].size / 1024).toFixed(0)} KB)`);

  // Build the expected set from the schema module itself, against a throwaway file,
  // so this never drifts from the real definition.
  const tmp = path.join(require('os').tmpdir(), `schema-ref-${process.pid}.sqlite`);
  const prev = process.env.DB_PATH;
  process.env.DB_PATH = tmp;
  delete require.cache[require.resolve('../src/db/schema')];
  const ref = require('../src/db/schema').getDb();
  const want = ref.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((r) => r.name);
  ref.close();
  for (const f of [tmp, `${tmp}-wal`, `${tmp}-shm`]) fs.rmSync(f, { force: true });
  if (prev === undefined) delete process.env.DB_PATH; else process.env.DB_PATH = prev;

  const missing = want.filter((t) => !have.has(t));
  if (!missing.length) {
    console.log('  schema    : up to date');
    return;
  }
  console.log(`  schema    : ${missing.length} table(s) behind the code`);
  console.log(`              ${missing.join(', ')}`);

  if (!MIGRATE) {
    console.log('\nStarting the server creates these automatically. To do it now:');
    console.log('  node scripts/db-check.js --migrate');
    process.exitCode = 1;
    return;
  }
  // Opening through the schema module runs the same CREATE TABLE IF NOT EXISTS
  // the server runs, so this adds what is missing and touches nothing else.
  delete require.cache[require.resolve('../src/db/schema')];
  const db = require('../src/db/schema').getDb();
  const now = db.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get().c;
  console.log(`\nmigrated. tables: ${have.size} -> ${now}, integrity: ${Object.values(db.prepare('PRAGMA integrity_check').get())[0]}`);
}

try { main(); } catch (e) {
  // The native-module error dumps a dozen candidate paths that tell the reader
  // nothing. The version mismatch is the actual problem, so say only that.
  if (/bindings file|NODE_MODULE_VERSION/.test(e.message)) {
    console.error(`better-sqlite3 has no build for this Node (${process.version}).`);
    console.error('This project needs Node 22 — see "engines" in package.json.');
    console.error('  nvm use 22   (or: brew install node@22)');
  } else {
    console.error('db-check failed:', e.message);
  }
  process.exitCode = 1;
}
