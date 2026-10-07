'use strict';
// Hard daily request budget per provider, persisted in the research DB (table api_budget) so a restart cannot
// reset it. Fail-closed: if the budget cannot be read/written, the request is NOT allowed.
// Birdeye's free tier is roughly 200 requests/day; the default budget (BIRDEYE_DAILY_BUDGET=150) leaves headroom.

const DEFAULT_BIRDEYE_DAILY_BUDGET = 150;

const utcDay = (sec) => new Date(sec * 1000).toISOString().slice(0, 10);

function parseDailyBudget(env = process.env, key = 'BIRDEYE_DAILY_BUDGET', def = DEFAULT_BIRDEYE_DAILY_BUDGET) {
  const raw = env[key];
  if (raw === undefined || raw === '') return def;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : def;
}

/** db may be null: then the budget is in-memory only (not persisted). */
function createBudget(db, { provider = 'birdeye', dailyLimit = DEFAULT_BIRDEYE_DAILY_BUDGET, nowSec = () => Math.floor(Date.now() / 1000) } = {}) {
  let mem = { day: '', used: 0 };
  if (db) {
    db.exec(`CREATE TABLE IF NOT EXISTS api_budget (provider TEXT NOT NULL, day TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (provider, day))`);
  }
  const used = () => {
    const day = utcDay(nowSec());
    if (!db) { if (mem.day !== day) mem = { day, used: 0 }; return mem.used; }
    const r = db.prepare('SELECT used FROM api_budget WHERE provider = ? AND day = ?').get(provider, day);
    return r ? Number(r.used) : 0;
  };
  return {
    provider, limit: dailyLimit,
    used,
    remaining: () => { try { return Math.max(0, dailyLimit - used()); } catch { return 0; } },
    /** Reserve n requests. Returns false (and spends nothing) when that would exceed today's budget. */
    tryConsume(n = 1) {
      try {
        const u = used();
        if (!(n > 0) || u + n > dailyLimit) return false;
        const day = utcDay(nowSec());
        if (!db) { mem.used += n; return true; }
        db.prepare('INSERT INTO api_budget (provider, day, used) VALUES (?, ?, ?) ON CONFLICT(provider, day) DO UPDATE SET used = used + excluded.used').run(provider, day, n);
        return true;
      } catch { return false; }
    },
    status() { let u = null; try { u = used(); } catch { /* unknown */ } return { provider, day: utcDay(nowSec()), used: u, limit: dailyLimit, persisted: !!db }; },
  };
}

function budgetError(provider) {
  const e = new Error(`${provider} daily request budget exhausted`);
  e.budgetExceeded = true;      // not retriable
  return e;
}

module.exports = { createBudget, parseDailyBudget, budgetError, utcDay, DEFAULT_BIRDEYE_DAILY_BUDGET };
