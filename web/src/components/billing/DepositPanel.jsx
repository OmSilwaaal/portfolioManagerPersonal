import { useState } from 'react'
import {
  useGetBillingConfigQuery, useGetBalanceQuery, useCreateCardDepositMutation,
  useClaimSolDepositMutation, formatMoney, formatUsd, formatSol,
} from '../../api/billingApi'

// Deposits, card and SOL.
//
// This panel computes NO money. Every figure it shows — gross, the 5% fee, the net credited —
// arrives from /billing/config or /billing/balance already split by the server, in integer
// minor units. The only thing it sends is a tier id or a transaction signature.
//
// With no rails configured the server reports `enabled: false` and this renders nothing at
// all, so an unconfigured deployment shows no way to pay.

function Fee({ bps }) {
  return <span style={{ opacity: 0.6 }}> (incl. {bps / 100}% fee)</span>
}

export default function DepositPanel() {
  const { data: config, isLoading } = useGetBillingConfigQuery()
  const { data: balance } = useGetBalanceQuery()
  const [createCardDeposit, cardState] = useCreateCardDepositMutation()
  const [claimSol, solState] = useClaimSolDepositMutation()
  const [signature, setSignature] = useState('')
  const [notice, setNotice] = useState(null)

  if (isLoading) return null
  // Nothing switched on: offer nothing. This is the default state of a fresh deployment.
  if (!config || (!config.card?.enabled && !config.sol?.enabled)) return null

  const buy = async (tierId) => {
    setNotice(null)
    try {
      const res = await createCardDeposit(tierId).unwrap()
      if (res.url) window.location.href = res.url
    } catch (err) {
      setNotice(err?.data?.message || 'Could not start that payment.')
    }
  }

  const claim = async (e) => {
    e.preventDefault()
    setNotice(null)
    try {
      const res = await claimSol(signature.trim()).unwrap()
      setSignature('')
      // A resubmitted signature is a success that credits nothing — say so plainly rather
      // than letting someone think a second deposit went missing.
      setNotice(res.duplicate
        ? 'That transaction was already credited.'
        : `Credited ${formatSol(res.netMinor)}${res.feeMinor ? ` after a ${formatSol(res.feeMinor)} fee` : ''}.`)
    } catch (err) {
      setNotice(err?.data?.message || 'Could not verify that transaction.')
    }
  }

  const box = { border: '1px solid var(--line, rgba(255,255,255,0.14))', borderRadius: 10, padding: 14 }

  return (
    <section style={{ display: 'grid', gap: 14 }}>
      <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <h3 style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0 }}>Deposit</h3>
        {balance ? (
          <span style={{ fontSize: 12, opacity: 0.7 }}>
            Balance {formatUsd(balance.balances.usd.netMinor)} · {formatSol(balance.balances.sol.netMinor)}
          </span>
        ) : null}
      </header>

      {config.card?.enabled ? (
        <div style={box}>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 10 }}>
            Card<Fee bps={config.feeBps} />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {config.card.tiers.map((t) => (
              <button
                key={t.id}
                disabled={cardState.isLoading}
                onClick={() => buy(t.id)}
                title={`${formatMoney(t.netMinor, t.currency)} credited after a ${formatMoney(t.feeMinor, t.currency)} fee`}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--line, rgba(255,255,255,0.18))', background: 'transparent', color: 'inherit', fontSize: 13, cursor: 'pointer' }}
              >
                {formatMoney(t.grossMinor, t.currency)}
                <span style={{ display: 'block', fontSize: 10, opacity: 0.6 }}>
                  {formatMoney(t.netMinor, t.currency)} credited
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {config.sol?.enabled ? (
        <div style={box}>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
            SOL<Fee bps={config.feeBps} />
          </div>
          <p style={{ fontSize: 11, opacity: 0.65, margin: '0 0 8px' }}>
            Send SOL to the treasury address, then paste the transaction signature to have it
            credited. It must be sent from your own wallet.
          </p>
          <code style={{ display: 'block', fontSize: 11, wordBreak: 'break-all', opacity: 0.85, marginBottom: 10 }}>
            {config.sol.treasury}
          </code>
          <form onSubmit={claim} style={{ display: 'flex', gap: 8 }}>
            <input
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              placeholder="Transaction signature"
              maxLength={120}
              style={{ flex: 1, minWidth: 0, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line, rgba(255,255,255,0.18))', background: 'transparent', color: 'inherit', fontSize: 12 }}
            />
            <button
              type="submit"
              disabled={!signature.trim() || solState.isLoading}
              style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--moss-400)', color: '#fff', fontSize: 12, cursor: 'pointer' }}
            >
              {solState.isLoading ? 'Checking…' : 'Claim'}
            </button>
          </form>
        </div>
      ) : null}

      {notice ? <p style={{ fontSize: 12, opacity: 0.8, margin: 0 }}>{notice}</p> : null}
    </section>
  )
}
