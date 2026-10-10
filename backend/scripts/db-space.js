#!/usr/bin/env node
/**
 * What is using the volume, and how much room is left.
 *
 *   node scripts/db-space.js
 *
 * Written after a production "database or disk is full": a full volume stops every write, and
 * the first question is always which of the three writers grew — the main database, the radar
 * database, or the backups. SQLite also never shrinks a file on DELETE, so a database can sit
 * at its high-water mark long after the rows are gone; `free pages` is how you spot that.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;
const sizeOf = (p) => { try { return fs.statSync(p).size } catch { return 0 } };

function groupSize(file) {
  return sizeOf(file) + sizeOf(`${file}-wal`) + sizeOf(`${file}-shm`);
}

function freePages(file) {
  try {
    const Database = require('better-sqlite3');
    const d = new Database(file, { readonly: true });
    const free = d.pragma('freelist_count', { simple: true });
    const page = d.pragma('page_size', { simple: true });
    d.close();
    return { pages: free, bytes: free * page };
  } catch { return null }
}

function main() {
  const { DB_PATH } = require('../src/db/schema');
  const vol = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.dirname(DB_PATH);
  console.log(`volume: ${vol}`);
  try {
    const st = fs.statfsSync(vol);
    const total = st.blocks * st.bsize;
    const free = st.bavail * st.bsize;
    const pct = total ? ((total - free) / total) * 100 : 0;
    console.log(`  ${mb(total - free)} used of ${mb(total)} — ${pct.toFixed(0)}% full, ${mb(free)} free`);
    if (free < 256 * 1048576) console.log('  WARNING: under 256MB free. Backups will be skipped and writes may start failing.');
  } catch (e) {
    console.log(`  (could not read filesystem stats: ${e.message})`);
  }

  const radar = path.join(path.dirname(DB_PATH), 'radar.sqlite');
  for (const [label, file] of [['main ', DB_PATH], ['radar', radar]]) {
    if (!fs.existsSync(file)) { console.log(`\n${label}: not present at ${file}`); continue }
    console.log(`\n${label}: ${file}`);
    console.log(`  file ${mb(sizeOf(file))} · wal ${mb(sizeOf(`${file}-wal`))} · total ${mb(groupSize(file))}`);
    const f = freePages(file);
    // Reclaimable space is the tell: DELETE frees pages into a freelist but leaves the file
    // the same size. A big number here means a VACUUM would hand the space back.
    if (f) console.log(`  reclaimable by VACUUM: ${mb(f.bytes)} (${f.pages} free pages)`);
  }

  const { listBackups, backupDir } = require('../src/db/backup');
  const dir = backupDir();
  const backups = listBackups(dir);
  console.log(`\nbackups: ${dir || '(off)'}`);
  if (!dir) console.log('  none — no volume and no DB_BACKUP_DIR');
  else if (!backups.length) console.log('  none yet');
  else {
    const total = backups.reduce((n, b) => n + b.size, 0);
    console.log(`  ${backups.length} file(s), ${mb(total)} total, newest ${backups[0].at.toISOString()}`);
    for (const b of backups) console.log(`    ${b.name}  ${mb(b.size)}`);
  }
}

try { main() } catch (e) {
  if (/bindings file|NODE_MODULE_VERSION/.test(e.message)) {
    console.error(`better-sqlite3 has no build for this Node (${process.version}). This project needs Node 22.`);
  } else console.error('db-space failed:', e.message);
  process.exitCode = 1;
}
