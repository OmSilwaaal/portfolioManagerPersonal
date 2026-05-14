const express = require('express');
const router = express.Router();

const MACRO_EVENTS = [
  {
    id: 'fed-jun-2026',
    date: '2026-06-11',
    event: 'Federal Reserve Interest Rate Decision',
    category: 'Central Bank',
    importance: 'High',
    aiBlurb:
      'The Fed may hold rates steady or cut by 0.25%. A cut would likely boost stocks and weaken the dollar.',
  },
  {
    id: 'cpi-may-2026',
    date: '2026-05-28',
    event: 'US CPI Inflation Report (May)',
    category: 'Economic Data',
    importance: 'High',
    aiBlurb:
      'If inflation comes in below expectations, markets may rally on hopes of faster rate cuts.',
  },
  {
    id: 'jobs-may-2026',
    date: '2026-06-05',
    event: 'US Non-Farm Payrolls (May)',
    category: 'Economic Data',
    importance: 'High',
    aiBlurb:
      'Strong jobs data could push back Fed cut expectations; weak data might accelerate them.',
  },
  {
    id: 'nvda-earnings-q1-2026',
    date: '2026-05-28',
    event: 'NVIDIA Q1 2026 Earnings',
    category: 'Earnings',
    importance: 'High',
    ticker: 'NVDA',
    aiBlurb:
      'NVIDIA earnings are a key read on AI chip demand. A beat could lift the entire tech sector.',
  },
  {
    id: 'gdp-q1-2026',
    date: '2026-05-29',
    event: 'US GDP Q1 2026 (Revised)',
    category: 'Economic Data',
    importance: 'Medium',
    aiBlurb:
      'Revised GDP figures will confirm whether the US economy grew or contracted in early 2026.',
  },
  {
    id: 'aapl-wwdc-2026',
    date: '2026-06-09',
    event: 'Apple WWDC 2026',
    category: 'Company Event',
    importance: 'Medium',
    ticker: 'AAPL',
    aiBlurb:
      'Apple developers conference where new software and AI features are typically announced.',
  },
  {
    id: 'ecb-jun-2026',
    date: '2026-06-05',
    event: 'European Central Bank Rate Decision',
    category: 'Central Bank',
    importance: 'Medium',
    aiBlurb:
      'ECB policy affects global currency markets and European equities. A rate cut could weaken the euro.',
  },
  {
    id: 'msft-earnings-q3-2026',
    date: '2026-06-18',
    event: 'Microsoft Q3 2026 Earnings',
    category: 'Earnings',
    importance: 'High',
    ticker: 'MSFT',
    aiBlurb:
      "Microsoft's Azure cloud growth will be closely watched as a bellwether for enterprise AI spending.",
  },
];

router.get('/', (req, res) => {
  const now = new Date();
  const events = MACRO_EVENTS
    .filter((e) => new Date(e.date) >= now)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  res.json({ events });
});

module.exports = router;
