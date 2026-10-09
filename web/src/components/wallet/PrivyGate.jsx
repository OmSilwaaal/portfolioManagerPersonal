import { Suspense, lazy } from 'react'

// Mounts the Privy provider ON DEMAND, around just the subtree that needs a wallet.
//
// This is how the wallet became available outside /terminal without making Privy eager and
// without touching App.jsx (three other agents are working in this tree; a shared file is the
// one place a merge can silently break someone else's feature).
//
// The import() runs when a PrivyGate first renders, so Privy's ~2.8MB stays off the critical
// path for every user who never opens a wallet. A page that already sits inside a provider
// pays nothing extra either: PrivyProviderWrapper is idempotent and simply yields.

const LazyPrivyProvider = lazy(() => import('../../providers/PrivyProviderWrapper'))

export default function PrivyGate({ children, fallback = null }) {
  return (
    <Suspense fallback={fallback}>
      <LazyPrivyProvider>{children}</LazyPrivyProvider>
    </Suspense>
  )
}
