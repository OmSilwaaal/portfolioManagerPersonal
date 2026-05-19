// Inline SVG icons for commodity types — no external dependency needed

const ICONS = {
  // ── Energy ───────────────────────────────────────────────────────────────
  CL1: { label: 'Crude Oil', color: '#64748b', bg: '#1e293b',
    svg: <path d="M12 2C12 2 5 10 5 15.5a7 7 0 0 0 14 0C19 10 12 2 12 2z" fill="currentColor" opacity="0.85"/>
  },
  NG1: { label: 'Natural Gas', color: '#60a5fa', bg: '#1e3a5f',
    svg: <>
      <path d="M12 2c-3 4-5 8-3 12s1 6-1 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none"/>
      <path d="M16 6c-2 3-3 6-2 9s0 4-1 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.6"/>
    </>
  },
  HO1: { label: 'Heating Oil', color: '#f97316', bg: '#2c1a0e',
    svg: <><path d="M12 2C12 2 5 10 5 15.5a7 7 0 0 0 14 0C19 10 12 2 12 2z" fill="currentColor" opacity="0.7"/><path d="M12 8c0 0-3 5-1 8" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/></>
  },
  RB1: { label: 'Gasoline', color: '#a78bfa', bg: '#1e1b4b',
    svg: <><rect x="8" y="14" width="8" height="6" rx="1" fill="currentColor" opacity="0.8"/><path d="M8 14V8a4 4 0 0 1 8 0v6" fill="currentColor" opacity="0.5"/><path d="M14 4v2" stroke="white" strokeWidth="1.5" strokeLinecap="round"/><rect x="12" y="3" width="4" height="2" rx="1" fill="white" opacity="0.6"/></>
  },

  // ── Metals ───────────────────────────────────────────────────────────────
  GC1: { label: 'Gold', color: '#f59e0b', bg: '#2c1f00',
    svg: <><rect x="5" y="10" width="14" height="8" rx="2" fill="currentColor"/><path d="M7 10L9 6h6l2 4" fill="currentColor" opacity="0.6"/><line x1="9" y1="13" x2="15" y2="13" stroke="white" strokeWidth="0.75" opacity="0.4"/><line x1="9" y1="15" x2="15" y2="15" stroke="white" strokeWidth="0.75" opacity="0.4"/></>
  },
  SI1: { label: 'Silver', color: '#94a3b8', bg: '#1a2433',
    svg: <><rect x="5" y="10" width="14" height="8" rx="2" fill="currentColor"/><path d="M7 10L9 6h6l2 4" fill="currentColor" opacity="0.5"/><line x1="9" y1="13" x2="15" y2="13" stroke="white" strokeWidth="0.75" opacity="0.4"/><line x1="9" y1="15" x2="15" y2="15" stroke="white" strokeWidth="0.75" opacity="0.4"/></>
  },
  HG1: { label: 'Copper', color: '#b45309', bg: '#1c0e00',
    svg: <><circle cx="12" cy="12" r="5" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="none" stroke="white" strokeWidth="0.75" opacity="0.4"/><path d="M12 7v2M12 15v2M7 12h2M15 12h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/></>
  },
  PL1: { label: 'Platinum', color: '#e2e8f0', bg: '#1a1f2e',
    svg: <><rect x="5" y="10" width="14" height="8" rx="2" fill="currentColor" opacity="0.9"/><path d="M7 10L9 6h6l2 4" fill="currentColor" opacity="0.4"/></>
  },
  PA1: { label: 'Palladium', color: '#c4b5fd', bg: '#1a1040',
    svg: <><circle cx="12" cy="12" r="6" fill="currentColor" opacity="0.8"/><path d="M9 12h6M12 9v6" stroke="white" strokeWidth="1" strokeLinecap="round" opacity="0.4"/></>
  },

  // ── Agriculture ──────────────────────────────────────────────────────────
  ZW1: { label: 'Wheat', color: '#d97706', bg: '#1c1200',
    svg: <><path d="M12 20V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M12 8c-2-2-4-1-4 1s2 2 4 0" fill="currentColor" opacity="0.8"/><path d="M12 12c-2-2-4-1-4 1s2 2 4 0" fill="currentColor" opacity="0.7"/><path d="M12 8c2-2 4-1 4 1s-2 2-4 0" fill="currentColor"/><path d="M12 12c2-2 4-1 4 1s-2 2-4 0" fill="currentColor" opacity="0.9"/><path d="M12 16c2-2 4-1 4 1s-2 2-4 0" fill="currentColor" opacity="0.6"/><path d="M12 16c-2-2-4-1-4 1s2 2 4 0" fill="currentColor" opacity="0.5"/></>
  },
  ZC1: { label: 'Corn', color: '#eab308', bg: '#1a1400',
    svg: <><ellipse cx="12" cy="13" rx="4" ry="6" fill="currentColor" opacity="0.85"/><path d="M12 7C10 5 8 6 9 8" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/><path d="M12 7C14 5 16 6 15 8" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/><circle cx="10.5" cy="11" r="0.6" fill="white" opacity="0.5"/><circle cx="12" cy="10.5" r="0.6" fill="white" opacity="0.5"/><circle cx="13.5" cy="11" r="0.6" fill="white" opacity="0.5"/><circle cx="10.5" cy="13" r="0.6" fill="white" opacity="0.5"/><circle cx="12" cy="12.5" r="0.6" fill="white" opacity="0.5"/><circle cx="13.5" cy="13" r="0.6" fill="white" opacity="0.5"/></>
  },
  ZS1: { label: 'Soybeans', color: '#65a30d', bg: '#0f1a00',
    svg: <><ellipse cx="9" cy="13" rx="3" ry="4" fill="currentColor" opacity="0.8"/><ellipse cx="15" cy="13" rx="3" ry="4" fill="currentColor" opacity="0.8"/><ellipse cx="12" cy="11" rx="3" ry="4" fill="currentColor"/><path d="M12 7C12 7 10 4 12 2" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.6"/></>
  },
  KC1: { label: 'Coffee', color: '#92400e', bg: '#1a0a00',
    svg: <><ellipse cx="12" cy="14" rx="6" ry="4" fill="currentColor" opacity="0.8"/><path d="M12 10V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/><path d="M9 8c0-2 2-4 3-4s3 2 3 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.5"/><path d="M17 12c1 0 2 1 2 2s-1 2-2 2" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.6"/></>
  },
  SB1: { label: 'Sugar', color: '#f9a8d4', bg: '#200010',
    svg: <><rect x="7" y="9" width="10" height="7" rx="2" fill="currentColor" opacity="0.8"/><rect x="9" y="7" width="6" height="3" rx="1" fill="currentColor" opacity="0.5"/><line x1="10" y1="12" x2="14" y2="12" stroke="white" strokeWidth="0.75" opacity="0.4"/><line x1="10" y1="14" x2="14" y2="14" stroke="white" strokeWidth="0.75" opacity="0.4"/></>
  },
  CT1: { label: 'Cotton', color: '#f1f5f9', bg: '#1a1a2e',
    svg: <><circle cx="12" cy="12" r="4" fill="currentColor" opacity="0.9"/><path d="M12 8V5M12 19v-3M8 12H5M19 12h-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.5"/><circle cx="12" cy="12" r="1.5" fill="none" stroke="rgba(0,0,0,0.2)" strokeWidth="1"/></>
  },
  OJ1: { label: 'Orange Juice', color: '#fb923c', bg: '#1c0e00',
    svg: <><circle cx="12" cy="13" r="5" fill="currentColor" opacity="0.85"/><path d="M12 8V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M12 6c1-2 3-2 3-2" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.5"/><line x1="12" y1="13" x2="15" y2="11" stroke="white" strokeWidth="0.7" opacity="0.3"/><line x1="12" y1="13" x2="9" y2="11" stroke="white" strokeWidth="0.7" opacity="0.3"/><line x1="12" y1="13" x2="12" y2="10" stroke="white" strokeWidth="0.7" opacity="0.3"/></>
  },
  LE1: { label: 'Live Cattle', color: '#92400e', bg: '#1a0a00',
    svg: <><ellipse cx="12" cy="14" rx="7" ry="5" fill="currentColor" opacity="0.7"/><path d="M8 9c0-3 2-5 4-5s4 2 4 5" fill="currentColor" opacity="0.5"/><path d="M7 9L5 7M17 9l2-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></>
  },
  HE1: { label: 'Lean Hogs', color: '#f9a8d4', bg: '#1a0010',
    svg: <><ellipse cx="12" cy="14" rx="6" ry="4" fill="currentColor" opacity="0.8"/><circle cx="12" cy="10" r="3" fill="currentColor" opacity="0.9"/><circle cx="10.5" cy="9.5" r="0.8" fill="white" opacity="0.5"/><circle cx="13.5" cy="9.5" r="0.8" fill="white" opacity="0.5"/></>
  },
  LBS1: { label: 'Lumber', color: '#92400e', bg: '#1c0e00',
    svg: <><rect x="4" y="9" width="16" height="3" rx="1" fill="currentColor" opacity="0.9"/><rect x="4" y="13" width="16" height="3" rx="1" fill="currentColor" opacity="0.7"/><rect x="4" y="5" width="16" height="3" rx="1" fill="currentColor" opacity="0.5"/></>
  },
  ZO1: { label: 'Oats', color: '#d97706', bg: '#1a0e00',
    svg: <><ellipse cx="12" cy="14" rx="3" ry="5" fill="currentColor" opacity="0.8"/><path d="M12 9V5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M9 8c0-2 1.5-4 3-4s3 2 3 4" stroke="currentColor" strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.5"/></>
  },
  ZR1: { label: 'Rough Rice', color: '#fef08a', bg: '#1a1400',
    svg: <><ellipse cx="9" cy="13" rx="2.5" ry="4" fill="currentColor" opacity="0.8"/><ellipse cx="15" cy="13" rx="2.5" ry="4" fill="currentColor" opacity="0.8"/><ellipse cx="12" cy="11" rx="2.5" ry="4" fill="currentColor"/><path d="M12 7V5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/></>
  },
  CC1: { label: 'Cocoa', color: '#92400e', bg: '#150800',
    svg: <><path d="M12 4c-4 0-7 3-7 7s3 7 7 7 7-3 7-7-3-7-7-7z" fill="currentColor" opacity="0.7"/><path d="M9 11c1-2 2-3 3-3s2 1 3 3" stroke="white" strokeWidth="0.75" fill="none" opacity="0.4"/></>
  },
}

