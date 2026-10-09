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

/* Every route is a dynamic import, so the browser only learns about its chunk once the entry has
   downloaded and run — a round trip after everything else. The landing page is where first-time
   visitors always arrive, so its chunk is announced in the HTML instead. Only this one: each extra
   page listed here competes for bandwidth on the routes that do not need it. */
const ENTRY_PAGES = ['src/pages/Landing.jsx']

function preloadEntryPages() {
  return {
    name: 'tvx-preload-entry-pages',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml(html, ctx) {
      if (!ctx.bundle) return html
      const files = new Set()
      for (const [file, chunk] of Object.entries(ctx.bundle)) {
        if (chunk.type !== 'chunk' || !chunk.facadeModuleId) continue
        if (!ENTRY_PAGES.some((page) => chunk.facadeModuleId.endsWith(page))) continue
        files.add(file)
        for (const imported of chunk.imports) files.add(imported)
      }
      const tags = [...files]
        .filter((file) => !html.includes(file)) // Vite already preloads the entry's own graph
        .map((file) => ({ tag: 'link', attrs: { rel: 'modulepreload', crossorigin: true, href: `/${file}` }, injectTo: 'head' }))
      return { html, tags }
    },
  }
}

export default defineConfig({
  plugins: [react(), preloadEntryPages()],
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
