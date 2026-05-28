import { useState, useRef, useCallback } from 'react'
import { useSelector } from 'react-redux'
import { Link } from 'react-router-dom'
import {
  useGetSnaptradeStatusQuery,
  useGetSnaptradeHoldingsQuery,
  useGetSnaptradeAccountsQuery,
  useRegisterSnaptradeMutation,
  useDisconnectSnaptradeMutation,
  useGetCsvPositionsQuery,
  useSaveCsvPositionsMutation,
  useDeleteCsvPositionsMutation,
} from '../api/snaptradeApi'

const INK8   = 'var(--ink-800)'
const BORDER = 'var(--on-ink-border)'
const CREAM  = 'var(--paper)'
const MUTED  = 'var(--on-ink-text-3)'
const DIM    = 'var(--on-ink-text-4)'

// ── CSV parser ─────────────────────────────────────────────────────────────────

const HEADER_MAP = {
  ticker:      ['symbol', 'ticker', 'instrument', 'stock'],
  quantity:    ['quantity', 'qty', 'shares', 'units', 'open qty', 'position'],
  avg_cost:    ['average cost', 'avg cost', 'avg price', 'average cost basis', 'cost basis per share', 'avg entry price', 'price paid'],
  price:       ['current price', 'last price', 'mark price', 'price', 'last'],
  market_value:['market value', 'mkt value', 'current value', 'equity', 'fair value', 'total value'],
}

function normalizeHeader(h) {
  return h.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()
}

function detectColumn(headers, candidates) {
  for (const c of candidates) {
    const idx = headers.findIndex((h) => normalizeHeader(h) === c)
    if (idx !== -1) return idx
  }
  return -1
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) throw new Error('File appears empty or has only one row')

  // Find header row (first row with recognisable column names)
  let headerIdx = 0
  let headers = []
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const cols = lines[i].split(',').map((c) => c.replace(/^"|"$/g, '').trim())
    if (cols.some((c) => HEADER_MAP.ticker.includes(normalizeHeader(c)))) {
      headers = cols
      headerIdx = i
      break
    }
  }
  if (!headers.length) throw new Error('Could not find a Symbol/Ticker column. Make sure you exported positions, not transactions.')

  const col = {
    ticker:       detectColumn(headers, HEADER_MAP.ticker),
    quantity:     detectColumn(headers, HEADER_MAP.quantity),
    avg_cost:     detectColumn(headers, HEADER_MAP.avg_cost),
    price:        detectColumn(headers, HEADER_MAP.price),
    market_value: detectColumn(headers, HEADER_MAP.market_value),
  }

  const toNum = (v) => {
    if (v == null || v === '' || v === '--' || v === 'N/A') return null
    const n = parseFloat(String(v).replace(/[$,%]/g, ''))
    return isNaN(n) ? null : n
  }

  const positions = []
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cells = lines[i].split(',').map((c) => c.replace(/^"|"$/g, '').trim())
    if (!cells.length || cells.every((c) => !c)) continue
    const ticker = col.ticker !== -1 ? cells[col.ticker]?.toUpperCase() : null
    if (!ticker || ticker.length > 10 || /^\d/.test(ticker)) continue
    positions.push({
      ticker,
      quantity:     col.quantity     !== -1 ? toNum(cells[col.quantity])     : null,
      avg_cost:     col.avg_cost     !== -1 ? toNum(cells[col.avg_cost])     : null,
      price:        col.price        !== -1 ? toNum(cells[col.price])        : null,
      market_value: col.market_value !== -1 ? toNum(cells[col.market_value]) : null,
    })
  }
  if (!positions.length) throw new Error('No valid positions found in the file.')
  return positions
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600, letterSpacing: '0.24em', textTransform: 'uppercase', color: DIM, marginBottom: 10 }}>
      {children}
    </p>
  )
}

function HoldingRow({ ticker, description, quantity, price, avgCost, value }) {
  const gainPct = price != null && avgCost != null && avgCost > 0
    ? ((price - avgCost) / avgCost) * 100
    : null
  const pos = gainPct == null || gainPct >= 0

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 64px 80px 88px 60px', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${BORDER}`, gap: 8 }}>
      <div style={{ minWidth: 0 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: CREAM, letterSpacing: '0.04em' }}>{ticker}</span>
        {description && <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: DIM, marginLeft: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{description}</span>}
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: MUTED, textAlign: 'right' }}>
        {quantity != null ? quantity.toLocaleString(undefined, { maximumFractionDigits: 4 }) : '—'}
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--on-ink-text-2)', textAlign: 'right' }}>
        {price != null ? `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--on-ink-text-2)', textAlign: 'right' }}>
        {value != null ? `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: gainPct == null ? DIM : pos ? 'var(--positive)' : 'var(--negative)', textAlign: 'right' }}>
        {gainPct == null ? '—' : `${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(1)}%`}
      </span>
    </div>
  )
}

