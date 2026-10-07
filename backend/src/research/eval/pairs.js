// Builds (signal, outcome) pairs for evaluate(). Any model_version and any score column can be
// evaluated with the same code:
//   scoreKey = 'composite_score'          the model's composite
//   scoreKey = 'component:<name>'         one key of component_scores JSON (feature-group ablation)
//   scoreKey = (row, components) => num   arbitrary function (e.g. social-only, smart-money-only)
//
// The volume_5m baseline feature is read from the last market_snapshot AT OR BEFORE as_of_ts
// (known at signal time, so not a leak). Outcomes come only from outcome_window.

function makeScoreFn(scoreKey) {
  if (typeof scoreKey === 'function') return scoreKey;
  const key = scoreKey || 'composite_score';
  if (key === 'composite_score') return (row) => row.composite_score;
  if (key.startsWith('component:')) {
    const name = key.slice('component:'.length);
    return (row, comps) => {
      const v = comps ? comps[name] : undefined;
      return typeof v === 'number' ? v : (v && typeof v.score === 'number' ? v.score : null);
    };
  }
  throw new Error(`unknown scoreKey: ${key}`);
}

function parseComponents(json) {
  try { return JSON.parse(json); } catch (_) { return null; }
}

// Radar tokens are usually absent from the main-DB market_snapshot, so their "highest 5m volume" baseline reads the raw
// 5m volume stored with the score (taken from the market snapshot the features came from, i.e. known at signal time).
function radarVolume(row) {
  if (!String(row.model_version || '').startsWith('radar-')) return null;
  const c = parseComponents(row.component_scores);
  const v = c && c.features ? c.features.vol_m5 : null;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function loadPairs(db, { modelVersion, horizonMin = 60, scoreKey = 'composite_score', volumeTolSec = 600,
  sinceTs = null, untilTs = null } = {}) {
  const scoreFn = makeScoreFn(scoreKey);
  const where = ['o.horizon_min = ?', 'o.forward_return IS NOT NULL'];
  const args = [volumeTolSec, horizonMin];
  if (modelVersion) { where.push('s.model_version = ?'); args.push(modelVersion); }
  if (sinceTs != null) { where.push('s.as_of_ts >= ?'); args.push(sinceTs); }
  if (untilTs != null) { where.push('s.as_of_ts <= ?'); args.push(untilTs); }
  const rows = db.prepare(`
    SELECT s.signal_id, s.token_id, s.as_of_ts, s.model_version, s.component_scores, s.composite_score,
           o.forward_return, o.max_drawdown, o.max_runup, o.status,
           (SELECT m.volume_5m FROM market_snapshot m
             WHERE m.token_id = s.token_id AND m.ts <= s.as_of_ts AND m.ts >= s.as_of_ts - ?
             ORDER BY m.ts DESC LIMIT 1) AS volume_5m
    FROM signal_snapshot s
    JOIN outcome_window o ON o.signal_snapshot_id = s.signal_id
    WHERE ${where.join(' AND ')}
    ORDER BY s.as_of_ts ASC`).all(...args);
  const needComps = typeof scoreKey === 'function' || String(scoreKey).startsWith('component:');
  const out = [];
  for (const r of rows) {
    const comps = needComps ? parseComponents(r.component_scores) : null;
    const score = scoreFn(r, comps);
    if (score == null || !Number.isFinite(Number(score))) continue;
    out.push({
      signal_id: r.signal_id, token_id: r.token_id, as_of_ts: r.as_of_ts, score: Number(score),
      forward_return: r.forward_return, max_drawdown: r.max_drawdown, max_runup: r.max_runup,
      volume_5m: r.volume_5m != null ? r.volume_5m : radarVolume(r), dead: r.status === 'dead',
    });
  }
  return out;
}

/** Distinct model versions present in signal_snapshot with signal counts. */
function listModelVersions(db) {
  return db.prepare(`SELECT model_version, COUNT(*) AS n, MIN(as_of_ts) AS first_ts, MAX(as_of_ts) AS last_ts
                     FROM signal_snapshot GROUP BY model_version ORDER BY n DESC`).all();
}

/** Component names seen in the most recent signals of a model (for ablation). */
function listComponents(db, modelVersion, sample = 200) {
  const rows = db.prepare(`SELECT component_scores FROM signal_snapshot WHERE model_version = ?
                           ORDER BY signal_id DESC LIMIT ?`).all(modelVersion, sample);
  const names = new Set();
  for (const r of rows) {
    const c = parseComponents(r.component_scores);
    if (!c) continue;
    for (const [k, v] of Object.entries(c)) {
      if (typeof v === 'number' || (v && typeof v.score === 'number')) names.add(k);
    }
  }
  names.delete('confidence');
  return [...names].sort();
}

module.exports = { loadPairs, listModelVersions, listComponents, makeScoreFn };