const SYMBOL_ALIASES = {
  WTI: 'CL1', BRENT: 'CL1',
  GOLD: 'GC1', SILVER: 'SI1',
  NATURAL_GAS: 'NG1',
  COPPER: 'HG1',
  WHEAT: 'ZW1', CORN: 'ZC1', SOYBEANS: 'ZS1',
  COFFEE: 'KC1', SUGAR: 'SB1', COTTON: 'CT1',
  COCOA: 'CC1', CC1: 'CC1',
  PLATINUM: 'PL1', PALLADIUM: 'PA1',
  HO1: 'HO1', RB1: 'RB1', OJ1: 'OJ1',
}

// Generic fallbacks by sector
const SECTOR_FALLBACKS = {
  Energy: { color: '#64748b', bg: '#1e293b',
    svg: <path d="M12 2C12 2 5 10 5 15.5a7 7 0 0 0 14 0C19 10 12 2 12 2z" fill="currentColor" opacity="0.85"/>
  },
  Metals: { color: '#94a3b8', bg: '#1a2433',
    svg: <><rect x="5" y="10" width="14" height="8" rx="2" fill="currentColor"/><path d="M7 10L9 6h6l2 4" fill="currentColor" opacity="0.5"/></>
  },
  Agriculture: { color: '#65a30d', bg: '#0f1a00',
    svg: <><path d="M12 20V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M12 8c-2-2-4-1-4 1s2 2 4 0" fill="currentColor"/><path d="M12 8c2-2 4-1 4 1s-2 2-4 0" fill="currentColor" opacity="0.8"/><path d="M12 12c2-2 4-1 4 1s-2 2-4 0" fill="currentColor" opacity="0.6"/></>
  },
  Other: { color: '#6b7280', bg: '#1a1a1a',
    svg: <circle cx="12" cy="12" r="6" fill="currentColor" opacity="0.7"/>
  },
}

export default function CommodityIcon({ symbol, sector = 'Other', size = 40, className = '' }) {
  const resolvedSymbol = SYMBOL_ALIASES[symbol] || symbol
  const icon = ICONS[resolvedSymbol] || SECTOR_FALLBACKS[sector] || SECTOR_FALLBACKS.Other

  return (
    <div
      className={`flex items-center justify-center rounded-xl flex-shrink-0 ${className}`}
      style={{ width: size, height: size, background: icon.bg }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size * 0.55}
        height={size * 0.55}
        viewBox="0 0 24 24"
        style={{ color: icon.color }}
      >
        {icon.svg}
      </svg>
    </div>
  )
}
