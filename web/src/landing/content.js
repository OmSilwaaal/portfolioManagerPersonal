// Copy for the scroll-driven landing page. Each stage is one "page" the ASCII grid resolves into.
// kind 'art'  -> a word rasterised into ASCII (with an optional caption)
// kind 'text' -> description blocks laid out as monospaced paragraphs

export const STAGES = [
  {
    kind: 'art',
    id: 'cover',
    label: 'COVER',
    lines: ['TRAVAUX'],
    linesNarrow: ['TRA', 'VAUX'],
    logo: true,
    caption: ['THE MARKET, EXPLAINED.', 'AI news · portfolio impact · upside picks · gov trades · commodities · crypto intel. All in plain English.'],
    hint: 'SCROLL ↓',
  },
  {
    kind: 'text',
    id: 'premise',
    label: 'PREMISE',
    blocks: [
      {
        h: 'THE MARKET, EXPLAINED.',
        art: 'globe',
        tag: 'AN ARCHIVE OF THE PRESENT',
        p: 'Travauxus reads the news so you do not have to. Every story is scored, tied back to what you actually own, and written in plain English. You see what matters before the market has finished reacting.',
      },
    ],
  },
  {
    kind: 'text',
    id: 'feed',
    label: 'NEWS & IMPACT',
    blocks: [
      {
        h: '01 — AI NEWS FEED',
        art: 'bars',
        tag: 'DAILY · AI-SCORED',
        p: 'Every story scored Act Now, Watch, or Low. Know which news actually moves your holdings before the market reacts.',
      },
      {
        h: '02 — PORTFOLIO IMPACT',
        art: 'chart',
        tag: 'PLAIN ENGLISH',
        p: 'Every headline translated into real dollars for your portfolio. No jargon — just what it means for what you own.',
      },
    ],
  },
  {
    kind: 'text',
    id: 'picks',
    label: 'PICKS & POLITICS',
    blocks: [
      {
        h: '03 — UPSIDE PICKS',
        art: 'arrow',
        tag: 'OPPORTUNITY',
        p: 'Stocks with near-term catalysts surfaced daily. News-driven upside you can act on before the crowd catches up.',
      },
      {
        h: '04 — GOV TRADES',
        art: 'dome',
        tag: 'STOCK ACT',
        p: "Congressional stock trades the moment they're disclosed. See what senators and representatives are actually buying.",
      },
    ],
  },
  {
    kind: 'text',
    id: 'macro',
    label: 'MACRO & CRYPTO',
    blocks: [
      {
        h: '05 — COMMODITIES',
        art: 'ingots',
        tag: 'MACRO',
        p: 'Gold, crude oil, gas, wheat — with AI-generated context on why prices are moving today, not just the number.',
      },
      {
        h: '06 — CRYPTO INTEL',
        art: 'hex',
        tag: 'ON-CHAIN',
        p: 'Crypto news decoded with the same plain-English scoring as stocks. Know when on-chain moves are signal, not noise.',
      },
    ],
  },
  {
    kind: 'art',
    id: 'begin',
    label: 'BEGIN',
    lines: ['BEGIN.'],
    reserveBottom: 12,
    caption: ['FREE TIER AVAILABLE · PRO FROM $12/MO'],
  },
]

export const WRAP_TEXT =
  'TRAVAUXUS // THE MARKET, EXPLAINED // AI NEWS // PORTFOLIO IMPACT // UPSIDE PICKS // GOV TRADES // COMMODITIES // CRYPTO INTEL // '
