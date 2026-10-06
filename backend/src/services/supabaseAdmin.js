const { createClient } = require('@supabase/supabase-js')
const ws = require('ws')

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.warn('[supabaseAdmin] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — groups will not work')
}

const supabase = createClient(supabaseUrl ?? '', supabaseKey ?? '', {
  auth: { persistSession: false },
  // Explicit transport: Node < 22 has no native WebSocket, and this server never uses realtime.
  realtime: { transport: ws },
})

module.exports = { supabase }