function TableHeader() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 64px 80px 88px 60px', padding: '7px 0', borderBottom: `1px solid ${BORDER}`, gap: 8 }}>
      {['Symbol', 'Qty', 'Price', 'Value', 'Gain%'].map((h, i) => (
        <span key={h} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: DIM, textAlign: i > 0 ? 'right' : 'left' }}>{h}</span>
      ))}
    </div>
  )
}

function AccountBlock({ title, subtitle, totalValue, currency, positions, onRemove }) {
  return (
    <div style={{ background: INK8, border: `1px solid ${BORDER}`, borderRadius: 'var(--r-md)', overflow: 'hidden', marginBottom: 14 }}>
      <div style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: MUTED, marginBottom: 2 }}>{title}</p>
          {subtitle && <p style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: DIM }}>{subtitle}</p>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {totalValue != null && (
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 17, fontWeight: 700, color: CREAM }}>
                ${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              {currency && <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: DIM }}>{currency}</p>}
            </div>
          )}
          {onRemove && (
            <button onClick={onRemove} title="Remove" style={{ background: 'transparent', border: 0, cursor: 'pointer', color: DIM, padding: 4, lineHeight: 1 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          )}
        </div>
      </div>
      {positions.length > 0 ? (
        <div style={{ padding: '0 20px' }}>
          <TableHeader />
          {positions.map((p, i) => <HoldingRow key={i} {...p} />)}
        </div>
      ) : (
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: DIM, padding: '14px 20px' }}>No positions found.</p>
      )}
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {[1, 2].map((i) => (
        <div key={i} style={{ background: INK8, border: `1px solid ${BORDER}`, borderRadius: 'var(--r-md)', padding: 20 }}>
          <div className="animate-pulse">
            <div style={{ height: 10, width: 120, background: 'var(--on-ink-2)', borderRadius: 2, marginBottom: 10 }} />
            <div style={{ height: 13, width: '60%', background: 'var(--on-ink-1)', borderRadius: 2, marginBottom: 6 }} />
            <div style={{ height: 13, width: '40%', background: 'var(--on-ink-1)', borderRadius: 2 }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function DropZone({ onFile, importing, error }) {
  const inputRef = useRef()
  const [dragging, setDragging] = useState(false)

  const handle = useCallback((file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => onFile(e.target.result, file.name)
    reader.readAsText(file)
  }, [onFile])

  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    handle(e.dataTransfer.files[0])
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      style={{
        border: `1.5px dashed ${dragging ? 'var(--on-ink-text-2)' : BORDER}`,
        borderRadius: 'var(--r-md)',
        padding: '28px 24px',
        textAlign: 'center',
        cursor: 'pointer',
        background: dragging ? 'var(--on-ink-1)' : 'transparent',
        transition: 'all 150ms',
      }}
    >
      <input ref={inputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={(e) => handle(e.target.files[0])} />
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 10px', display: 'block' }}>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="17 8 12 3 7 8"/>
        <line x1="12" y1="3" x2="12" y2="15"/>
      </svg>
      <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: importing ? MUTED : CREAM, marginBottom: 4 }}>
        {importing ? 'Importing…' : 'Drop CSV file here, or click to browse'}
      </p>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: DIM, letterSpacing: '0.08em' }}>
        Supports Robinhood · Fidelity · Schwab · IBKR · Questrade · TD
      </p>
      {error && <p style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--negative)', marginTop: 10 }}>{error}</p>}
    </div>
  )
}

