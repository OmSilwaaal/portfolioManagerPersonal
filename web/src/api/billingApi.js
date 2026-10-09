import { baseApi } from './baseApi'

// All amounts crossing this boundary are INTEGER minor units (USD cents, SOL lamports), and
// nothing here ever sends an amount to the server. A deposit sends a tier id; a SOL payment
// sends a transaction signature. The server owns every number that becomes money.

// Tag types are added here rather than in baseApi.js: enhanceEndpoints is the supported way
// to extend them from a feature module, so billing owns its own cache invalidation and the
// shared file stays untouched (three other agents are working in this tree).
const billingBase = baseApi.enhanceEndpoints({ addTagTypes: ['Billing', 'Wallet', 'Pro'] })

export const billingApi = billingBase.injectEndpoints({
  endpoints: (builder) => ({
    // What is switched on, the publishable key, the treasury address and the price list.
    getBillingConfig: builder.query({
      query: () => '/billing/config',
      providesTags: ['Billing'],
    }),
    getBalance: builder.query({
      query: () => '/billing/balance',
      providesTags: ['Billing'],
    }),
    getWallets: builder.query({
      query: () => '/billing/wallet',
      providesTags: ['Wallet'],
    }),
    // Registers the PUBLIC address of the user's Privy embedded wallet. Never key material.
    registerWallet: builder.mutation({
      query: (address) => ({ url: '/billing/wallet', method: 'POST', body: { address } }),
      invalidatesTags: ['Wallet'],
    }),
    // Returns a Stripe Checkout URL. The amount is the server's, keyed off the tier id only.
    createCardDeposit: builder.mutation({
      query: (tierId) => ({ url: '/billing/deposit/card', method: 'POST', body: { tierId } }),
    }),
    // Claims an on-chain transfer. The server confirms it on Solana before crediting anything.
    claimSolDeposit: builder.mutation({
      query: (signature) => ({ url: '/billing/deposit/solana', method: 'POST', body: { signature } }),
      invalidatesTags: ['Billing'],
    }),
    getProStatus: builder.query({
      query: () => '/billing/pro',
      providesTags: ['Pro'],
    }),
    createProCheckout: builder.mutation({
      query: () => ({ url: '/billing/pro/checkout', method: 'POST' }),
    }),
    payProWithSol: builder.mutation({
      query: (signature) => ({ url: '/billing/pro/solana', method: 'POST', body: { signature } }),
      invalidatesTags: ['Pro', 'Billing'],
    }),
    cancelPro: builder.mutation({
      query: () => ({ url: '/billing/pro/cancel', method: 'POST' }),
      invalidatesTags: ['Pro'],
    }),
  }),
})

export const {
  useGetBillingConfigQuery,
  useGetBalanceQuery,
  useGetWalletsQuery,
  useRegisterWalletMutation,
  useCreateCardDepositMutation,
  useClaimSolDepositMutation,
  useGetProStatusQuery,
  useCreateProCheckoutMutation,
  usePayProWithSolMutation,
  useCancelProMutation,
} = billingApi

// ── display helpers ──────────────────────────────────────────────────────────
// Formatting only. Nothing here feeds back into arithmetic: the server is the only place
// money is added up, and a float produced for display must never make a round trip.
const DECIMALS = { usd: 2, sol: 9 }

/** Integer minor units -> a display string. Never used as an input to a calculation. */
export function formatMinor(minor, currency) {
  const d = DECIMALS[currency]
  if (d == null || !Number.isFinite(minor)) return '—'
  const neg = minor < 0
  const s = String(Math.abs(Math.trunc(minor))).padStart(d + 1, '0')
  const whole = s.slice(0, s.length - d).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const frac = d ? s.slice(s.length - d) : ''
  // SOL has nine decimals and almost never needs all of them on screen.
  const trimmed = currency === 'sol' ? frac.replace(/0+$/, '').slice(0, 4) : frac
  return `${neg ? '-' : ''}${whole}${trimmed ? `.${trimmed}` : ''}`
}

export const formatUsd = (cents) => `$${formatMinor(cents, 'usd')}`
export const formatSol = (lamports) => `${formatMinor(lamports, 'sol')} SOL`
export const formatMoney = (minor, currency) => (currency === 'usd' ? formatUsd(minor) : formatSol(minor))
