// The old path bug stranded the production database on the container's
// ephemeral root. Startup folds it onto the volume — but a recovery that
// overwrites live data would be far worse than the bug, so the guards matter
// more than the happy path.
const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const BACKEND = path.join(__dirname, '..');

// Each case runs in a child: the schema module caches its connection.
function boot(volume, script) {
  return execFileSync(process.execPath, ['-e', script], {
    cwd: BACKEND,
    env: { ...process.env, RAILWAY_VOLUME_MOUNT_PATH: volume, DB_PATH: '' },
    encoding: 'utf8',
  });
}

/** A volume dir, plus the path the old buggy expression resolves to from it. */
function arena() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rescue-'));
  const volume = path.join(root, 'deep', 'data');
  fs.mkdirSync(volume, { recursive: true });
  return { root, volume, stranded: path.join(volume, '../../market_intelligence.sqlite') };
}

// Uses a table name the real schema does not define, so initSchema cannot
// collide with the fixture.
const seed = (file, rows) => execFileSync(process.execPath, ['-e', `
  const D = require('better-sqlite3');
  const db = new D(${JSON.stringify(file)});
  db.pragma('journal_mode = WAL');
  db.pragma('wal_autocheckpoint = 0');
  db.exec('CREATE TABLE rescued_rows (a TEXT)');
  const ins = db.prepare('INSERT INTO rescued_rows VALUES (?)');
  for (let i = 0; i < ${rows}; i++) ins.run('u' + i);
  process.exit(0);                       // leave the writes in the -wal
`], { cwd: BACKEND });

test('a stranded database is recovered onto the volume, including its WAL', () => {
  const { volume, stranded } = arena();
  seed(stranded, 75);
  // the main file is near-empty; everything lives in the -wal
  assert.ok(fs.statSync(stranded).size <= 8192, 'main file is small, as in production');
  assert.ok(fs.statSync(`${stranded}-wal`).size > 10000, 'the data is in the wal');

  const out = boot(volume, `
    const { getDb } = require('./src/db/schema');
    console.log(String(getDb().prepare('SELECT COUNT(*) AS n FROM rescued_rows').get().n));
  `);
  assert.match(out, /recovered 1 tables/, 'it reports the recovery');
  assert.strictEqual(out.trim().split('\n').pop(), '75', 'every row survived, wal included');
});

test('it never overwrites a volume that already holds data', () => {
  const { volume, stranded } = arena();
  seed(stranded, 10);
  // volume already has its own, different data
  execFileSync(process.execPath, ['-e', `
    const D = require('better-sqlite3');
    const db = new D(${JSON.stringify(path.join(volume, 'market_intelligence.sqlite'))});
    db.exec('CREATE TABLE rescued_rows (a TEXT)');
    db.prepare('INSERT INTO rescued_rows VALUES (?)').run('live-row');
    db.close();
  `], { cwd: BACKEND });

  const out = boot(volume, `
    const { getDb } = require('./src/db/schema');
    console.log(String(getDb().prepare('SELECT COUNT(*) AS n FROM rescued_rows').get().n));
  `);
  assert.ok(!/recovered/.test(out), 'it must not run against a populated volume');
  assert.strictEqual(out.trim().split('\n').pop(), '1', 'the live row is untouched');
});

test('it is a one-off: a second boot does not undo later writes', () => {
  const { volume, stranded } = arena();
  seed(stranded, 5);
  boot(volume, `require('./src/db/schema').getDb()`);
  boot(volume, `
    const db = require('./src/db/schema').getDb();
    db.prepare('INSERT INTO rescued_rows VALUES (?)').run('added-later');
  `);
  const out = boot(volume, `
    console.log(String(require('./src/db/schema').getDb().prepare('SELECT COUNT(*) AS n FROM rescued_rows').get().n));
  `);
  assert.strictEqual(out.trim().split('\n').pop(), '6', 'the later write survives a reboot');
});

test('nothing happens when there is no stranded database', () => {
  const { volume } = arena();
  const out = boot(volume, `require('./src/db/schema').getDb(); console.log('booted')`);
  assert.ok(!/recovered/.test(out));
  assert.match(out, /booted/);
});
