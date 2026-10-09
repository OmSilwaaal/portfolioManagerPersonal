// Where the database file lands decides whether anything survives a deploy, and
// getting it wrong fails silently: the app works, then every row vanishes on the
// next release. These pin both databases to the mounted volume.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

// Resolved in a child so each case gets a clean module registry and env.
function resolve(file, exportName, env) {
  const { execFileSync } = require('node:child_process');
  const code = `console.log(require(${JSON.stringify(path.join(__dirname, '..', file))}).${exportName})`;
  return execFileSync(process.execPath, ['-e', code], {
    env: { ...process.env, DB_PATH: '', RADAR_DB_PATH: '', ...env },
    encoding: 'utf8',
  }).trim();
}

test('the main database sits on the Railway volume, not beside it', () => {
  const p = resolve('src/db/schema.js', 'DB_PATH', { RAILWAY_VOLUME_MOUNT_PATH: '/data' });
  assert.strictEqual(p, '/data/market_intelligence.sqlite');
  // The failure this guards against: '../..' applied to an absolute volume path
  // escapes to '/', which is ephemeral.
  assert.ok(!p.startsWith('/market_intelligence'), 'must not escape the volume to the filesystem root');
});

test('the radar database sits on the Railway volume too', () => {
  assert.strictEqual(
    resolve('src/radar/db.js', 'DB_PATH', { RAILWAY_VOLUME_MOUNT_PATH: '/data' }),
    '/data/radar.sqlite',
  );
});

test('without a volume both fall back inside the backend directory', () => {
  const backend = path.join(__dirname, '..');
  assert.strictEqual(resolve('src/db/schema.js', 'DB_PATH', {}), path.join(backend, 'market_intelligence.sqlite'));
  assert.strictEqual(resolve('src/radar/db.js', 'DB_PATH', {}), path.join(backend, 'radar.sqlite'));
});

test('DB_PATH overrides everything', () => {
  assert.strictEqual(
    resolve('src/db/schema.js', 'DB_PATH', { DB_PATH: '/tmp/explicit.sqlite', RAILWAY_VOLUME_MOUNT_PATH: '/data' }),
    '/tmp/explicit.sqlite',
  );
});
