// Append-only market snapshot collector for research. Enabled with SNAPSHOT_COLLECTOR=1.
// Inserts only; never updates or deletes snapshot rows.
const { getDb } = require('../db/schema');
const data = require('./memecoinData');

const INTERVAL_MS = 60_000;
let timer = null;
let running = false;

async function collectOnce() {
  if (running) return 0;
  running = true;
  try {
    const [trending, fresh] = await Promise.all([
      data.getTrending().catch(() => []),
      data.getNew().catch(() => []),
    ]);
    const seen = new Set();
    const tokens = [...trending, ...fresh].filter((t) => {
      if (!t.address || seen.has(t.address)) return false;
      seen.add(t.address);
      return true;
    });
    if (!tokens.length) return 0;

    const db = getDb();
    const insTok = db.prepare(
      `INSERT OR IGNORE INTO token (chain, contract_address, first_seen_ts, symbol) VALUES ('solana', ?, ?, ?)`);
    const getTok = db.prepare(`SELECT token_id FROM token WHERE chain = 'solana' AND contract_address = ?`);
    const insSnap = db.prepare(
      `INSERT INTO market_snapshot
        (token_id, ts, price, mcap, liquidity_usd, volume_5m, volume_1h, buy_count, sell_count, holder_count, ingested_ts)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

    const ts = Math.floor(Date.now() / 1000);
    const tx = db.transaction((list) => {
      for (const t of list) {
        insTok.run(t.address, ts, t.symbol || null);
        const row = getTok.get(t.address);
        if (!row) continue;
        insSnap.run(row.token_id, ts, t.price ?? null, t.mcap ?? null, t.liquidity_usd ?? null,
          t.volume_5m ?? null, t.volume_1h ?? null, t.buy_count ?? null, t.sell_count ?? null,
          t.holders ?? null, Math.floor(Date.now() / 1000));
      }
    });
    tx(tokens);
    return tokens.length;
  } catch (err) {
    console.error('[snapshotCollector] error:', err.message);
    return 0;
  } finally {
    running = false;
  }
}

function startSnapshotCollector() {
  if (process.env.SNAPSHOT_COLLECTOR !== '1' || timer) return;
  console.log('[snapshotCollector] started (every 60s)');
  collectOnce();
  timer = setInterval(collectOnce, INTERVAL_MS);
  timer.unref?.();
}

module.exports = { startSnapshotCollector, collectOnce };
