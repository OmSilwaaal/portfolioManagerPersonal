export const COMMITTEE_INDUSTRY_MAP = {
  defense: ['Armed Services', 'Appropriations - Defense'],
  tech: ['Commerce, Science, and Transportation', 'Science, Space, and Technology'],
  finance: ['Banking, Housing, and Urban Affairs', 'Financial Services'],
  health: ['Health, Education, Labor, and Pensions', 'Energy and Commerce - Health'],
  energy: ['Energy and Natural Resources', 'Environment and Public Works'],
}

// Simple ticker-to-industry mapping
const TICKER_INDUSTRY_MAP = {
  // Defense
  LMT: 'defense', RTX: 'defense', NOC: 'defense', BA: 'defense', GD: 'defense', HII: 'defense',
  // Tech
  AAPL: 'tech', MSFT: 'tech', GOOGL: 'tech', META: 'tech', AMZN: 'tech', NVDA: 'tech',
  TSLA: 'tech', AMD: 'tech', INTC: 'tech', CRM: 'tech', ORCL: 'tech',
  // Finance
  JPM: 'finance', GS: 'finance', BAC: 'finance', MS: 'finance', WFC: 'finance',
  BLK: 'finance', C: 'finance', AXP: 'finance', V: 'finance', MA: 'finance',
  // Health
  JNJ: 'health', PFE: 'health', MRK: 'health', ABBV: 'health', BMY: 'health',
  LLY: 'health', UNH: 'health', CVS: 'health', AMGN: 'health', GILD: 'health',
  // Energy
  XOM: 'energy', CVX: 'energy', COP: 'energy', SLB: 'energy', EOG: 'energy',
  OXY: 'energy', MPC: 'energy', VLO: 'energy', PSX: 'energy',
}

// Known committee memberships (simplified — in production this would be a full DB)
const OFFICIAL_COMMITTEES = {
  'Jack Reed': ['Armed Services'],
  'Jim Inhofe': ['Armed Services'],
  'Mark Warner': ['Banking, Housing, and Urban Affairs', 'Finance'],
  'Maria Cantwell': ['Commerce, Science, and Transportation', 'Energy and Natural Resources'],
  'Ron Wyden': ['Finance', 'Energy and Natural Resources'],
  'Richard Burr': ['Health, Education, Labor, and Pensions'],
  'Tommy Tuberville': ['Armed Services'],
  'Sheldon Whitehouse': ['Environment and Public Works'],
}

export function detectCommitteeOverlap(officialName, ticker) {
  const industry = TICKER_INDUSTRY_MAP[ticker ? ticker.toUpperCase() : '']
  if (!industry) return false

  const relevantCommittees = COMMITTEE_INDUSTRY_MAP[industry] || []
  const officialCommittees = OFFICIAL_COMMITTEES[officialName] || []

  return officialCommittees.some((c) =>
    relevantCommittees.some((rc) => rc.toLowerCase().includes(c.toLowerCase()) || c.toLowerCase().includes(rc.toLowerCase()))
  )
}
