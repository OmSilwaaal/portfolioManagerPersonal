// Test DB driver. Prefers the production driver (better-sqlite3) when it is loadable so the suite proves behaviour on the
// real thing (Node 20 on Railway); falls back to node:sqlite (Node 22+) where the native module isn't built.
// Force one with TEST_SQLITE=node|better.
let DatabaseSync; let driver;
const want = process.env.TEST_SQLITE;
if (want !== 'node') {
  try { const B = require('better-sqlite3'); new B(':memory:').close(); DatabaseSync = B; driver = 'better-sqlite3'; } catch { /* fall through */ }
}
if (!DatabaseSync) { ({ DatabaseSync } = require('node:sqlite')); driver = 'node:sqlite'; }
module.exports = { DatabaseSync, driver };

// Make `require('better-sqlite3')` (used by src/db/schema.js and src/radar/db.js) work where the native module isn't
// built (e.g. local Node 24): route it to a node:sqlite adapter. No-op when the real driver loads. Returns the driver in use.
function installBetterSqlite3Adapter() {
  if (driver === 'better-sqlite3' && want !== 'node') return 'better-sqlite3';
  const Module = require('module');
  const { DatabaseSync: Raw } = require('node:sqlite');
  class Database {
    constructor(p) { this.d = new Raw(p); }
    pragma(s, o) {
      if (/=/.test(s)) { this.d.exec('PRAGMA ' + s); return undefined; }
      const r = this.d.prepare('PRAGMA ' + s).all();
      return o && o.simple ? Object.values(r[0] || {})[0] : r;
    }
    exec(s) { return this.d.exec(s); }
    prepare(s) { return this.d.prepare(s); }
    transaction(fn) { return (...a) => { this.d.exec('BEGIN'); try { const r = fn(...a); this.d.exec('COMMIT'); return r; } catch (e) { this.d.exec('ROLLBACK'); throw e; } }; }
    close() { this.d.close(); }
  }
  const orig = Module._load;
  Module._load = function (req, ...rest) { return req === 'better-sqlite3' ? Database : orig.call(this, req, ...rest); };
  return 'node:sqlite (adapter)';
}
module.exports.installBetterSqlite3Adapter = installBetterSqlite3Adapter;
