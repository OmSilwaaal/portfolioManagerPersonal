const collector = require('./collector');
const security = require('./security');
const stream = require('./stream');
const enrich = require('./enrich');

// Opt-in so local dev and tests never start hitting external APIs by accident. All four loops run concurrently:
// the PumpPortal push stream (instant launches/graduations/trades), DexScreener snapshot polling, Rugcheck vetting,
// and promotion/metadata enrichment. None blocks another.
function startRadar() {
  if (process.env.ENABLE_RADAR !== 'true') return;
  stream.start();
  collector.start();
  security.start();
  enrich.start();
}

// Production wiring of the OPTIONAL smart-money / social feature groups (see radar/extraFeatures.js). When a research
// collector is switched on (SMART_MONEY_COLLECTOR=1 / SOCIAL_COLLECTOR=1) the matching group is enabled automatically
// with the main-db provider, for both the live scorer and the report. RADAR_EXTRA_FEATURES overrides:
//   unset/empty -> derive from the collector flags;  off|none|0|false -> disabled;  'smartmoney,social' -> explicit list.
// With a group on but no collector data yet, features are NULL (no contribution), never zero. Returns the groups enabled.
function configureExtraFeatures(env = process.env, log = console) {
  const feat = require('./features');
  const extra = require('./extraFeatures');
  const raw = String(env.RADAR_EXTRA_FEATURES || '').trim().toLowerCase();
  if (['off', 'none', '0', 'false'].includes(raw)) {
    feat.setExtraFeatureSource(null);
    log.log('[radar] extra feature groups: off (RADAR_EXTRA_FEATURES=' + raw + ')');
    return [];
  }
  const groups = raw
    ? extra.normalizeGroups(raw.split(',').map((x) => x.trim()))
    : [env.SMART_MONEY_COLLECTOR === '1' ? 'smartmoney' : null, env.SOCIAL_COLLECTOR === '1' ? 'social' : null].filter(Boolean);
  if (!groups.length) { feat.setExtraFeatureSource(null); return []; }
  feat.setExtraFeatureSource({ provider: extra.createMainDbProvider(), groups });
  log.log('[radar] extra feature groups on: ' + groups.join(', ') + ' (main-db provider; live model ' + feat.liveModelFor(groups) + ')');
  return groups;
}

module.exports = { startRadar, configureExtraFeatures };
