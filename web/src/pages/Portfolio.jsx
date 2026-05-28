import { useState } from 'react'
import {
  useGetSnaptradeStatusQuery,
  useGetSnaptradeHoldingsQuery,
  useGetSnaptradeAccountsQuery,
  useRegisterSnaptradeMutation,
  useDisconnectSnaptradeMutation,
} from '../api/snaptradeApi'

const INK8   = 'var(--ink-800)'
const BORDER = 'var(--on-ink-border)'
const CREAM  = 'var(--paper)'
const MUTED  = 'var(--on-ink-text-3)'
const DIM    = 'var(--on-ink-text-4)'

function ConnectButton({ onConnect, loading }) {
  return (
    <button
      onClick={onConnect}
      disabled={loading}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 20px',
        borderRadius: 'var(--r-sm)',
        border: `1px solid ${BORDER}`,
        background: 'var(--on-ink-2)',
        color: CREAM,
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: '0.06em',
        cursor: loading ? 'not-allowed' : 'pointer',
        opacity: loading ? 0.6 : 1,
        transition: 'all 150ms',
      }}
    >
      {loading ? 'Opening...' : 'Connect Brokerage'}
    </button>
  )
}

function HoldingRow({ symbol, description, quantity, price, value, change }) {
  const pos = change >= 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '11px 0', borderBottom: `1px solid ${BORDER}`, gap: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: CREAM, letterSpacing: '0.04em' }}>{symbol}</span>
        {description && (
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: MUTED, marginLeft: 8 }}>{description}</span>
        )}
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: MUTED, width: 52, textAlign: 'right' }}>
        {quantity != null ? quantity.toLocaleString(undefined, { maximumFractionDigits: 4 }) : '—'}
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--on-ink-text-2)', width: 72, textAlign: 'right' }}>
        {price != null ? `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--on-ink-text-2)', width: 80, textAlign: 'right' }}>
        {value != null ? `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
      </span>
      {change != null && (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: pos ? 'var(--positive)' : 'var(--negative)', width: 56, textAlign: 'right' }}>
          {pos ? '+' : ''}{change.toFixed(2)}%
        </span>
      )}
    </div>
  )
}

function AccountCard({ account, holdings }) {
  const positions = holdings?.positions || []
  const totalValue = holdings?.totalValue?.amount ?? positions.reduce((s, p) => s + (p.price?.amount ?? 0) * (p.units ?? 0), 0)
  const currency = holdings?.totalValue?.currency ?? 'USD'

  return (
    <div style={{ background: INK8, border: `1px solid ${BORDER}`, borderRadius: 'var(--r-md)', overflow: 'hidden', marginBottom: 14 }}>
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: MUTED, marginBottom: 2 }}>
            {account.institution_name || account.brokerage_authorization?.brokerage?.name || 'Brokerage Account'}
          </p>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: CREAM }}>{account.name || account.number}</p>
        </div>
        {totalValue != null && (
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, color: CREAM }}>
              ${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: DIM }}>{currency}</p>
          </div>
        )}
      </div>

      {positions.length > 0 ? (
        <div style={{ padding: '0 20px' }}>
          <div style={{ display: 'flex', padding: '8px 0', borderBottom: `1px solid ${BORDER}` }}>
            <span style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: DIM }}>Symbol</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: DIM, width: 52, textAlign: 'right' }}>Qty</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: DIM, width: 72, textAlign: 'right' }}>Price</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: DIM, width: 80, textAlign: 'right' }}>Value</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: DIM, width: 56, textAlign: 'right' }}>Chg%</span>
          </div>
          {positions.map((pos, i) => {
            const sym = pos.symbol?.symbol ?? pos.symbol?.ticker ?? pos.ticker ?? '—'
            const desc = pos.symbol?.description ?? null
            const qty = pos.units ?? pos.quantity ?? null
            const price = pos.price?.amount ?? pos.price ?? null
            const value = pos.open_pnl?.amount != null ? (price ?? 0) * (qty ?? 0) : (price ?? 0) * (qty ?? 0)
            const change = pos.percentage_change ?? null
            return (
              <HoldingRow
                key={i}
                symbol={sym}
                description={desc}
                quantity={qty}
                price={price}
                value={value || null}
                change={change}
              />
            )
          })}
        </div>
      ) : (
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: DIM, padding: '16px 20px' }}>No positions found.</p>
      )}
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {[1, 2, 3].map((i) => (
        <div key={i} style={{ background: INK8, border: `1px solid ${BORDER}`, borderRadius: 'var(--r-md)', padding: '20px', animation: 'pulse 1.5s ease-in-out infinite' }}>
          <div style={{ height: 10, width: 120, background: 'var(--on-ink-2)', borderRadius: 2, marginBottom: 8 }} />
          <div style={{ height: 14, width: 200, background: 'var(--on-ink-1)', borderRadius: 2 }} />
        </div>
      ))}
    </div>
  )
}

