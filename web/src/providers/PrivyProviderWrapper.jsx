import React from 'react'
import { PrivyProvider } from '@privy-io/react-auth'

const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID || 'client-placeholder-app-id'

export default function PrivyProviderWrapper({ children }) {
  // If no real App ID is provided yet, render children with a warning banner context if needed
  return (
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
  )
}
