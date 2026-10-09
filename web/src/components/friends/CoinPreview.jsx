import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGetMemecoinQuery } from '../../api/memecoinApi'
import { fmtPrice, fmtPct, toneOf, shortAddr as short } from './fmt'

const BORDER = 'var(--on-ink-border)'
const MONO = { fontFamily: 'var(--font-sans)' }
const MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

function Logo({ src, symbol, dim }) {
  const [broken, setBroken] = useState(false)
  if (src && !broken) {
    return <img src={src} alt="" width={30} height={30} referrerPolicy="no-referrer" onError={() => setBroken(true)} style={{ width: 30, height: 30, flexShrink: 0, objectFit: 'cover', border: `1px solid ${BORDER}`, borderRadius: 2 }} />
  }
  return (
    <span aria-hidden="true" style={{ width: 30, height: 30, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${BORDER}`, borderRadius: 2, fontWeight: 800, fontSize: 12, color: dim ? 'var(--on-ink-text-4)' : 'var(--paper)' }}>
      {(symbol || '$').slice(0, 2).toUpperCase()}
    </span>
  )
}

function CopyAddress({ address }) {
  const [done, setDone] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address)
      setDone(true)
      setTimeout(() => setDone(false), 1400)
    } catch { /* clipboard blocked (insecure context, denied permission): the address is still on screen to select */ }
  }
  return (
    <button
      className="t-btn px-2 py-1" onClick={copy} title={address}
      aria-label={`Copy contract address ${address}`}
      style={{ ...MONO, fontSize: 10, flexShrink: 0, letterSpacing: '0.04em' }}
    >
      {done ? 'copied' : short(address)}
    </button>
  )
}

/**
 * One coin, as a card: logo, symbol, live price and 24h change, with its contract address copyable and the card itself
 * the way into the terminal. Used wherever a coin is referenced outside the terminal — a callout, a ticker shared in a
 * DM — so those two cannot drift apart.
 *
 * A reference that no longer resolves (rugged, delisted, a mint that was never real) renders as a dead card carrying
 * whatever symbol the sender snapshotted. Nothing here throws on a missing field: that is the whole point of it.
 *
 * `resolve={false}` renders the snapshot without asking for a price, which keeps a long feed inside the rate limit.
 */
export default function CoinPreview({ address, symbol, note = null, resolve = true, compact = false }) {
  const navigate = useNavigate()
  const valid = MINT_RE.test(address ?? '')
  const q = useGetMemecoinQuery(address, { skip: !valid || !resolve })
  const tok = valid ? q.data : null
  const price = tok?.price != null && !isNaN(Number(tok.price)) ? Number(tok.price) : null
  const pending = resolve && valid && q.isLoading
  const dead = !valid || (resolve && !pending && price == null)
  const label = tok?.symbol || symbol || short(address) || 'Unknown'

  const inner = (
    <>
      <Logo src={tok?.image} symbol={label} dim={dead} />
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: 'block', fontFamily: 'var(--font-display)', fontStretch: '125%', fontWeight: 800, fontSize: compact ? 13 : 15, textTransform: 'uppercase', color: dead ? 'var(--on-ink-text-3)' : 'var(--paper)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          ${label}
        </span>
        <span style={{ ...MONO, display: 'block', fontSize: 10, color: 'var(--on-ink-text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {dead ? (valid ? 'No market — this token no longer prices' : 'Unknown token') : (note || tok?.name || 'Solana token')}
        </span>
      </span>
      {!dead && (
        <span style={{ ...MONO, textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
          <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--paper)' }}>{pending ? '…' : fmtPrice(price)}</span>
          <span style={{ display: 'block', fontSize: 10, fontWeight: 700, color: toneOf(tok?.change24h) }}>{fmtPct(tok?.change24h)}</span>
        </span>
      )}
    </>
  )

  return (
    <div style={{ display: 'flex', alignItems: 'stretch', gap: 6, border: `1px ${dead ? 'dashed' : 'solid'} ${BORDER}`, borderRadius: 2, background: 'var(--ink-900)', padding: 6, minWidth: 0 }}>
      {dead ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, padding: '2px 4px' }} aria-label={`${label} — no market`}>{inner}</div>
      ) : (
        <button
          onClick={() => navigate(`/terminal?token=${encodeURIComponent(address)}`)}
          title={`Open ${label} in the terminal`}
          style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, textAlign: 'left', padding: '2px 4px', background: 'transparent', border: 0, cursor: 'pointer', color: 'inherit' }}
        >
          {inner}
        </button>
      )}
      {valid && <span style={{ display: 'flex', alignItems: 'center' }}><CopyAddress address={address} /></span>}
    </div>
  )
}
