// In-memory stand-in for the supabase-js query builder, covering exactly what routes/memecoins.js and
// services/memecoinPositions.js call: select(cols, {count}) / insert / update / upsert(onConflict) / delete, with
// eq / gt / in / like filters, order, range, maybeSingle / single, and `.select()` after a write.
// It mimics the production column precision (NUMERIC) so rounding bugs show up, and has hooks for fault/race injection.
const SCHEMA = {
  paper_portfolios: { unique: ['user_id'], round: { cash_balance: 4 } },
  paper_positions: { unique: ['user_id', 'ticker'], round: { shares: 9 } },
  paper_transactions: { unique: [], round: { shares: 9, total: 4 } },
};

const roundTo = (v, dp) => (typeof v === 'number' ? Math.round(v * 10 ** dp) / 10 ** dp : v);

function likeToRe(pattern) {
  const esc = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.');
  return new RegExp(`^${esc}$`, 's');
}

function createFakeSupabase() {
  const tables = { paper_portfolios: [], paper_positions: [], paper_transactions: [] };
  let seq = 0;
  const hooks = { beforeWrite: null, failWrite: null }; // beforeWrite(table, op, filters), failWrite(table, op) -> Error|null
  const calls = [];

  function normalise(table, row) {
    const out = { ...row };
    for (const [k, dp] of Object.entries(SCHEMA[table].round)) if (k in out) out[k] = roundTo(out[k], dp);
    return out;
  }

  function builder(table) {
    const st = { op: 'select', filters: [], payload: null, returning: false, count: false, orders: [], range: null, single: null, onConflict: null };
    const matches = (row) => st.filters.every(([kind, col, val]) => {
      const v = row[col];
      if (kind === 'eq') return v === val || (v != null && val != null && typeof v !== typeof val && Number(v) === Number(val));
      if (kind === 'gt') return Number(v) > Number(val);
      if (kind === 'in') return val.includes(v);
      if (kind === 'like') return typeof v === 'string' && likeToRe(val).test(v);
      return true;
    });

    async function run() {
      await new Promise((r) => setImmediate(r)); // yield so concurrent requests really interleave
      calls.push({ table, op: st.op });
      const rows = tables[table];
      if (st.op !== 'select') {
        if (hooks.beforeWrite) hooks.beforeWrite(table, st.op, st.filters, tables);
        const fail = hooks.failWrite && hooks.failWrite(table, st.op);
        if (fail) return { data: null, error: fail };
      }
      let result;
      if (st.op === 'select') {
        result = rows.filter(matches);
      } else if (st.op === 'insert') {
        const created = [];
        for (const p of [].concat(st.payload)) {
          const n = normalise(table, p);
          const u = SCHEMA[table].unique;
          if (u.length && rows.some((r) => u.every((c) => r[c] === n[c]))) {
            return { data: null, error: { code: '23505', message: `duplicate key on ${table}` } };
          }
          const row = { id: ++seq, created_at: new Date(1_700_000_000_000 + seq * 1000).toISOString(), updated_at: null, ...n };
          rows.push(row);
          created.push(row);
        }
        result = created;
      } else if (st.op === 'upsert') {
        const n = normalise(table, st.payload);
        const keys = (st.onConflict || SCHEMA[table].unique.join(',')).split(',');
        const existing = rows.find((r) => keys.every((c) => r[c] === n[c]));
        if (existing) { Object.assign(existing, n); result = [existing]; } else {
          const row = { id: ++seq, created_at: new Date(1_700_000_000_000 + seq * 1000).toISOString(), ...n };
          rows.push(row); result = [row];
        }
      } else if (st.op === 'update') {
        result = rows.filter(matches);
        for (const r of result) Object.assign(r, normalise(table, st.payload));
      } else if (st.op === 'delete') {
        result = rows.filter(matches);
        tables[table] = rows.filter((r) => !result.includes(r));
      }

      let total = null;
      if (st.op === 'select') {
        for (const { col, asc } of [...st.orders].reverse()) {
          result = [...result].sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (asc ? 1 : -1));
        }
        total = result.length;
        if (st.range) result = result.slice(st.range[0], st.range[1] + 1);
      }
      const shaped = result.map((r) => ({ ...r }));
      const wantRows = st.op === 'select' || st.returning;
      if (st.single === 'maybe') {
        if (shaped.length > 1) return { data: null, error: { message: 'multiple rows' } };
        return { data: shaped[0] ?? null, error: null };
      }
      if (st.single === 'one') {
        if (shaped.length !== 1) return { data: null, error: { message: 'no rows' } };
        return { data: shaped[0], error: null };
      }
      return { data: wantRows ? shaped : null, error: null, count: st.count ? total : null };
    }

    const api = {
      select(_cols, opts) { if (st.op === 'select') st.op = 'select'; else st.returning = true; if (opts?.count) st.count = true; return api; },
      insert(p) { st.op = 'insert'; st.payload = p; return api; },
      update(p) { st.op = 'update'; st.payload = p; return api; },
      upsert(p, opts) { st.op = 'upsert'; st.payload = p; st.onConflict = opts?.onConflict || null; return api; },
      delete() { st.op = 'delete'; return api; },
      eq(c, v) { st.filters.push(['eq', c, v]); return api; },
      gt(c, v) { st.filters.push(['gt', c, v]); return api; },
      in(c, v) { st.filters.push(['in', c, v]); return api; },
      like(c, v) { st.filters.push(['like', c, v]); return api; },
      order(col, o) { st.orders.push({ col, asc: o?.ascending !== false }); return api; },
      range(a, b) { st.range = [a, b]; return api; },
      maybeSingle() { st.single = 'maybe'; return api; },
      single() { st.single = 'one'; return api; },
      then(res, rej) { return run().then(res, rej); },
    };
    return api;
  }

  return {
    from: (t) => {
      if (!SCHEMA[t]) throw new Error(`unknown table ${t}`);
      return builder(t);
    },
    tables,
    hooks,
    calls,
    seedCash(userId, cash) { tables.paper_portfolios.push({ id: ++seq, user_id: userId, cash_balance: cash }); },
    seedPosition(userId, ticker, shares, avgCost) {
      tables.paper_positions.push({ id: ++seq, user_id: userId, ticker, shares, avg_cost: avgCost });
    },
    seedTx(row) {
      tables.paper_transactions.push({ id: ++seq, created_at: new Date(1_700_000_000_000 + seq * 1000).toISOString(), ...row });
    },
    cash: (u) => tables.paper_portfolios.find((r) => r.user_id === u)?.cash_balance,
    position: (u, t) => tables.paper_positions.find((r) => r.user_id === u && r.ticker === t) || null,
  };
}

module.exports = { createFakeSupabase };
