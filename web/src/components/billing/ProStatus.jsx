import { useState } from 'react'
import {
  useGetProStatusQuery, useGetBillingConfigQuery,
  useCreateProCheckoutMutation, useCancelProMutation, usePayProWithSolMutation, formatSol,
} from '../../api/billingApi'

// Pro status, and the controls to buy or cancel it.
//
// Status is a read of the server's grant log, so it can say WHY someone is Pro (a
// subscription, a referral month, an admin comp) and when it ends. Cancelling calls Stripe;
// it does not just flip something locally.

const when = (iso) => {
  if (!iso) return null
  try { return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) }
  catch { return null }
}

const LABEL = { stripe: 'subscription', referral: 'referral', admin: 'granted', solana: 'paid in SOL', legacy: 'existing' }

export default function ProStatus() {
  const { data: pro, isLoading } = useGetProStatusQuery()
  const { data: config } = useGetBillingConfigQuery()
  const [checkout, checkoutState] = useCreateProCheckoutMutation()
  const [cancel, cancelState] = useCancelProMutation()
  const [paySol, solState] = usePayProWithSolMutation()
  const [signature, setSignature] = useState('')
  const [notice, setNotice] = useState(null)
  const [confirming, setConfirming] = useState(false)

  if (isLoading || !pro) return null

  const canBuyCard = config?.card?.proAvailable
  const canBuySol = config?.sol?.enabled && config?.sol?.proPriceLamports

  const start = async () => {
    setNotice(null)
    try {
      const res = await checkout().unwrap()
      if (res.url) window.location.href = res.url
    } catch (err) { setNotice(err?.data?.message || 'Could not start checkout.') }
  }

  const doCancel = async () => {
    setNotice(null)
    try {
      const res = await cancel().unwrap()
      setConfirming(false)
      setNotice(res.cancelled
        ? (res.message || 'Cancelled.')
        : 'There is no card subscription to cancel on this account.')
    } catch (err) { setNotice(err?.data?.message || 'Could not cancel.') }
  }

  const payWithSol = async (e) => {
    e.preventDefault()
    setNotice(null)
    try {
      const res = await paySol(signature.trim()).unwrap()
      setSignature('')
      setNotice(res.duplicate ? 'That transaction was already used.' : 'Pro is active for one month.')
    } catch (err) { setNotice(err?.data?.message || 'Could not verify that transaction.') }
  }

  const until = when(pro.until)

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <h3 style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0 }}>Pro</h3>
        <span style={{ fontSize: 12, opacity: 0.75 }}>
          {pro.isPro ? (pro.openEnded ? 'Active' : `Active until ${until || '—'}`) : 'Not active'}
        </span>
      </header>

      {pro.isPro && pro.sources?.length ? (
        <p style={{ fontSize: 11, opacity: 0.6, margin: 0 }}>
          From: {pro.sources.map((s) => LABEL[s] || s).join(', ')}
        </p>
      ) : null}

      {!pro.isPro && (canBuyCard || canBuySol) ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {canBuyCard ? (
            <button
              onClick={start}
              disabled={checkoutState.isLoading}
              style={{ padding: '9px 14px', borderRadius: 8, border: 'none', background: 'var(--moss-400)', color: '#fff', fontSize: 13, cursor: 'pointer' }}
            >
              Subscribe with a card
            </button>
          ) : null}

          {canBuySol ? (
            <form onSubmit={payWithSol} style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 11, opacity: 0.65 }}>
                Or send {formatSol(config.sol.proPriceLamports)} to {config.sol.treasury} and paste the signature:
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={signature}
                  onChange={(e) => setSignature(e.target.value)}
                  placeholder="Transaction signature"
                  maxLength={120}
                  style={{ flex: 1, minWidth: 0, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line, rgba(255,255,255,0.18))', background: 'transparent', color: 'inherit', fontSize: 12 }}
                />
                <button type="submit" disabled={!signature.trim() || solState.isLoading}
                  style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--line, rgba(255,255,255,0.18))', background: 'transparent', color: 'inherit', fontSize: 12, cursor: 'pointer' }}>
                  {solState.isLoading ? 'Checking…' : 'Activate'}
                </button>
              </div>
            </form>
          ) : null}
        </div>
      ) : null}

      {pro.isPro && pro.canCancelStripe ? (
        confirming ? (
          <div style={{ display: 'grid', gap: 8 }}>
            <p style={{ fontSize: 12, opacity: 0.8, margin: 0 }}>
              Cancel your subscription? Pro stays active until the end of the period you have
              already paid for, and you will not be billed again.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={doCancel} disabled={cancelState.isLoading}
                style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #b4492f', background: 'transparent', color: '#e0775c', fontSize: 12, cursor: 'pointer' }}>
                {cancelState.isLoading ? 'Cancelling…' : 'Yes, cancel'}
              </button>
              <button onClick={() => setConfirming(false)}
                style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--line, rgba(255,255,255,0.18))', background: 'transparent', color: 'inherit', fontSize: 12, cursor: 'pointer' }}>
                Keep Pro
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setConfirming(true)}
            style={{ justifySelf: 'start', padding: '7px 12px', borderRadius: 8, border: '1px solid var(--line, rgba(255,255,255,0.18))', background: 'transparent', color: 'inherit', fontSize: 12, cursor: 'pointer' }}>
            Cancel subscription
          </button>
        )
      ) : null}

      {notice ? <p style={{ fontSize: 12, opacity: 0.8, margin: 0 }}>{notice}</p> : null}
    </section>
  )
}