export default function Portfolio() {
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState(null)

  const { data: status, isLoading: statusLoading } = useGetSnaptradeStatusQuery()
  const { data: holdingsData, isLoading: holdingsLoading } = useGetSnaptradeHoldingsQuery(undefined, {
    skip: !status?.connected,
  })
  const { data: accountsData, isLoading: accountsLoading } = useGetSnaptradeAccountsQuery(undefined, {
    skip: !status?.connected,
  })
  const [registerSnaptrade] = useRegisterSnaptradeMutation()
  const [disconnectSnaptrade] = useDisconnectSnaptradeMutation()

  const accounts = accountsData?.accounts || []
  const allHoldings = holdingsData?.holdings || []

  const handleConnect = async () => {
    setConnecting(true)
    setConnectError(null)
    try {
      const result = await registerSnaptrade().unwrap()
      const uri = result.redirectURI
      if (uri) {
        window.open(uri, '_blank', 'width=800,height=700,noopener,noreferrer')
      }
    } catch (err) {
      setConnectError('Failed to open connection portal. Please try again.')
    } finally {
      setConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    if (!confirm('Disconnect your brokerage accounts? This will remove all connected accounts.')) return
    await disconnectSnaptrade()
  }

  const isLoading = statusLoading || holdingsLoading || accountsLoading

  return (
    <main className="flex-1 p-5 md:p-8 max-w-4xl mx-auto w-full">
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: 'var(--font-sans)', fontSize: 22, fontWeight: 600, letterSpacing: '-0.022em', color: CREAM, margin: 0 }}>
          Portfolio
        </h1>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: MUTED, marginTop: 4 }}>
          Live brokerage positions
        </p>
      </div>

      {statusLoading && <LoadingSkeleton />}

      {!statusLoading && !status?.connected && (
        <div style={{ background: INK8, border: `1px solid ${BORDER}`, borderRadius: 'var(--r-md)', padding: '40px 32px', textAlign: 'center' }}>
          <div style={{ marginBottom: 20 }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--on-ink-text-3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 16px' }}>
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
            </svg>
            <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 16, fontWeight: 600, color: CREAM, marginBottom: 8 }}>
              Connect your brokerage
            </h2>
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: MUTED, lineHeight: 1.6, maxWidth: 360, margin: '0 auto 24px' }}>
              Link your brokerage account to view real positions, balances, and performance — all in one place. Powered by SnapTrade.
            </p>
          </div>
          <ConnectButton onConnect={handleConnect} loading={connecting} />
          {connectError && (
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--negative)', marginTop: 12 }}>{connectError}</p>
          )}
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: DIM, marginTop: 20, letterSpacing: '0.1em' }}>
            Read-only access · Your credentials are never stored by us
          </p>
        </div>
      )}

      {!statusLoading && status?.connected && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--positive)', display: 'inline-block' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: MUTED, letterSpacing: '0.14em' }}>
                {status.brokerages?.length > 0 ? status.brokerages.join(', ') : 'Connected'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleConnect}
                disabled={connecting}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: MUTED, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 'var(--r-sm)', padding: '6px 12px', cursor: 'pointer', letterSpacing: '0.08em' }}
              >
                Add account
              </button>
              <button
                onClick={handleDisconnect}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--negative)', background: 'transparent', border: `1px solid var(--negative)`, borderRadius: 'var(--r-sm)', padding: '6px 12px', cursor: 'pointer', opacity: 0.7, letterSpacing: '0.08em' }}
              >
                Disconnect
              </button>
            </div>
          </div>

          {isLoading && <LoadingSkeleton />}

          {!isLoading && accounts.length === 0 && (
            <div style={{ background: INK8, border: `1px solid ${BORDER}`, borderRadius: 'var(--r-md)', padding: '32px', textAlign: 'center' }}>
              <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: MUTED }}>No accounts found. Try reconnecting your brokerage.</p>
              <button
                onClick={handleConnect}
                disabled={connecting}
                style={{ marginTop: 14, fontFamily: 'var(--font-mono)', fontSize: 11, color: CREAM, background: 'var(--on-ink-2)', border: `1px solid ${BORDER}`, borderRadius: 'var(--r-sm)', padding: '8px 16px', cursor: 'pointer', letterSpacing: '0.08em' }}
              >
                {connecting ? 'Opening...' : 'Connect brokerage'}
              </button>
            </div>
          )}

          {!isLoading && accounts.length > 0 && accounts.map((account) => {
            const accountHoldings = allHoldings.find((h) => h.account?.id === account.id) ?? allHoldings[0] ?? null
            return <AccountCard key={account.id} account={account} holdings={accountHoldings} />
          })}
        </>
      )}
    </main>
  )
}
