// Standalone radar: runs ONLY the data collectors (no web server, no API, no trading). Used by the Docker setup:
//   docker compose -f docker-compose.radar.yml up -d
// Everything it pulls is free; the paid PumpPortal trade feed stays off unless PUMPPORTAL_API_KEY is set.
const { getRadarDb, DB_PATH } = require('./db');
const stream = require('./stream');
const collector = require('./collector');
const security = require('./security');
const enrich = require('./enrich');

getRadarDb();
console.log(`[radar] standalone collector writing to ${DB_PATH}`);
stream.start();
collector.start();
security.start();
enrich.start();

// A heartbeat in the logs so `docker compose logs` shows it's alive and growing.
setInterval(() => {
  const db = getRadarDb();
  const c = (sql) => db.prepare(sql).get().c;
  const s = stream.status();
  console.log(`[radar] heartbeat: tokens=${c('SELECT COUNT(*) c FROM token')} snapshots=${c('SELECT COUNT(*) c FROM market_snapshot')} ` +
    `security=${c('SELECT COUNT(DISTINCT token_address) c FROM token_security')} promos=${c('SELECT COUNT(*) c FROM token_promo')} ` +
    `pumpportal=${s.connected ? 'connected' : 'DISCONNECTED'} launchesSinceStart=${s.launchesSeen}`);
}, 10 * 60 * 1000);

// Docker sends SIGTERM on stop: flush buffered stream events and close the DB cleanly so nothing is lost.
function shutdown(sig) {
  console.log(`[radar] ${sig} received, flushing and closing`);
  try { stream.stop(); collector.stop(); security.stop(); enrich.stop(); getRadarDb().close(); } catch (e) { console.error(e.message); }
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
