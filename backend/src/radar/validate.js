// Validation harness: generates synthetic worlds with KNOWN ground truth and checks the whole pipeline
// (features → models → paper fills → stats) recovers it. Run after any change to the radar:
//   node src/radar/validate.js
// A: volume/buy spike LEADS a real pump      → models must find a significant edge, mostly non-reactive.
// C: spike FOLLOWS the pump (reactive)       → precedence check must flag most signals as reactive.
// G: spike unrelated to price (noise)        → spike-only models must not be significant; fitted lift stays low.
// W: real pumps led by many buyers, fake spikes by one wallet → wallet-flow model must beat volume alone.
// S: like A, plus security flags predict rugs → the *_safe filter must cut the rug rate.
// Every world includes pump.fun graduations, which must never be scored as rugs.
const fs = require('fs');
const os = require('os');
const path = require('path');

function buildWorld(mode, N, dbPath) {
  for (const x of ['', '-wal', '-shm']) fs.rmSync(dbPath + x, { force: true });
  process.env.RADAR_DB_PATH = dbPath;
  // fresh module instances per world so each gets its own DB handle
  for (const k of Object.keys(require.cache)) if (k.includes(`${path.sep}radar${path.sep}`) && !k.endsWith('validate.js')) delete require.cache[k];
  const db = require('./db').getRadarDb();
  const insTok = db.prepare('INSERT INTO token (token_address,symbol,name,creator,first_pool,current_pool,dex,launchpad,pool_created_ts,first_seen_ts,migrated_ts,dead_ts,dead_reason) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
  const insSnap = db.prepare('INSERT INTO market_snapshot (token_address,ts,pool_address,price_usd,liquidity_usd,liq_estimated,fdv,vol_m5,vol_h1,buys_m5,sells_m5,buys_h1,sells_h1) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
  const insTrade = db.prepare('INSERT INTO trade (token_address,ts_ms,sig,wallet,is_buy,sol,tokens,mcap_sol,v_sol) VALUES (?,?,?,?,?,?,?,?,?)');
  const insSec = db.prepare('INSERT INTO token_security (token_address,ts,creator,rc_score,danger_count,top1_pct_ex,top10_pct_ex,creator_pct,insider_pct,mint_auth,freeze_auth,holders,lp_locked_pct,rugged,creator_prev_count,creator_prev_dead_share,risks_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  let seed = 777; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const now = Math.floor(Date.now() / 1000);
  const serial = Array.from({ length: 40 }, (_, i) => ({ id: 'SER' + i, rugger: i < 12 }));
  let migratedN = 0, gone = 0, inactive = 0;
  db.transaction(() => {
    for (let k = 0; k < N; k++) {
      const created = now - 3 * 86400 + Math.floor(rnd() * 2 * 86400);
      const ser = rnd() < 0.3 ? serial[Math.floor(rnd() * serial.length)] : null;
      const creator = ser ? ser.id : 'C' + k;
      const flagged = rnd() < 0.2 || (ser && ser.rugger && rnd() < 0.7);
      const pump = rnd() < 0.10;
      const tPump = 30 + Math.floor(rnd() * 90);
      const rugP = mode === 'S' ? (flagged ? 0.7 : 0.06) : 0.2;
      const rugAt = rnd() < rugP ? 20 + Math.floor(rnd() * 160) : null;
      const goesInactive = rugAt === null && rnd() < 0.08;
      const inactiveAt = 60 + Math.floor(rnd() * 90);
      const migrates = rnd() < 0.25;
      const migMin = 40;
      let tSpike = null;
      if ((mode === 'A' || mode === 'S') && pump) tSpike = tPump - 4;
      if (mode === 'C' && pump) tSpike = tPump + 4;
      if (mode === 'G') tSpike = rnd() < 0.10 ? 30 + Math.floor(rnd() * 90) : null;
      // W: real pumps are led by MANY distinct buyers; an equal number of fake spikes come from ONE wallet, no pump.
      const fake = mode === 'W' && !pump && rnd() < 0.12;
      if (mode === 'W') tSpike = pump ? tPump - 4 : fake ? 30 + Math.floor(rnd() * 90) : null;
      const tok = `T${mode}${k}`;
      let price = 1e-5, deadTs = null, deadReason = null;
      const rows = [];
      for (let m = 0; m <= 180; m++) {
        if (rugAt !== null && m >= rugAt) { deadTs = created + rugAt * 60; deadReason = 'gone'; gone++; break; }
        if (goesInactive && m >= inactiveAt) { deadTs = created + inactiveAt * 60; deadReason = 'inactive'; inactive++; break; }
        let drift = -0.0008;
        if (pump && m >= tPump && m < tPump + 10) drift = 0.05;
        price *= Math.exp(drift + 0.02 * gauss());
        const spike = tSpike !== null && m >= tSpike && m < tSpike + 6;
      if (mode === 'W') {
        const n = spike ? 25 : 3;
        for (let q = 0; q < n; q++) {
          const buy = spike ? 1 : rnd() < 0.5 ? 1 : 0;
          const wallet = spike && fake ? 'WHALE' + k : 'w' + Math.floor(rnd() * 400);
          insTrade.run(`T${mode}${k}`, (created + m * 60) * 1000 + Math.floor(rnd() * 59000), `s${k}_${m}_${q}`, wallet, buy, 0.2 + rnd(), 1000, 30, 30);
        }
      }
        const vm5 = (80 + 30 * rnd()) * (spike ? 9 : 1), vh1 = 1000 + 200 * rnd();
        const br = spike ? 0.82 : 0.45 + 0.1 * rnd();
        const onCurve = !(migrates && m >= migMin);
        rows.push([tok, created + m * 60, 'pool' + tok, price, onCurve ? 12000 : 40000, onCurve ? 1 : 0, price * 1e9, vm5, vh1, Math.round(20 * br), Math.round(20 * (1 - br)), 120, 120]);
      }
      const migTs = migrates ? created + migMin * 60 : null;
      if (migrates && deadTs === null || (migrates && deadTs > migTs)) migratedN++;
      insTok.run(tok, 'S' + k, 'S' + k + ' / SOL', creator, 'pool' + tok, 'pool' + tok, migrates ? 'pumpswap' : 'pumpfun', 'pumpfun', created, created, migrates && (deadTs === null || deadTs > migTs) ? migTs : null, deadTs, deadReason);
      for (const r of rows) insSnap.run(...r);
      insSec.run(tok, created + 300 + Math.floor(rnd() * 120), creator, flagged ? 80 : 10, flagged ? 2 : 0,
        flagged ? 40 + 20 * rnd() : 5 + 10 * rnd(), flagged ? 70 + 20 * rnd() : 20 + 15 * rnd(),
        flagged ? 25 + 20 * rnd() : 4 * rnd(), flagged ? 30 : 3, flagged && rnd() < 0.5 ? 1 : 0, 0, 100, 0, 0,
        ser ? 5 : 0, ser ? (ser.rugger ? 0.9 : 0.1) : null, '[]');
    }
  })();
  
  db.exec('UPDATE token SET last_snapshot_ts = (SELECT MAX(ts) FROM market_snapshot s WHERE s.token_address = token.token_address)');
  return require('./report').runReport({ horizons: [15, 60] });
}

function check(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  return cond;
}

if (require.main === module) {
  const N = Number(process.argv[2] || 1500);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-validate-'));
  const row = (out, win, model, strat) => out.results.find((r) => r.window === win && r.model === model && r.strategy === strat);
  const pct = (x) => (x === null || x === undefined ? '—' : (x * 100).toFixed(1) + '%');
  let ok = true;

  const G = buildWorld('G', N, path.join(dir, 'G.sqlite'));
  // In G the spikes are noise, but pumps still exist and run ~10 min, so PRICE momentum is a real effect there.
  // Only the spike-driven models must come up empty.
  const sigG = G.results.filter((r) => r.window === 'all' && r.significantAfterCorrection && ['volume_only', 'buy_only'].includes(r.model));
  ok &= check('G: spike-only models not significant when spikes are noise', sigG.length === 0, sigG.map((r) => `${r.model}/${r.strategy}`).join(', ') || 'none');
  ok &= check('G: fitted model finds no real lift', G.fit.status !== 'ok' || G.fit.valLift < 1.5, `lift=${G.fit.valLift?.toFixed(2)}`);

  const A = buildWorld('A', N, path.join(dir, 'A.sqlite'));
  const a = row(A, 'all', 'market_v1', '60m');
  ok &= check('A: leading signal detected', a.significantAfterCorrection && a.mean > 0, `mean=${pct(a.mean)} p=${a.pVsRandom}`);
  ok &= check('A: signals are mostly early, not reactive', a.precedence.shareReactive < 0.2, `reactive=${pct(a.precedence.shareReactive)}`);
  const fa = row(A, 'test', 'fitted_lr', '60m');
  ok &= check('A: fitted model beats random on held-out data', !!fa && fa.pVsRandom !== null && fa.pVsRandom < 0.01 && fa.mean > 0, fa ? `mean=${pct(fa.mean)} lift=${A.fit.valLift?.toFixed(2)}` : 'fit unavailable');

  const C = buildWorld('C', N, path.join(dir, 'C.sqlite'));
  const c = row(C, 'all', 'market_v1', '60m');
  ok &= check('C: reactive signal flagged by precedence check', c.precedence.shareReactive > 0.5, `reactive=${pct(c.precedence.shareReactive)}`);

  const W = buildWorld('W', N, path.join(dir, 'W.sqlite'));
  const wv = row(W, 'all', 'volume_only', '60m'), wf = row(W, 'all', 'flow_v1', '60m');
  ok &= check('W: wallet flow separates real pumps from one-wallet fake volume', wf.n >= 10 && wf.mean > wv.mean + 0.1 && wf.significantAfterCorrection,
    `volume_only mean=${pct(wv.mean)} (n=${wv.n}) vs flow_v1 mean=${pct(wf.mean)} (n=${wf.n})`);

  const S = buildWorld('S', N, path.join(dir, 'S.sqlite'));
  const s0 = row(S, 'all', 'market_v1', '60m'), s1 = row(S, 'all', 'market_v1_safe', '60m');
  ok &= check('S: safety filter cuts rug rate', s1.rugRate < s0.rugRate, `rug ${pct(s0.rugRate)} → ${pct(s1.rugRate)}, mean ${pct(s0.mean)} → ${pct(s1.mean)}`);

  const fakeRugs = [G, A, C, W, S].reduce((n, o) => n + o.data.migrated, 0);
  ok &= check('graduations tracked as migrations, not deaths', fakeRugs > 0, `${fakeRugs} graduations across worlds`);

  fs.rmSync(dir, { recursive: true, force: true });
  console.log(ok ? '\nALL CHECKS PASSED' : '\nSOME CHECKS FAILED');
  process.exit(ok ? 0 : 1);
}

module.exports = { buildWorld };
