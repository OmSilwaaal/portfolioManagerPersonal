import { useState } from 'react'

export const GLOSSARY = {
  "P/E Ratio": "How many years of profit you're paying for. A P/E of 20 means you pay $20 for every $1 of yearly profit. Lower can mean cheaper.",
  "Market Cap": "The total value of a company. Share price × total shares. Apple's market cap is ~$3 trillion.",
  "EPS": "Earnings Per Share — how much profit the company made per share last year.",
  "Dividend": "Cash the company pays you just for owning the stock, usually every 3 months.",
  "Volume": "How many shares were bought and sold today. High volume = lots of interest.",
  "52-Week High": "The highest price the stock has reached in the past year.",
  "52-Week Low": "The lowest price the stock has reached in the past year.",
  "Bull Market": "When stock prices are generally rising and people feel optimistic.",
  "Bear Market": "When stock prices are falling 20%+ from recent highs. People feel pessimistic.",
  "Volatility": "How wildly the price swings up and down. High volatility = bigger swings, more risk.",
  "Liquidity": "How easy it is to buy or sell a stock quickly without affecting the price.",
  "Short Selling": "Betting that a stock will go down in price. You borrow shares, sell them, and hope to buy them back cheaper later.",
  "ETF": "Exchange-Traded Fund — a basket of many stocks you can buy as one share. Like buying a slice of 500 companies at once.",
  "IPO": "Initial Public Offering — when a private company sells shares to the public for the first time.",
  "Market Order": "Buy or sell immediately at whatever the current price is.",
  "Limit Order": "Buy or sell only if the price reaches a specific level you set.",
  "Portfolio": "All the investments you own put together.",
  "Yield": "The annual income from an investment shown as a percentage. A 3% yield on a $100 stock pays you $3/year.",
  "RSI": "Relative Strength Index — a 0-100 score. Above 70 = possibly overbought (expensive), below 30 = possibly oversold (cheap).",
  "Moving Average": "The average price over the past X days. Smooths out daily noise to show the real trend.",
  "Support Level": "A price the stock keeps bouncing back up from. Like a floor.",
  "Resistance Level": "A price the stock keeps struggling to break above. Like a ceiling.",
  "Hedge": "An investment made to reduce risk on another investment. Like insurance.",
  "Index Fund": "A fund that tracks a market index like the S&P 500. Owns a tiny piece of every company in the index.",
  "Blue Chip": "Stock of a large, well-established, financially stable company with a long track record.",
  "Bullish": "Expecting prices to rise. A bullish investor believes a stock or market will go up.",
  "Bearish": "Expecting prices to fall. A bearish investor believes a stock or market will go down.",
  "24h Volume": "Total amount of a cryptocurrency bought and sold in the last 24 hours. High volume means lots of trading activity.",
  "Related ETFs": "Exchange-Traded Funds that track a basket of stocks related to this commodity or sector.",
}

const popupStyle = {
  background: 'var(--ink-800)',
  border: '1px solid var(--on-ink-3)',
}

export default function JargonTooltip({ children, term }) {
  const [visible, setVisible] = useState(false)
  const definition = term ? GLOSSARY[term] : null

  if (!definition) {
    return <>{children}</>
  }

  return (
    <span style={{ position: 'relative', display: 'inline' }}>
      <span
        style={{
          borderBottom: '1px dotted rgba(255,255,255,0.35)',
          cursor: 'help',
        }}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        onTouchStart={() => setVisible((v) => !v)}
        tabIndex={0}
      >
        {children}
      </span>

      {visible && (
        <span
          style={{
            ...popupStyle,
            position: 'absolute',
            bottom: 'calc(100% + 8px)',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 50,
            width: '280px',
            maxWidth: '90vw',
            borderRadius: '12px',
            padding: '10px 12px',
            pointerEvents: 'none',
            display: 'block',
          }}
        >
          <span
            style={{
              display: 'block',
              color: 'rgba(255,255,255,0.80)',
              fontWeight: '600',
              fontSize: '0.8rem',
              marginBottom: '4px',
            }}
          >
            {term}
          </span>
          <span
            style={{
              display: 'block',
              color: 'rgba(255,255,255,0.55)',
              fontSize: '0.75rem',
              lineHeight: '1.4',
            }}
          >
            {definition}
          </span>
        </span>
      )}
    </span>
  )
}
