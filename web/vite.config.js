import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vendor groups are split so pages that do not need a heavy library never download it.
const VENDOR_GROUPS = [
  ['solana', ['@solana/', 'bn.js', 'borsh', 'bs58', 'superstruct', 'rpc-websockets', 'jayson']],
  ['charts-lw', ['lightweight-charts', 'fancy-canvas']],
  ['charts-recharts', ['recharts', 'recharts-scale', 'victory-vendor', 'd3-', 'internmap', 'decimal.js-light', 'fast-equals', 'lodash', 'react-smooth', 'react-transition-group']],
  ['motion', ['framer-motion', 'motion-dom', 'motion-utils']],
  ['supabase', ['@supabase/']],
  ['redux', ['@reduxjs/', 'react-redux', 'redux', 'reselect', 'immer', 'use-sync-external-store']],
  ['react', ['/react/', '/react-dom/', '/scheduler/', 'react-router', '@remix-run/']],
]

function manualChunks(id) {
  if (!id.includes('node_modules')) return undefined
  const path = id.split('node_modules/').pop()
  for (const [name, needles] of VENDOR_GROUPS) {
    if (needles.some((n) => (n.startsWith('/') ? id.includes(`node_modules${n}`) : path.startsWith(n)))) return name
  }
  return undefined
}

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: { output: { manualChunks } },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
