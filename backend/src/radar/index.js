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

module.exports = { startRadar };
