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
const { backupOnce, listBackups, backupDir, reclaimSpaceIfTight } = require('../src/db/backup');
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

// A full volume stops every write — "database or disk is full" takes the whole service down,
// which is far worse than having one fewer backup. So retention is bounded by bytes as well
// as by count, and a backup that would leave the disk near empty is not taken at all.
test('retention is bounded by bytes, not just by count', async (t) => {
  // Set here rather than relied on from the runner: a test that only passes with a particular
  // environment variable set outside it is a test that fails for the next person.
  const BUDGET = 120_000;
  const prevBudget = process.env.DB_BACKUP_MAX_BYTES;
  process.env.DB_BACKUP_MAX_BYTES = String(BUDGET);
  t.after(() => { if (prevBudget === undefined) delete process.env.DB_BACKUP_MAX_BYTES; else process.env.DB_BACKUP_MAX_BYTES = prevBudget });
  const dir = path.join(ROOT, 'budget');
  const db = open(path.join(ROOT, 'budget-src.sqlite'));
  db.exec('CREATE TABLE t (a)');
  const ins = db.prepare('INSERT INTO t VALUES (?)');
  for (let i = 0; i < 400; i++) ins.run('x'.repeat(200)); // a few pages, so size is measurable

  let last;
  for (let i = 0; i < 5; i++) {
    last = await backupOnce({ db, dir, keep: 10 }); // count would allow all five
    assert.ok(last.file, JSON.stringify(last));
    await new Promise((r) => setTimeout(r, 5));
  }
  db.close();

  const kept = listBackups(dir);
  const total = kept.reduce((n, b) => n + b.size, 0);
  assert.ok(kept.length >= 1, 'never deletes everything');
  assert.ok(kept.length < 5, `the byte budget should have dropped some: kept ${kept.length}`);
  assert.ok(total <= BUDGET, `kept ${total} bytes, budget ${BUDGET}`);
  // The newest is the one worth keeping.
  assert.strictEqual(kept[0].name, path.basename(last.file));
})

test('the newest backup is never deleted, even alone over budget', async () => {
  const dir = path.join(ROOT, 'single');
  const db = open(path.join(ROOT, 'single-src.sqlite'));
  db.exec('CREATE TABLE t (a)');
  const ins = db.prepare('INSERT INTO t VALUES (?)');
  for (let i = 0; i < 400; i++) ins.run('y'.repeat(200));
  const r = await backupOnce({ db, dir, keep: 3 });
  db.close();
  assert.ok(r.file)
  assert.strictEqual(listBackups(dir).length, 1, 'a volume too small for one backup is a sizing problem, not a reason to keep none');
})

// The smallest Railway volume is 0.5GB and cannot be resized without a paid plan, so when it
// fills, recovery may mean a shell the operator does not have. Reclaiming at boot turns that
// into "redeploy". It may only ever delete backups, and never the newest one.
test('a nearly-full volume is relieved by dropping old backups, newest kept', async () => {
  const dir = path.join(ROOT, 'reclaim');
  const db = open(path.join(ROOT, 'reclaim-src.sqlite'));
  db.exec('CREATE TABLE t (a)');
  const ins = db.prepare('INSERT INTO t VALUES (?)');
  for (let i = 0; i < 300; i++) ins.run('z'.repeat(200));
  const made = [];
  for (let i = 0; i < 4; i++) {
    const r = await backupOnce({ db, dir, keep: 10 });
    assert.ok(r.file, JSON.stringify(r));
    made.push(path.basename(r.file));
    await new Promise((res) => setTimeout(res, 5));
  }
  db.close();
  assert.strictEqual(listBackups(dir).length, 4, 'precondition: four copies on disk');

  // minFree above anything the real filesystem reports, so the "tight" branch always runs.
  const out = reclaimSpaceIfTight(dir, { minFree: Number.MAX_SAFE_INTEGER });
  const left = listBackups(dir);
  assert.ok(out.removed >= 1, 'something was freed');
  assert.strictEqual(left.length, 1, 'it stops at the newest rather than deleting everything');
  assert.strictEqual(left[0].name, made[made.length - 1], 'and the newest is the one kept');
})

test('a volume with room is left completely alone', () => {
  const dir = path.join(ROOT, 'roomy');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${'market_intelligence-'}2020-01-01T00-00-00-000.sqlite`), 'x');
  const before = listBackups(dir).length;
  const out = reclaimSpaceIfTight(dir, { minFree: 1 }); // 1 byte: there is always more than this
  assert.strictEqual(out.removed, 0);
  assert.strictEqual(listBackups(dir).length, before, 'nothing deleted when there is space');
})
