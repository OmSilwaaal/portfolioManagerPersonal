// Backups of the live database. The rules worth holding onto:
//   - a database with rows is copied, with whatever is still in its -wal
//   - a database with no rows is never copied, so a fresh/empty one cannot
//     rotate the last good backup out of existence
//   - rotation keeps the newest N and nothing else
//   - restore refuses to overwrite data, and refuses to restore an empty copy
const os = require('os');
const fs = require('fs');
const path = require('path');

// Must be set before src/db/schema is required: it resolves its path at load.
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'travauxus-backup-'));
process.env.DB_PATH = path.join(ROOT, 'live.sqlite');
process.env.DB_BACKUP_DIR = path.join(ROOT, 'backups');

const test = require('node:test');
const assert = require('node:assert');
const Database = require('better-sqlite3');
const { backupOnce, listBackups, backupDir } = require('../src/db/backup');
const { tableRowCounts } = require('../src/db/stats');

const open = (file) => { const d = new Database(file); d.pragma('journal_mode = WAL'); return d };

test.after(() => fs.rmSync(ROOT, { recursive: true, force: true }));

test('backupDir prefers an explicit directory', () => {
  assert.strictEqual(backupDir(), path.join(ROOT, 'backups'));
});

test('a database with rows is backed up, including writes still in the -wal', async () => {
  const db = open(path.join(ROOT, 'withRows.sqlite'));
  db.exec('CREATE TABLE friendships (requester_id TEXT, addressee_id TEXT)');
  const ins = db.prepare('INSERT INTO friendships VALUES (?, ?)');
  for (let i = 0; i < 40; i++) ins.run(`u${i}`, `v${i}`);

  // The connection stays open, so these rows live in the -wal, not the main
  // file — the state a plain file copy loses.
  const r = await backupOnce({ db, dir: path.join(ROOT, 'backups') });
  assert.ok(r.file, `expected a backup, got ${JSON.stringify(r)}`);
  assert.strictEqual(r.counts.total, 40);

  const copy = new Database(r.file, { readonly: true });
  assert.strictEqual(copy.prepare('SELECT COUNT(*) n FROM friendships').get().n, 40);
  copy.close();
  db.close();
});

test('an empty database is refused, leaving the good backup in place', async () => {
  const before = listBackups(path.join(ROOT, 'backups')).map((b) => b.name);
  assert.ok(before.length > 0, 'precondition: a good backup exists');

  const empty = open(path.join(ROOT, 'empty.sqlite'));
  empty.exec('CREATE TABLE friendships (requester_id TEXT, addressee_id TEXT)'); // schema but no rows
  const r = await backupOnce({ db: empty, dir: path.join(ROOT, 'backups') });
  empty.close();

  assert.ok(!r.file, 'an empty database must not produce a backup');
  assert.match(r.skipped, /empty/);
  assert.deepStrictEqual(listBackups(path.join(ROOT, 'backups')).map((b) => b.name), before);
});

test('rotation keeps the newest N', async () => {
  const dir = path.join(ROOT, 'rotate');
  const db = open(path.join(ROOT, 'rotate-src.sqlite'));
  db.exec('CREATE TABLE t (a)');
  db.prepare('INSERT INTO t VALUES (1)').run();

  const made = [];
  for (let i = 0; i < 4; i++) {
    const r = await backupOnce({ db, dir, keep: 2 });
    assert.ok(r.file, JSON.stringify(r));
    made.push(path.basename(r.file));
    await new Promise((res) => setTimeout(res, 5)); // distinct timestamps
  }
  db.close();

  const left = listBackups(dir).map((b) => b.name);
  assert.strictEqual(left.length, 2, `kept ${left.length}: ${left.join(', ')}`);
  assert.deepStrictEqual(left.slice().sort(), made.slice(-2).sort());
});

test('a missing backup directory turns backups off rather than erroring', async () => {
  const db = open(path.join(ROOT, 'nodir.sqlite'));
  db.exec('CREATE TABLE t (a)');
  db.prepare('INSERT INTO t VALUES (1)').run();
  const r = await backupOnce({ db, dir: null });
  db.close();
  assert.match(r.skipped, /no backup directory/);
});

test('row counts are what distinguish a fresh database from a lost one', () => {
  const db = open(path.join(ROOT, 'counts.sqlite'));
  db.exec('CREATE TABLE clans (id INTEGER); CREATE TABLE clan_members (user_id TEXT)');
  assert.strictEqual(tableRowCounts(db).total, 0, 'a full set of tables with no rows totals zero');
  assert.strictEqual(tableRowCounts(db).tables, 2);
  db.prepare('INSERT INTO clans VALUES (1)').run();
  assert.strictEqual(tableRowCounts(db).total, 1);
  db.close();
});
