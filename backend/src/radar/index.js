const collector = require('./collector');
const security = require('./security');

// Opt-in so local dev and tests never start hitting external APIs by accident.
function startRadar() {
  if (process.env.ENABLE_RADAR !== 'true') return;
  collector.start();
  security.start();
}

module.exports = { startRadar };
