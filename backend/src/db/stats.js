/**
 * Row counts across every user table.
 *
 * Table *count* is not a health signal: a freshly initialised database has the
 * full set of tables and no data at all, which is exactly how a lost database
 * looks. Rows are the signal, so everything that needs to know whether a
 * database holds anything asks here.
 */

// Table names come from sqlite_master, so they are filtered rather than bound:
// an identifier cannot be a parameter. Quoting with "" keeps names that collide
// with keywords working.
function tableRowCounts(db) {
  const byTable = {};
  let total = 0;
  for (const r of db.prepare('SELECT name, type FROM sqlite_master').all()) {
    if (r.type !== 'table' || r.name.startsWith('sqlite_')) continue;
    let n = 0;
    try { n = db.prepare(`SELECT COUNT(*) AS n FROM "${r.name.replace(/"/g, '""')}"`).get().n } catch { n = 0 }
    byTable[r.name] = n;
    total += n;
  }
  return { total, tables: Object.keys(byTable).length, byTable };
}

// The tables whose loss a person actually notices, worth naming in a report.
const SOCIAL_TABLES = ['friendships', 'clans', 'clan_members', 'clan_posts', 'messages', 'trade_wins', 'trade_results', 'elo_peaks', 'user_cosmetics', 'referrals'];

function summarise(counts) {
  const populated = Object.entries(counts.byTable).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  return {
    total: counts.total,
    tables: counts.tables,
    populated: populated.map(([name, n]) => `${name}=${n}`),
    social: SOCIAL_TABLES.filter((t) => counts.byTable[t] > 0).map((t) => `${t}=${counts.byTable[t]}`),
  };
}

module.exports = { tableRowCounts, summarise, SOCIAL_TABLES };
