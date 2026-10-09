import React, { createContext, useContext } from 'react'
import { PrivyProvider } from '@privy-io/react-auth'

// Privy is ~2.8MB of chunks, and the app's navigation speed was hard-won, so it stays out of
// the initial bundle. It is also now needed in more than one place (the terminal, and the
// wallet card on a profile), which creates a second problem: mounting two PrivyProviders in
// one tree gives two wallet sessions and two sets of state.
//
// Both problems are solved here rather than in App.jsx:
//
//  * `MountedContext` makes this component IDEMPOTENT. Nested inside an existing provider it
//    renders its children and nothing else, so the wallet card can mount its own provider
//    without caring whether the page already has one. Nobody has to reason about ordering.
//  * Callers reach it through <PrivyGate>, which import()s this module only when a wallet is
//    actually about to be shown. Privy therefore stays lazy for everyone who never opens one,
//    and the cost is paid per-feature instead of per-page-load.

const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID || ''

/** True once a provider is mounted above us. */
const MountedContext = createContext(false)

export const usePrivyMounted = () => useContext(MountedContext)

/** Without an app id Privy cannot work; say so rather than mounting a broken provider. */
export const isPrivyConfigured = () => Boolean(PRIVY_APP_ID)

export default function PrivyProviderWrapper({ children }) {
  const alreadyMounted = useContext(MountedContext)

  // A second provider in the same tree would open a second wallet session. Defer to the first.
  if (alreadyMounted) return children

  // No app id configured: render the children and let them show their own "not configured"
  // state. Mounting PrivyProvider with a placeholder id produces confusing network errors.
  if (!PRIVY_APP_ID) return children

  return (
    <MountedContext.Provider value={true}>
      <PrivyProvider
        appId={PRIVY_APP_ID}
        config={{
          appearance: {
            theme: 'dark',
            accentColor: '#566838', // Travauxus Moss accent
            logo: 'https://www.travauxus.com/favicon.ico',
          },
          embeddedWallets: {
            // Privy v3: embedded wallets are configured per chain. The terminal needs Solana.
            // The keys are MPC-sharded by Privy and never reach our server — we only ever
            // read the public address off the user's linked accounts.
            ethereum: { createOnLogin: 'off' },
            solana: { createOnLogin: 'users-without-wallets' },
          },
          loginMethods: ['google', 'twitter', 'email', 'wallet'],
          solanaClusters: [
            {
              name: 'mainnet-beta',
              rpcUrl: 'https://api.mainnet-beta.solana.com',
            },
          ],
        }}
      >
        {children}
      </PrivyProvider>
    </MountedContext.Provider>
  )
}