// ── ProGate inline (no blur on the whole page — just gate the content) ─────────
function PortfolioProGate({ children }) {
  const isPro = useSelector((s) => s.preferences.isPro)
  if (isPro) return <>{children}</>
  return (
    <div style={{ background: INK8, border: `1px solid ${BORDER}`, borderRadius: 'var(--r-md)', padding: '48px 32px', textAlign: 'center' }}>
      <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--on-ink-2)', border: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      </div>
      <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 16, fontWeight: 600, color: CREAM, marginBottom: 6 }}>Pro feature</h2>
      <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: MUTED, lineHeight: 1.6, maxWidth: 320, margin: '0 auto 24px' }}>
        Connect your brokerage or import positions via CSV with a Travauxus Pro subscription.
      </p>
      <Link
        to="/pricing"
        style={{ display: 'inline-block', background: CREAM, color: '#0a0a0a', fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700, padding: '10px 24px', borderRadius: '999px', textDecoration: 'none' }}
      >
        Upgrade to Pro
      </Link>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function Portfolio() {
  const isPro = useSelector((s) => s.preferences.isPro)

  const [connecting, setConnecting]   = useState(false)
  const [connectError, setConnectError] = useState(null)
  const [csvError, setCsvError]       = useState(null)
  const [csvImporting, setCsvImporting] = useState(false)

  const { data: status, isLoading: statusLoading } = useGetSnaptradeStatusQuery(undefined, { skip: !isPro })
  const { data: holdingsData, isLoading: holdingsLoading } = useGetSnaptradeHoldingsQuery(undefined, { skip: !isPro || !status?.connected })
  const { data: accountsData, isLoading: accountsLoading } = useGetSnaptradeAccountsQuery(undefined, { skip: !isPro || !status?.connected })
  const { data: csvData, isLoading: csvLoading } = useGetCsvPositionsQuery(undefined, { skip: !isPro })

  const [registerSnaptrade]  = useRegisterSnaptradeMutation()
  const [disconnectSnaptrade] = useDisconnectSnaptradeMutation()
  const [saveCsvPositions]   = useSaveCsvPositionsMutation()
  const [deleteCsvPositions] = useDeleteCsvPositionsMutation()

  const snapAccounts  = accountsData?.accounts || []
  const snapHoldings  = holdingsData?.holdings || []
  const csvPositions  = csvData?.positions || []

  // Group CSV positions by account name
  const csvByAccount = csvPositions.reduce((acc, p) => {
    if (!acc[p.account]) acc[p.account] = []
    acc[p.account].push(p)
    return acc
  }, {})

  const snapTotalValue = snapHoldings.reduce((s, h) => s + (h.totalValue?.amount ?? 0), 0)
  const csvTotalValue  = csvPositions.reduce((s, p) => s + (p.market_value ?? (p.price ?? 0) * (p.quantity ?? 0)), 0)
  const grandTotal     = snapTotalValue + csvTotalValue

  const handleConnect = async () => {
    setConnecting(true)
    setConnectError(null)
    try {
      const result = await registerSnaptrade().unwrap()
      const uri = result.redirectURI
      if (uri) window.open(uri, '_blank', 'width=800,height=700,noopener,noreferrer')
    } catch {
      setConnectError('Failed to open connection portal. Please try again.')
    } finally {
      setConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    if (!confirm('Disconnect your brokerage accounts? This will remove all connected accounts.')) return
    await disconnectSnaptrade()
  }

  const handleCsvFile = useCallback(async (text, filename) => {
    setCsvError(null)
    setCsvImporting(true)
    try {
      const positions = parseCSV(text)
      const account = filename.replace(/\.csv$/i, '').replace(/_/g, ' ').replace(/-/g, ' ')
      await saveCsvPositions({ account, positions }).unwrap()
    } catch (err) {
      setCsvError(err.message || 'Failed to parse CSV')
    } finally {
      setCsvImporting(false)
    }
  }, [saveCsvPositions])

  const isLoading = statusLoading || holdingsLoading || accountsLoading || csvLoading
  const hasAnyData = snapAccounts.length > 0 || csvPositions.length > 0

  return (
    <main className="flex-1 p-5 md:p-8 max-w-4xl mx-auto w-full">

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: 'var(--font-sans)', fontSize: 22, fontWeight: 600, letterSpacing: '-0.022em', color: CREAM, margin: 0 }}>Portfolio</h1>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: MUTED, marginTop: 4 }}>Live positions</p>
      </div>

      <PortfolioProGate>

        {/* Grand total */}
        {grandTotal > 0 && (
          <div style={{ background: INK8, border: `1px solid ${BORDER}`, borderRadius: 'var(--r-md)', padding: '18px 22px', marginBottom: 22, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: MUTED }}>Total Portfolio</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: CREAM }}>
              ${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        )}

        {/* ── SnapTrade section ── */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <SectionLabel>Brokerage connection</SectionLabel>
            {status?.connected && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleConnect} disabled={connecting} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: MUTED, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 'var(--r-sm)', padding: '5px 10px', cursor: 'pointer', letterSpacing: '0.08em' }}>
                  Add account
                </button>
                <button onClick={handleDisconnect} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--negative)', background: 'transparent', border: '1px solid var(--negative)', borderRadius: 'var(--r-sm)', padding: '5px 10px', cursor: 'pointer', opacity: 0.7, letterSpacing: '0.08em' }}>
                  Disconnect
                </button>
              </div>
            )}
          </div>

          {statusLoading && <LoadingSkeleton />}

          {!statusLoading && !status?.connected && (
            <div style={{ background: INK8, border: `1px solid ${BORDER}`, borderRadius: 'var(--r-md)', padding: '28px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
              <div>
                <p style={{ fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 600, color: CREAM, marginBottom: 4 }}>Connect via OAuth</p>
                <p style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: MUTED, lineHeight: 1.6 }}>
                  Link Questrade, IBKR, TD, Fidelity, and more. Read-only — your credentials are never stored by us.
                </p>
                {connectError && <p style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--negative)', marginTop: 8 }}>{connectError}</p>}
              </div>
              <button
                onClick={handleConnect}
                disabled={connecting}
                style={{ flexShrink: 0, padding: '10px 20px', borderRadius: 'var(--r-sm)', border: `1px solid ${BORDER}`, background: 'var(--on-ink-2)', color: CREAM, fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', cursor: connecting ? 'not-allowed' : 'pointer', opacity: connecting ? 0.6 : 1, whiteSpace: 'nowrap' }}
              >
                {connecting ? 'Opening…' : 'Connect Brokerage'}
              </button>
            </div>
          )}

          {!statusLoading && status?.connected && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--positive)', display: 'inline-block' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: MUTED, letterSpacing: '0.1em' }}>
                  {status.brokerages?.length > 0 ? status.brokerages.join(', ') : 'Connected'}
                </span>
              </div>
              {(holdingsLoading || accountsLoading) && <LoadingSkeleton />}
              {!holdingsLoading && !accountsLoading && snapAccounts.map((account) => {
                const h = snapHoldings.find((x) => x.account?.id === account.id) ?? snapHoldings[0] ?? null
                const positions = (h?.positions || []).map((p) => ({
                  ticker:      p.symbol?.symbol ?? p.symbol?.ticker ?? p.ticker ?? '—',
                  description: p.symbol?.description ?? null,
                  quantity:    p.units ?? p.quantity ?? null,
                  price:       p.price?.amount ?? p.price ?? null,
                  avgCost:     p.average_purchase_price ?? null,
                  value:       p.price?.amount != null && (p.units ?? p.quantity) != null
                    ? (p.price?.amount ?? p.price) * (p.units ?? p.quantity)
                    : null,
                }))
                const totalValue = h?.totalValue?.amount ?? positions.reduce((s, p) => s + (p.value ?? 0), 0)
                return (
                  <AccountBlock
                    key={account.id}
                    title={account.institution_name ?? account.brokerage_authorization?.brokerage?.name ?? 'Brokerage'}
                    subtitle={account.name ?? account.number}
                    totalValue={totalValue || null}
                    currency={h?.totalValue?.currency ?? 'USD'}
                    positions={positions}
                  />
                )
              })}
            </>
          )}
        </div>

        {/* ── CSV Import section ── */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <SectionLabel>Import from CSV</SectionLabel>
            {Object.keys(csvByAccount).length > 0 && (
              <button
                onClick={() => { if (confirm('Remove all imported positions?')) deleteCsvPositions() }}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--negative)', background: 'transparent', border: '1px solid var(--negative)', borderRadius: 'var(--r-sm)', padding: '5px 10px', cursor: 'pointer', opacity: 0.7, letterSpacing: '0.08em' }}
              >
                Clear all
              </button>
            )}
          </div>

          <DropZone onFile={handleCsvFile} importing={csvImporting} error={csvError} />

          {csvLoading && <div style={{ marginTop: 14 }}><LoadingSkeleton /></div>}

          {!csvLoading && Object.entries(csvByAccount).map(([account, rows]) => {
            const totalValue = rows.reduce((s, p) => s + (p.market_value ?? (p.price ?? 0) * (p.quantity ?? 0)), 0)
            const positions = rows.map((p) => ({
              ticker:      p.ticker,
              quantity:    p.quantity,
              price:       p.price,
              avgCost:     p.avg_cost,
              value:       p.market_value ?? (p.price != null && p.quantity != null ? p.price * p.quantity : null),
            }))
            return (
              <div key={account} style={{ marginTop: 14 }}>
                <AccountBlock
                  title={account}
                  subtitle="CSV Import"
                  totalValue={totalValue > 0 ? totalValue : null}
                  positions={positions}
                  onRemove={() => deleteCsvPositions(account)}
                />
              </div>
            )
          })}

          {!csvLoading && !isLoading && !hasAnyData && csvPositions.length === 0 && (
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: DIM, textAlign: 'center', marginTop: 14, letterSpacing: '0.1em' }}>
              Export a positions CSV from your broker and drop it above
            </p>
          )}
        </div>

      </PortfolioProGate>
    </main>
  )
}
