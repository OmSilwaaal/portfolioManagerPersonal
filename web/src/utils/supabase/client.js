import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY

if (!supabaseUrl || !supabaseKey) {
  document.body.innerHTML = `<div style="font-family:monospace;padding:40px;color:#fff;background:#0a0a0a;min-height:100vh">
    <h2 style="color:#ef4444">Missing environment variables</h2>
    <p>VITE_SUPABASE_URL and VITE_SUPABASE_KEY must be set in your Vercel project settings.</p>
    <pre style="color:#6b7280;margin-top:16px">VITE_SUPABASE_URL = ${supabaseUrl ? '✓ set' : '✗ missing'}
VITE_SUPABASE_KEY = ${supabaseKey ? '✓ set' : '✗ missing'}</pre>
  </div>`
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseKey)
