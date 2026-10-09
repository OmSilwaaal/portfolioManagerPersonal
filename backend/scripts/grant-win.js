#!/usr/bin/env node
/**
 * Record a win against a real account, by @username.
 *
 *   node scripts/grant-win.js --user foidkiller --symbol CATE --pnl 2930.12 \
 *     --pct 218.4 --entry 0.0000412 --exit 0.000131 --anim lion --kind meme
 *
 * This writes a row to trade_wins exactly as closing a profitable trade would,
 * so it counts toward that account's Elo, win stats and profile. Unlike a
 * seeded board entry it is real data and is not removed by WINNERS_DEMO=off —
 * so it prints what it is about to do and refuses to run twice for the same
 * user and symbol unless --force is given.
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, to turn the @handle into a
 * user id.
 */
require('dotenv').config();
const { getDb } = require('../src/db/schema');
const { recordWin, ANIMS } = require('../src/services/wins');
const { supabase } = require('../src/services/supabaseAdmin');

const arg = (name, fallback = undefined) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
};
const has = (name) => process.argv.includes(`--${name}`);
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

async function main() {
  const username = arg('user');
  const symbol = (arg('symbol') || '').toUpperCase();
  const pnlUsd = num(arg('pnl'));
  if (!username || !symbol || pnlUsd === null) {
    console.error('usage: --user <handle> --symbol <TICKER> --pnl <usd> [--pct --entry --exit --anim --kind --force]');
    process.exit(1);
  }
  const anim = arg('anim');
  if (anim && !ANIMS.includes(anim)) {
    console.error(`--anim must be one of: ${ANIMS.join(', ')}`);
    process.exit(1);
  }

  const { data, error } = await supabase
    .from('profiles').select('user_id, username, display_name').eq('username', username).maybeSingle();
  if (error) { console.error('profile lookup failed:', error.message); process.exit(1); }
  if (!data) { console.error(`no account with username "${username}"`); process.exit(1); }

  const db = getDb();
  const dupe = db.prepare('SELECT COUNT(*) AS n FROM trade_wins WHERE user_id = ? AND symbol = ?')
    .get(data.user_id, symbol);
  if (dupe.n > 0 && !has('force')) {
    console.error(`${username} already has ${dupe.n} recorded win(s) on ${symbol}. Re-run with --force to add another.`);
    process.exit(1);
  }

  console.log(`recording for @${data.username} (${data.user_id}): ${symbol} +$${pnlUsd}`);
  const id = recordWin({
    userId: data.user_id,
    kind: arg('kind', 'meme') === 'stock' ? 'stock' : 'meme',
    symbol,
    entry: num(arg('entry')),
    exit: num(arg('exit')),
    qty: num(arg('qty')),
    pnlUsd,
    pnlPct: num(arg('pct')),
    solPrice: num(arg('sol')),
    anim,
  }, db);

  if (!id) { console.error('not recorded — check the profit clears the $1 minimum'); process.exit(1); }
  console.log(`done. trade_wins row ${id}. It will appear on the board and count toward their Elo and stats.`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
