import { useEffect, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import QrCode from './QrCode'
import PrivyGate from './PrivyGate'
import { useRegisterWalletMutation, useGetWalletsQuery } from '../../api/billingApi'

// The account's Solana address, with a scannable QR so funds can be sent to it.
//
// The address comes from Privy's linked accounts, which is where the embedded wallet's PUBLIC
// key lives. There is no code path in this component — or anywhere on the server — that reads,
// requests or transmits a private key or a seed phrase. Privy MPC-shards the key material and
// it never leaves the user's session.
//
// Mount it as <WalletCard /> anywhere; it brings its own Privy provider via PrivyGate and
// yields to an existing one if the page already has it.

const short = (a) => (a && a.length > 12 ? `${a.slice(0, 5)}…${a.slice(-5)}` : a || '')

function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.6 }}>{label}</span>
      {children}
    </div>
  )
}

function WalletCardInner({ compact = false }) {
  const { ready, authenticated, login, user } = usePrivy()
  const [copied, setCopied] = useState(false)
  const [registerWallet] = useRegisterWalletMutation()
  const { data: known } = useGetWalletsQuery(undefined, { skip: !authenticated })

  // Same derivation the terminal uses: read the Solana address off the linked accounts rather
  // than importing '@privy-io/react-auth/solana', which drags in a much heavier entry point.
  const address = user?.linkedAccounts?.find((a) => a.type === 'wallet' && a.chainType === 'solana')?.address || null

  // Tell the server this public address belongs to this account. It is what lets a SOL
  // deposit be attributed to the right user: a transaction signature is public, so without a
  // registered payer address anyone could claim a stranger's transfer as their own.
  const registered = known?.addresses?.includes(address)
  useEffect(() => {
    if (!address || registered) return
    registerWallet(address).unwrap().catch(() => { /* retried on next mount; nothing is lost */ })
  }, [address, registered, registerWallet])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch { /* clipboard blocked; the address is on screen to select by hand */ }
  }

  if (!ready) {
    return <div style={{ padding: 16, opacity: 0.6, fontSize: 13 }}>Loading wallet…</div>
  }

  if (!authenticated) {
    return (
      <div style={{ padding: 16 }}>
        <p style={{ fontSize: 13, opacity: 0.75, marginBottom: 10 }}>Connect to see your Solana address.</p>
        <button
          onClick={login}
          style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--moss-300)', background: 'var(--moss-400)', color: '#fff', fontSize: 13, cursor: 'pointer' }}
        >
          Connect wallet
        </button>
      </div>
    )
  }

  if (!address) {
    return <div style={{ padding: 16, fontSize: 13, opacity: 0.75 }}>No Solana wallet on this account yet.</div>
  }

  return (
    <div style={{ padding: 16, display: 'grid', gap: 14, justifyItems: 'center' }}>
      {/* The QR stays light-on-white in both themes — see QrCode.jsx. */}
      <QrCode value={address} size={compact ? 168 : 216} title={`Solana address ${address}`} />

      <div style={{ width: '100%', display: 'grid', gap: 8 }}>
        <Row label="Solana">
          <code style={{ fontSize: 12, fontFamily: 'var(--font-mono, monospace)' }} title={address}>{short(address)}</code>
        </Row>
        <button
          onClick={copy}
          style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--line, rgba(255,255,255,0.15))', background: 'transparent', color: 'inherit', fontSize: 12, cursor: 'pointer' }}
        >
          {copied ? 'Copied' : 'Copy address'}
        </button>
        <p style={{ fontSize: 11, opacity: 0.55, textAlign: 'center', margin: 0 }}>
          Solana (SPL) only. Sending any other network&rsquo;s assets here will lose them.
        </p>
      </div>
    </div>
  )
}

export default function WalletCard(props) {
  return (
    <PrivyGate fallback={<div style={{ padding: 16, opacity: 0.6, fontSize: 13 }}>Loading wallet…</div>}>
      <WalletCardInner {...props} />
    </PrivyGate>
  )
}
