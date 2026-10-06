const collector = require('./collector');

// Opt-in so local dev and tests never start hitting external APIs by accident.
function startRadar() {
  if (process.env.ENABLE_RADAR !== 'true') return;
  collector.start();
}

module.exports = { startRadar };
